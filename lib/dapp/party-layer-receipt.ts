import { isLedgerUpdateId } from "@/lib/purchase/ledger-update-id";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const ledgerId = (value: unknown): string | null =>
  typeof value === "string" && isLedgerUpdateId(value) ? value : null;

const readUpdateId = (value: unknown, allowRaw: boolean): string | null => {
  if (!isRecord(value)) return null;
  const direct =
    ledgerId(value.updateId) ?? ledgerId(value.transactionHash) ?? ledgerId(value.txId);
  if (direct) return direct;

  const tx = isRecord(value.tx) ? value.tx : null;
  const payload = tx && isRecord(tx.payload) ? tx.payload : null;
  const nested = payload ? ledgerId(payload.updateId) : null;
  if (nested) return nested;
  if (!allowRaw) return null;
  return readUpdateId(value.raw, false);
};

/** PartyLayer reports the ledger update on the receipt, often before calling it committed. */
export const updateIdFromPartyLayerReceipt = (receipt: unknown): string | null =>
  readUpdateId(receipt, true);

export const updateIdFromPartyLayerStatus = (event: unknown): string | null => {
  if (!isRecord(event)) return null;
  if (event.status === "rejected" || event.status === "failed") return null;
  return updateIdFromPartyLayerReceipt(event);
};

export const commandIdFromPartyLayerStatus = (event: unknown): string | null => {
  if (!isRecord(event)) return null;
  if (isRecord(event.raw) && typeof event.raw.commandId === "string") return event.raw.commandId;
  if (isRecord(event.tx) && typeof event.tx.commandId === "string") return event.tx.commandId;
  return null;
};
