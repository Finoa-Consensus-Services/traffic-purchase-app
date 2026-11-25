import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { GET } from "./route";

const originalFetch = globalThis.fetch;
const originalScanBase = process.env.SCAN_BASE_URL;
const originalUiFixtures = process.env.UI_FIXTURES;

beforeEach(() => {
  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  delete process.env.UI_FIXTURES;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalScanBase === undefined) delete process.env.SCAN_BASE_URL;
  else process.env.SCAN_BASE_URL = originalScanBase;
  if (originalUiFixtures === undefined) delete process.env.UI_FIXTURES;
  else process.env.UI_FIXTURES = originalUiFixtures;
});

test("GET /api/quote returns fixture quote when UI_FIXTURES=1 in non-production", async () => {
  process.env.UI_FIXTURES = "1";
  const res = await GET(new Request("http://localhost/api/quote"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    fixture?: boolean;
    quotedAt: string;
    validUntil: string;
    snapshotId: string;
    round: { contractId: string; validUntil: string };
    rates: { minTopupBytes: number };
  };
  assert.equal(body.ok, true);
  assert.equal(body.fixture, true);
  assert.equal(body.rates.minTopupBytes, 200_000);
  assert.equal(body.snapshotId, "cid-round-local");
  assert.equal(body.round.contractId, "cid-round-local");
  assert.equal(typeof body.quotedAt, "string");
  assert.equal(body.validUntil, body.round.validUntil);
  assert.equal(Number.isNaN(Date.parse(body.validUntil)), false);
});

test("GET /api/quote propagates ScanError status when upstream Scan fails", async () => {
  globalThis.fetch = (async () =>
    new Response("unauthorized", { status: 401 })) as typeof fetch;

  const res = await GET(new Request("http://localhost/api/quote"));
  assert.equal(res.status, 401);
  const body = (await res.json()) as { ok: boolean; error: string; proxy: boolean };
  assert.equal(body.ok, false);
  assert.equal(body.proxy, false);
  assert.match(body.error, /401/);
});
