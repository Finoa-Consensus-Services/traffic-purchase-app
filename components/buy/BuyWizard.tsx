"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCc, formatGroupedAmount, formatUsd, parseAmount } from "@/lib/amount-format";
import {
  coversMinimumPurchaseUsd,
  minimumPurchaseUsd,
  purchaseMinBytes,
  quoteFromBytes,
  quoteFromCc,
  quoteFromUsd,
  type TrafficQuote,
  type TrafficRates,
} from "@/lib/pricing";
import { purchaseConfirmReady } from "@/lib/jurisdiction";
import { QUOTE_ROUND_CHANGED, useTrafficPurchase } from "@/hooks/useTrafficPurchase";
import {
  quoteAllowsSubmission,
  quoteClock,
  quoteStatusMessage,
  type QuoteRound,
} from "@/lib/purchase/quote-validity";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Assembly, type AssemblyMode } from "@/components/buy/Assembly";
import { useSmoothSize } from "@/components/buy/useSmoothSize";
import { NetworkMenu } from "@/components/buy/NetworkMenu";
import { PathMenu } from "@/components/buy/PathMenu";
import { CC_RATE_NOTE, EstimateTag, PriceEstimateInfo } from "@/components/buy/PriceEstimateInfo";
import { AnimatedCc } from "@/components/buy/AnimatedCc";
import { QuoteCountdown } from "@/components/buy/QuoteCountdown";
import { WalletDialog } from "@/components/buy/WalletDialog";
import { lighthouseTransactionUrl } from "@/lib/lighthouse";
import { isLedgerUpdateId } from "@/lib/purchase/ledger-update-id";
import { readBrowserBuyDraft, writeBrowserBuyDraft, type BuyDraft } from "@/lib/purchase/buy-draft";
import { uiErrorName } from "@/lib/ui-error-name";

type Step = "target" | "quote" | "review" | "processing" | "rejected" | "complete";
type AmountMode = "bytes" | "usd" | "cc";

type QuoteResponse = {
  ok: true;
  proxy: boolean;
  scanBaseUrl: string;
  fees: { extraTrafficPriceUsdPerMb: number; minTopupBytes: number };
  rates: TrafficRates;
  snapshotId: string;
  quotedAt: string;
  validUntil: string | null;
  round: QuoteRound | null;
  domainIds: string[];
  defaultDomainId: string | null;
  fixture?: boolean;
};

type MemberTraffic = {
  memberId: string;
  totalConsumed: number;
  totalLimit: number;
  totalPurchased: number;
  availableBytes: number;
};

