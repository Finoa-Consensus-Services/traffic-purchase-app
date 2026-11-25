export type TrafficFees = {
  extraTrafficPriceUsdPerMb: number;
  minTopupBytes: number;
  baseRateBurstBytes: number | null;
  activeSynchronizer: string | null;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function readFees(config: unknown): TrafficFees {
  if (!isRecord(config)) {
    throw new Error("Amulet config was not an object");
  }
  const synchronizer = config.decentralizedSynchronizer;
  if (!isRecord(synchronizer) || !isRecord(synchronizer.fees)) {
    throw new Error("Amulet config has no decentralised synchronizer fees");
  }
  const fees = synchronizer.fees;
  const price =
    readNumber(fees.extraTrafficPrice) ?? readNumber(fees.trafficPrice);
  const minimum = readNumber(fees.minTopupAmount);
  if (price === null || price <= 0 || minimum === null) {
    throw new Error("Traffic price or minimum top-up was missing");
  }
  const limits = isRecord(fees.baseRateTrafficLimits)
    ? fees.baseRateTrafficLimits
    : null;
  return {
    extraTrafficPriceUsdPerMb: price,
    minTopupBytes: minimum,
    baseRateBurstBytes: limits ? readNumber(limits.burstAmount) : null,
    activeSynchronizer: readString(synchronizer.activeSynchronizer),
  };
}

type ScheduledConfig = {
  timeMs: number;
  config: unknown;
};

function readScheduleEntry(entry: unknown): ScheduledConfig | null {
  if (Array.isArray(entry) && entry.length >= 2) {
    return readPair(entry[0], entry[1]);
  }
  if (!isRecord(entry)) {
    return null;
  }
  if ("time" in entry && "value" in entry) {
    return readPair(entry.time, entry.value);
  }
  if ("_1" in entry && "_2" in entry) {
    return readPair(entry._1, entry._2);
  }
  return null;
}

function readPair(time: unknown, config: unknown): ScheduledConfig | null {
  const timeText = readString(time);
  if (!timeText) {
    return null;
  }
  const timeMs = Date.parse(timeText);
  if (Number.isNaN(timeMs)) {
    return null;
  }
  return { timeMs, config };
}

export function selectAmuletConfig(payload: unknown, now: Date): unknown {
  if (!isRecord(payload) || !isRecord(payload.configSchedule)) {
    throw new Error("AmuletRules payload has no config schedule");
  }
  const schedule = payload.configSchedule;
  const nowMs = now.getTime();
  const futureValues = Array.isArray(schedule.futureValues)
    ? schedule.futureValues
    : [];
  let selected = schedule.initialValue;
  let selectedTime = Number.NEGATIVE_INFINITY;
  for (const entry of futureValues) {
    const scheduled = readScheduleEntry(entry);
    if (!scheduled || scheduled.timeMs > nowMs || scheduled.timeMs < selectedTime) {
      continue;
    }
    selected = scheduled.config;
    selectedTime = scheduled.timeMs;
  }
  if (selected === undefined) {
    throw new Error("AmuletRules config schedule was empty");
  }
  return selected;
}

export function contractPayload(update: unknown): JsonRecord {
  if (!isRecord(update)) {
    throw new Error("Scan contract update was empty");
  }
  const contract = isRecord(update.contract) ? update.contract : update;
  if (!isRecord(contract.payload)) {
    throw new Error("Scan contract has no payload");
  }
  return contract.payload;
}

function readTickDurationMicros(value: unknown): number | null {
  if (isRecord(value)) {
    return readTickDurationMicros(value.microseconds);
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function readRound(update: unknown): {
  round: string;
  amuletPriceUsd: number;
  opensAt: string | null;
  targetClosesAt: string | null;
  tickDurationMicros: number | null;
} {
  const payload = contractPayload(update);
  const price = readNumber(payload.amuletPrice);
  if (price === null || price <= 0) {
    throw new Error("Open mining round has no amulet price");
  }
  const roundField = payload.round;
  const round = isRecord(roundField)
    ? readString(roundField.number) ?? JSON.stringify(roundField)
    : readString(roundField) ??
      (typeof roundField === "number" ? String(roundField) : "unknown");
  return {
    round,
    amuletPriceUsd: price,
    opensAt: readString(payload.opensAt),
    targetClosesAt: readString(payload.targetClosesAt),
    tickDurationMicros: readTickDurationMicros(payload.tickDuration),
  };
}

function hasContract(entry: unknown): boolean {
  return isRecord(entry) && isRecord(entry.contract);
}

function openRoundEntries(openMiningRounds: unknown): unknown[] {
  if (Array.isArray(openMiningRounds)) {
    return openMiningRounds.filter(hasContract);
  }
  if (!isRecord(openMiningRounds)) {
    throw new Error("Scan returned no open mining rounds");
  }
  return Object.values(openMiningRounds).filter(hasContract);
}

function roundNumberFromEntry(entry: unknown): number {
  if (!isRecord(entry)) {
    return -1;
  }
  const contract = isRecord(entry.contract) ? entry.contract : entry;
  const meta = readRound(contract);
  const parsed = Number(meta.round);
  return Number.isFinite(parsed) ? parsed : -1;
}

function isRoundOpenAt(entry: unknown, now: Date): boolean {
  if (!isRecord(entry)) {
    return false;
  }
  const contract = isRecord(entry.contract) ? entry.contract : entry;
  const { opensAt, targetClosesAt } = readRound(contract);
  if (opensAt) {
    const opens = new Date(opensAt);
    if (Number.isFinite(opens.getTime()) && now < opens) {
      return false;
    }
  }
  if (targetClosesAt) {
    const closes = new Date(targetClosesAt);
    if (Number.isFinite(closes.getTime()) && now >= closes) {
      return false;
    }
  }
  return true;
}

/** Latest open round. A closed wrapper fails submit. */
function entrySynchronizerId(entry: unknown): string | null {
  const top = contractDomainId(entry);
  if (top) {
    return top;
  }
  if (!isRecord(entry) || !isRecord(entry.contract)) {
    return null;
  }
  return contractDomainId(entry.contract);
}

export function selectOpenMiningRoundForPurchase(
  openMiningRounds: unknown,
  now = new Date(),
  synchronizerId?: string,
): unknown {
  const entries = openRoundEntries(openMiningRounds);
  if (entries.length === 0) {
    throw new Error("Scan returned no open mining round contract");
  }
  const openNow = entries.filter((entry) => isRoundOpenAt(entry, now));
  let candidates = openNow.length > 0 ? openNow : entries;
  const requested = synchronizerId?.trim() ?? "";
  if (requested) {
    const onSynchronizer = candidates.filter(
      (entry) => entrySynchronizerId(entry) === requested,
    );
    const knownDomains = candidates.some((entry) => entrySynchronizerId(entry));
    if (knownDomains && onSynchronizer.length === 0) {
      throw new Error(
        `Scan returned no open mining round on synchronizer ${requested}`,
      );
    }
    if (onSynchronizer.length > 0) {
      candidates = onSynchronizer;
    }
  }
  return candidates.reduce((best, entry) =>
    roundNumberFromEntry(entry) >= roundNumberFromEntry(best) ? entry : best,
  );
}

export function firstOpenRound(openMiningRounds: unknown): unknown {
  return selectOpenMiningRoundForPurchase(openMiningRounds);
}

/** Amulet prices of rounds open at `now`, oldest round first. */
export function listOpenAmuletPrices(openMiningRounds: unknown, now = new Date()): number[] {
  let entries: unknown[];
  try {
    entries = openRoundEntries(openMiningRounds);
  } catch {
    return [];
  }
  const openNow = entries.filter((entry) => isRoundOpenAt(entry, now));
  const candidates = openNow.length > 0 ? openNow : entries;
  return candidates
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const contract = isRecord(entry.contract) ? entry.contract : entry;
      try {
        return [{ round: roundNumberFromEntry(entry), price: readRound(contract).amuletPriceUsd }];
      } catch {
        return [];
      }
    })
    .filter((row) => row.price > 0)
    .sort((left, right) => left.round - right.round)
    .map((row) => row.price);
}

export function contractDomainId(contract: unknown): string | null {
  return isRecord(contract) && typeof contract.domain_id === "string"
    ? contract.domain_id
    : null;
}
