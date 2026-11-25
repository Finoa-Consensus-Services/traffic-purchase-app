import assert from "node:assert/strict";
import test from "node:test";
import {
  coversMinimumPurchaseUsd,
  creditedTrafficBytes,
  minimumPurchaseUsd,
  purchaseMinBytes,
  quoteFromBytes,
  quoteFromCc,
  quoteFromUsd,
  trafficBytesFromCc,
  DEFAULT_PURCHASE_MIN_BYTES,
} from "./pricing";

const rates = {
  extraTrafficPriceUsdPerMb: 60,
  amuletPriceUsd: 0.1,
  minTopupBytes: 200_000,
};

test("one megabyte converts with the proposal formula", () => {
  const quote = quoteFromBytes(1_000_000, rates);
  assert.equal(quote.usd, 60);
  assert.equal(quote.cc, 600);
  assert.equal(quote.belowMinimum, false);
});

test("amounts below the network minimum are flagged", () => {
  const quote = quoteFromBytes(199_999, rates);
  assert.equal(quote.belowMinimum, true);
});

test("the app purchase minimum is 200000 bytes unless the network minimum is higher", () => {
  assert.equal(DEFAULT_PURCHASE_MIN_BYTES, 200_000);
  assert.equal(purchaseMinBytes(200_000), 200_000);
  assert.equal(purchaseMinBytes(199_000), 200_000);
  assert.equal(purchaseMinBytes(250_000), 250_000);
  assert.equal(quoteFromBytes(200_000, rates).belowMinimum, false);
});

test("a lower CC price credits fewer bytes than the amount typed", () => {
  // Scan rounds 124088 ($0.07661) then 124090 ($0.076337), extra traffic $60/MB.
  assert.equal(creditedTrafficBytes(200_000, 0.07661, 0.076337), 199_287);
  assert.equal(creditedTrafficBytes(210_000, 0.07661, 0.076337), 209_251);
  assert.ok(creditedTrafficBytes(210_000, 0.07661, 0.076337) >= rates.minTopupBytes);
});

test("usd and cc inputs invert back to the same bytes", () => {
  const fromBytes = quoteFromBytes(2_500_000, rates);
  const fromUsd = quoteFromUsd(fromBytes.usd, rates);
  const fromCc = quoteFromCc(fromBytes.cc, rates);
  assert.ok(Math.abs(fromUsd.bytes - 2_500_000) < 1e-6);
  assert.ok(Math.abs(fromCc.bytes - 2_500_000) < 1e-6);
});

test("the network minimum is 12 dollars", () => {
  assert.equal(minimumPurchaseUsd(rates), 12);
  const atMinimum = quoteFromBytes(200_000, rates);
  assert.equal(atMinimum.usd, 12);
  assert.equal(coversMinimumPurchaseUsd(atMinimum.cc, rates), true);
  const short = quoteFromBytes(199_285, rates);
  assert.ok(short.usd < 12);
  assert.equal(coversMinimumPurchaseUsd(short.cc, rates), false);
  assert.equal(coversMinimumPurchaseUsd(quoteFromBytes(210_000, rates).cc, rates), true);
});

test("trafficBytesFromCc rounds down whole bytes", () => {
  assert.equal(trafficBytesFromCc(600, rates), 1_000_000);
  assert.equal(trafficBytesFromCc(600.00005, rates), 1_000_000);
  assert.equal(
    trafficBytesFromCc(157.54, {
      extraTrafficPriceUsdPerMb: 60,
      amuletPriceUsd: 0.076172,
      minTopupBytes: 200_000,
    }),
    200_002,
  );
});

test("creditedTrafficBytes rejects non-positive or non-finite inputs", () => {
  assert.throws(() => creditedTrafficBytes(0, 0.1, 0.1), /positive/);
  assert.throws(() => creditedTrafficBytes(200_000, 0, 0.1), /positive/);
  assert.throws(() => creditedTrafficBytes(200_000, 0.1, -0.05), /positive/);
  assert.throws(() => creditedTrafficBytes(Number.NaN, 0.1, 0.1), /positive/);
});

test("coversMinimumPurchaseUsd honors the half-cent rounding tolerance", () => {
  // 199,920 bytes at $60/MB = $11.9952 (+ $0.005 tolerance >= $12.00)
  assert.equal(coversMinimumPurchaseUsd(quoteFromBytes(199_920, rates).cc, rates), true);
  // 199,900 bytes at $60/MB = $11.994 (+ $0.005 tolerance < $12.00)
  assert.equal(coversMinimumPurchaseUsd(quoteFromBytes(199_900, rates).cc, rates), false);
});

test("purchaseMinBytes falls back to default when network minimum is non-finite", () => {
  assert.equal(purchaseMinBytes(Number.NaN), DEFAULT_PURCHASE_MIN_BYTES);
  assert.equal(purchaseMinBytes(0), DEFAULT_PURCHASE_MIN_BYTES);
});
