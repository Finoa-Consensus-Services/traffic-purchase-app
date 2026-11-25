/** Buy form floor. The network minimum is 200,000 bytes. */
export const DEFAULT_PURCHASE_MIN_BYTES = 200_000;

export function purchaseMinBytes(networkMinBytes: number): number {
  const network = Number.isFinite(networkMinBytes) ? networkMinBytes : 0;
  return Math.max(network, DEFAULT_PURCHASE_MIN_BYTES);
}

/** Credited bytes when the execution round's CC price differs from the quote. */
export function creditedTrafficBytes(
  requestedBytes: number,
  quoteAmuletPriceUsd: number,
  executionAmuletPriceUsd: number,
): number {
  if (
    !Number.isFinite(requestedBytes) ||
    requestedBytes <= 0 ||
    !Number.isFinite(quoteAmuletPriceUsd) ||
    quoteAmuletPriceUsd <= 0 ||
    !Number.isFinite(executionAmuletPriceUsd) ||
    executionAmuletPriceUsd <= 0
  ) {
    throw new Error("traffic credit needs a positive byte count and CC prices");
  }
  return Math.floor((requestedBytes * executionAmuletPriceUsd) / quoteAmuletPriceUsd);
}

export type TrafficRates = {
  extraTrafficPriceUsdPerMb: number;
  amuletPriceUsd: number;
  minTopupBytes: number;
};

export type TrafficQuote = {
  bytes: number;
  usd: number;
  cc: number;
  belowMinimum: boolean;
};

const BYTES_PER_MB = 1_000_000;

export function quoteFromBytes(bytes: number, rates: TrafficRates): TrafficQuote {
  const usd = (bytes / BYTES_PER_MB) * rates.extraTrafficPriceUsdPerMb;
  const cc = usd / rates.amuletPriceUsd;
  return {
    bytes,
    usd,
    cc,
    belowMinimum: bytes < purchaseMinBytes(rates.minTopupBytes),
  };
}

export function quoteFromUsd(usd: number, rates: TrafficRates): TrafficQuote {
  const bytes = (usd / rates.extraTrafficPriceUsdPerMb) * BYTES_PER_MB;
  return quoteFromBytes(bytes, rates);
}

export function quoteFromCc(cc: number, rates: TrafficRates): TrafficQuote {
  const usd = cc * rates.amuletPriceUsd;
  return quoteFromUsd(usd, rates);
}

export function trafficBytesFromCc(cc: number, rates: TrafficRates): number {
  const usd = cc * rates.amuletPriceUsd;
  return Math.floor((usd / rates.extraTrafficPriceUsdPerMb) * BYTES_PER_MB);
}

/** USD cost of the network minimum. 200,000 bytes at $60/MB is exactly $12. */
export function minimumPurchaseUsd(rates: TrafficRates): number {
  return (rates.minTopupBytes * rates.extraTrafficPriceUsdPerMb) / BYTES_PER_MB;
}

/** USD of the bytes the ledger would credit from this CC at these rates. */
export function creditedPurchaseUsd(cc: number, rates: TrafficRates): number {
  return (trafficBytesFromCc(cc, rates) * rates.extraTrafficPriceUsdPerMb) / BYTES_PER_MB;
}

const MINIMUM_USD_TOLERANCE = 0.005;

export function coversMinimumPurchaseUsd(cc: number, rates: TrafficRates): boolean {
  return creditedPurchaseUsd(cc, rates) + MINIMUM_USD_TOLERANCE >= minimumPurchaseUsd(rates);
}
