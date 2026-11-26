import { isLedgerUpdateId } from "@/lib/purchase/ledger-update-id";

type JsonRecord = Record<string, unknown>;

export type LoopDataPurchase = {
  senderPartyId: string;
  receiverPartyId: string;
  amount: string;
  memo: string;
  inputHoldingCids: string[];
  submittedAfter: string;
};

type LoopDataTransactionSummary = {
  update_id?: unknown;
  record_time?: unknown;
  choice?: unknown;
};

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asStringArray = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;

const sameStrings = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const loopDataBaseUrl = (
  env: Record<string, string | undefined> = process.env,
): string => {
  const configured = env.LOOP_DATA_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const networkHint = `${env.APP_NETWORK ?? ""} ${env.SCAN_BASE_URL ?? ""}`.toLowerCase();
  if (networkHint.includes("devnet") || networkHint.includes(".dev.")) {
    return "https://data.devnet.looptech.io";
  }
  if (networkHint.includes("testnet") || networkHint.includes(".test.")) {
    return "https://data.testnet.looptech.io";
  }
  return "https://data.looptech.io";
};

const matchingTransferEvent = (
  details: unknown,
  expected: LoopDataPurchase,
): boolean => {
  if (!isRecord(details) || !isRecord(details.events)) return false;

  return Object.values(details.events).some((event) => {
    if (!isRecord(event) || event.choice !== "TransferFactory_Transfer") return false;

    const actingParties = asStringArray(event.acting_parties);
    if (!actingParties?.includes(expected.senderPartyId)) return false;

    const choiceArgument = isRecord(event.choice_argument) ? event.choice_argument : null;
    const transfer = choiceArgument && isRecord(choiceArgument.transfer)
      ? choiceArgument.transfer
      : null;
    if (!transfer) return false;

    const meta = isRecord(transfer.meta) ? transfer.meta : null;
    const values = meta && isRecord(meta.values) ? meta.values : null;
    const inputHoldingCids = asStringArray(transfer.inputHoldingCids);

    return (
      transfer.sender === expected.senderPartyId &&
      transfer.receiver === expected.receiverPartyId &&
      transfer.amount === expected.amount &&
      values?.memo === expected.memo &&
      inputHoldingCids !== null &&
      sameStrings(inputHoldingCids, expected.inputHoldingCids)
    );
  });
};

export const findLoopDataPurchaseUpdateId = async (
  expected: LoopDataPurchase,
  options?: {
    fetch?: typeof fetch;
    signal?: AbortSignal;
    baseUrl?: string;
  },
): Promise<string | null> => {
  const fetcher = options?.fetch ?? fetch;
  const baseUrl = (options?.baseUrl ?? loopDataBaseUrl()).replace(/\/+$/, "");
  const submittedAfter = Date.parse(expected.submittedAfter);
  if (!Number.isFinite(submittedAfter)) {
    throw new Error("submittedAfter must be an ISO timestamp.");
  }

  const listUrl =
    `${baseUrl}/api/parties/${encodeURIComponent(expected.senderPartyId)}/tx?limit=20`;
  const listResponse = await fetcher(listUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: options?.signal,
  });
  if (!listResponse.ok) {
    throw new Error(`Loop Data returned ${listResponse.status} for party transactions.`);
  }
  const list = (await listResponse.json()) as unknown;
  const transactions =
    isRecord(list) && Array.isArray(list.transactions)
      ? (list.transactions as LoopDataTransactionSummary[])
      : [];

  const candidates = transactions.filter((transaction) => {
    const updateId = asString(transaction.update_id);
    const recordTime = asString(transaction.record_time);
    return (
      updateId !== null &&
      isLedgerUpdateId(updateId) &&
      recordTime !== null &&
      Date.parse(recordTime) >= submittedAfter &&
      transaction.choice === "TransferFactory_Transfer"
    );
  });

  for (const candidate of candidates.slice(0, 5)) {
    const updateId = candidate.update_id as string;
    const detailResponse = await fetcher(
      `${baseUrl}/api/transactions/${encodeURIComponent(updateId)}`,
      {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: options?.signal,
      },
    );
    if (!detailResponse.ok) continue;

    const details = (await detailResponse.json()) as unknown;
    if (matchingTransferEvent(details, expected)) return updateId;
  }

  return null;
};
