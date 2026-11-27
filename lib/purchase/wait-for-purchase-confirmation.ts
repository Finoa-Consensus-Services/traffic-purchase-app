import { isLedgerUpdateId } from "@/lib/purchase/ledger-update-id";

export type PurchaseConfirmationRequest = {
  senderPartyId: string;
  receiverPartyId: string;
  amount: string;
  memo: string;
  inputHoldingCids: string[];
  submittedAfter: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Read the Token Standard transfer from the command the wallet actually receives. */
export const purchaseConfirmationFromPrepare = (
  params: { commands?: unknown },
  submittedAfter: string,
): PurchaseConfirmationRequest | null => {
  if (!Array.isArray(params.commands)) return null;

  for (const command of params.commands) {
    if (!isRecord(command) || !isRecord(command.ExerciseCommand)) continue;
    const exercise = command.ExerciseCommand;
    if (exercise.choice !== "TransferFactory_Transfer" || !isRecord(exercise.choiceArgument)) {
      continue;
    }
    const transfer = isRecord(exercise.choiceArgument.transfer)
      ? exercise.choiceArgument.transfer
      : null;
    const meta = transfer && isRecord(transfer.meta) ? transfer.meta : null;
    const values = meta && isRecord(meta.values) ? meta.values : null;
    const memo = typeof values?.memo === "string" ? values.memo : "";
    const amount = typeof transfer?.amount === "string" ? transfer.amount : "";
    const senderPartyId = typeof transfer?.sender === "string" ? transfer.sender : "";
    const receiverPartyId = typeof transfer?.receiver === "string" ? transfer.receiver : "";
    const inputHoldingCids = Array.isArray(transfer?.inputHoldingCids)
      ? transfer.inputHoldingCids.filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )
      : [];
    if (
      !senderPartyId ||
      !receiverPartyId ||
      !amount ||
      !memo.startsWith("splice/memo:") ||
      inputHoldingCids.length === 0
    ) {
      continue;
    }
    return {
      senderPartyId,
      receiverPartyId,
      amount,
      memo,
      inputHoldingCids,
      submittedAfter,
    };
  }

  return null;
};

const waitForNextAttempt = (
  delayMs: number,
  signal: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", handleAbort, { once: true });
  });

/**
 * Confirms a Token Standard purchase when PartyLayer and the wallet callback
 * do not report the ledger update. The first lookup waits so those responses
 * stay the primary result.
 */
/** Give PartyLayer and the wallet time to report the update before asking Loop Data. */
export const PURCHASE_CONFIRMATION_FALLBACK_DELAY_MS = 8_000;

export const waitForPurchaseConfirmation = async (
  expected: PurchaseConfirmationRequest,
  options: {
    signal: AbortSignal;
    delayMs?: number;
    initialDelayMs?: number;
    fetch?: typeof fetch;
  },
): Promise<string> => {
  const fetcher = options.fetch ?? fetch;
  const delayMs = options.delayMs ?? 1_500;
  if (options.initialDelayMs && options.initialDelayMs > 0) {
    await waitForNextAttempt(options.initialDelayMs, options.signal);
  }

  while (!options.signal.aborted) {
    try {
      const response = await fetcher("/api/purchase/confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(expected),
        cache: "no-store",
        signal: options.signal,
      });
      if (response.ok) {
        const body = (await response.json()) as { updateId?: unknown };
        if (typeof body.updateId === "string" && isLedgerUpdateId(body.updateId)) {
          return body.updateId;
        }
      }
    } catch (error) {
      if (options.signal.aborted) throw error;
    }

    await waitForNextAttempt(delayMs, options.signal);
  }

  throw options.signal.reason ?? new DOMException("Aborted", "AbortError");
};
