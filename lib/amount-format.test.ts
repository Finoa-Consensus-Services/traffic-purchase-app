import assert from "node:assert/strict";
import test from "node:test";
import { formatCc, formatGroupedAmount, formatUsd, parseAmount } from "./amount-format";

test("amount entry groups thousands and keeps a typed decimal", () => {
  assert.equal(formatGroupedAmount("1000000"), "1,000,000");
  assert.equal(formatGroupedAmount("1000.50"), "1,000.50");
  assert.equal(formatGroupedAmount("1,000,023.00"), "1,000,023.00");
  assert.equal(formatGroupedAmount("0.5"), "0.5");
  assert.equal(formatGroupedAmount("000123"), "123");
  assert.equal(formatGroupedAmount("$1,200.3.4"), "1,200.34");
  assert.equal(formatGroupedAmount("abc"), "");
  assert.equal(formatGroupedAmount(""), "");
});

test("grouped amounts still parse as numbers", () => {
  assert.equal(parseAmount("1,000,000"), 1_000_000);
  assert.equal(parseAmount("1,000.50"), 1000.5);
  assert.equal(Number.isNaN(parseAmount("not-a-number")), true);
  assert.equal(Number.isNaN(parseAmount("Infinity")), true);
});

test("CC and USD amounts group thousands to two decimals", () => {
  assert.equal(formatCc(1000023), "1,000,023.00 CC");
  assert.equal(formatCc(600), "600.00 CC");
  assert.equal(formatUsd(12), "12.00 USD");
  assert.equal(formatUsd(1234.5), "1,234.50 USD");
});
