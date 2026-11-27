const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasLedgerPayload = (value: Record<string, unknown>): boolean =>
  "offset" in value ||
  "Offset" in value ||
  "ledgerEnd" in value ||
  "activeContracts" in value ||
  "active_contracts" in value ||
  "active_contract" in value;

/**
 * PartyLayer's wallet adapter returns the ledger body as `response`, often a JSON
 * string. Direct CIP-0103 wallets return the ledger object itself.
 */
export const unwrapLedgerPayload = (value: unknown): unknown => {
  let current = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current) as unknown;
        continue;
      } catch {
        return value;
      }
    }
    if (!isRecord(current) || hasLedgerPayload(current)) return current;
    const nested = current.response ?? current.body ?? current.result;
    if (nested === undefined || nested === current) return current;
    current = nested;
  }
  return current;
};

const offsetNumber = (raw: unknown): number | null => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && /^-?\d+$/.test(raw.trim())) {
    const parsed = Number(raw.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!isRecord(raw)) return null;
  return offsetNumber(raw.absolute ?? raw.value ?? raw.offset ?? null);
};

export const ledgerOffset = (value: unknown): number => {
  const payload = unwrapLedgerPayload(value);
  const raw = isRecord(payload)
    ? payload.offset ??
      payload.Offset ??
      (isRecord(payload.ledgerEnd) ? payload.ledgerEnd.offset : null)
    : null;
  const parsed = offsetNumber(raw);
  if (parsed === null) {
    throw new Error("Ledger did not return an offset");
  }
  return parsed;
};
