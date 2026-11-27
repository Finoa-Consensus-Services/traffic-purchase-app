import type { LedgerApiParams } from "@canton-network/dapp-sdk";
import { ledgerOffset, unwrapLedgerPayload } from "@/lib/dapp/ledger-response";
import { readCoin } from "@/lib/coin";

export type LedgerApiFn = (
  params: LedgerApiParams,
) => Promise<Record<string, unknown>>;

export type AmuletHolding = {
  contractId: string;
  amountCc: number;
};

/** Token-standard holding interface (same as wallet SDK listHoldingUtxos). */
export const HOLDING_INTERFACE_ID =
  "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";

export const HOLDING_INTERFACE_ID_V2 =
  "#splice-api-token-holding-v2:Splice.Api.Token.HoldingV2:Holding";

const AMULET_TEMPLATE_IDS = [
  "#splice-amulet:Splice.Amulet:Amulet",
  "Splice.Amulet:Amulet",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function templateIdString(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (!isRecord(raw)) {
    return "";
  }
  if (typeof raw.templateId === "string") {
    return raw.templateId;
  }
  const moduleName = raw.moduleName;
  const entityName = raw.entityName;
  const packageId = raw.packageId;
  if (typeof moduleName === "string" && typeof entityName === "string") {
    if (typeof packageId === "string" && packageId.length > 0) {
      return `#${packageId}:${moduleName}:${entityName}`;
    }
    return `${moduleName}:${entityName}`;
  }
  return "";
}

function pickCreatePayloadFromEvent(ce: Record<string, unknown>): Record<string, unknown> {
  const candidates = [
    ce.createArgument,
    ce.create_argument,
    ce.createArguments,
    ce.create_arguments,
    ce.payload,
  ];
  for (const candidate of candidates) {
    if (
      isRecord(candidate) &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).length > 0
    ) {
      return candidate;
    }
  }
  const fallback = candidates.find((c) => isRecord(c));
  return fallback ?? {};
}

function createdEventFromAcsRow(row: unknown): Record<string, unknown> | null {
  if (!isRecord(row)) {
    return null;
  }
  const entry = row.contractEntry;
  if (isRecord(entry) && isRecord(entry.JsActiveContract)) {
    const created = entry.JsActiveContract.createdEvent;
    if (isRecord(created)) {
      return created;
    }
  }
  if (isRecord(row.createdEvent)) {
    return row.createdEvent;
  }
  if (isRecord(row.created_event)) {
    return row.created_event;
  }
  return null;
}

function holdingViewFromCreatedEvent(
  createdEvent: Record<string, unknown>,
): Record<string, unknown> | null {
  const views = createdEvent.interfaceViews ?? createdEvent.interface_views;
  if (!Array.isArray(views)) {
    return null;
  }
  for (const view of views) {
    if (!isRecord(view)) {
      continue;
    }
    const interfaceId = templateIdString(view.interfaceId ?? view.interface_id);
    if (!interfaceId.includes("Holding")) {
      continue;
    }
    const viewValue = view.viewValue ?? view.view_value;
    if (isRecord(viewValue)) {
      return viewValue;
    }
  }
  return null;
}

function isUnlockedHolding(viewValue: Record<string, unknown>, now = new Date()): boolean {
  const lock = viewValue.lock;
  if (lock == null) {
    return true;
  }
  if (!isRecord(lock)) {
    return false;
  }
  const expiresAt = lock.expiresAt ?? lock.expires_at;
  if (typeof expiresAt !== "string" || !expiresAt.trim()) {
    return false;
  }
  const expires = new Date(expiresAt);
  return Number.isFinite(expires.getTime()) && expires <= now;
}

function amuletInstrumentId(viewValue: Record<string, unknown>): string | null {
  const instrument = viewValue.instrumentId ?? viewValue.instrument_id;
  if (!isRecord(instrument)) {
    return null;
  }
  const id = instrument.id;
  return typeof id === "string" ? id : null;
}

export function amuletAmountFromContract(entry: unknown): number {
  const createdEvent = createdEventFromAcsRow(entry) ?? (isRecord(entry) ? entry : null);
  if (!createdEvent) {
    return 0;
  }
  const holdingView = holdingViewFromCreatedEvent(createdEvent);
  if (holdingView && amuletInstrumentId(holdingView) === "Amulet") {
    return readCoin(holdingView.amount);
  }
  const payload = pickCreatePayloadFromEvent(createdEvent);
  const amount = payload.amount;
  if (isRecord(amount) && "initialAmount" in amount) {
    return readCoin(amount.initialAmount);
  }
  return readCoin(amount);
}

