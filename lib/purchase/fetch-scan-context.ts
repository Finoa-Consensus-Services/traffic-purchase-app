import {
  ScanError,
  isScanProxy,
  scanGet,
  scanPost,
} from "@/lib/scan";
import {
  contractDomainId,
  contractPayload,
  selectOpenMiningRoundForPurchase,
  readFees,
  selectAmuletConfig,
} from "@/lib/rules";
import { disclosedFromScanContract } from "@/lib/scan-contract";
import type { PurchaseContext } from "@/lib/purchase/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function fetchPurchaseContext(
  token: string | undefined,
  options?: { synchronizerId?: string | null },
): Promise<PurchaseContext> {
  if (isScanProxy()) {
    throw new ScanError(
      404,
      "Purchase context requires a full Scan API, not the scan proxy.",
    );
  }

  const now = new Date();
  const [rulesUpdate, rounds, migration, dsoPayload] = await Promise.all([
    scanPost("/v0/amulet-rules", {}, token),
    scanPost(
      "/v0/open-and-issuing-mining-rounds",
      {
        cached_open_mining_round_contract_ids: [],
        cached_issuing_round_contract_ids: [],
      },
      token,
    ),
    scanGet("/v0/migrations/last", token),
    scanGet("/v0/dso-party-id", token),
  ]);

  if (!isRecord(rulesUpdate) || !isRecord(rounds)) {
    throw new Error("Scan purchase context responses were not objects");
  }
  const rulesContract = isRecord(rulesUpdate.amulet_rules)
    ? rulesUpdate.amulet_rules
    : rulesUpdate.amulet_rules_update;
  const config = selectAmuletConfig(contractPayload(rulesContract), new Date());
  const fees = readFees(config);
  const requested = options?.synchronizerId?.trim() || null;
  const openRound = selectOpenMiningRoundForPurchase(
    rounds.open_mining_rounds,
    now,
    requested ?? undefined,
  );

  const synchronizerId =
    requested ??
    fees.activeSynchronizer ??
    contractDomainId(openRound) ??
    contractDomainId(rulesContract);
  if (!synchronizerId) {
    throw new Error("Scan did not return a synchronizer id for purchase");
  }

  const amuletRules = disclosedFromScanContract(rulesContract, synchronizerId);
  const openMiningRound = disclosedFromScanContract(openRound, synchronizerId);
  if (!amuletRules || !openMiningRound) {
    throw new Error("Scan contracts were missing disclosed-contract fields");
  }
  if (
    requested &&
    (amuletRules.synchronizerId !== requested ||
      openMiningRound.synchronizerId !== requested)
  ) {
    const actual =
      amuletRules.synchronizerId !== requested
        ? amuletRules.synchronizerId
        : openMiningRound.synchronizerId;
    throw new Error(
      `Scan purchase contracts are on synchronizer ${actual}, not ${requested}.`,
    );
  }

  const migrationId =
    isRecord(migration) && typeof migration.migration_id === "number"
      ? migration.migration_id
      : null;
  if (migrationId === null) {
    throw new Error("Scan did not return a migration id");
  }

  const dsoPartyId = isRecord(dsoPayload)
    ? readString(dsoPayload.dso_party_id) ?? readString(dsoPayload.party_id)
    : null;
  if (!dsoPartyId) {
    throw new Error("Scan did not return the DSO party id");
  }

  return {
    scanBaseUrl: process.env.SCAN_BASE_URL?.replace(/\/$/, "") ?? "",
    synchronizerId,
    migrationId,
    dsoPartyId,
    amuletRules,
    openMiningRound,
    amuletRulesTemplateId: amuletRules.templateId,
  };
}
