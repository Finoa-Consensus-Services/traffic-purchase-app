/** Interface ids kept here so the client bundle stays smaller. */
export const TRANSFER_FACTORY_INTERFACE_ID =
  "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory";

export const TRANSFER_FACTORY_INTERFACE_ID_V2 =
  "#splice-api-token-transfer-instruction-v2:Splice.Api.Token.TransferInstructionV2:TransferFactory";

/** Splice token-standard memo metadata key (CIP transfer reason). */
export const SPLICE_TRANSFER_MEMO_KEY =
  "splice.lfdecentralizedtrust.org/reason";

export const AMULET_INSTRUMENT_ID = "Amulet";

const REQUESTED_AT_SKEW_MS = 30_000;

export function formatCcAmount(cc: number): string {
  if (!Number.isFinite(cc) || cc <= 0) {
    throw new Error("CC amount must be a positive number");
  }
  return cc.toFixed(10).replace(/\.?0+$/, "") || "0";
}

export function defaultExecuteBeforeIso(hours = 24): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function defaultRequestedAtIso(): string {
  return new Date(Date.now() - REQUESTED_AT_SKEW_MS).toISOString();
}
