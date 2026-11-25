import type { DisclosedContractRef } from "@/lib/scan-contract";
import { disclosedFromScanContract } from "@/lib/scan-contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export type ParsedTransferFactoryResponse = {
  factoryId: string;
  transferKind: string | null;
  choiceContextData: Record<string, unknown>;
  disclosedContracts: DisclosedContractRef[];
  /** Interface id of the registry path that returned this factory. */
  interfaceId?: string;
};

export function parseTransferFactoryResponse(
  payload: unknown,
  synchronizerId: string,
): ParsedTransferFactoryResponse {
  if (!isRecord(payload)) {
    throw new Error("Transfer factory response was not an object");
  }
  const factoryId = readString(payload.factoryId);
  if (!factoryId) {
    throw new Error("Transfer factory response has no factoryId");
  }
  const choiceContext = isRecord(payload.choiceContext)
    ? payload.choiceContext
    : null;
  if (!choiceContext) {
    throw new Error("Transfer factory response has no choiceContext");
  }
  const choiceContextData = isRecord(choiceContext.choiceContextData)
    ? choiceContext.choiceContextData
    : { values: {} };
  const disclosedRaw = Array.isArray(choiceContext.disclosedContracts)
    ? choiceContext.disclosedContracts
    : [];
  const disclosedContracts = disclosedRaw.flatMap((row) => {
    const ref = disclosedFromScanContract(row, synchronizerId);
    return ref ? [ref] : [];
  });
  if (disclosedContracts.length === 0) {
    throw new Error("Transfer factory returned no disclosed contracts");
  }
  return {
    factoryId,
    transferKind: readString(payload.transferKind),
    choiceContextData,
    disclosedContracts,
  };
}
