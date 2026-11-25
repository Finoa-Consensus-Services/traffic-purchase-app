"use client";

import { useCallback, useEffect, useState } from "react";
import {
  quoteFromBytes,
  trafficBytesFromCc,
  type TrafficRates,
} from "@/lib/pricing";
import type {
  PurchaseContext,
  TokenStandardPurchaseContext,
} from "@/lib/purchase/types";
import type { TransferFactoryChoiceArguments } from "@/lib/purchase/build-transfer-choice-args";
import type { TransferFactoryContext } from "@/lib/purchase/fetch-transfer-factory";
import type { PurchasePath } from "@/lib/purchase/paths";
import { buildTrafficPurchasePrepareExecute } from "@/lib/purchase/build-traffic-purchase";
import {
  isLedgerUpdateId,
  needsLedgerUpdateLookup,
  readLedgerEndOffset,
  resolveSubmittedUpdateId,
} from "@/lib/purchase/ledger-update-id";
import {
  formatInsufficientAmuletBalance,
  selectInputAmuletCids,
} from "@/lib/purchase/amulet-ledger";
import {
  submitPrepareExecute,
  type SubmitProvider,
} from "@/lib/dapp/transactions";
import { useDappContext } from "@/components/DappProvider";
import { useAmuletBalance } from "@/hooks/useAmuletBalance";
import { legacyBuyMemberTrafficInputMinCc } from "@/lib/purchase/legacy-input-buffer";

export const QUOTE_ROUND_CHANGED = "The CC price changed. Review the updated amount.";

type PathMode = "token-standard" | "legacy";

type PathStatusResponse = {
  ok: true;
  path: PurchasePath;
  detail: string;
  receiverPartyId: string | null;
  transferFactoryAvailable: boolean;
  transferFactoryProbeError: string | null;
  transferFactoryPathUsed: string | null;
  tokenStandardAvailable: boolean;
};

function withSynchronizer(path: string, synchronizerId: string) {
  const id = synchronizerId.trim();
  if (!id) {
    return path;
  }
  const params = new URLSearchParams({ synchronizerId: id });
  return `${path}?${params.toString()}`;
}

type Options = {
  domainId: string;
  memberId: string | null;
  rates: TrafficRates | null;
  bytes: string;
  /** Quote's open-round contract. Omit to skip the check. Null fails closed. */
  roundContractId?: string | null;
  onQuoteStale?: () => void;
  onPurchased?: () => void;
};