function flattenAcsRows(body: unknown): unknown[] {
  const payload = unwrapLedgerPayload(body);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!isRecord(payload)) {
    return [];
  }
  for (const key of ["activeContracts", "active_contracts", "active_contract"]) {
    const rows = payload[key];
    if (Array.isArray(rows)) {
      return rows;
    }
  }
  return [];
}

function parseSpendableAmuletRow(row: unknown): AmuletHolding | null {
  const createdEvent = createdEventFromAcsRow(row);
  if (!createdEvent) {
    return null;
  }
  const contractId =
    typeof createdEvent.contractId === "string"
      ? createdEvent.contractId
      : typeof createdEvent.contract_id === "string"
        ? createdEvent.contract_id
        : null;
  if (!contractId) {
    return null;
  }

  const holdingView = holdingViewFromCreatedEvent(createdEvent);
  if (holdingView) {
    if (amuletInstrumentId(holdingView) !== "Amulet") {
      return null;
    }
    if (!isUnlockedHolding(holdingView)) {
      return null;
    }
    const amountCc = readCoin(holdingView.amount);
    return amountCc > 0 ? { contractId, amountCc } : null;
  }

  const templateId = templateIdString(createdEvent.templateId ?? createdEvent.template_id);
  const isLegacyAmulet =
    templateId.includes("Splice.Amulet:Amulet") || templateId.includes("splice-amulet");
  if (!isLegacyAmulet) {
    return null;
  }
  const amountCc = amuletAmountFromContract(row);
  return amountCc > 0 ? { contractId, amountCc } : null;
}

async function ledgerEndOffset(ledgerApi: LedgerApiFn): Promise<number> {
  return ledgerOffset(
    await ledgerApi({
      requestMethod: "get",
      resource: "/v2/state/ledger-end",
    }),
  );
}

function interfaceFilterCumulative(interfaceId: string): Record<string, unknown>[] {
  return [
    {
      identifierFilter: {
        InterfaceFilter: {
          value: {
            interfaceId,
            includeInterfaceView: true,
            includeCreatedEventBlob: false,
          },
        },
      },
    },
  ];
}

function templateFilterCumulative(templateId: string): Record<string, unknown>[] {
  return [
    {
      identifierFilter: {
        TemplateFilter: {
          value: {
            templateId,
            includeCreatedEventBlob: false,
          },
        },
      },
    },
  ];
}

function buildAmuletTemplateOnlyBodies(
  partyId: string,
  activeAtOffset: number,
): Record<string, unknown>[] {
  return AMULET_TEMPLATE_IDS.map((templateId) => ({
    filter: {
      filtersByParty: {
        [partyId]: {
          cumulative: templateFilterCumulative(templateId),
        },
      },
    },
    verbose: true,
    activeAtOffset,
  }));
}

/** ACS request bodies for the ledger client. */
function buildActiveContractsBodies(
  partyId: string,
  activeAtOffset: number,
): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];

  bodies.push({
    filter: {
      filtersByParty: {
        [partyId]: {
          cumulative: interfaceFilterCumulative(HOLDING_INTERFACE_ID),
        },
      },
    },
    verbose: true,
    activeAtOffset,
  });

  bodies.push({
    eventFormat: {
      filtersByParty: {
        [partyId]: {
          cumulative: interfaceFilterCumulative(HOLDING_INTERFACE_ID),
        },
      },
      verbose: true,
    },
    activeAtOffset,
  });

  bodies.push({
    filter: {
      filtersByParty: {
        [partyId]: {
          cumulative: interfaceFilterCumulative(HOLDING_INTERFACE_ID_V2),
        },
      },
    },
    verbose: true,
    activeAtOffset,
  });

  bodies.push({
    eventFormat: {
      filtersByParty: {
        [partyId]: {
          cumulative: interfaceFilterCumulative(HOLDING_INTERFACE_ID_V2),
        },
      },
      verbose: true,
    },
    activeAtOffset,
  });

  for (const templateId of AMULET_TEMPLATE_IDS) {
    bodies.push({
      filter: {
        filtersByParty: {
          [partyId]: {
            cumulative: templateFilterCumulative(templateId),
          },
        },
      },
      verbose: true,
      activeAtOffset,
    });
  }

  return bodies;
}

