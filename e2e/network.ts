import type { Page, Route } from "@playwright/test";

export const DOMAIN_ID = "global-domain::1220abcd";
export const SECOND_DOMAIN_ID = "global-domain::1220efgh";
export const PARTY_ID = "alice::1220abcd1234ef";
export const MEMBER_ID = "PAR::validator-north-01";
export const SECOND_MEMBER_ID = "PAR::validator-south-02";
export const UPDATE_ID =
  "1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
export const SUBMISSION_UUID = "008a1c33-21d3-40c8-aeba-ebd0039ed70d";

const RATES = {
  extraTrafficPriceUsdPerMb: 60,
  amuletPriceUsd: 0.1,
  minTopupBytes: 200_000,
};

const disclosed = {
  templateId: "pkg:Splice.AmuletRules:AmuletRules",
  contractId: "cid-rules",
  createdEventBlob: "blob-rules",
  synchronizerId: DOMAIN_ID,
};

export const quoteBody = {
  ok: true,
  proxy: false,
  scanBaseUrl: "https://scan.example/api/scan",
  fees: {
    extraTrafficPriceUsdPerMb: RATES.extraTrafficPriceUsdPerMb,
    minTopupBytes: RATES.minTopupBytes,
  },
  rates: RATES,
  domainIds: [DOMAIN_ID],
  defaultDomainId: DOMAIN_ID,
};

export const purchaseContextBody = {
  ok: true,
  context: {
    scanBaseUrl: "https://scan.example/api/scan",
    synchronizerId: DOMAIN_ID,
    migrationId: 0,
    dsoPartyId: "DSO::1220dso",
    amuletRules: disclosed,
    openMiningRound: {
      ...disclosed,
      templateId: "pkg:Splice.Round:OpenMiningRound",
      contractId: "cid-round",
      createdEventBlob: "blob-round",
    },
    amuletRulesTemplateId: disclosed.templateId,
  },
};

export const legacyPathBody = {
  ok: true,
  path: "legacy",
  detail: "Token Standard receiver is not configured.",
  receiverPartyId: null,
  transferFactoryAvailable: false,
  transferFactoryProbeError: null,
  transferFactoryPathUsed: null,
  tokenStandardAvailable: false,
};

export const RECEIVER_PARTY_ID = "splice_traffic-manager::1220abcd";

export const tokenStandardPathBody = {
  ok: true,
  path: "token-standard",
  detail: "Traffic-purchase receiver is configured.",
  receiverPartyId: RECEIVER_PARTY_ID,
  transferFactoryAvailable: true,
  transferFactoryProbeError: null,
  transferFactoryPathUsed: "/registry/transfer-instruction/v1/transfer-factory",
  tokenStandardAvailable: true,
};

export function quoteTiming(
  now = Date.now(),
  validForMs = 30 * 60 * 1000,
  contractId = "cid-round",
) {
  const tickDurationMicros = 600_000_000;
  const tickMs = tickDurationMicros / 1000;
  const validUntilMs = now + validForMs;
  const opensAtMs = validUntilMs - tickMs;
  const validUntil = new Date(validUntilMs).toISOString();
  return {
    snapshotId: contractId,
    quotedAt: new Date(now).toISOString(),
    validUntil,
    round: {
      round: "1",
      contractId,
      amuletPriceUsd: RATES.amuletPriceUsd,
      opensAt: new Date(opensAtMs).toISOString(),
      targetClosesAt: new Date(opensAtMs + tickMs * 2).toISOString(),
      tickDurationMicros,
      validUntil,
    },
  };
}

export function pricedQuote(input: {
  now?: number;
  price?: number;
  contractId?: string;
  validForMs?: number;
}) {
  const price = input.price ?? RATES.amuletPriceUsd;
  const timing = quoteTiming(
    input.now ?? Date.now(),
    input.validForMs ?? 30 * 60 * 1000,
    input.contractId ?? "cid-round",
  );
  return {
    ...timing,
    rates: {
      extraTrafficPriceUsdPerMb: RATES.extraTrafficPriceUsdPerMb,
      amuletPriceUsd: price,
      minTopupBytes: RATES.minTopupBytes,
    },
    round: { ...timing.round, amuletPriceUsd: price },
  };
}

export type PurchaseApiOptions = {
  path?: "legacy" | "token-standard";
  quote?: Record<string, unknown> | (() => Record<string, unknown> | undefined);
  openRoundContractId?: string | (() => string);
  lookupError?: { status: number; error: string };
  transferContextError?: { status: number; error: string };
  confirmationUpdateId?: string;
};

export type MemberFixture = {
  memberId: string;
  totalConsumed: number;
  totalLimit: number;
  totalPurchased: number;
  availableBytes: number;
};

