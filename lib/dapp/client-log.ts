/** Browser-only diagnostic logs for CIP-0103 wallet flows (never runs on the server). */

const PREFIX = "[traffic-dapp]";

function enabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  return process.env.NEXT_PUBLIC_DEBUG_DAPP === "true";
}

export function dappLog(
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (!enabled()) {
    return;
  }
  if (detail && Object.keys(detail).length > 0) {
    console.info(PREFIX, scope, message, detail);
  } else {
    console.info(PREFIX, scope, message);
  }
}

export function dappWarn(
  scope: string,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (!enabled()) {
    return;
  }
  if (detail && Object.keys(detail).length > 0) {
    console.warn(PREFIX, scope, message, detail);
  } else {
    console.warn(PREFIX, scope, message);
  }
}