function quoteForMode(mode: AmountMode, value: number, rates: TrafficRates): TrafficQuote {
  switch (mode) {
    case "bytes":
      return quoteFromBytes(value, rates);
    case "usd":
      return quoteFromUsd(value, rates);
    case "cc":
      return quoteFromCc(value, rates);
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

function isQuoteResponse(value: unknown): value is QuoteResponse {
  if (typeof value !== "object" || value === null || !("ok" in value) || value.ok !== true) {
    return false;
  }
  if (!("rates" in value) || !("snapshotId" in value) || typeof value.snapshotId !== "string") {
    return false;
  }
  if (!("quotedAt" in value) || typeof value.quotedAt !== "string") return false;
  return "validUntil" in value && (value.validUntil === null || typeof value.validUntil === "string");
}

async function requestQuote(): Promise<QuoteResponse> {
  const response = await fetch("/api/quote");
  const body: unknown = await response.json();
  if (!response.ok || !isQuoteResponse(body)) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : "The network quote is unavailable.";
    throw new Error(message === "fetch failed" ? "The network quote is unavailable." : message);
  }
  return body;
}

function quoteIdentityOf(body: QuoteResponse) {
  return [
    body.round?.contractId ?? "",
    body.snapshotId,
    body.validUntil ?? "",
    body.rates.amuletPriceUsd,
    body.rates.extraTrafficPriceUsdPerMb,
  ].join(":");
}

const RAIL = ["target", "quote", "review", "complete"] as const;
const RAIL_LABEL = { target: "Validator", quote: "Amount", review: "Review", complete: "Done" };

const primaryButton =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-bold tracking-tight text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink";
const secondaryButton =
  "inline-flex h-12 items-center justify-center rounded-full border border-line bg-surface px-5 text-sm font-bold tracking-tight text-primary";
const ghostButton =
  "inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-bold tracking-tight text-ink-muted hover:text-primary";

function formatBytes(value: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value))} bytes`;
}

function formatTrafficMb(bytes: number) {
  return `${(bytes / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 3 })} MB`;
}

function shortParty(account: string) {
  const [prefix, id] = account.split("::");
  if (!id || id.length <= 8) return account;
  return `${prefix}::${id.slice(0, 4)}…${id.slice(-4)}`;
}

/** Drop a trailing party hash so the review can show the readable validator name. */
function validatorName(memberId: string) {
  const parts = memberId.split("::");
  const last = parts[parts.length - 1] ?? "";
  if (parts.length >= 3 && /^[0-9a-f]{16,}$/i.test(last)) {
    return parts.slice(0, -1).join("::");
  }
  return memberId;
}

export function BuyWizard() {
  const windowRef = useSmoothSize<HTMLDivElement>();
  const [restored] = useState<BuyDraft | null>(() => readBrowserBuyDraft());
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [domainId, setDomainId] = useState(restored?.domainId ?? "");
  const [lookupQuery, setLookupQuery] = useState(restored?.lookupQuery ?? "");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [members, setMembers] = useState<MemberTraffic[]>(restored?.members ?? []);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(restored?.selectedMemberId ?? null);
  const [lookingUp, setLookingUp] = useState(false);
  const [proxy, setProxy] = useState(false);
  const [step, setStep] = useState<Step>(restored?.step ?? "target");
  const [mode, setMode] = useState<AmountMode>(restored?.mode ?? "bytes");
  const [rawAmount, setRawAmount] = useState(restored?.rawAmount ?? "");
  const [requestedBytes, setRequestedBytes] = useState<number | null>(restored?.requestedBytes ?? null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [clockTick, setClockTick] = useState(0);
  const [quoteRefreshError, setQuoteRefreshError] = useState<string | null>(null);
  const [roundBlocked, setRoundBlocked] = useState(false);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [jurisdictionConfirmed, setJurisdictionConfirmed] = useState(false);
  const [checkingPrice, setCheckingPrice] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const confirmAfterAssert = useRef(false);
  const [priceAssertion, setPriceAssertion] = useState<{ ok: boolean } | null>(null);
  const [priceRefresh, setPriceRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const body = await requestQuote();
        if (cancelled) return;
        const serverNow = Date.parse(body.quotedAt);
        if (Number.isFinite(serverNow)) setServerOffsetMs(serverNow - Date.now());
        const minimum = purchaseMinBytes(body.rates.minTopupBytes);
        setQuote(body);
        setProxy(body.proxy);
        setDomainId((current) => current || (body.defaultDomainId ?? body.domainIds[0] ?? ""));
        setRequestedBytes((current) => current ?? minimum);
        setRawAmount((current) =>
          current ? current : formatGroupedAmount(String(minimum)),
        );
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Quote failed";
          setQuoteError(
            message === "fetch failed" ? "The network quote is unavailable." : message,
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setClockTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    writeBrowserBuyDraft({
      step: step === "processing" ? "review" : step,
      domainId,
      lookupQuery,
      members,
      selectedMemberId,
      mode,
      rawAmount,
      requestedBytes,
    });
  }, [domainId, lookupQuery, members, mode, rawAmount, requestedBytes, selectedMemberId, step]);

  async function onLookup() {
    setLookingUp(true);
    setLookupError(null);
    setLookupMessage("");
    setMembers([]);
    setSelectedMemberId(null);
    setAgreed(false);
    setJurisdictionConfirmed(false);
    try {
      const response = await fetch("/api/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: lookupQuery, domainId }),
      });
      const body = (await response.json()) as
        | { ok: true; members: MemberTraffic[] }
        | { error?: string };
      if (!response.ok || !("ok" in body) || !body.ok) {
        throw new Error("error" in body && body.error ? body.error : "Lookup failed");
      }
      setMembers(body.members);
      setSelectedMemberId(body.members.length === 1 ? body.members[0].memberId : null);
      setLookupMessage(
        body.members.length > 1
          ? "This account is linked to more than one validator. Choose one."
          : body.members.length === 1
            ? "One validator found."
            : "No validator found.",
      );
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setLookingUp(false);
    }
  }

  const amountQuote = useMemo(() => {
    if (!quote || requestedBytes == null || !Number.isFinite(requestedBytes) || requestedBytes <= 0) {
      return null;
    }
    return quoteFromBytes(requestedBytes, quote.rates);
  }, [quote, requestedBytes]);
  const payCc = amountQuote?.cc ?? 0;
  const payUsd = amountQuote?.usd ?? 0;
  const nowMs = useMemo(() => Date.now() + serverOffsetMs, [clockTick, serverOffsetMs]);
  const clock = quote ? quoteClock(quote.validUntil, nowMs) : null;
  const roundContractId = quote?.round?.contractId ?? null;
  const submissionOpen = Boolean(
    clock && !roundBlocked && quoteAllowsSubmission(clock, roundContractId),
  );
  const quoteStatus = clock ? quoteStatusMessage(clock.state) : "";

  const handleQuoteStale = useCallback(() => {
    confirmAfterAssert.current = false;
    setPriceAssertion(null);
    setRoundBlocked(true);
  }, []);

  const purchase = useTrafficPurchase({
    domainId,
    memberId: selectedMemberId,
    rates: quote?.rates ?? null,
    bytes: requestedBytes != null ? String(requestedBytes) : "",
    roundContractId,
    onQuoteStale: handleQuoteStale,
  });
  const quoteRef = useRef(quote);
  const requestedBytesRef = useRef(requestedBytes);
  const modeRef = useRef(mode);
  quoteRef.current = quote;
  requestedBytesRef.current = requestedBytes;
  modeRef.current = mode;

  const commitQuote = useCallback((body: QuoteResponse) => {
    const previous = quoteRef.current;
    const bytes = requestedBytesRef.current;
    const serverNow = Date.parse(body.quotedAt);
    if (Number.isFinite(serverNow)) setServerOffsetMs(serverNow - Date.now());
    const freshClock = quoteClock(body.validUntil, Number.isFinite(serverNow) ? serverNow : Date.now());
    const contractId = body.round?.contractId ?? null;
    const submittable = quoteAllowsSubmission(freshClock, contractId);
    let ccChanged = false;
    if (bytes != null && bytes > 0) {
      const next = quoteFromBytes(bytes, body.rates);
      if (previous) {
        ccChanged = Math.abs(quoteFromBytes(bytes, previous.rates).cc - next.cc) > 1e-8;
      }
      const ratesChanged =
        !previous ||
        previous.rates.amuletPriceUsd !== body.rates.amuletPriceUsd ||
        previous.rates.extraTrafficPriceUsdPerMb !== body.rates.extraTrafficPriceUsdPerMb;
      if (ratesChanged && modeRef.current === "usd") {
        setRawAmount(formatGroupedAmount(next.usd.toFixed(2)));
      } else if (ratesChanged && modeRef.current === "cc") {
        setRawAmount(formatGroupedAmount(next.cc.toFixed(2)));
      }
      if (ccChanged) {
        setPriceRefresh((current) => current + 1);
        setPriceAssertion(null);
        confirmAfterAssert.current = false;
      }
    }
    if (submittable) setPriceError(null);
    if (submittable && contractId && contractId !== (previous?.round?.contractId ?? null)) {
      setRoundBlocked(false);
      purchase.clearOutcome();
    }
    setQuote(body);
    setQuoteRefreshError(null);
    return { ccChanged, submittable };
  }, [purchase]);
  const commitQuoteRef = useRef(commitQuote);
  commitQuoteRef.current = commitQuote;

  useEffect(() => {
    if (purchase.busy) {
      setStep("processing");
      return;
    }
    if (step !== "processing") return;
    if (purchase.submitError === QUOTE_ROUND_CHANGED) {
      setStep("review");
      return;
    }
    if (purchase.submitError) setStep("rejected");
    else if (purchase.phase?.startsWith("Submitted")) setStep("complete");
  }, [purchase.busy, purchase.phase, purchase.submitError, step]);

  const quoteIdentity = quote ? quoteIdentityOf(quote) : "";
  const quoteState = clock?.state ?? null;
  useEffect(() => {
    if (!quoteIdentity || !quoteState) return;
    const shouldPoll =
      roundBlocked || quoteState === "blocked" || quoteState === "expired" || quoteState === "invalid";
    if (!shouldPoll) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const fresh = await requestQuote();
        if (cancelled) return;
        const current = quoteRef.current;
        if (!current || quoteIdentityOf(fresh) !== quoteIdentityOf(current)) {
          commitQuoteRef.current(fresh);
        }
        setQuoteRefreshError(null);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "The network quote is unavailable.";
          setQuoteRefreshError(message === "fetch failed" ? "The network quote is unavailable." : message);
        }
      }
      if (!cancelled) {
        timer = window.setTimeout(() => {
          void poll();
        }, 2000);
      }
    };
    timer = window.setTimeout(() => {
      void poll();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [quoteIdentity, quoteState, roundBlocked]);

  const connected = purchase.connection?.isConnected === true;
  const partyId = purchase.primaryAccount?.partyId ?? "";
  const selected = members.find((member) => member.memberId === selectedMemberId) ?? null;
  const networks = quote?.domainIds.length ? quote.domainIds : domainId ? [domainId] : [];
  const railStep: (typeof RAIL)[number] =
    step === "processing" || step === "rejected" ? "review" : step === "complete" ? "complete" : step;
  const shortfall =
    purchase.insufficientBalance &&
    purchase.requiredCc !== null &&
    purchase.totalCc !== null
      ? purchase.requiredCc - purchase.totalCc
      : 0;

  function onNetworkChange(next: string) {
    if (next === domainId) {
      return;
    }
    setDomainId(next);
    setMembers([]);
    setSelectedMemberId(null);
    setLookupError(null);
    setLookupMessage("");
    setAgreed(false);
    setJurisdictionConfirmed(false);
    setStep("target");
    purchase.clearOutcome();
  }

  const networkDisconnected =
    connected && purchase.connection?.isNetworkConnected === false;
  const networkReason = purchase.connection?.networkReason ?? "network unavailable";

  const handleModeSwitch = (next: AmountMode) => {
    if (!quote || requestedBytes == null) {
      setMode(next);
      return;
    }
    const nextQuote = quoteFromBytes(requestedBytes, quote.rates);
    if (next === "bytes") setRawAmount(formatGroupedAmount(String(requestedBytes)));
    if (next === "usd") setRawAmount(formatGroupedAmount(nextQuote.usd.toFixed(2)));
    if (next === "cc") setRawAmount(formatGroupedAmount(nextQuote.cc.toFixed(2)));
    setMode(next);
    setAgreed(false);
    setJurisdictionConfirmed(false);
  };

  const handleAmountChange = (value: string) => {
    const formatted = formatGroupedAmount(value);
    setRawAmount(formatted);
    setAgreed(false);
    setJurisdictionConfirmed(false);
    setPriceError(null);
    setPriceAssertion(null);
    if (!quote) {
      setRequestedBytes(null);
      return;
    }
    const parsed = parseAmount(formatted);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRequestedBytes(null);
      return;
    }
    const nextBytes = Math.round(quoteForMode(mode, parsed, quote.rates).bytes);
    setRequestedBytes(nextBytes > 0 ? nextBytes : null);
  };

  const quoteReady = Boolean(
    amountQuote && !amountQuote.belowMinimum && shortfall <= 0 && submissionOpen,
  );

  const assertPurchasePrice = async (): Promise<boolean> => {
    const bytes = requestedBytesRef.current;
    if (bytes == null || bytes <= 0) return false;
    setCheckingPrice(true);
    setPriceError(null);
    try {
      const fresh = await requestQuote();
      const result = commitQuote(fresh);
      if (!result.submittable) {
        setPriceAssertion(null);
        const freshNow = Date.parse(fresh.quotedAt);
        const freshState = quoteClock(fresh.validUntil, Number.isFinite(freshNow) ? freshNow : Date.now()).state;
        setPriceError(
          freshState === "invalid" ? "Quote timing is unavailable." : "Waiting for the next CC price.",
        );
        return false;
      }
      if (result.ccChanged) return false;
      const next = quoteFromBytes(bytes, fresh.rates);
      if (next.belowMinimum || !coversMinimumPurchaseUsd(next.cc, fresh.rates)) {
        setPriceAssertion({ ok: false });
        setPriceError(`Minimum is ${formatUsd(minimumPurchaseUsd(fresh.rates))}.`);
        return false;
      }
      setPriceAssertion({ ok: true });
      return true;
    } catch (error) {
      setPriceAssertion(null);
      setPriceError(error instanceof Error ? error.message : "The network quote is unavailable.");
      return false;
    } finally {
      setCheckingPrice(false);
    }
  };

  useEffect(() => {
    if (step !== "review") return;
    let cancelled = false;
    setReviewChecked(false);
    void assertPurchasePrice().finally(() => {
      if (!cancelled) setReviewChecked(true);
    });
    return () => {
      cancelled = true;
    };
    // Re-check when the review page opens. Confirm runs the same check again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (!confirmAfterAssert.current || checkingPrice) return;
    if (!priceAssertion?.ok) {
      confirmAfterAssert.current = false;
      return;
    }
    confirmAfterAssert.current = false;
    void purchase.onPurchase();
  }, [checkingPrice, priceAssertion, purchase]);
  const assemblyMode: AssemblyMode = purchase.phase?.startsWith("Submitted")
    ? "done"
    : purchase.phase?.includes("wallet")
      ? "wallet"
      : "submit";

  return (
    <>
      <p className="sr-only" aria-live="polite">
        {[purchase.phase, lookupMessage, quoteStatus].filter(Boolean).join(". ")}
      </p>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-[calc(var(--banner-h,0px)+1rem)] focus:left-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-3">
        Skip to content
      </a>
      <header className="sticky top-[calc(var(--banner-h,0px)+1rem)] z-30 mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-full border border-white/80 bg-white/80 py-3 pr-3 pl-5 bar-shadow backdrop-blur-md">
        <Link href="/" className="font-bold tracking-tight text-primary no-underline">
          Validator Traffic
        </Link>
        <div className="flex items-center gap-2">
          {connected && purchase.totalCc !== null ? (
            <p className="text-sm font-bold tracking-tight text-primary">{formatCc(purchase.totalCc)}</p>
          ) : null}
          <button
            type="button"
            className={`inline-flex h-12 max-w-48 items-center truncate rounded-full px-4 text-sm font-bold tracking-tight ${connected ? "bg-primary text-white" : "border border-line bg-surface text-primary"}`}
            onClick={() => setWalletOpen(true)}
          >
            {connected && partyId ? shortParty(partyId) : "Connect wallet"}
          </button>
        </div>
      </header>

      <main id="main" className="relative mx-auto mt-6 mb-10 w-full max-w-2xl">
        <ol
          className="mb-4 flex items-center justify-between gap-2 px-1 min-[1100px]:absolute min-[1100px]:top-2 min-[1100px]:right-[calc(100%+1.5rem)] min-[1100px]:mb-0 min-[1100px]:w-max min-[1100px]:flex-col min-[1100px]:items-start min-[1100px]:px-0"
          aria-label="Purchase progress"
        >
          {RAIL.map((item) => {
            const current = RAIL.indexOf(railStep);
            const index = RAIL.indexOf(item);
            const state = index < current ? "done" : index === current ? "current" : "upcoming";
            return (
              <li
                key={item}
                aria-current={state === "current" ? "step" : undefined}
                className={`flex h-12 shrink-0 items-center gap-2 text-sm font-bold ${state === "done" ? "text-accent-strong" : state === "current" ? "text-primary" : "text-ink-muted"}`}
              >
                <span
                  className={`size-[0.7rem] rounded-full ${state === "done" ? "bg-[#3b82f6]" : state === "current" ? "bg-primary shadow-[0_0_0_4px_rgb(59_130_246/0.28)]" : "bg-track"}`}
                />
                {RAIL_LABEL[item]}
              </li>
            );
          })}
        </ol>

        <div ref={windowRef} className="rounded-xl border border-white/70 bg-surface p-6 panel-shadow">
          {step !== "target" && !quote && !quoteError ? (
            <p className="text-sm text-ink-muted">Reading the network quote…</p>
          ) : null}
          {step === "target" ? (
            <form
              className="grid gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                void onLookup();
              }}
            >
              <h2 className="text-[clamp(1.8rem,3vw,2.3rem)] leading-tight font-bold tracking-tight text-primary">
                Validator
              </h2>
              {networks.length > 1 ? (
                <div className="grid gap-2">
                  <p className="text-sm font-bold">Network</p>
                  <NetworkMenu value={domainId} options={networks} onChange={onNetworkChange} />
                </div>
              ) : null}
              <div className="grid gap-2">
                <label className="text-sm font-bold" htmlFor="validator-query">
                  Validator ID or account
                </label>
                <div className="flex gap-2">
                  <input
                    id="validator-query"
                    className="h-12 min-w-0 flex-1 rounded-md border border-line px-4 font-mono"
                    value={lookupQuery}
                    placeholder="PAR::"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setLookupQuery(event.target.value)}
                  />
                  <button
                    className={`${secondaryButton} w-28 shrink-0`}
                    type="submit"
                    disabled={lookingUp || !domainId}
                  >
                    {lookingUp ? "Finding…" : "Find"}
                  </button>
                </div>
                <p className="text-sm text-ink-muted">
                  {quote?.fixture
                    ? "Local preview. Paste any participant id. The deployed app calls Scan."
                    : proxy
                      ? "This scan proxy does not publish participant lookup. Paste a participant or party id when a Scan that exposes those reads is available."
                      : "Paste a participant id (PAR::…) or a party id."}
                </p>
                {quoteError ? <p className="text-sm text-danger">{uiErrorName(quoteError)}</p> : null}
                {!quote && !quoteError ? <p className="text-sm text-ink-muted">Reading the network quote…</p> : null}
                {lookupError ? <p className="text-sm text-danger">{uiErrorName(lookupError)}</p> : null}
                {lookupMessage ? <p className="text-sm text-ink-muted">{lookupMessage}</p> : null}
              </div>
              <div className="grid gap-3" role="radiogroup" aria-label="Matching validators">
                {members.map((member) => (
                  <label
                    key={member.memberId}
                    className={`grid cursor-pointer grid-cols-[auto_1fr] gap-x-2 rounded-lg border p-4 ${member.memberId === selectedMemberId ? "border-accent-strong bg-accent-soft" : "border-line bg-surface"}`}
                  >
                    <input
                      className="mt-1 size-[18px] accent-primary"
                      type="radio"
                      name="member"
                      value={member.memberId}
                      checked={member.memberId === selectedMemberId}
                      onChange={() => {
                        setSelectedMemberId(member.memberId);
                        setAgreed(false);
                        setJurisdictionConfirmed(false);
                      }}
                    />
                    <span className="font-mono font-medium break-all">{member.memberId}</span>
                  </label>
                ))}
              </div>
              {selected ? (
                <div className="grid gap-2 rounded-md bg-surface-sunken p-4">
                  <p className="font-mono text-sm text-ink-muted">{selected.memberId}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-sm text-ink-muted">Allowance</p>
                      <p className="font-bold">{formatBytes(selected.totalLimit)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-ink-muted">Purchased</p>
                      <p className="font-bold">{formatBytes(selected.totalPurchased)}</p>
                    </div>
                  </div>
                  {selected.availableBytes === 0 ? (
                    <p className="text-sm text-ink-muted">This validator has no traffic left to submit.</p>
                  ) : null}
                </div>
              ) : null}
              <button
                className={primaryButton}
                type="button"
                disabled={!selected || !quote || selected.availableBytes === 0}
                onClick={() => setStep("quote")}
              >
                Continue
              </button>
            </form>
          ) : null}

          {step === "quote" && quote ? (
            <form
              className="grid gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (!connected) {
                  setWalletOpen(true);
                  return;
                }
                if (!quoteReady) return;
                void assertPurchasePrice().then((ok) => {
                  if (ok) setStep("review");
                });
              }}
            >
              <h2 className="text-[clamp(1.8rem,3vw,2.3rem)] leading-tight font-bold tracking-tight text-primary">
                Amount
              </h2>
              <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-sunken p-1" role="group" aria-label="How to enter the amount">
                {(
                  [
                    ["bytes", "Traffic"],
                    ["usd", "USD"],
                    ["cc", "CC"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    className={`h-10 rounded-sm font-bold ${mode === value ? "bg-primary text-white" : "text-ink-muted"}`}
                    onClick={() => handleModeSwitch(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2">
                <div className="grid gap-2 rounded-md bg-surface-sunken p-4 focus-within:shadow-[inset_0_0_0_2px_var(--color-primary)]">
                  <label className="text-sm font-bold" htmlFor="amount-input">
                    {mode === "bytes" ? "Traffic in bytes" : mode === "usd" ? "Budget in USD" : "Budget in CC"}
                  </label>
                  <input
                    id="amount-input"
                    className="w-full border-0 bg-transparent text-[clamp(2rem,5vw,2.8rem)] font-bold tracking-tight text-primary outline-none"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    value={rawAmount}
                    onChange={(event) => handleAmountChange(event.target.value)}
                  />
                </div>
                {amountQuote?.belowMinimum ? (
                  <p className="text-sm text-danger">
                    Minimum is {formatBytes(purchaseMinBytes(quote.fees.minTopupBytes))}.
                  </p>
                ) : null}
                {priceError ? <p className="text-sm text-danger">{priceError}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                <span>
                  {formatUsd(quote.rates.extraTrafficPriceUsdPerMb)} per MB · {quote.rates.amuletPriceUsd.toFixed(4)} USD per CC
                </span>
                <PriceEstimateInfo
                  showEst={false}
                  note={CC_RATE_NOTE}
                  label="About the CC price"
                  align="start"
                />
                {!amountQuote && clock ? (
                  <QuoteCountdown state={clock.state} remainingMs={clock.remainingMs} />
                ) : null}
              </div>
              {quoteStatus ? (
                <p className={`text-sm ${clock?.state === "warning" ? "text-warning" : "text-danger"}`}>
                  {quoteStatus}
                </p>
              ) : null}
              {quoteRefreshError ? <p className="text-sm text-danger">{uiErrorName(quoteRefreshError)}</p> : null}
              {amountQuote ? (
                <div className="grid gap-2">
                  {mode === "bytes" ? (
                    <>
                      <p className="text-sm text-ink-muted">You pay</p>
                      <p className="flex flex-wrap items-baseline gap-2 text-[1.8rem] font-bold tracking-tight text-primary">
                        <AnimatedCc value={payCc} refreshKey={priceRefresh} />
                        {clock ? <QuoteCountdown state={clock.state} remainingMs={clock.remainingMs} /> : null}
                        <PriceEstimateInfo align="start" />
                      </p>
                      <p className="flex flex-wrap items-baseline gap-2 text-[1.8rem] font-bold tracking-tight text-primary">
                        <span>{formatUsd(payUsd)}</span>
                        <EstimateTag />
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-ink-muted">Traffic you receive</p>
                      <p className="flex flex-wrap items-baseline gap-2 text-[1.8rem] font-bold tracking-tight text-primary">
                        <span>{formatTrafficMb(amountQuote.bytes)}</span>
                        <PriceEstimateInfo align="start" />
                      </p>
                      <p className="flex flex-wrap items-baseline gap-1.5 text-sm text-ink-muted">
                        <AnimatedCc value={payCc} refreshKey={priceRefresh} />
                        {clock ? <QuoteCountdown state={clock.state} remainingMs={clock.remainingMs} /> : null}
                        <span>· {formatUsd(payUsd)}</span>
                        <EstimateTag />
                      </p>
                    </>
                  )}
                </div>
              ) : null}
              {shortfall > 0 ? (
                <p className="rounded-md bg-accent-soft p-4 font-bold text-primary">
                  Need {formatCc(shortfall)} more. Add CC in your wallet, then come back. This app does not take a card payment.
                </p>
              ) : null}
              {networkDisconnected ? (
                <p className="text-sm text-danger">
                  Wallet is not connected to a Canton network ({networkReason}).
                </p>
              ) : null}
              <div className="grid gap-3">
                <button
                  className={primaryButton}
                  type="submit"
                  disabled={checkingPrice || purchase.preparing || !submissionOpen || (connected && !quoteReady)}
                >
                  {!submissionOpen
                    ? "Waiting for CC price…"
                    : checkingPrice
                      ? "Checking price…"
                      : !connected && amountQuote && !amountQuote.belowMinimum
                        ? "Connect wallet"
                        : "Review"}
                </button>
                <button className={ghostButton} type="button" onClick={() => setStep("target")}>
                  Back
                </button>
              </div>
            </form>
          ) : null}

          {step === "review" && quote && amountQuote && selected ? (
            <form
              className="grid gap-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !submissionOpen ||
                  !purchaseConfirmReady({
                    termsAccepted: agreed,
                    jurisdictionConfirmed,
                  }) ||
                  !purchase.canPurchase ||
                  purchase.busy ||
                  purchase.preparing
                ) {
                  return;
                }
                confirmAfterAssert.current = true;
                void assertPurchasePrice();
              }}
            >
              <h2 className="text-[clamp(1.8rem,3vw,2.3rem)] leading-tight font-bold tracking-tight text-primary">
                Review
              </h2>
              <section className="grid gap-4 rounded-md bg-surface-sunken p-4" aria-label="Transfer">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid min-w-0 gap-1">
                    <p className="text-sm text-ink-muted">You send</p>
                    <p className="flex flex-wrap items-baseline gap-x-1.5 text-[1.7rem] leading-none font-bold tracking-tight text-primary">
                      <AnimatedCc value={payCc} refreshKey={priceRefresh} />
                      {clock ? <QuoteCountdown state={clock.state} remainingMs={clock.remainingMs} /> : null}
                      <PriceEstimateInfo align="start" />
                    </p>
                    <p className="text-sm text-ink-muted">{formatUsd(payUsd)}</p>
                  </div>
                  <div className="grid min-w-0 gap-1 text-right">
                    <p className="text-sm text-ink-muted">Traffic</p>
                    <p className="flex flex-wrap items-baseline justify-end gap-x-1.5 text-[1.7rem] leading-none font-bold tracking-tight text-primary">
                      <span>{formatTrafficMb(amountQuote.bytes)}</span>
                      <EstimateTag />
                    </p>
                    <p className="text-sm text-ink-muted">{formatBytes(amountQuote.bytes)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-t border-line pt-4">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="text-sm text-ink-muted">From wallet</p>
                    <p className="truncate font-bold tracking-tight text-primary" title={partyId}>
                      {partyId ? shortParty(partyId) : "—"}
                    </p>
                  </div>
                  <span aria-hidden="true" className="text-lg leading-none text-ink-muted">→</span>
                  <div className="grid min-w-0 gap-0.5 text-right">
                    <p className="text-sm text-ink-muted">To validator</p>
                    <p className="truncate font-bold tracking-tight text-primary" title={selected.memberId}>
                      {validatorName(selected.memberId)}
                    </p>
                  </div>
                </div>
              </section>
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                <span>{quote.rates.amuletPriceUsd.toFixed(4)} USD per CC</span>
                <PriceEstimateInfo
                  showEst={false}
                  note={CC_RATE_NOTE}
                  label="About the CC price"
                  align="start"
                />
              </p>
              {quoteStatus ? (
                <p className={`text-sm ${clock?.state === "warning" ? "text-warning" : "text-danger"}`}>
                  {quoteStatus}
                </p>
              ) : null}
              {quoteRefreshError ? <p className="text-sm text-danger">{uiErrorName(quoteRefreshError)}</p> : null}
              {priceError ? <p className="text-sm text-danger">{priceError}</p> : null}
              <p className="text-sm text-ink">CC spent on traffic does not come back. The traffic stays with that validator.</p>
              <PathMenu value={purchase.pathMode} onChange={purchase.setPathMode} />
              {purchase.pathStatus && purchase.pathStatus.path !== "token-standard" ? (
                <p className="text-sm text-ink-muted">
                  {purchase.pathLabel}. {purchase.pathStatus.detail}
                </p>
              ) : null}
              {networkDisconnected ? (
                <p className="text-sm text-danger">
                  Wallet is not connected to a Canton network ({networkReason}).
                </p>
              ) : null}
              {purchase.submitError ? <p className="text-sm text-danger">{uiErrorName(purchase.submitError)}</p> : null}
              {purchase.contextError ? <p className="text-sm text-danger">{uiErrorName(purchase.contextError)}</p> : null}
              {purchase.pathError ? <p className="text-sm text-danger">{uiErrorName(purchase.pathError)}</p> : null}
              {purchase.pathStatus?.transferFactoryProbeError ? (
                <p className="text-sm text-danger">{uiErrorName(purchase.pathStatus.transferFactoryProbeError)}</p>
              ) : null}
              <label className="flex items-start gap-2">
                <input
                  className="mt-1 size-[18px] accent-primary"
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <span>
                  I agree to the <Link href="/terms" className="font-bold text-primary">Terms</Link>.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  className="mt-1 size-[18px] accent-primary"
                  type="checkbox"
                  checked={jurisdictionConfirmed}
                  onChange={(event) => setJurisdictionConfirmed(event.target.checked)}
                />
                <span>I may buy traffic in my jurisdiction.</span>
              </label>
              <div className="grid gap-3">
                <button
                  className={primaryButton}
                  type="submit"
                  disabled={
                    checkingPrice ||
                    purchase.preparing ||
                    !submissionOpen ||
                    !reviewChecked ||
                    Boolean(priceError) ||
                    priceAssertion?.ok === false ||
                    !purchaseConfirmReady({
                      termsAccepted: agreed,
                      jurisdictionConfirmed,
                    }) ||
                    !purchase.canPurchase ||
                    purchase.busy
                  }
                >
                  {!submissionOpen
                    ? "Waiting for CC price…"
                    : checkingPrice || purchase.preparing
                      ? "Checking price…"
                      : "Confirm in wallet"}
                </button>
                <button className={ghostButton} type="button" onClick={() => setStep("quote")}>
                  Back
                </button>
              </div>
            </form>
          ) : null}

          {step === "processing" ? (
            <div className="grid gap-6">
              <h2 className="text-[clamp(1.8rem,3vw,2.3rem)] leading-tight font-bold tracking-tight text-primary">
                Processing
              </h2>
              <Assembly mode={assemblyMode} />
              <p className="text-lg font-bold tracking-tight" aria-live="polite">
                {purchase.phase ?? "Waiting for wallet"}
              </p>
              {purchase.approvalUrl ? (
                <a className={primaryButton} href={purchase.approvalUrl} target="_blank" rel="noreferrer">
                  Open wallet
                </a>
              ) : null}
            </div>
          ) : null}

          {step === "rejected" ? (
            <div className="grid gap-6">
              <h2 className="text-[clamp(1.8rem,3vw,2.3rem)] leading-tight font-bold tracking-tight text-primary">
                Not approved
              </h2>
              <p className="text-sm text-ink-muted">{purchase.submitError ? uiErrorName(purchase.submitError) : "The purchase was not confirmed."}</p>
              <button
                className={primaryButton}
                type="button"
                onClick={() => {
                  purchase.clearOutcome();
                  setStep("review");
                }}
              >
                Back to review
              </button>
            </div>
          ) : null}

          {step === "complete" && amountQuote && selected ? (
            <div className="grid gap-6">
              <h2 className="text-[clamp(1.8rem,3vw,2.3rem)] leading-tight font-bold tracking-tight text-primary">
                Traffic credited
              </h2>
              <Assembly mode="done" />
              <dl className="grid gap-3 rounded-md bg-surface-sunken p-4">
                <ReviewRow label="Validator" value={selected.memberId} mono />
                <ReviewRow label="Traffic" value={formatBytes(amountQuote.bytes)} />
                <ReviewRow label="CC removed" value={formatCc(payCc)} />
                <ReviewRow
                  label="Balance"
                  value={purchase.totalCc !== null ? formatCc(purchase.totalCc) : "—"}
                />
                <ReviewRow
                  label={purchase.updateId ? "Update ID" : "Reference"}
                  value={purchase.updateId ?? purchase.commandId ?? ""}
                  href={
                    purchase.updateId &&
                    quote &&
                    isLedgerUpdateId(purchase.updateId)
                      ? lighthouseTransactionUrl(purchase.updateId, quote.scanBaseUrl)
                      : undefined
                  }
                  mono
                />
              </dl>
              <button
                className={primaryButton}
                type="button"
                onClick={() => {
                  purchase.clearOutcome();
                  setAgreed(false);
                  setJurisdictionConfirmed(false);
                  setStep("target");
                }}
              >
                Buy again
              </button>
            </div>
          ) : null}
        </div>
      </main>
      <div className="mx-auto w-full max-w-2xl">
        <SiteFooter contained />
      </div>
      <WalletDialog open={walletOpen} onClose={() => setWalletOpen(false)} />
    </>
  );
}

function ReviewRow({
  label,
  value,
  href,
  mono = false,
  emphasis = false,
  estimate,
}: {
  label: string;
  value: string;
  href?: string;
  mono?: boolean;
  emphasis?: boolean;
  estimate?: "tag" | "info";
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd
        className={`text-right font-bold ${mono ? "break-all font-mono font-medium" : estimate ? "flex flex-wrap items-baseline justify-end gap-x-1.5" : "break-all"} ${emphasis ? "text-lg" : ""}`}
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-accent-strong underline"
            title="Open in Lighthouse"
          >
            {value}
          </a>
        ) : (
          <span>{value}</span>
        )}
        {estimate === "info" ? <PriceEstimateInfo align="end" /> : null}
        {estimate === "tag" ? <EstimateTag /> : null}
      </dd>
    </div>
  );
}
