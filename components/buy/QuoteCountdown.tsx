"use client";

import { formatQuoteCountdown, type QuoteValidityState } from "@/lib/purchase/quote-validity";

const TONE: Record<QuoteValidityState, string> = {
  ready: "text-ink-muted",
  warning: "text-warning",
  blocked: "text-danger",
  expired: "text-danger",
  invalid: "text-danger",
};

type QuoteCountdownProps = {
  state: QuoteValidityState;
  remainingMs: number | null;
};

export const QuoteCountdown = ({ state, remainingMs }: QuoteCountdownProps) => {
  const label = formatQuoteCountdown(state, remainingMs);

  return (
    <span
      data-quote-state={state}
      aria-hidden="true"
      className={`text-sm font-bold tracking-tight tabular-nums ${TONE[state]}`}
    >
      {label}
    </span>
  );
};
