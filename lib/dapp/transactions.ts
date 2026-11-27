import type {
  PrepareExecuteAndWaitResult,
  PrepareExecuteParams,
  StatusEvent,
  TxChangedEvent,
} from "@canton-network/dapp-sdk";
import { dappLog, dappWarn } from "@/lib/dapp/client-log";
import { isLedgerUpdateId } from "@/lib/purchase/ledger-update-id";
import {
  isUnsupportedWalletOperation,
  messageForProviderError,
  messageForTxFailure,
  rpcCodeFromProviderError,
} from "@/lib/dapp/errors";
import { installPopupCapture } from "@/lib/dapp/popup-capture";
import { TIMEOUT_MESSAGE, watchTransaction, type TxListener } from "@/lib/dapp/tx-match";
import { errorCodes } from "@canton-network/core-rpc-errors";

export type SubmitResult =
  | { ok: true; commandId: string; updateId?: string }
  | { ok: false; commandId: string; message: string; code?: number; timedOut?: boolean };

export type SubmitProvider = TxListener<TxChangedEvent> & {
  request(args: { method: "prepareExecute"; params: PrepareExecuteParams }): Promise<unknown>;
};

type SubmitOptions = {
  timeoutMs?: number;
  onApprovalUrl?: (url: string) => void;
  confirmExecuted?: (commandId: string, signal: AbortSignal) => Promise<string>;
  prepareExecuteAndWait?: (params: PrepareExecuteParams) => Promise<PrepareExecuteAndWaitResult>;
  provider?: SubmitProvider | null;
};

function isSyncCapable(status: StatusEvent | null): boolean {
  const type = status?.provider?.providerType;
  return type === "browser" || type === "desktop" || type === "mobile";
}

function updateIdFrom(tx: {
  status?: string;
  payload?: { updateId?: unknown };
}) {
  if (tx.status && tx.status !== "executed") return undefined;
  const updateId =
    tx.payload && "updateId" in tx.payload && tx.payload.updateId != null
      ? String(tx.payload.updateId)
      : "";
  if (!updateId) return undefined;
  // Vala returns the executed update id without the CIP-0103 status field.
  if (!tx.status && !isLedgerUpdateId(updateId)) return undefined;
  return updateId;
}

function txResult(tx: TxChangedEvent, commandId: string): SubmitResult {
  if (tx.status === "executed") {
    const updateId = updateIdFrom(tx);
    const reportedCommandId = tx.commandId || commandId;
    dappLog("purchase", "txChanged executed", { commandId: reportedCommandId, updateId });
    return { ok: true, commandId: reportedCommandId, updateId };
  }
  dappWarn("purchase", "txChanged failed", { commandId, status: tx.status });
  return { ok: false, commandId, message: messageForTxFailure("Transaction failed") };
}

function failure(commandId: string, error: unknown): Extract<SubmitResult, { ok: false }> {
  const timedOut = error instanceof Error && error.message === TIMEOUT_MESSAGE;
  const message = timedOut ? error.message : messageForProviderError(error);
  const rpcCode = rpcCodeFromProviderError(error);
  const code = isUnsupportedWalletOperation(error)
    ? errorCodes.provider.unsupportedMethod
    : rpcCode ?? undefined;
  return { ok: false, commandId, message, code, timedOut };
}

export type PrepareExecuteAttemptResult = SubmitResult & {
  usedPath?: "primary" | "legacy-fallback";
};

export async function submitPrepareExecuteWithLegacyFallback(
  primary: PrepareExecuteParams,
  legacy: PrepareExecuteParams | null,
  status: StatusEvent | null,
  options?: SubmitOptions,
): Promise<PrepareExecuteAttemptResult> {
  const primaryOutcome = await submitPrepareExecute(primary, status, options);
  if (primaryOutcome.ok || !legacy) {
    return { ...primaryOutcome, usedPath: "primary" };
  }
  if (
    primaryOutcome.code !== errorCodes.provider.unsupportedMethod &&
    !primaryOutcome.message.toLowerCase().includes("not support")
  ) {
    return { ...primaryOutcome, usedPath: "primary" };
  }
  dappWarn("purchase", "primary prepare failed; retrying legacy BuyMemberTraffic", {
    message: primaryOutcome.message,
  });
  const legacyOutcome = await submitPrepareExecute(legacy, status, options);
  return { ...legacyOutcome, usedPath: "legacy-fallback" };
}

