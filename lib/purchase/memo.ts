import { rawSynchronizerId } from "@/lib/purchase/synchronizer-id";

export type TrafficPurchaseMemoInput = {
  memberId: string;
  synchronizerId: string;
  migrationId: number;
  forfeitValidatorRewardCoupon?: boolean;
};

/** Splice reads `synchronizer-id` from the memo as an exact string. */
export function memoWithRawSynchronizerId(memo: string): string {
  return memo.replace(
    /(synchronizer-id=)([^&]*)/g,
    (_match, prefix: string, value: string) =>
      `${prefix}${rawSynchronizerId(value)}`,
  );
}

/** Escape query separators without encoding `:`, which is part of the id. */
function memoField(value: string): string {
  return value.replace(/%/g, "%25").replace(/&/g, "%26").replace(/=/g, "%3D");
}

export function buildTrafficPurchaseMemo(input: TrafficPurchaseMemoInput): string {
  const fields: Array<[string, string]> = [
    ["member-id", input.memberId],
    ["synchronizer-id", rawSynchronizerId(input.synchronizerId)],
    ["migration-id", String(input.migrationId)],
  ];
  if (input.forfeitValidatorRewardCoupon !== false) {
    fields.push(["forfeit-validator-reward-coupon", "true"]);
  }
  const query = fields
    .map(([key, value]) => `${key}=${memoField(value)}`)
    .join("&");
  return `splice/memo:${query}`;
}
