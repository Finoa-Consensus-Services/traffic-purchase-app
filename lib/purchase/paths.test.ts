import assert from "node:assert/strict";
import test from "node:test";
import { detectPurchasePath } from "./paths";

test("detectPurchasePath enables TS when receiver party is configured", () => {
  const status = detectPurchasePath({
    status: "configured",
    partyId: "splice_traffic-manager::1220abcd",
    detail: "ok",
    source: "env",
  });
  assert.equal(status.path, "token-standard");
  assert.equal(status.tokenStandardAvailable, true);
});

test("detectPurchasePath falls back when receiver is not configured", () => {
  const status = detectPurchasePath({
    status: "not-configured",
    partyId: null,
    detail: "set env",
    source: "none",
  });
  assert.equal(status.path, "legacy");
  assert.equal(status.tokenStandardAvailable, false);
});
