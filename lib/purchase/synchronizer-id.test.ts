import assert from "node:assert/strict";
import test from "node:test";
import { rawSynchronizerId } from "./synchronizer-id";

test("rawSynchronizerId decodes single and double percent-encoded ids and trims whitespace", () => {
  assert.equal(rawSynchronizerId("  global-domain::1220abcd  "), "global-domain::1220abcd");
  assert.equal(rawSynchronizerId("global-domain%3A%3A1220abcd"), "global-domain::1220abcd");
  assert.equal(rawSynchronizerId("global-domain%253A%253A1220abcd"), "global-domain::1220abcd");
});

test("rawSynchronizerId leaves malformed percent escapes intact instead of throwing", () => {
  assert.equal(rawSynchronizerId("global-domain%ZZ1220"), "global-domain%ZZ1220");
});
