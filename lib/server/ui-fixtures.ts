import type { PurchaseContext } from "@/lib/purchase/types";
import { validUntilFromRound } from "@/lib/purchase/quote-validity";

/** Sample Scan data for next dev. Off when NODE_ENV is production. */
export function uiFixturesEnabled(
  env: { UI_FIXTURES?: string; NODE_ENV?: string } = process.env,
) {
  return env.UI_FIXTURES === "1" && env.NODE_ENV !== "production";
}

const DOMAIN_ID = "global-domain::local-ui";

const RATES = {
  extraTrafficPriceUsdPerMb: 60,
  amuletPriceUsd: 0.1,
  minTopupBytes: 200_000,
};

export function fixtureQuote(now = new Date()) {
  const opensAt = new Date(now.getTime() - 60_000).toISOString();
  const tickDurationMicros = 600_000_000;
  const validUntil = validUntilFromRound({ opensAt, tickDurationMicros });
  return {
    ok: true as const,
    fixture: true,
    proxy: false,
    scanBaseUrl: "http://localhost/fixture",
    snapshotId: "cid-round-local",
    quotedAt: now.toISOString(),
    validUntil,
    fees: {
      extraTrafficPriceUsdPerMb: RATES.extraTrafficPriceUsdPerMb,
      minTopupBytes: RATES.minTopupBytes,
    },
    rates: RATES,
    round: {
      round: "1",
      contractId: "cid-round-local",
      amuletPriceUsd: RATES.amuletPriceUsd,
      opensAt,
      targetClosesAt: new Date(now.getTime() + 19 * 60_000).toISOString(),
      tickDurationMicros,
      validUntil,
    },
    domainIds: [DOMAIN_ID],
    defaultDomainId: DOMAIN_ID,
  };
}

export function fixtureLookup(query: string) {
  const memberId = /^(PAR|MED)::/i.test(query) ? query : "PAR::local-preview";
  return {
    ok: true as const,
    inputKind: "member" as const,
    domainId: DOMAIN_ID,
    members: [
      {
        memberId,
        totalConsumed: 120_000,
        totalLimit: 5_000_000,
        totalPurchased: 800_000,
        availableBytes: 4_880_000,
      },
    ],
  };
}

export function fixturePurchaseContext(): { ok: true; scanBaseUrl: string; context: PurchaseContext } {
  const disclosed = {
    templateId: "pkg:Splice.AmuletRules:AmuletRules",
    contractId: "cid-rules-local",
    createdEventBlob: "blob-rules-local",
    synchronizerId: DOMAIN_ID,
  };
  return {
    ok: true,
    scanBaseUrl: "http://localhost/fixture",
    context: {
      scanBaseUrl: "http://localhost/fixture",
      synchronizerId: DOMAIN_ID,
      migrationId: 0,
      dsoPartyId: "DSO::local-ui",
      amuletRules: disclosed,
      openMiningRound: {
        ...disclosed,
        templateId: "pkg:Splice.Round:OpenMiningRound",
        contractId: "cid-round-local",
        createdEventBlob: "blob-round-local",
      },
      amuletRulesTemplateId: disclosed.templateId,
    },
  };
}

export function fixturePathStatus() {
  return {
    ok: true as const,
    scanBaseUrl: "http://localhost/fixture",
    proxy: false,
    path: "token-standard" as const,
    detail: "Local preview uses a sample token transfer.",
    receiverPartyId: "splice_traffic-manager::1220localpreview",
    transferFactoryAvailable: true,
    transferFactoryProbeError: null,
    transferFactoryPathUsed: "/registry/transfer-instruction/v1/transfer-factory",
    tokenStandardAvailable: true,
  };
}
