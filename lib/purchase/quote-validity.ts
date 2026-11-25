export const QUOTE_WARNING_MS = 60_000;
export const QUOTE_BLOCK_MS = 10_000;

export type QuoteValidityState = "ready" | "warning" | "blocked" | "expired" | "invalid";

export type QuoteRound = {
  round: string;
  contractId: string | null;
  amuletPriceUsd: number;
  opensAt: string | null;
  targetClosesAt: string | null;
  tickDurationMicros: number | null;
  validUntil: string | null;
};

export type QuoteClock = {
  state: QuoteValidityState;
  remainingMs: number | null;
};

/** The displayed CC/USD rate changes when the next tick opens, at `opensAt + tickDuration`. */
export const validUntilFromRound = (input: {
  opensAt: string | null;
  tickDurationMicros: number | null;
}): string | null => {
  if (!input.opensAt || input.tickDurationMicros == null) return null;
  if (!Number.isFinite(input.tickDurationMicros) || input.tickDurationMicros <= 0) return null;
  const opensMs = Date.parse(input.opensAt);
  if (!Number.isFinite(opensMs)) return null;
  const durationMs = input.tickDurationMicros / 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return new Date(opensMs + durationMs).toISOString();
};

export const quoteClock = (
  validUntil: string | null | undefined,
  nowMs: number,
): QuoteClock => {
  if (!validUntil || !Number.isFinite(nowMs)) {
    return { state: "invalid", remainingMs: null };
  }
  const untilMs = Date.parse(validUntil);
  if (!Number.isFinite(untilMs)) return { state: "invalid", remainingMs: null };
  const remainingMs = untilMs - nowMs;
  if (remainingMs <= 0) return { state: "expired", remainingMs: 0 };
  if (remainingMs <= QUOTE_BLOCK_MS) return { state: "blocked", remainingMs };
  if (remainingMs <= QUOTE_WARNING_MS) return { state: "warning", remainingMs };
  return { state: "ready", remainingMs };
};

export const quoteAllowsSubmission = (
  clock: QuoteClock,
  roundContractId: string | null | undefined,
): boolean =>
  Boolean(roundContractId) && (clock.state === "ready" || clock.state === "warning");

export const formatQuoteCountdown = (
  state: QuoteValidityState,
  remainingMs: number | null,
): string => {
  if (state === "invalid") return "Unavailable";
  if (state === "expired" || remainingMs == null) return "Updating";
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const clock = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const quoteStatusMessage = (state: QuoteValidityState): string => {
  switch (state) {
    case "ready":
      return "";
    case "warning":
      return "This CC price updates in under a minute.";
    case "blocked":
      return "Buying is paused until the next CC price.";
    case "expired":
      return "Updating the CC price.";
    case "invalid":
      return "Quote timing is unavailable.";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
};
