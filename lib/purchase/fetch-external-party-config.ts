import { isScanProxy, scanGet, scanPost } from "@/lib/scan";
import {
  contractDomainId,
  contractPayload,
  firstOpenRound,
  readFees,
  readRound,
  selectAmuletConfig,
} from "@/lib/rules";
import type { PricingSnapshot } from "@/lib/purchase/pricing-snapshot";
import { validUntilFromRound, type QuoteRound } from "@/lib/purchase/quote-validity";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function domainIdsFromSequencers(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.domainSequencers)) {
    return [];
  }
  const ids = payload.domainSequencers.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.domainId !== "string") {
      return [];
    }
    return [entry.domainId];
  });
  return [...new Set(ids)];
}

function contractFromExternalPartyRules(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return null;
  }
  const keys = [
    "external_party_amulet_rules",
    "external_party_amulet_rules_update",
    "externalPartyAmuletRules",
    "externalPartyAmuletRulesUpdate",
  ] as const;
  for (const key of keys) {
    if (key in payload) {
      return payload[key];
    }
  }
  if (isRecord(payload.contract)) {
    return payload;
  }
  return null;
}

function snapshotIdFromContract(contract: unknown): string {
  if (!isRecord(contract)) {
    return "unknown";
  }
  const direct =
    readString(contract.contract_id) ??
    readString(contract.contractId) ??
    (isRecord(contract.contract)
      ? readString(contract.contract.contract_id) ??
        readString(contract.contract.contractId)
      : null);
  return direct ?? "unknown";
}

function miningRoundFrom(entry: unknown): QuoteRound {
  const meta = readRound(entry);
  const contractId = snapshotIdFromContract(entry);
  return {
    round: meta.round,
    contractId: contractId === "unknown" ? null : contractId,
    amuletPriceUsd: meta.amuletPriceUsd,
    opensAt: meta.opensAt,
    targetClosesAt: meta.targetClosesAt,
    tickDurationMicros: meta.tickDurationMicros,
    validUntil: validUntilFromRound(meta),
  };
}

export function parseExternalPartyPricingSnapshot(
  rulesUpdate: unknown,
  rounds: unknown,
  sequencers: unknown | null,
  now: Date,
): PricingSnapshot | null {
  const contract = contractFromExternalPartyRules(rulesUpdate);
  if (!contract) {
    return null;
  }
  const payload = contractPayload(contract);
  const config = isRecord(payload.configSchedule)
    ? selectAmuletConfig(payload, now)
    : payload;
  const fees = readFees(config);
  const amuletFromPayload = readNumber(payload.amuletPrice);
  let round: PricingSnapshot["round"] = null;
  let amuletPriceUsd = amuletFromPayload;
  if (isRecord(rounds)) {
    try {
      const openRound = firstOpenRound(rounds.open_mining_rounds);
      round = miningRoundFrom(openRound);
      if (amuletPriceUsd === null || amuletPriceUsd <= 0) {
        amuletPriceUsd = round.amuletPriceUsd;
      }
    } catch {
      /* open round optional for external-party config */
    }
  }
  if (amuletPriceUsd === null || amuletPriceUsd <= 0) {
    return null;
  }
  const domainIds = domainIdsFromSequencers(sequencers);
  const contractDomain = contractDomainId(contract);
  if (contractDomain && !domainIds.includes(contractDomain)) {
    domainIds.push(contractDomain);
  }
  const defaultDomainId =
    (fees.activeSynchronizer && domainIds.includes(fees.activeSynchronizer)
      ? fees.activeSynchronizer
      : null) ??
    domainIds[0] ??
    fees.activeSynchronizer;

  return {
    quoteSource: "external-party-config",
    snapshotId: snapshotIdFromContract(contract),
    quotedAt: now.toISOString(),
    fees,
    rates: {
      extraTrafficPriceUsdPerMb: fees.extraTrafficPriceUsdPerMb,
      amuletPriceUsd,
      minTopupBytes: fees.minTopupBytes,
    },
    round,
    domainIds,
    defaultDomainId,
  };
}

export function parseOpenMiningRoundPricingSnapshot(
  rulesUpdate: unknown,
  rounds: unknown,
  sequencers: unknown | null,
  now: Date,
): PricingSnapshot {
  if (!isRecord(rulesUpdate) || !isRecord(rounds)) {
    throw new Error("Scan quote responses were not objects");
  }
  const rulesContract = isRecord(rulesUpdate.amulet_rules)
    ? rulesUpdate.amulet_rules
    : rulesUpdate.amulet_rules_update;
  const config = selectAmuletConfig(contractPayload(rulesContract), now);
  const fees = readFees(config);
  const openRound = firstOpenRound(rounds.open_mining_rounds);
  const round = miningRoundFrom(openRound);
  const domainIds = domainIdsFromSequencers(sequencers);
  const contractDomain =
    contractDomainId(openRound) ?? contractDomainId(rulesContract);
  if (contractDomain && !domainIds.includes(contractDomain)) {
    domainIds.push(contractDomain);
  }
  const defaultDomainId =
    (fees.activeSynchronizer && domainIds.includes(fees.activeSynchronizer)
      ? fees.activeSynchronizer
      : null) ??
    domainIds[0] ??
    fees.activeSynchronizer;

  return {
    quoteSource: "open-mining-round",
    snapshotId: snapshotIdFromContract(openRound),
    quotedAt: now.toISOString(),
    fees,
    rates: {
      extraTrafficPriceUsdPerMb: fees.extraTrafficPriceUsdPerMb,
      amuletPriceUsd: round.amuletPriceUsd,
      minTopupBytes: fees.minTopupBytes,
    },
    round,
    domainIds,
    defaultDomainId,
  };
}

export async function fetchPricingSnapshot(
  token: string | undefined,
): Promise<PricingSnapshot> {
  const now = new Date();
  const sequencersPromise = isScanProxy()
    ? Promise.resolve(null)
    : scanGet("/v0/dso-sequencers", token).catch(() => null);

  if (!isScanProxy()) {
    try {
      const [externalRules, rounds, sequencers] = await Promise.all([
        scanPost("/v0/external-party-amulet-rules", {}, token),
        scanPost(
          "/v0/open-and-issuing-mining-rounds",
          {
            cached_open_mining_round_contract_ids: [],
            cached_issuing_round_contract_ids: [],
          },
          token,
        ),
        sequencersPromise,
      ]);
      const fromExternal = parseExternalPartyPricingSnapshot(
        externalRules,
        rounds,
        sequencers,
        now,
      );
      if (fromExternal) {
        return fromExternal;
      }
    } catch {
      /* fall through to amulet rules */
    }
  }

  const [rulesUpdate, rounds, sequencers] = isScanProxy()
    ? await Promise.all([
        scanGet("/amulet-rules", token),
        scanGet("/open-and-issuing-mining-rounds", token),
        Promise.resolve(null),
      ])
    : await Promise.all([
        scanPost("/v0/amulet-rules", {}, token),
        scanPost(
          "/v0/open-and-issuing-mining-rounds",
          {
            cached_open_mining_round_contract_ids: [],
            cached_issuing_round_contract_ids: [],
          },
          token,
        ),
        sequencersPromise,
      ]);

  return parseOpenMiningRoundPricingSnapshot(
    rulesUpdate,
    rounds,
    sequencers,
    now,
  );
}