export function memberFixture(
  memberId: string,
  availableBytes = 1_000_000,
): MemberFixture {
  return {
    memberId,
    totalConsumed: 0,
    totalLimit: availableBytes,
    totalPurchased: 0,
    availableBytes,
  };
}

function tokenStandardTransferContext(body: {
  senderPartyId?: string;
  receiverPartyId?: string;
  memberId?: string;
  synchronizerId?: string;
  ccAmount?: number;
  inputHoldingCids?: string[];
}) {
  const memberId = body.memberId ?? MEMBER_ID;
  const synchronizerId = body.synchronizerId ?? DOMAIN_ID;
  const memo = `splice/memo:member-id=${memberId}&synchronizer-id=${synchronizerId}&migration-id=0&forfeit-validator-reward-coupon=true`;
  return {
    ok: true,
    receiverPartyId: body.receiverPartyId ?? RECEIVER_PARTY_ID,
    memo,
    synchronizerId,
    migrationId: 0,
    transferFactory: {
      factoryId: "00factory-cid",
      transferKind: "self",
      choiceContextData: { values: { openMiningRound: "cid-round" } },
      disclosedContracts: [
        {
          templateId: disclosed.templateId,
          contractId: "00factory-cid",
          createdEventBlob: "blob-factory",
          synchronizerId: DOMAIN_ID,
        },
      ],
    },
    choiceArguments: {
      expectedAdmin: "DSO::1220dso",
      transfer: {
        sender: body.senderPartyId ?? PARTY_ID,
        receiver: RECEIVER_PARTY_ID,
        amount: String(body.ccAmount ?? 0),
        instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
        requestedAt: "2026-01-01T00:00:00.000Z",
        executeBefore: "2026-01-02T00:00:00.000Z",
        inputHoldingCids: body.inputHoldingCids ?? [],
        meta: {
          values: {
            memo,
            "splice.lfdecentralizedtrust.org/reason": memo,
          },
        },
      },
      extraArgs: {
        context: { values: {} },
        meta: { values: {} },
      },
    },
  };
}

export async function mockPurchaseApis(
  page: Page,
  members: MemberFixture[],
  options: PurchaseApiOptions = {},
) {
  const purchasePath = options.path ?? "legacy";
  await page.route("**/api/**", async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === "/api/quote") {
      const extra = typeof options.quote === "function" ? options.quote() : options.quote;
      await route.fulfill({ json: { ...quoteBody, ...quoteTiming(), ...extra } });
      return;
    }
    if (path === "/api/lookup") {
      if (options.lookupError) {
        await route.fulfill({
          status: options.lookupError.status,
          json: { ok: false, error: options.lookupError.error },
        });
        return;
      }
      await route.fulfill({ json: { ok: true, members } });
      return;
    }
    if (path === "/api/purchase-context") {
      const requestedSync = url.searchParams.get("synchronizerId") || DOMAIN_ID;
      const openRoundContractId =
        typeof options.openRoundContractId === "function"
          ? options.openRoundContractId()
          : options.openRoundContractId ?? "cid-round";
      await route.fulfill({
        json: {
          ...purchaseContextBody,
          context: {
            ...purchaseContextBody.context,
            synchronizerId: requestedSync,
            amuletRules: {
              ...purchaseContextBody.context.amuletRules,
              synchronizerId: requestedSync,
            },
            openMiningRound: {
              ...purchaseContextBody.context.openMiningRound,
              contractId: openRoundContractId,
              synchronizerId: requestedSync,
            },
          },
        },
      });
      return;
    }
    if (path === "/api/purchase/path-status") {
      await route.fulfill({
        json: purchasePath === "token-standard" ? tokenStandardPathBody : legacyPathBody,
      });
      return;
    }
    if (path === "/api/purchase/confirmation" && route.request().method() === "POST") {
      const prepared = await page.evaluate(
        () =>
          Boolean(
            (window as Window & { __playwrightLastPrepare?: unknown })
              .__playwrightLastPrepare,
          ),
      );
      await route.fulfill({
        json: {
          ok: true,
          updateId: prepared ? (options.confirmationUpdateId ?? null) : null,
        },
      });
      return;
    }
    if (path === "/api/purchase/transfer-context" && route.request().method() === "POST") {
      if (options.transferContextError) {
        await route.fulfill({
          status: options.transferContextError.status,
          json: { ok: false, error: options.transferContextError.error },
        });
        return;
      }
      const body = route.request().postDataJSON() as {
        senderPartyId?: string;
        receiverPartyId?: string;
        memberId?: string;
        synchronizerId?: string;
        ccAmount?: number;
        inputHoldingCids?: string[];
      };
      await route.fulfill({ json: tokenStandardTransferContext(body) });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { ok: false, error: `Unmocked ${path}` },
    });
  });
}
