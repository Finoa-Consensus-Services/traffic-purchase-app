"use client";

import { useEffect, useMemo, useState } from "react";
import { WalletConnectPanel } from "@/components/WalletConnectPanel";
import { PurchasePanel } from "@/components/PurchasePanel";
import { EstimateTag, PriceEstimateInfo } from "@/components/buy/PriceEstimateInfo";
import { purchaseMinBytes, quoteFromBytes, type TrafficRates } from "@/lib/pricing";
import { uiErrorName } from "@/lib/ui-error-name";

type QuoteResponse = {
  ok: true;
  scanBaseUrl: string;
  proxy: boolean;
  fees: {
    extraTrafficPriceUsdPerMb: number;
    minTopupBytes: number;
    baseRateBurstBytes: number | null;
    activeSynchronizer: string | null;
  };
  round: {
    round: string;
    amuletPriceUsd: number;
    opensAt: string | null;
    targetClosesAt: string | null;
  } | null;
  rates: TrafficRates;
  snapshotId: string;
  domainIds: string[];
  defaultDomainId: string | null;
  quoteSource: "open-mining-round" | "external-party-config";
  receiver: {
    status: "configured" | "not-configured";
    partyId: string | null;
    detail: string;
    source: "env" | "reserved" | "none";
  };
};

type MemberTraffic = {
  memberId: string;
  totalConsumed: number;
  totalLimit: number;
  totalPurchased: number;
  availableBytes: number;
};

function availableBytesOf(member: MemberTraffic): number {
  if (Number.isFinite(member.availableBytes)) {
    return member.availableBytes;
  }
  return Math.max(0, member.totalLimit - member.totalConsumed);
}

function formatBytes(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.round(value),
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(value);
}

function ratesFrom(quote: QuoteResponse): TrafficRates {
  return quote.rates;
}

