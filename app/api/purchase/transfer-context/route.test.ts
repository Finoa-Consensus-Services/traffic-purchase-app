import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resetPublicPurchaseInputsCacheForTests } from "@/lib/purchase/public-purchase-inputs";
import { resetRegistryAuthCacheForTests } from "@/lib/server/registry-auth";
import { POST } from "./route";

const originalFetch = globalThis.fetch;
const envKeys = [
  "TRANSFER_REGISTRY_BASE_URL",
  "SCAN_TRANSFER_FACTORY_BASE_URL",
  "SCAN_TRANSFER_FACTORY_PATH",
  "NETWORK_INFO_URL",
  "REGISTRY_BEARER_TOKEN",
  "REGISTRY_REQUIRE_AUTH",
  "KEYCLOAK_TOKEN_URL",
] as const;

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  resetPublicPurchaseInputsCacheForTests();
  resetRegistryAuthCacheForTests();
  for (const key of envKeys) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
  process.env.TRANSFER_REGISTRY_BASE_URL = "https://scan.example";
  process.env.NETWORK_INFO_URL = "https://info.example/info";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetPublicPurchaseInputsCacheForTests();
  resetRegistryAuthCacheForTests();
  for (const key of envKeys) {
    const prev = savedEnv.get(key);
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/purchase/transfer-context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockPublicRegistry() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("info.example")) {
      return new Response(JSON.stringify({ sv: { migration_id: 5 } }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        factoryId: "00factory-cid",
        transferKind: "self",
        choiceContext: {
          choiceContextData: { values: { openMiningRound: "cid-round" } },
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
}

test("POST /api/purchase/transfer-context validates JSON and required fields", async () => {
  const badJson = await POST(
    new Request("http://localhost/api/purchase/transfer-context", {
      method: "POST",
      body: "not-json",
    }),
  );
  assert.equal(badJson.status, 400);

  const missing = await POST(
    jsonRequest({ senderPartyId: "alice::1", receiverPartyId: "rx::1", memberId: "PAR::m", ccAmount: 0 }),
  );
  assert.equal(missing.status, 400);
});

test("POST /api/purchase/transfer-context normalizes memberId, filters holding cids, and builds memo", async () => {
  mockPublicRegistry();
  const res = await POST(
    jsonRequest({
      senderPartyId: "alice::1220",
      receiverPartyId: "splice_traffic-manager::1220",
      memberId: "1220bare",
      synchronizerId: "global-domain::1220",
      ccAmount: "157.89",
      inputHoldingCids: ["cid-1", "", 42, "cid-2"],
    }),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    memo: string;
    migrationId: number;
    choiceArguments: { transfer: { inputHoldingCids: string[]; amount: string } };
  };
  assert.equal(body.ok, true);
  assert.equal(body.migrationId, 5);
  assert.equal(
    body.memo,
    "splice/memo:member-id=PAR::1220bare&synchronizer-id=global-domain::1220&migration-id=5&forfeit-validator-reward-coupon=true",
  );
  assert.deepEqual(body.choiceArguments.transfer.inputHoldingCids, ["cid-1", "cid-2"]);
  assert.equal(body.choiceArguments.transfer.amount, "157.89");
});

test("POST /api/purchase/transfer-context returns 502 on synchronizer mismatch", async () => {
  mockPublicRegistry();
  const res = await POST(
    jsonRequest({
      senderPartyId: "alice::1220",
      receiverPartyId: "splice_traffic-manager::1220",
      memberId: "PAR::m",
      synchronizerId: "global-domain::wrong",
      ccAmount: 100,
    }),
  );
  assert.equal(res.status, 502);
  const body = (await res.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /not global-domain::wrong/);
});
