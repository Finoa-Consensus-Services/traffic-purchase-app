import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { GET } from "./route";

const originalFetch = globalThis.fetch;
const originalScanBase = process.env.SCAN_BASE_URL;

beforeEach(() => {
  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalScanBase === undefined) delete process.env.SCAN_BASE_URL;
  else process.env.SCAN_BASE_URL = originalScanBase;
});

test("GET /api/pricing returns snapshot fields and maps ScanError status", async () => {
  globalThis.fetch = (async () =>
    new Response("bad gateway", { status: 503 })) as typeof fetch;

  const failed = await GET(new Request("http://localhost/api/pricing"));
  assert.equal(failed.status, 503);
  const failBody = (await failed.json()) as { ok: boolean; proxy: boolean };
  assert.equal(failBody.ok, false);
  assert.equal(failBody.proxy, false);
});