export function Explorer() {
  const [proxy, setProxy] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [domainId, setDomainId] = useState("");
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberTraffic[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await loadQuote();
      if (cancelled) {
        return;
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // First read on open. Public Scan needs no token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadQuote() {
    setQuoteError(null);
    try {
      const response = await fetch("/api/quote");
      const body = (await response.json()) as QuoteResponse | {
        error?: string;
        proxy?: boolean;
      };
      if ("proxy" in body && typeof body.proxy === "boolean") {
        setProxy(body.proxy);
      }
      if (!response.ok || !("ok" in body) || !body.ok) {
        const message =
          "error" in body && body.error
            ? body.error
            : "The scan proxy did not return a quote";
        throw new Error(message);
      }
      setQuote(body);
      setDomainId(body.defaultDomainId ?? "");
    } catch (error) {
      setQuote(null);
      setQuoteError(error instanceof Error ? error.message : "Quote failed");
    }
  }

  async function onLookup() {
    setLookingUp(true);
    setLookupError(null);
    setMembers([]);
    setSelectedMemberId(null);
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
        throw new Error(
          "error" in body && body.error ? body.error : "Lookup failed",
        );
      }
      setMembers(body.members);
      setSelectedMemberId(body.members[0]?.memberId ?? null);
    } catch (error) {
      setLookupError(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setLookingUp(false);
    }
  }

  const priced = quote
    ? quoteFromBytes(quote.fees.minTopupBytes, ratesFrom(quote))
    : null;

  const purchaseRates = useMemo(
    (): TrafficRates | null => (quote ? ratesFrom(quote) : null),
    [quote],
  );

  return (
    <>
      <WalletConnectPanel />
      <section className="panel">
        <h2>Scan API price</h2>
        {quoteError ? <p className="error">{uiErrorName(quoteError)}</p> : null}
        {!quote && !quoteError ? (
          <p className="note">Reading Scan API…</p>
        ) : null}
        {quote && priced ? (
          <>
            <dl className="facts">
              <div>
                <dt>Extra traffic price</dt>
                <dd>{formatMoney(quote.fees.extraTrafficPriceUsdPerMb)} USD per MB</dd>
              </div>
              <div>
                <dt>CC price</dt>
                <dd className="inline-flex flex-wrap items-baseline gap-1.5">
                  <span>
                    {formatMoney(quote.rates.amuletPriceUsd)} USD
                    {quote.round
                      ? `, open mining round ${quote.round.round}`
                      : ""}
                  </span>
                  <PriceEstimateInfo showEst={false} align="start" />
                </dd>
              </div>
              <div>
                <dt>Network minimum</dt>
                <dd>{formatBytes(quote.fees.minTopupBytes)} bytes</dd>
              </div>
              <div>
                <dt>Purchase minimum</dt>
                <dd>{formatBytes(purchaseMinBytes(quote.fees.minTopupBytes))} bytes</dd>
              </div>
              <div>
                <dt>Quote source</dt>
                <dd>
                  {quote.quoteSource === "external-party-config"
                    ? "External party config"
                    : "Open mining round"}
                  {quote.snapshotId ? ` · ${quote.snapshotId}` : ""}
                </dd>
              </div>
              <div>
                <dt>Traffic-purchase receiver</dt>
                <dd>{quote.receiver.detail}</dd>
              </div>
              <div>
                <dt>Bytes</dt>
                <dd>{formatBytes(priced.bytes)}</dd>
              </div>
              <div>
                <dt>USD</dt>
                <dd className="inline-flex items-baseline gap-1.5">
                  <span>{formatMoney(priced.usd)}</span>
                  <EstimateTag />
                </dd>
              </div>
              <div>
                <dt>Canton Coin</dt>
                <dd className="inline-flex items-baseline gap-1.5">
                  <span>{formatMoney(priced.cc)}</span>
                  <EstimateTag />
                </dd>
              </div>
            </dl>
            {quote.receiver.partyId ? (
              <p className="note">
                Receiver party: <code>{quote.receiver.partyId}</code>
              </p>
            ) : null}
            <p className="note">
              CC = (bytes / 1,000,000) × USD per MB / CC price. Shown at the
              network minimum
              {quote.round
                ? `, bound to open mining round ${quote.round.round}`
                : ", bound to external party config snapshot"}.
            </p>
          </>
        ) : null}
      </section>

      <section className="panel">
        <h2>Validator traffic</h2>
        <p className="note">
          {proxy
            ? "This scan proxy does not publish participant lookup or traffic status. Paste a participant or party id here once a Scan that exposes those reads is available."
            : "Paste a participant id (PAR::…) or a party id. A party id is resolved to the participants that host it."}
        </p>
        <dl className="facts">
          <div>
            <dt>Synchronizer id</dt>
            <dd>
              {domainId ? <code>{domainId}</code> : "Reading from Scan…"}
            </dd>
          </div>
        </dl>
        <div className="row">
          <label>
            Participant or party
            <input
              value={lookupQuery}
              onChange={(event) => setLookupQuery(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void onLookup()} disabled={lookingUp}>
            {lookingUp ? "Looking up…" : "Look up"}
          </button>
        </div>
        {lookupError ? <p className="error">{uiErrorName(lookupError)}</p> : null}
        {members.length > 1 ? (
          <div className="row">
            <label>
              Purchase target
              <select
                value={selectedMemberId ?? ""}
                onChange={(event) => setSelectedMemberId(event.target.value || null)}
              >
                {members.map((member) => (
                  <option key={member.memberId} value={member.memberId}>
                    {member.memberId}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        <div className="members">
          {members.map((member) => {
            const available = availableBytesOf(member);
            return (
            <article className="member" key={member.memberId}>
              <p>
                <code>{member.memberId}</code>
              </p>
              <p className={available === 0 ? "balance empty" : "balance"}>
                <span className="balance-label">Available traffic</span>
                <strong>{formatBytes(available)} bytes</strong>
                {available === 0 ? (
                  <span className="note">
                    This validator has no traffic left to submit.
                  </span>
                ) : null}
              </p>
              <dl className="facts">
                <div>
                  <dt>Consumed</dt>
                  <dd>{formatBytes(member.totalConsumed)} bytes</dd>
                </div>
                <div>
                  <dt>Limit</dt>
                  <dd>{formatBytes(member.totalLimit)} bytes</dd>
                </div>
                <div>
                  <dt>Purchased</dt>
                  <dd>{formatBytes(member.totalPurchased)} bytes</dd>
                </div>
              </dl>
            </article>
            );
          })}
        </div>
      </section>
      {purchaseRates ? (
        <PurchasePanel
          domainId={domainId}
          memberId={selectedMemberId}
          rates={purchaseRates}
          minTopupBytes={quote?.fees.minTopupBytes ?? purchaseRates.minTopupBytes}
          onPurchased={() => {
            if (lookupQuery.trim() && domainId) {
              void onLookup();
            }
          }}
        />
      ) : null}
    </>
  );
}
