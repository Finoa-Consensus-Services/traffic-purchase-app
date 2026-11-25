import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficPurchaseMemo, memoWithRawSynchronizerId } from "./memo";

test("buildTrafficPurchaseMemo keeps synchronizer and member ids unencoded", () => {
  const memo = buildTrafficPurchaseMemo({
    memberId: "PAR::abc",
    synchronizerId: "global-domain::1220be58",
    migrationId: 1,
  });
  assert.equal(
    memo,
    "splice/memo:member-id=PAR::abc&synchronizer-id=global-domain::1220be58&migration-id=1&forfeit-validator-reward-coupon=true",
  );
});

test("buildTrafficPurchaseMemo decodes a synchronizer id copied from a URL", () => {
  const memo = buildTrafficPurchaseMemo({
    memberId: "PAR::abc",
    synchronizerId:
      "global-domain%3A%3A1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a",
    migrationId: 1,
    forfeitValidatorRewardCoupon: false,
  });
  assert.equal(
    memo,
    "splice/memo:member-id=PAR::abc&synchronizer-id=global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a&migration-id=1",
  );
});

test("buildTrafficPurchaseMemo can omit forfeit flag", () => {
  const memo = buildTrafficPurchaseMemo({
    memberId: "PAR::abc",
    synchronizerId: "global-domain::1220",
    migrationId: 2,
    forfeitValidatorRewardCoupon: false,
  });
  assert.ok(!memo.includes("forfeit-validator-reward-coupon"));
});

test("buildTrafficPurchaseMemo escapes separator characters without encoding colons", () => {
  const memo = buildTrafficPurchaseMemo({
    memberId: "PAR::a&b=c%d",
    synchronizerId: "global-domain::1220",
    migrationId: 0,
    forfeitValidatorRewardCoupon: false,
  });
  assert.equal(
    memo,
    "splice/memo:member-id=PAR::a%26b%3Dc%25d&synchronizer-id=global-domain::1220&migration-id=0",
  );
});

test("memoWithRawSynchronizerId decodes only the synchronizer-id query value", () => {
  assert.equal(
    memoWithRawSynchronizerId(
      "splice/memo:member-id=PAR%3A%3Aabc&synchronizer-id=global-domain%3A%3A1220&migration-id=1",
    ),
    "splice/memo:member-id=PAR%3A%3Aabc&synchronizer-id=global-domain::1220&migration-id=1",
  );
});
