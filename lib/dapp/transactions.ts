import type {
  PrepareExecuteAndWaitResult,
  PrepareExecuteParams,
  StatusEvent,
  TxChangedEvent,
} from "@canton-network/dapp-sdk";
import { dappLog, dappWarn } from "@/lib/dapp/client-log";
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
  prepareExecuteAndWait?: (params: PrepareExecuteParams) => Promise<PrepareExecuteAndWaitResult>;
  provider?: SubmitProvider | null;
};

function isSyncCapable(status: StatusEvent | null): boolean {
  const type = status?.provider?.providerType;
  return type === "browser" || type === "desktop" || type === "mobile";
}

function updateIdFrom(tx: TxChangedEvent) {
  if (tx.status !== "executed") return undefined;
  return tx.payload && "updateId" in tx.payload ? String(tx.payload.updateId) : undefined;
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

  try {
    if (isSyncCapable(status) && options?.prepareExecuteAndWait) {
      try {
        const waited = await options.prepareExecuteAndWait(request);
        const tx = waited.tx;
        if (tx.status === "executed") {
          const updateId = updateIdFrom(tx);
          dappLog("purchase", "prepareExecuteAndWait executed", { commandId, updateId });
          return { ok: true, commandId, updateId };
        }
        dappWarn("purchase", "prepareExecuteAndWait failed", {
          commandId,
          status: tx.status,
        });
        return {
          ok: false,
          commandId,
          message: messageForTxFailure(tx.status === "failed" ? "Transaction failed" : undefined),
        };
      } catch {
        dappLog("purchase", "prepareExecuteAndWait unavailable; using txChanged");
      }
    }

    const provider = options?.provider;
    if (!provider) {
      throw new Error("Connect a wallet before submitting a transaction.");
    }
    const watched = watchTransaction(provider, commandId, options?.timeoutMs ?? 600_000);
    const restoreCapture = installPopupCapture((url) => options?.onApprovalUrl?.(url));
    try {
      await provider.request({ method: "prepareExecute", params: request });
    } catch (error) {
      watched.promise.catch(() => {});
      watched.cancel();
      throw error;
    } finally {
      restoreCapture();
    }
    const finalTx = await watched.promise;
    if (finalTx.status === "executed") {
      const updateId = updateIdFrom(finalTx);
      const reportedCommandId = finalTx.commandId || commandId;
      dappLog("purchase", "txChanged executed", { commandId: reportedCommandId, updateId });
      return { ok: true, commandId: reportedCommandId, updateId };
    }
    dappWarn("purchase", "txChanged failed", { commandId, status: finalTx.status });
    return { ok: false, commandId, message: messageForTxFailure("Transaction failed") };
  } catch (error) {
    const result = failure(commandId, error);
    dappWarn("purchase", "prepareExecute error", { commandId, message: result.message });
    return result;
  }
}
