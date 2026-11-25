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

test("GET /api/purchase-context propagates ScanError status on scan-proxy", async () => {
  process.env.SCAN_BASE_URL = "https://validator.example/api/validator/v0/scan-proxy";
  const res = await GET(new Request("http://localhost/api/purchase-context"));
  assert.equal(res.status, 404);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /full Scan API/);
});

test("GET /api/purchase-context returns fixture payload when UI_FIXTURES=1 in non-production", async () => {
  process.env.UI_FIXTURES = "1";
  const res = await GET(new Request("http://localhost/api/purchase-context"));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; context: { synchronizerId: string } };
  assert.equal(body.ok, true);
  assert.equal(body.context.synchronizerId, "global-domain::local-ui");
});
