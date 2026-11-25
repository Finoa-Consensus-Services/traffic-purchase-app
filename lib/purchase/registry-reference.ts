import { buildTransferChoiceArguments } from "@/lib/purchase/build-transfer-choice-args";
import { fetchTransferFactoryPayload } from "@/lib/purchase/fetch-transfer-factory";
import { readFees, selectAmuletConfig } from "@/lib/rules";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export type RegistryReference = {
  dsoPartyId: string;
  synchronizerId: string;
};

/** Placeholder admin. The registry still returns the live AmuletRules payload. */
const BOOTSTRAP_ADMIN = "DSO::1220abcd";

export function readRegistryReference(
  payload: unknown,
  now = new Date(),
): RegistryReference {
  if (!isRecord(payload) || !isRecord(payload.choiceContext)) {
    throw new Error("Transfer factory response has no choiceContext");
  }
  const disclosed = Array.isArray(payload.choiceContext.disclosedContracts)
    ? payload.choiceContext.disclosedContracts
    : [];
  for (const row of disclosed) {
    if (!isRecord(row)) {
      continue;
    }
    const templateId = readString(row.templateId) ?? "";
    if (!templateId.endsWith(":AmuletRules")) {
      continue;
    }
    const debugPayload = row.debugPayload;
    if (!isRecord(debugPayload)) {
      continue;
    }
    const dsoPartyId = readString(debugPayload.dso);
    if (!dsoPartyId) {
      continue;
    }
    const synchronizerId = readFees(
      selectAmuletConfig(debugPayload, now),
    ).activeSynchronizer;
    if (!synchronizerId) {
      continue;
    }
    return { dsoPartyId, synchronizerId };
  }
  throw new Error(
    "Transfer factory response did not include AmuletRules debug fields (dso, active synchronizer).",
  );
}

export async function fetchRegistryReference(): Promise<RegistryReference> {
  const choiceArguments = buildTransferChoiceArguments({
    senderPartyId: "sender::1220abcd",
    receiverPartyId: "splice_traffic-manager::1220abcd",
    ccAmount: 1,
    instrumentAdmin: BOOTSTRAP_ADMIN,
    inputHoldingCids: [],
    memo: "splice/memo:member-id=PAR::bootstrap&synchronizer-id=bootstrap&migration-id=0",
  });
  const payload = await fetchTransferFactoryPayload(choiceArguments, {
    excludeDebugFields: false,
  });
  return readRegistryReference(payload);
}
