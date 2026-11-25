import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resetRegistryAuthCacheForTests } from "@/lib/server/registry-auth";
import { resetPublicPurchaseInputsCacheForTests } from "./public-purchase-inputs";
import { resolvePurchasePath } from "./resolve-purchase-path";

const originalFetch = globalThis.fetch;
const envKeys = [
  "TRANSFER_REGISTRY_BASE_URL",
  "SCAN_TRANSFER_FACTORY_BASE_URL",
  "SCAN_TRANSFER_FACTORY_PATH",
  "SCAN_BASE_URL",
  "NETWORK_INFO_URL",
  "TRAFFIC_PURCHASE_PROBE_SENDER",
  "TRAFFIC_PURCHASE_RECEIVER_PARTY_ID",
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

const registryPayloadWithDebug = {
  factoryId: "00factory-cid",
  transferKind: "self",
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
};

function mockPublicEndpoints(options?: { failProbe?: boolean }) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("info.example")) {
      return new Response(JSON.stringify({ sv: { migration_id: 2 } }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body ?? "{}")) as { excludeDebugFields?: boolean };
    if (body.excludeDebugFields === false) {
      return new Response(JSON.stringify(registryPayloadWithDebug), { status: 200 });
    }
    if (options?.failProbe) {
      return new Response("bad sender", { status: 400 });
    }
    return new Response(JSON.stringify(registryPayloadWithDebug), { status: 200 });
  }) as typeof fetch;
}

test("resolvePurchasePath enables token-standard when probe succeeds", async () => {
  mockPublicEndpoints();
  const status = await resolvePurchasePath(undefined, {
    probeSenderPartyId: "alice::1220",
    synchronizerId: "global-domain::1220",
  });
  assert.equal(status.path, "token-standard");
  assert.equal(status.tokenStandardAvailable, true);
  assert.equal(status.transferFactoryAvailable, true);
  assert.equal(
    status.transferFactoryPathUsed,
    "/registry/transfer-instruction/v1/transfer-factory",
  );
  assert.equal(status.transferFactoryProbeError, null);
});

test("resolvePurchasePath falls back to legacy when no probe sender is configured", async () => {
  mockPublicEndpoints();
  const status = await resolvePurchasePath(undefined);
  assert.equal(status.path, "legacy");
  assert.equal(status.tokenStandardAvailable, false);
  assert.equal(status.transferFactoryAvailable, false);
  assert.match(status.transferFactoryProbeError ?? "", /Connect a wallet/);
});

test("resolvePurchasePath falls back to legacy on synchronizer mismatch or probe error", async () => {
  mockPublicEndpoints();
  const mismatch = await resolvePurchasePath(undefined, {
    probeSenderPartyId: "alice::1220",
    synchronizerId: "global-domain::other",
  });
  assert.equal(mismatch.path, "legacy");
  assert.match(mismatch.transferFactoryProbeError ?? "", /not global-domain::other/);

  resetPublicPurchaseInputsCacheForTests();
  mockPublicEndpoints({ failProbe: true });
  const failed = await resolvePurchasePath(undefined, {
    probeSenderPartyId: "alice::1220",
  });
  assert.equal(failed.path, "legacy");
  assert.match(failed.transferFactoryProbeError ?? "", /400/);
});
