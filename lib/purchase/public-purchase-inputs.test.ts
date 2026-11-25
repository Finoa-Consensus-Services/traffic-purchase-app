import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resetRegistryAuthCacheForTests } from "@/lib/server/registry-auth";
import {
  loadPublicPurchaseInputs,
  resetPublicPurchaseInputsCacheForTests,
} from "./public-purchase-inputs";

const originalFetch = globalThis.fetch;
const originalRegistry = process.env.TRANSFER_REGISTRY_BASE_URL;
const originalInfo = process.env.NETWORK_INFO_URL;

beforeEach(() => {
  resetPublicPurchaseInputsCacheForTests();
  resetRegistryAuthCacheForTests();
  process.env.TRANSFER_REGISTRY_BASE_URL = "https://scan.example";
  process.env.NETWORK_INFO_URL = "https://info.example/info";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetPublicPurchaseInputsCacheForTests();
  resetRegistryAuthCacheForTests();
  if (originalRegistry === undefined) delete process.env.TRANSFER_REGISTRY_BASE_URL;
  else process.env.TRANSFER_REGISTRY_BASE_URL = originalRegistry;
  if (originalInfo === undefined) delete process.env.NETWORK_INFO_URL;
  else process.env.NETWORK_INFO_URL = originalInfo;
});

test("loadPublicPurchaseInputs caches results until reset", async () => {
  let fetchCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCount += 1;
    const url = String(input);
    if (url.includes("info.example")) {
      return new Response(JSON.stringify({ sv: { migration_id: 3 } }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        choiceContext: {
          disclosedContracts: [
            {
              templateId: "pkg:Splice.AmuletRules:AmuletRules",
              debugPayload: {
                dso: "DSO::1220cached",
                configSchedule: {
                  initialValue: {
                    decentralizedSynchronizer: {
                      activeSynchronizer: "global-domain::1220cached",
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

  const first = await loadPublicPurchaseInputs();
  assert.deepEqual(first, {
    dsoPartyId: "DSO::1220cached",
    synchronizerId: "global-domain::1220cached",
    migrationId: 3,
  });
  assert.equal(fetchCount, 2);

  const cached = await loadPublicPurchaseInputs();
  assert.deepEqual(cached, first);
  assert.equal(fetchCount, 2);

  resetPublicPurchaseInputsCacheForTests();
  await loadPublicPurchaseInputs();
  assert.equal(fetchCount, 4);
});
