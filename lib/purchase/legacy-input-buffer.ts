/** Quoted CC plus fees. Inputs have to cover the total. */
export function legacyBuyMemberTrafficInputMinCc(trafficQuotedCc: number): number {
  if (!Number.isFinite(trafficQuotedCc) || trafficQuotedCc <= 0) {
    throw new Error("trafficQuotedCc must be positive");
  }
  const feeSlack = Math.max(7, trafficQuotedCc * 0.02);
  return trafficQuotedCc + feeSlack;
}
