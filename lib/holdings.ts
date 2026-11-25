/** Scan holdings summary parsing (server-side Scan routes / tests; not wallet balance). */

import { readCoin } from "@/lib/coin";

export type CantonBalance = {
  partyId: string;
  unlocked: number;
  locked: number;
  available: number;
  total: number;
  asOfRound: string | null;
  recordTime: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export { readCoin } from "@/lib/coin";

export function parseHoldingsSummary(
  payload: unknown,
  partyId: string,
): CantonBalance {
  if (!isRecord(payload)) {
    throw new Error("Holdings summary was not an object");
  }
  const summaries = Array.isArray(payload.summaries) ? payload.summaries : [];
  const match =
    summaries.find(
      (entry) => isRecord(entry) && entry.party_id === partyId,
    ) ?? summaries[0];
  const row = isRecord(match) ? match : {};
  const unlocked = readCoin(row.total_unlocked_coin);
  const locked = readCoin(row.total_locked_coin);
  const total = readCoin(row.total_coin_holdings);
  const available = readCoin(row.total_available_coin) || unlocked;
  const asOfRound =
    typeof payload.computed_as_of_round === "number"
      ? String(payload.computed_as_of_round)
      : typeof payload.computed_as_of_round === "string"
        ? payload.computed_as_of_round
        : null;
  const recordTime =
    typeof payload.record_time === "string" ? payload.record_time : null;
  return {
    partyId:
      typeof row.party_id === "string" && row.party_id.length > 0
        ? row.party_id
        : partyId,
    unlocked,
    locked,
    available,
    total,
    asOfRound,
    recordTime,
  };
}
