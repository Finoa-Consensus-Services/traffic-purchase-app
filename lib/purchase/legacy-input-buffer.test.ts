import assert from "node:assert/strict";
import test from "node:test";
import { legacyBuyMemberTrafficInputMinCc } from "./legacy-input-buffer";

test("legacyBuyMemberTrafficInputMinCc adds fee slack", () => {
  assert.equal(legacyBuyMemberTrafficInputMinCc(100), 107);
  assert.equal(legacyBuyMemberTrafficInputMinCc(350), 357);
  assert.equal(legacyBuyMemberTrafficInputMinCc(1000), 1020);
});

test("legacyBuyMemberTrafficInputMinCc rejects non-positive or non-finite inputs", () => {
  for (const bad of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => legacyBuyMemberTrafficInputMinCc(bad),
      /must be positive/,
    );
  }
});
