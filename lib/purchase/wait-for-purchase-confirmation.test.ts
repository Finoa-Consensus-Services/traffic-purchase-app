import assert from "node:assert/strict";
import test from "node:test";
import {
  purchaseConfirmationFromPrepare,
  waitForPurchaseConfirmation,
  type PurchaseConfirmationRequest,
} from "@/lib/purchase/wait-for-purchase-confirmation";

const expected: PurchaseConfirmationRequest = {
  senderPartyId: "alice::1220",
  receiverPartyId: "splice_traffic-manager::1220",
  amount: "12.5",
  memo: "splice/memo:member-id=PAR::member",
  inputHoldingCids: ["00holding"],
  submittedAfter: "2026-11-26T16:57:00.000Z",
};

test("purchaseConfirmationFromPrepare reads the submitted transfer", () => {
  assert.deepEqual(
    purchaseConfirmationFromPrepare(
      {
        commands: [
          {
            ExerciseCommand: {
              choice: "TransferFactory_Transfer",
              choiceArgument: {
                transfer: {
                  sender: expected.senderPartyId,
                  receiver: expected.receiverPartyId,
                  amount: expected.amount,
                  inputHoldingCids: expected.inputHoldingCids,
                  meta: { values: { memo: expected.memo } },
                },
              },
            },
          },
        ],
      },
      expected.submittedAfter,
    ),
    expected,
  );
  assert.equal(purchaseConfirmationFromPrepare({ commands: [] }, expected.submittedAfter), null);
});

test("waitForPurchaseConfirmation returns a confirmed ledger update", async () => {
  const updateId =
    "12201dfe7a8ee46330cd355818379864691f93bab3ca6e3957d410863b0ea8bb147f";
  const controller = new AbortController();
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), expected);
    return new Response(JSON.stringify({ ok: true, updateId }), { status: 200 });
  }) as typeof fetch;

  assert.equal(
    await waitForPurchaseConfirmation(expected, {
      fetch: fetcher,
      signal: controller.signal,
    }),
    updateId,
  );
});
