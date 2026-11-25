import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  ScanError,
  bearerFrom,
  isScanProxy,
  scanBaseUrl,
  scanGet,
  scanPost,
} from "./scan";

const originalFetch = globalThis.fetch;
const originalScanBase = process.env.SCAN_BASE_URL;
const originalScanBearer = process.env.SCAN_BEARER_TOKEN;

beforeEach(() => {
  delete process.env.SCAN_BASE_URL;
  delete process.env.SCAN_BEARER_TOKEN;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalScanBase === undefined) delete process.env.SCAN_BASE_URL;
  else process.env.SCAN_BASE_URL = originalScanBase;
  if (originalScanBearer === undefined) delete process.env.SCAN_BEARER_TOKEN;
  else process.env.SCAN_BEARER_TOKEN = originalScanBearer;
});

test("scanBaseUrl trims trailing slashes and isScanProxy detects /scan-proxy", () => {
  process.env.SCAN_BASE_URL = "https://scan.example/api/scan/";
  assert.equal(scanBaseUrl(), "https://scan.example/api/scan");
  assert.equal(isScanProxy(), false);

  process.env.SCAN_BASE_URL = "https://validator.example/api/validator/v0/scan-proxy/";
  assert.equal(isScanProxy(), true);
});

test("bearerFrom prefers x-scan-token header over SCAN_BEARER_TOKEN", () => {
  process.env.SCAN_BEARER_TOKEN = "env-token";
  const fromHeader = new Request("http://localhost/api/quote", {
    headers: { "x-scan-token": "header-token" },
  });
  const fromEnv = new Request("http://localhost/api/quote");
  assert.equal(bearerFrom(fromHeader), "header-token");
  assert.equal(bearerFrom(fromEnv), "env-token");

  delete process.env.SCAN_BEARER_TOKEN;
  assert.equal(bearerFrom(fromEnv), undefined);
});

test("scanGet and scanPost attach Authorization without double-prefixing Bearer", async () => {
  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  const seen: Array<{ url: string; method?: string; auth?: string; contentType?: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    seen.push({
      url: String(input),
      method: init?.method,
      auth: headers.authorization,
      contentType: headers["content-type"],
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  await scanGet("/v0/dso-party-id", "raw-token");
  await scanPost("/v0/amulet-rules", { a: 1 }, "Bearer already-prefixed");

  assert.deepEqual(seen, [
    {
      url: "https://scan.example/api/scan/v0/dso-party-id",
      method: "GET",
      auth: "Bearer raw-token",
      contentType: undefined,
    },
    {
      url: "https://scan.example/api/scan/v0/amulet-rules",
      method: "POST",
      auth: "Bearer already-prefixed",
      contentType: "application/json",
    },
  ]);
});

test("scanGet maps 401 proxy/public, HTML refusal, and non-JSON responses to ScanError", async () => {
  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  globalThis.fetch = (async () => new Response("denied", { status: 401 })) as typeof fetch;
  await assert.rejects(
    () => scanGet("/v0/test"),
    (err: unknown) =>
      err instanceof ScanError && err.status === 401 && /limited by IP/.test(err.message),
  );

  process.env.SCAN_BASE_URL = "https://validator.example/api/validator/v0/scan-proxy";
  await assert.rejects(
    () => scanGet("/amulet-rules"),
    (err: unknown) =>
      err instanceof ScanError && err.status === 401 && /bearer token/i.test(err.message),
  );

  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  globalThis.fetch = (async () =>
    new Response("<html><body>403 Forbidden</body></html>", { status: 403 })) as typeof fetch;
  await assert.rejects(
    () => scanGet("/v0/test"),
    (err: unknown) =>
      err instanceof ScanError && err.status === 403 && /refused/.test(err.message),
  );

  globalThis.fetch = (async () => new Response("plain-text", { status: 200 })) as typeof fetch;
  await assert.rejects(
    () => scanGet("/v0/test"),
    (err: unknown) =>
      err instanceof ScanError && /non-JSON/.test(err.message),
  );
});
