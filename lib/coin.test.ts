import assert from "node:assert/strict";
import test from "node:test";
import { readCoin } from "./coin";

test("readCoin parses Scan decimal strings", () => {
  assert.equal(readCoin("235169.4182689366"), 235169.4182689366);
  assert.equal(readCoin("0.0000000000"), 0);
});
