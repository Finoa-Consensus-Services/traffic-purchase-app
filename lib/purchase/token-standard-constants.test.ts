import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultExecuteBeforeIso,
  defaultRequestedAtIso,
  formatCcAmount,
} from "./token-standard-constants";

test("formatCcAmount strips trailing decimals and rejects non-positive inputs", () => {
  assert.equal(formatCcAmount(12), "12");
  assert.equal(formatCcAmount(12.5), "12.5");
  assert.equal(formatCcAmount(0.000001), "0.000001");
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => formatCcAmount(bad), /positive number/);
  }
});

test("defaultRequestedAtIso is slightly in the past and defaultExecuteBeforeIso is in the future", () => {
  const now = Date.now();
  const requestedAt = Date.parse(defaultRequestedAtIso());
  const executeBefore = Date.parse(defaultExecuteBeforeIso(2));
  assert.ok(requestedAt < now);
  assert.ok(executeBefore > now + 60 * 60 * 1000);
});
