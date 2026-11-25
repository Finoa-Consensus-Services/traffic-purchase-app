import { rawSynchronizerId } from "@/lib/purchase/synchronizer-id";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export type DisclosedContractRef = {
  templateId: string;
  contractId: string;
  createdEventBlob: string;
  synchronizerId: string;
};

/** Normalize Scan / ledger contract wrappers into disclosed-contract refs. */
export function disclosedFromScanContract(
  update: unknown,
  synchronizerId: string,
): DisclosedContractRef | null {
  if (!isRecord(update)) {
    return null;
  }
  const contract = isRecord(update.contract) ? update.contract : update;
  const contractId =
    readString(contract.contract_id) ?? readString(contract.contractId);
  const templateId =
    readString(contract.template_id) ?? readString(contract.templateId);
  const createdEventBlob =
    readString(contract.created_event_blob) ??
    readString(contract.createdEventBlob);
  const domain =
    readString(contract.domain_id) ??
    readString(contract.synchronizerId) ??
    synchronizerId;
  if (!contractId || !templateId || !createdEventBlob) {
    return null;
  }
  return {
    templateId,
    contractId,
    createdEventBlob,
    synchronizerId: rawSynchronizerId(domain),
  };
}
