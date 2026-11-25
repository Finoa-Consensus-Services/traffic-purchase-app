import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import {
  fetchPricingSnapshot,
  parseExternalPartyPricingSnapshot,
  parseOpenMiningRoundPricingSnapshot,
} from "./fetch-external-party-config";

const originalFetch = globalThis.fetch;
const originalScanBase = process.env.SCAN_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalScanBase === undefined) {
    delete process.env.SCAN_BASE_URL;
  } else {
    process.env.SCAN_BASE_URL = originalScanBase;
  }
});

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./fixtures/external-party-amulet-rules.json", import.meta.url),
    ),
    "utf8",
  ),
);

test("parseExternalPartyPricingSnapshot reads traffic rates from external party config", () => {
  const snapshot = parseExternalPartyPricingSnapshot(
    fixture,
    { open_mining_rounds: [] },
    null,
    new Date(),
  );
  assert.ok(snapshot);
  assert.equal(snapshot?.quoteSource, "external-party-config");
  assert.equal(snapshot?.snapshotId, "00abc123");
  assert.equal(snapshot?.rates.extraTrafficPriceUsdPerMb, 55);
  assert.equal(snapshot?.rates.amuletPriceUsd, 0.12);
  assert.equal(snapshot?.rates.minTopupBytes, 200_000);
});

test("parseExternalPartyPricingSnapshot falls back to open round price or returns null when absent", () => {
  const withoutPrice = structuredClone(fixture);
  delete withoutPrice.external_party_amulet_rules_update.contract.payload.amuletPrice;

  const missing = parseExternalPartyPricingSnapshot(
    withoutPrice,
    { open_mining_rounds: [] },
    null,
    new Date("2026-11-23T00:00:00Z"),
  );
  assert.equal(missing, null);

  const fromRound = parseExternalPartyPricingSnapshot(
    withoutPrice,
    {
      open_mining_rounds: [
        {
          domain_id: "global-domain::from-round",
          contract: {
            contract_id: "cid-round-1",
            payload: {
              round: { number: "100" },
              amuletPrice: "0.08",
              opensAt: "2026-01-01T00:00:00.000Z",
              targetClosesAt: "2099-01-01T00:00:00Z",
              tickDuration: { microseconds: "600000000" },
            },
          },
        },
      ],
    },
    { domainSequencers: [{ domainId: "global-domain::seq" }] },
    new Date("2026-11-23T00:00:00Z"),
  );
  assert.ok(fromRound);
  assert.equal(fromRound.rates.amuletPriceUsd, 0.08);
  assert.equal(fromRound.round?.round, "100");
  assert.equal(fromRound.round?.contractId, "cid-round-1");
  assert.equal(fromRound.round?.tickDurationMicros, 600_000_000);
  assert.equal(fromRound.round?.validUntil, "2026-01-01T00:10:00.000Z");
  assert.equal(fromRound.quotedAt, "2026-11-23T00:00:00.000Z");
  assert.equal("openAmuletPricesUsd" in fromRound, false);
  assert.ok(fromRound.domainIds.includes("global-domain::seq"));
});

test("parseOpenMiningRoundPricingSnapshot builds snapshot from AmuletRules and open rounds", () => {
  const rulesUpdate = {
    amulet_rules: {
      domain_id: "global-domain::active",
      contract: {
        contract_id: "cid-rules",
        payload: {
          configSchedule: {
            initialValue: {
              decentralizedSynchronizer: {
                activeSynchronizer: "global-domain::active",
                fees: { extraTrafficPrice: "60", minTopupAmount: "200000" },
              },
            },
            futureValues: [],
          },
        },
      },
    },
  };
  const rounds = {
    open_mining_rounds: [
      {
        domain_id: "global-domain::active",
        contract: {
          contract_id: "cid-round-12",
          payload: {
            round: { number: "12" },
            amuletPrice: "0.075",
            opensAt: "2026-01-01T00:00:00.000Z",
            targetClosesAt: "2099-01-01T00:00:00Z",
            tickDuration: { microseconds: "0" },
          },
        },
      },
    ],
  };
  const snapshot = parseOpenMiningRoundPricingSnapshot(
    rulesUpdate,
    rounds,
    { domainSequencers: [{ domainId: "global-domain::other" }, { domainId: "global-domain::active" }] },
    new Date("2026-11-23T00:00:00Z"),
  );
  assert.equal(snapshot.quoteSource, "open-mining-round");
  assert.equal(snapshot.snapshotId, "cid-round-12");
  assert.equal(snapshot.rates.extraTrafficPriceUsdPerMb, 60);
  assert.equal(snapshot.rates.amuletPriceUsd, 0.075);
  assert.equal(snapshot.round?.contractId, "cid-round-12");
  assert.equal(snapshot.round?.tickDurationMicros, null);
  assert.equal(snapshot.round?.validUntil, null);
  assert.equal(snapshot.quotedAt, "2026-11-23T00:00:00.000Z");
  assert.equal(snapshot.defaultDomainId, "global-domain::active");
});

test("fetchPricingSnapshot falls back to AmuletRules on external-party failure and uses GET on scan-proxy", async () => {
  const amuletRulesBody = {
    amulet_rules: {
      domain_id: "global-domain::1",
      contract: {
        contract_id: "cid-rules",
        payload: {
          configSchedule: {
            initialValue: {
              decentralizedSynchronizer: {
                activeSynchronizer: "global-domain::1",
                fees: { extraTrafficPrice: "60", minTopupAmount: "200000" },
              },
            },
            futureValues: [],
          },
        },
      },
    },
  };
  const roundsBody = {
    open_mining_rounds: [
      {
        domain_id: "global-domain::1",
        contract: {
          contract_id: "cid-round",
          payload: {
            round: { number: "7" },
            amuletPrice: "0.1",
            opensAt: "2026-01-01T00:00:00Z",
            targetClosesAt: "2099-01-01T00:00:00Z",
          },
        },
      },
    ],
  };

  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  const seenPublic: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seenPublic.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (url.includes("/v0/external-party-amulet-rules")) {
      return new Response("not found", { status: 404 });
    }
    if (url.includes("/v0/dso-sequencers")) {
      return new Response(JSON.stringify({ domainSequencers: [] }), { status: 200 });
    }
    if (url.includes("/v0/amulet-rules")) {
      return new Response(JSON.stringify(amuletRulesBody), { status: 200 });
    }
    return new Response(JSON.stringify(roundsBody), { status: 200 });
  }) as typeof fetch;

  const fallback = await fetchPricingSnapshot(undefined);
  assert.equal(fallback.quoteSource, "open-mining-round");
  assert.ok(seenPublic.some((entry) => entry.startsWith("POST /api/scan/v0/amulet-rules")));

  process.env.SCAN_BASE_URL = "https://validator.example/api/validator/v0/scan-proxy";
  const seenProxy: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seenProxy.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
    if (url.endsWith("/amulet-rules")) {
      return new Response(JSON.stringify(amuletRulesBody), { status: 200 });
    }
    return new Response(JSON.stringify(roundsBody), { status: 200 });
  }) as typeof fetch;

  const proxySnap = await fetchPricingSnapshot("proxy-token");
  assert.equal(proxySnap.quoteSource, "open-mining-round");
  assert.deepEqual(seenProxy.sort(), [
    "GET /api/validator/v0/scan-proxy/amulet-rules",
    "GET /api/validator/v0/scan-proxy/open-and-issuing-mining-rounds",
  ]);
});
