import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { POST } from "./route";

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

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST /api/lookup rejects scan-proxy with 404 and validates JSON/body fields", async () => {
  process.env.SCAN_BASE_URL = "https://validator.example/api/validator/v0/scan-proxy";
  const proxyRes = await POST(jsonRequest({ query: "PAR::a", domainId: "global-domain::1" }));
  assert.equal(proxyRes.status, 404);

  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  const badJson = await POST(
    new Request("http://localhost/api/lookup", { method: "POST", body: "{not json" }),
  );
  assert.equal(badJson.status, 400);

  const missingField = await POST(jsonRequest({ query: "", domainId: "global-domain::1" }));
  assert.equal(missingField.status, 400);
});

test("POST /api/lookup queries traffic directly for member ids and clamps availableBytes at 0", async () => {
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    seen.push(String(input));
    return new Response(
      JSON.stringify({
        traffic_status: {
          actual: { total_consumed: 600_000, total_limit: 500_000 },
          target: { total_purchased: 200_000 },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const res = await POST(jsonRequest({ query: "PAR::val-1", domainId: "global-domain::1" }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    inputKind: string;
    members: Array<{ memberId: string; availableBytes: number; totalPurchased: number }>;
  };
  assert.equal(body.ok, true);
  assert.equal(body.inputKind, "member");
  assert.equal(body.members.length, 1);
  assert.equal(body.members[0]?.memberId, "PAR::val-1");
  assert.equal(body.members[0]?.availableBytes, 0);
  assert.equal(seen.length, 1);
  assert.ok(seen[0]?.includes("/members/PAR%3A%3Aval-1/traffic-status"));
});

test("POST /api/lookup resolves party ids, caps at 8 participants, and returns 404 when empty", async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/participant-id")) {
      return new Response(JSON.stringify({ participant_ids: [] }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;

  const emptyRes = await POST(jsonRequest({ query: "alice::1220", domainId: "global-domain::1" }));
  assert.equal(emptyRes.status, 404);

  const ids = Array.from({ length: 10 }, (_, idx) => `PAR::p${idx}`);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/participant-id")) {
      return new Response(JSON.stringify({ participant_ids: ids }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        traffic_status: {
          actual: { total_consumed: 100, total_limit: 500 },
          target: { total_purchased: 200 },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const multiRes = await POST(jsonRequest({ query: "alice::1220", domainId: "global-domain::1" }));
  assert.equal(multiRes.status, 200);
  const multiBody = (await multiRes.json()) as {
    ok: boolean;
    inputKind: string;
    members: Array<{ memberId: string; availableBytes: number }>;
  };
  assert.equal(multiBody.inputKind, "party");
  assert.equal(multiBody.members.length, 8);
  assert.equal(multiBody.members[0]?.availableBytes, 400);
});

test("POST /api/lookup propagates ScanError HTTP statuses", async () => {
  globalThis.fetch = (async () =>
    new Response('{"error":"Invalid member"}', { status: 400 })) as typeof fetch;

  const res = await POST(jsonRequest({ query: "PAR::bad", domainId: "global-domain::1" }));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /Invalid member/);
});
