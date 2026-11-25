import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { ScanError } from "@/lib/scan";
import { fetchPurchaseContext } from "./fetch-scan-context";

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

function mockScanResponses(overrides?: {
  rulesDomain?: string;
  roundDomain?: string;
  migration?: unknown;
  dso?: unknown;
  omitBlob?: boolean;
}) {
  const rulesDomain = overrides?.rulesDomain ?? "global-domain::1220";
  const roundDomain = overrides?.roundDomain ?? "global-domain::1220";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/v0/amulet-rules")) {
      return new Response(
        JSON.stringify({
          amulet_rules: {
            domain_id: rulesDomain,
            contract: {
              contract_id: "cid-rules",
              template_id: "pkg:Splice.AmuletRules:AmuletRules",
              ...(overrides?.omitBlob ? {} : { created_event_blob: "blob-rules" }),
              domain_id: rulesDomain,
              payload: {
                configSchedule: {
                  initialValue: {
                    decentralizedSynchronizer: {
                      activeSynchronizer: rulesDomain,
                      fees: { extraTrafficPrice: "60", minTopupAmount: "200000" },
                    },
                  },
                  futureValues: [],
                },
              },
            },
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/v0/open-and-issuing-mining-rounds")) {
      return new Response(
        JSON.stringify({
          open_mining_rounds: [
            {
              domain_id: roundDomain,
              contract: {
                contract_id: "cid-round",
                template_id: "pkg:Splice.Round:OpenMiningRound",
                created_event_blob: "blob-round",
                domain_id: roundDomain,
                payload: {
                  round: { number: "12" },
                  amuletPrice: "0.1",
                  opensAt: "2020-01-01T00:00:00Z",
                  targetClosesAt: "2099-01-01T00:00:00Z",
                },
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/v0/migrations/last")) {
      return new Response(
        JSON.stringify(overrides?.migration ?? { migration_id: 4 }),
        { status: 200 },
      );
    }
    if (url.includes("/v0/dso-party-id")) {
      return new Response(
        JSON.stringify(overrides?.dso ?? { dso_party_id: "DSO::1220" }),
        { status: 200 },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

test("fetchPurchaseContext rejects scan-proxy endpoints with 404 ScanError", async () => {
  process.env.SCAN_BASE_URL = "https://validator.example/api/validator/v0/scan-proxy";
  await assert.rejects(
    () => fetchPurchaseContext(undefined),
    (err: unknown) => err instanceof ScanError && err.status === 404,
  );
});

test("fetchPurchaseContext assembles disclosed contracts, migrationId, and DSO party", async () => {
  mockScanResponses({ dso: { party_id: "DSO::fallback" } });
  const ctx = await fetchPurchaseContext(undefined, {
    synchronizerId: "global-domain::1220",
  });
  assert.equal(ctx.synchronizerId, "global-domain::1220");
  assert.equal(ctx.migrationId, 4);
  assert.equal(ctx.dsoPartyId, "DSO::fallback");
  assert.equal(ctx.amuletRules.contractId, "cid-rules");
  assert.equal(ctx.openMiningRound.contractId, "cid-round");
});

test("fetchPurchaseContext rejects synchronizer mismatches and incomplete Scan payloads", async () => {
  mockScanResponses({
    rulesDomain: "global-domain::other",
    roundDomain: "global-domain::1220",
  });
  await assert.rejects(
    () => fetchPurchaseContext(undefined, { synchronizerId: "global-domain::1220" }),
    /on synchronizer global-domain::other, not global-domain::1220/,
  );

  mockScanResponses({ omitBlob: true });
  await assert.rejects(
    () => fetchPurchaseContext(undefined),
    /missing disclosed-contract fields/,
  );

  mockScanResponses({ migration: {} });
  await assert.rejects(
    () => fetchPurchaseContext(undefined),
    /migration id/,
  );

  mockScanResponses({ dso: {} });
  await assert.rejects(
    () => fetchPurchaseContext(undefined),
    /DSO party id/,
  );
});
