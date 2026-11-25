"use client";

import { formatCc } from "@/lib/amount-format";

type AnimatedCcProps = {
  value: number;
  /** Bumps when a new token price replaces this amount. Typing does not bump it. */
  refreshKey: number;
};

export const AnimatedCc = ({ value, refreshKey }: AnimatedCcProps) => (
  <span
    key={refreshKey}
    data-cc-refresh={refreshKey > 0 ? "1" : undefined}
    className={refreshKey > 0 ? "cc-reveal inline-block" : "inline-block"}
  >
    {formatCc(value)}
  </span>
);