export async function submitPrepareExecute(
  params: PrepareExecuteParams,
  status: StatusEvent | null,
  options?: SubmitOptions,
): Promise<SubmitResult> {
  const commandId =
    params.commandId ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `cmd-${Date.now()}`);
  const request: PrepareExecuteParams = { ...params, commandId };

  dappLog("purchase", "prepareExecute submit", {
    commandId,
    providerId: status?.provider?.id,
    providerType: status?.provider?.providerType,
  });

  const confirmationController = new AbortController();
  const pendingConfirmation = options?.confirmExecuted
    ? options.confirmExecuted(commandId, confirmationController.signal).then((updateId) => ({
        kind: "confirmation" as const,
        updateId,
      }))
    : null;

  try {
    if (isSyncCapable(status) && options?.prepareExecuteAndWait) {
      const provider = options.provider ?? null;
      const watched = provider
        ? watchTransaction(provider, commandId, options.timeoutMs ?? 600_000)
        : null;
      const pendingWait = options.prepareExecuteAndWait(request).then(
        (waited) => ({ kind: "rpc" as const, waited }),
        (error: unknown) => ({ kind: "rpc-error" as const, error }),
      );
      const pendingEvent = watched
        ? watched.promise.then(
            (tx) => ({ kind: "event" as const, tx }),
            (error: unknown) => ({ kind: "event-error" as const, error }),
          )
        : null;
      const outcome = await Promise.race([
        pendingWait,
        ...(pendingEvent ? [pendingEvent] : []),
        ...(pendingConfirmation ? [pendingConfirmation] : []),
      ]);

      if (outcome.kind === "confirmation") {
        watched?.promise.catch(() => {});
        watched?.cancel();
        return { ok: true, commandId, updateId: outcome.updateId };
      }
      if (outcome.kind === "event") {
        pendingWait.then(
          () => {},
          () => {},
        );
        return txResult(outcome.tx, commandId);
      }
      if (outcome.kind === "event-error") {
        return failure(commandId, outcome.error);
      }
      if (outcome.kind === "rpc" && outcome.waited?.tx) {
        const tx = outcome.waited.tx;
        const updateId = updateIdFrom(tx);
        if (updateId) {
          watched?.promise.catch(() => {});
          watched?.cancel();
          dappLog("purchase", "prepareExecuteAndWait executed", { commandId, updateId });
          return { ok: true, commandId, updateId };
        }
        if (String(tx.status) === "failed") {
          watched?.promise.catch(() => {});
          watched?.cancel();
          dappWarn("purchase", "prepareExecuteAndWait failed", {
            commandId,
            status: tx.status,
          });
          return {
            ok: false,
            commandId,
            message: messageForTxFailure("Transaction failed"),
          };
        }
        watched?.promise.catch(() => {});
        watched?.cancel();
      }

      watched?.promise.catch(() => {});
      watched?.cancel();
      if (outcome.kind === "rpc-error") {
        const code = rpcCodeFromProviderError(outcome.error);
        if (
          code === errorCodes.provider.userRejectedRequest ||
          code === errorCodes.rpc.transactionRejected
        ) {
          return failure(commandId, outcome.error);
        }
      }
      dappLog("purchase", "prepareExecuteAndWait unavailable; using txChanged");
    }

    const provider = options?.provider;
    if (!provider) {
      throw new Error("Connect a wallet before submitting a transaction.");
    }
    const watched = watchTransaction(provider, commandId, options?.timeoutMs ?? 600_000);
    const restoreCapture = installPopupCapture((url) => options?.onApprovalUrl?.(url));
    let requestOutcome:
      | { kind: "request" }
      | { kind: "request-error"; error: unknown }
      | { kind: "confirmation"; updateId: string };
    try {
      const pendingRequest = provider.request({ method: "prepareExecute", params: request }).then(
        () => ({ kind: "request" as const }),
        (error: unknown) => ({ kind: "request-error" as const, error }),
      );
      requestOutcome = pendingConfirmation
        ? await Promise.race([pendingRequest, pendingConfirmation])
        : await pendingRequest;
    } finally {
      restoreCapture();
    }
    if (requestOutcome.kind === "confirmation") {
      watched.promise.catch(() => {});
      watched.cancel();
      return { ok: true, commandId, updateId: requestOutcome.updateId };
    }
    if (requestOutcome.kind === "request-error") {
      watched.promise.catch(() => {});
      watched.cancel();
      throw requestOutcome.error;
    }

    const finalOutcome = pendingConfirmation
      ? await Promise.race([
          watched.promise.then((tx) => ({ kind: "event" as const, tx })),
          pendingConfirmation,
        ])
      : { kind: "event" as const, tx: await watched.promise };
    if (finalOutcome.kind === "confirmation") {
      watched.promise.catch(() => {});
      watched.cancel();
      return { ok: true, commandId, updateId: finalOutcome.updateId };
    }
    return txResult(finalOutcome.tx, commandId);
  } catch (error) {
    const result = failure(commandId, error);
    dappWarn("purchase", "prepareExecute error", { commandId, message: result.message });
    return result;
  } finally {
    confirmationController.abort();
  }
}
