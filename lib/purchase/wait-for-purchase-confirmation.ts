import { isLedgerUpdateId } from "@/lib/purchase/ledger-update-id";

export type PurchaseConfirmationRequest = {
  senderPartyId: string;
  receiverPartyId: string;
  amount: string;
  memo: string;
  inputHoldingCids: string[];
  submittedAfter: string;
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
 * Confirms a Token Standard purchase independently from the wallet callback.
 * The server accepts only a newer Loop Data transaction matching every reviewed
 * transfer field, including the consumed input contracts.
 */
export const waitForPurchaseConfirmation = async (
  expected: PurchaseConfirmationRequest,
  options: {
    signal: AbortSignal;
    delayMs?: number;
    fetch?: typeof fetch;
  },
): Promise<string> => {
  const fetcher = options.fetch ?? fetch;
  const delayMs = options.delayMs ?? 1_500;

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
