import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resetPublicPurchaseInputsCacheForTests } from "@/lib/purchase/public-purchase-inputs";
import { resetRegistryAuthCacheForTests } from "@/lib/server/registry-auth";
import { GET } from "./route";

const originalFetch = globalThis.fetch;
const originalUiFixtures = process.env.UI_FIXTURES;
const originalRegistry = process.env.TRANSFER_REGISTRY_BASE_URL;
const originalInfo = process.env.NETWORK_INFO_URL;

beforeEach(() => {
  resetPublicPurchaseInputsCacheForTests();
  resetRegistryAuthCacheForTests();
  delete process.env.UI_FIXTURES;
  process.env.TRANSFER_REGISTRY_BASE_URL = "https://scan.example";
  process.env.NETWORK_INFO_URL = "https://info.example/info";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetPublicPurchaseInputsCacheForTests();
  resetRegistryAuthCacheForTests();
  if (originalUiFixtures === undefined) delete process.env.UI_FIXTURES;
  else process.env.UI_FIXTURES = originalUiFixtures;
  if (originalRegistry === undefined) delete process.env.TRANSFER_REGISTRY_BASE_URL;
  else process.env.TRANSFER_REGISTRY_BASE_URL = originalRegistry;
  if (originalInfo === undefined) delete process.env.NETWORK_INFO_URL;
  else process.env.NETWORK_INFO_URL = originalInfo;
});

test("GET /api/purchase/path-status forwards x-probe-sender and synchronizerId", async () => {
  let seenProbeSender: string | null = null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("info.example")) {
      return new Response(JSON.stringify({ sv: { migration_id: 1 } }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      excludeDebugFields?: boolean;
      choiceArguments?: { transfer?: { sender?: string } };
    };
    if (body.excludeDebugFields !== false) {
      seenProbeSender = body.choiceArguments?.transfer?.sender ?? null;
    }
    return new Response(
      JSON.stringify({
        factoryId: "00factory",
        choiceContext: {
          choiceContextData: { values: {} },
          disclosedContracts: [
            {
              templateId: "pkg:Splice.AmuletRules:AmuletRules",
              contractId: "cid-rules",
              createdEventBlob: "blob-rules",
              synchronizerId: "global-domain::1220",
              debugPayload: {
                dso: "DSO::1220",
                configSchedule: {
                  initialValue: {
                    decentralizedSynchronizer: {
                      activeSynchronizer: "global-domain::1220",
                      fees: { extraTrafficPrice: "60", minTopupAmount: "200000" },
                    },
                  },
                  futureValues: [],
                },
              },
            },
          ],
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const res = await GET(
    new Request(
      "http://localhost/api/purchase/path-status?synchronizerId=global-domain%3A%3A1220",
      { headers: { "x-probe-sender": "alice::1220" } },
    ),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; path: string; tokenStandardAvailable: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.path, "token-standard");
  assert.equal(body.tokenStandardAvailable, true);
  assert.equal(seenProbeSender, "alice::1220");
});