async function listAmuletHoldingsFromBodies(
  ledgerApi: LedgerApiFn,
  bodies: Record<string, unknown>[],
): Promise<AmuletHolding[]> {
  for (const body of bodies) {
    let response: unknown;
    try {
      response = await ledgerApi({
        requestMethod: "post",
        resource: "/v2/state/active-contracts",
        body: body as Record<string, unknown>,
      });
    } catch {
      continue;
    }
    const byCid = new Map<string, AmuletHolding>();
    for (const row of flattenAcsRows(response)) {
      const parsed = parseSpendableAmuletRow(row);
      if (parsed) {
        byCid.set(parsed.contractId, parsed);
      }
    }
    if (byCid.size > 0) {
      return [...byCid.values()].sort((a, b) => b.amountCc - a.amountCc);
    }
  }

  return [];
}

/** Unlocked Amulet holdings for a party (Canton Coin UTXOs). */
export async function listAmuletHoldings(
  ledgerApi: LedgerApiFn,
  partyId: string,
): Promise<AmuletHolding[]> {
  const activeAtOffset = await ledgerEndOffset(ledgerApi);
  return listAmuletHoldingsFromBodies(
    ledgerApi,
    buildActiveContractsBodies(partyId, activeAtOffset),
  );
}

/** Legacy path reads Splice.Amulet contracts, not Holding rows. */
export async function listLegacyInputAmuletHoldings(
  ledgerApi: LedgerApiFn,
  partyId: string,
): Promise<AmuletHolding[]> {
  const activeAtOffset = await ledgerEndOffset(ledgerApi);
  const fromTemplates = await listAmuletHoldingsFromBodies(
    ledgerApi,
    buildAmuletTemplateOnlyBodies(partyId, activeAtOffset),
  );
  if (fromTemplates.length > 0) {
    return fromTemplates;
  }
  return listAmuletHoldings(ledgerApi, partyId);
}

export function totalAmuletBalanceCc(holdings: AmuletHolding[]): number {
  let total = 0;
  for (const row of holdings) {
    total += row.amountCc;
  }
  return total;
}

export async function fetchAmuletBalanceCc(
  ledgerApi: LedgerApiFn,
  partyId: string,
): Promise<{ totalCc: number; holdings: AmuletHolding[] }> {
  const holdings = await listAmuletHoldings(ledgerApi, partyId);
  return { totalCc: totalAmuletBalanceCc(holdings), holdings };
}

function selectCidsFromHoldings(
  amulets: AmuletHolding[],
  minCc: number,
): string[] {
  const selected: string[] = [];
  let total = 0;
  for (const row of amulets) {
    selected.push(row.contractId);
    total += row.amountCc;
    if (total >= minCc) {
      return selected;
    }
  }
  if (selected.length === 0) {
    throw new Error("No unlocked Canton Coin holdings found for this party.");
  }
  throw new Error(
    `Holdings cover ${total.toFixed(4)} CC but the quote needs about ${minCc.toFixed(4)} CC.`,
  );
}

export async function selectInputAmuletCids(
  ledgerApi: LedgerApiFn,
  partyId: string,
  minCc: number,
): Promise<string[]> {
  const amulets = await listAmuletHoldings(ledgerApi, partyId);
  return selectCidsFromHoldings(amulets, minCc);
}

export async function selectLegacyInputAmuletCids(
  ledgerApi: LedgerApiFn,
  partyId: string,
  minCc: number,
): Promise<string[]> {
  const amulets = await listLegacyInputAmuletHoldings(ledgerApi, partyId);
  return selectCidsFromHoldings(amulets, minCc);
}

/** Reject before wallet submit when a selected input was spent or archived. */
export async function assertInputAmuletCidsActive(
  ledgerApi: LedgerApiFn,
  partyId: string,
  inputCids: string[],
): Promise<void> {
  if (inputCids.length === 0) {
    return;
  }
  const activeIds = new Set(
    (await listLegacyInputAmuletHoldings(ledgerApi, partyId)).map(
      (row) => row.contractId,
    ),
  );
  const missing = inputCids.filter((cid) => !activeIds.has(cid));
  if (missing.length > 0) {
    throw new Error(
      `Selected Canton Coin input is no longer active (${missing[0].slice(0, 16)}…). ` +
        "Refresh the page and submit again immediately.",
    );
  }
}

export function formatInsufficientAmuletBalance(
  totalCc: number,
  requiredCc: number,
): string {
  return `Insufficient Canton Coin: wallet holds ${totalCc.toFixed(4)} CC but this purchase needs about ${requiredCc.toFixed(4)} CC.`;
}
