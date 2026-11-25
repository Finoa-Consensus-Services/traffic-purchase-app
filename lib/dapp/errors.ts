import {
  errorCodes,
  getMessageFromCode,
  toJsonRpcError,
} from "@canton-network/core-rpc-errors";

/** Normalize wallet / SDK failures to a CIP-0103 `JsonRpcError` when possible. */
export function normalizeProviderError(error: unknown) {
  return toJsonRpcError(error);
}

export function rpcCodeFromProviderError(error: unknown): number | null {
  try {
    return normalizeProviderError(error).code;
  } catch {
    return null;
  }
}

export function messageForProviderError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "The wallet request failed.";
  }
  try {
    const normalized = normalizeProviderError(error);
    const code = normalized.code;
    const fallback =
      typeof normalized.message === "string" && normalized.message.length > 0
        ? normalized.message
        : getMessageFromCode(code);

    const upper = fallback.toUpperCase();
    if (
      upper.includes("INACTIVE_CONTRACTS") ||
      upper.includes("LOCAL_VERDICT_INACTIVE_CONTRACTS")
    ) {
      return (
        "The transaction referenced an archived contract (often a stale open mining round or " +
        "spent CC input). Refresh purchase context and submit again within a few seconds."
      );
    }

    switch (code) {
      case errorCodes.provider.userRejectedRequest:
        return "You declined the request in your wallet.";
      case errorCodes.provider.unauthorized:
        return "Not authorized. Connect your wallet and try again.";
      case errorCodes.provider.unsupportedMethod:
        return "This wallet does not support that operation.";
      case errorCodes.provider.disconnected:
        return "The wallet is disconnected.";
      case errorCodes.provider.chainDisconnected:
        return "The wallet is not connected to this network.";
      case errorCodes.rpc.transactionRejected:
        return "The transaction was rejected.";
      case errorCodes.rpc.resourceUnavailable:
        return "The wallet event channel timed out. Try again.";
      case errorCodes.rpc.invalidInput:
        return fallback || "The wallet rejected the request parameters.";
      default:
        return fallback || "The wallet request failed.";
    }
  } catch {
    const record = error as { message?: string };
    const message =
      typeof record.message === "string" && record.message.length > 0
        ? record.message
        : "The wallet request failed.";
    return message;
  }
}

export function messageForTxFailure(reason?: string): string {
  if (reason?.trim()) {
    return reason;
  }
  return "The transaction failed in your wallet.";
}

export function isUnsupportedWalletOperation(error: unknown): boolean {
  const code = rpcCodeFromProviderError(error);
  if (code === errorCodes.provider.unsupportedMethod) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const message =
    typeof (error as { message?: string }).message === "string"
      ? (error as { message: string }).message.toLowerCase()
      : "";
  return (
    message.includes("unsupported") ||
    message.includes("not support") ||
    message.includes("unknown choice") ||
    message.includes("transferfactory")
  );
}