export function useTrafficPurchase({
  domainId,
  memberId,
  rates,
  bytes,
  roundContractId,
  onQuoteStale,
  onPurchased,
}: Options) {
  const { connection, primaryAccount, status, ledgerApi, purchaseSession, previewCc } = useDappContext();
  const {
    totalCc,
    loading: balanceLoading,
    error: balanceError,
    refresh: refreshBalance,
  } = useAmuletBalance();
  const [context, setContext] = useState<PurchaseContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [pathStatus, setPathStatus] = useState<PathStatusResponse | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [pathMode, setPathMode] = useState<PathMode>("token-standard");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setContext(null);
    async function load() {
      setContextError(null);
      try {
        const response = await fetch(withSynchronizer("/api/purchase-context", domainId));
        const body = (await response.json()) as
          | { ok: true; context: PurchaseContext }
          | { error?: string };
        if (!response.ok || !("ok" in body) || !body.ok) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Purchase context unavailable",
          );
        }
        if (!cancelled) {
          setContext(body.context);
        }
      } catch (error) {
        if (!cancelled) {
          setContext(null);
          setContextError(
            error instanceof Error ? error.message : "Purchase context failed",
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [domainId]);

  useEffect(() => {
    const partyId = primaryAccount?.partyId;
    let cancelled = false;
    setPathStatus(null);
    async function loadPath() {
      setPathError(null);
      try {
        const headers: HeadersInit = {};
        if (partyId) {
          headers["x-probe-sender"] = partyId;
        }
        const response = await fetch(
          withSynchronizer("/api/purchase/path-status", domainId),
          { headers },
        );
        const body = (await response.json()) as
          | PathStatusResponse
          | { error?: string };
        if (!response.ok || !("ok" in body) || !body.ok) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Purchase path status unavailable",
          );
        }
        if (!cancelled) {
          setPathStatus(body);
        }
      } catch (error) {
        if (!cancelled) {
          setPathStatus(null);
          setPathError(
            error instanceof Error ? error.message : "Path detection failed",
          );
        }
      }
    }
    void loadPath();
    return () => {
      cancelled = true;
    };
  }, [domainId, primaryAccount?.partyId]);

  const resolvedPath = pathMode;

  const trafficBytes = Number(bytes);
  const priced =
    rates && Number.isFinite(trafficBytes) && trafficBytes > 0
      ? quoteFromBytes(trafficBytes, rates)
      : null;
  const chargedCc = priced?.cc ?? null;

  const effectiveBytes =
    priced && rates && chargedCc != null && resolvedPath === "token-standard"
      ? trafficBytesFromCc(chargedCc, rates)
      : priced?.bytes ?? null;

  const legacyInputCc =
    priced && chargedCc != null && resolvedPath === "legacy"
      ? legacyBuyMemberTrafficInputMinCc(chargedCc)
      : chargedCc;

  const requiredCc = legacyInputCc;

  const insufficientBalance =
    priced &&
    totalCc !== null &&
    !balanceLoading &&
    requiredCc !== null &&
    requiredCc > totalCc;

  const canPurchase =
    connection?.isConnected === true &&
    connection.isNetworkConnected !== false &&
    primaryAccount?.status === "allocated" &&
    Boolean(primaryAccount.partyId) &&
    Boolean(memberId) &&
    Boolean(context) &&
    Boolean(rates) &&
    Boolean(priced) &&
    !priced?.belowMinimum &&
    !insufficientBalance &&
    !balanceLoading &&
    totalCc !== null &&
    Boolean(domainId) &&
    (resolvedPath !== "token-standard" || Boolean(pathStatus?.receiverPartyId));

  const clearOutcome = useCallback(() => {
    setPhase(null);
    setUpdateId(null);
    setCommandId(null);
    setSubmitError(null);
    setApprovalUrl(null);
  }, []);

  const onPurchase = useCallback(async () => {
    if (!canPurchase || !context || !memberId || !priced || !primaryAccount || !rates) {
      return;
    }
    const requiredInputCc =
      resolvedPath === "legacy"
        ? legacyBuyMemberTrafficInputMinCc(chargedCc ?? priced.cc)
        : (chargedCc ?? priced.cc);
    if (totalCc !== null && requiredInputCc > totalCc) {
      setSubmitError(formatInsufficientAmuletBalance(totalCc, requiredInputCc));
      return;
    }
    const matchesQuoteRound = (openRoundContractId: string) => {
      if (roundContractId === undefined) return;
      if (!roundContractId || openRoundContractId !== roundContractId) {
        throw new Error(QUOTE_ROUND_CHANGED);
      }
    };
    setPreparing(true);
    setSubmitError(null);
    setUpdateId(null);
    setCommandId(null);
    setApprovalUrl(null);
    if (previewCc !== null) {
      setBusy(true);
      setPhase("Waiting for wallet approval…");
      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
      setCommandId("local-preview");
      setPhase("Submitted (local preview).");
      setBusy(false);
      setPreparing(false);
      return;
    }
    setPhase("Fetching latest purchase context…");
    try {
      const ledger = async (params: Parameters<typeof ledgerApi>[0]) => {
        const result = await ledgerApi(params);
        return result as Record<string, unknown>;
      };
      const loadPurchaseContext = async (): Promise<PurchaseContext> => {
        const ctxResponse = await fetch(
          withSynchronizer("/api/purchase-context", domainId),
        );
        const ctxBody = (await ctxResponse.json()) as
          | { ok: true; context: PurchaseContext }
          | { error?: string };
        if (!ctxResponse.ok || !("ok" in ctxBody) || !ctxBody.ok) {
          throw new Error(
            "error" in ctxBody && ctxBody.error
              ? ctxBody.error
              : "Purchase context unavailable",
          );
        }
        if (domainId && ctxBody.context.synchronizerId !== domainId) {
          throw new Error(
            `Purchase context is for synchronizer ${ctxBody.context.synchronizerId}, not ${domainId}.`,
          );
        }
        return ctxBody.context;
      };

      const gatedContext = await loadPurchaseContext();
      matchesQuoteRound(gatedContext.openMiningRound.contractId);
      let purchaseContext = gatedContext;
      let tokenStandard: TokenStandardPurchaseContext | undefined;
      if (resolvedPath === "token-standard") {
        const receiverPartyId = pathStatus?.receiverPartyId;
        if (!receiverPartyId) {
          throw new Error("Traffic-purchase receiver is not configured on Scan.");
        }
        setPhase("Fetching Token Standard transfer context…");
        const inputHoldingCids = await selectInputAmuletCids(
          ledger,
          primaryAccount.partyId,
          chargedCc ?? priced.cc,
        );
        const tcResponse = await fetch("/api/purchase/transfer-context", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            senderPartyId: primaryAccount.partyId,
            receiverPartyId,
            memberId,
            synchronizerId: purchaseContext.synchronizerId,
            ccAmount: chargedCc ?? priced.cc,
            inputHoldingCids,
          }),
        });
        const tcBody = (await tcResponse.json()) as
          | {
              ok: true;
              receiverPartyId: string;
              transferFactory: TransferFactoryContext;
              choiceArguments: TransferFactoryChoiceArguments;
            }
          | { error?: string };
        if (!tcResponse.ok || !("ok" in tcBody) || !tcBody.ok) {
          throw new Error(
            "error" in tcBody && tcBody.error
              ? tcBody.error
              : "Transfer context failed",
          );
        }
        tokenStandard = {
          receiverPartyId: tcBody.receiverPartyId,
          transferFactory: tcBody.transferFactory,
          choiceArguments: tcBody.choiceArguments,
        };
      }

      const legacyTrafficBytes =
        resolvedPath === "legacy"
          ? priced.bytes
          : trafficBytesFromCc(chargedCc ?? priced.cc, rates);

      const buildParams = async (
        path: PurchasePath,
        ctx: PurchaseContext,
        ts?: TokenStandardPurchaseContext,
      ) =>
        buildTrafficPurchasePrepareExecute(ledger, {
          path,
          context: ctx,
          tokenStandard: ts,
          providerPartyId: primaryAccount.partyId,
          memberId,
          trafficAmountBytes:
            path === "legacy" ? priced.bytes : legacyTrafficBytes,
          ccAmount: chargedCc ?? priced.cc,
        });

      let ledgerOffsetBeforeSubmit = 0;
      try {
        ledgerOffsetBeforeSubmit = await readLedgerEndOffset(ledgerApi);
      } catch {
        ledgerOffsetBeforeSubmit = 0;
      }

      purchaseContext = await loadPurchaseContext();
      matchesQuoteRound(purchaseContext.openMiningRound.contractId);
      setBusy(true);
      setPhase("Waiting for wallet approval…");
      const primaryParams =
        resolvedPath === "legacy"
          ? await buildParams("legacy", purchaseContext)
          : await buildParams(resolvedPath, purchaseContext, tokenStandard);

      const session = purchaseSession();
      const submitOptions = {
        timeoutMs: 600_000,
        onApprovalUrl: (url: string) => setApprovalUrl(url),
        prepareExecuteAndWait: session?.prepareExecuteAndWait,
        provider: (session?.provider as SubmitProvider | undefined) ?? null,
      };
      const outcome = await submitPrepareExecute(primaryParams, status, submitOptions);

      const pathLabel =
        "usedPath" in outcome && outcome.usedPath === "legacy-fallback"
          ? " (legacy fallback)"
          : resolvedPath === "token-standard"
            ? " (Token Standard)"
            : " (legacy)";
      let succeeded = outcome.ok;
      let reportedUpdateId = outcome.ok ? (outcome.updateId ?? null) : null;
      if (!outcome.ok && outcome.timedOut) {
        setPhase("Reading the ledger update…");
        const found = await resolveSubmittedUpdateId(ledgerApi, {
          partyId: primaryAccount.partyId,
          userId: status?.session?.userId,
          commandOrSubmissionIds: [outcome.commandId],
          beginExclusive: ledgerOffsetBeforeSubmit,
        });
        if (found && isLedgerUpdateId(found)) {
          succeeded = true;
          reportedUpdateId = found;
        }
      }
      if (!succeeded) {
        setSubmitError(outcome.ok ? "The purchase was not confirmed." : outcome.message);
        setPhase(null);
        return;
      }
      let ledgerUpdateId = reportedUpdateId;
      if (needsLedgerUpdateLookup(reportedUpdateId)) {
        setPhase("Reading the ledger update…");
        ledgerUpdateId = await resolveSubmittedUpdateId(ledgerApi, {
          partyId: primaryAccount.partyId,
          userId: status?.session?.userId,
          commandOrSubmissionIds: [reportedUpdateId, outcome.commandId].filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
          beginExclusive: ledgerOffsetBeforeSubmit,
          reportedUpdateId,
        });
      }
      setUpdateId(ledgerUpdateId);
      setCommandId(outcome.commandId);
      setPhase(`Submitted${pathLabel}.`);
      await refreshBalance();
      onPurchased?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Purchase failed";
      if (message === QUOTE_ROUND_CHANGED) onQuoteStale?.();
      setSubmitError(message);
      setPhase(null);
    } finally {
      setBusy(false);
      setPreparing(false);
    }
  }, [
    canPurchase,
    context,
    domainId,
    ledgerApi,
    memberId,
    chargedCc,
    onQuoteStale,
    roundContractId,
    onPurchased,
    pathMode,
    pathStatus?.receiverPartyId,
    previewCc,
    purchaseSession,
    priced,
    primaryAccount,
    rates,
    refreshBalance,
    resolvedPath,
    status,
    totalCc,
  ]);

  const pathLabel =
    resolvedPath === "token-standard"
      ? "Token Standard transfer"
      : "Legacy BuyMemberTraffic";

  return {
    connection,
    primaryAccount,
    contextError,
    pathStatus,
    pathError,
    pathMode,
    setPathMode,
    resolvedPath,
    pathLabel,
    priced,
    effectiveBytes,
    requiredCc,
    insufficientBalance,
    canPurchase,
    onPurchase,
    busy,
    preparing,
    submitError,
    phase,
    updateId,
    commandId,
    approvalUrl,
    clearOutcome,
    totalCc,
    balanceLoading,
    balanceError,
  };
}

export type { PathMode };
