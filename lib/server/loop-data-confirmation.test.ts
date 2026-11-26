import assert from "node:assert/strict";
import test from "node:test";
import {
  findLoopDataPurchaseUpdateId,
  loopDataBaseUrl,
  type LoopDataPurchase,
} from "@/lib/server/loop-data-confirmation";

const updateId =
  "12201dfe7a8ee46330cd355818379864691f93bab3ca6e3957d410863b0ea8bb147f";

const expected: LoopDataPurchase = {
  senderPartyId: "lunar::1220sender",
  receiverPartyId: "splice_traffic-manager::1220receiver",
  amount: "158.4200242911",
  memo: "splice/memo:member-id=PAR::FCS-3::1220member&synchronizer-id=global-domain::1220",
  inputHoldingCids: ["00holding"],
  submittedAfter: "2026-11-26T16:57:00.000Z",
};

const listResponse = {
  transactions: [
    {
      update_id: updateId,
      record_time: "2026-11-26T16:57:59.000Z",
      choice: "TransferFactory_Transfer",
    },
  ],
};

const details = {
  events: {
    [`${updateId}:0`]: {
      acting_parties: [expected.senderPartyId],
      choice: "TransferFactory_Transfer",
      choice_argument: {
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
};

test("Loop Data confirmation returns only an exact reviewed transfer", async () => {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return new Response(
      JSON.stringify(url.includes("/api/transactions/") ? details : listResponse),
      { status: 200 },
    );
  }) as typeof fetch;

  const found = await findLoopDataPurchaseUpdateId(expected, {
    baseUrl: "https://data.example",
    fetch: fetcher,
  });

  assert.equal(found, updateId);
  assert.equal(calls.length, 2);
});

test("Loop Data confirmation rejects a transaction with different inputs", async () => {
  const fetcher = (async (input: RequestInfo | URL) =>
    new Response(
      JSON.stringify(
        String(input).includes("/api/transactions/")
          ? {
              events: {
                [`${updateId}:0`]: {
                  ...details.events[`${updateId}:0`],
                  choice_argument: {
                    transfer: {
                      ...details.events[`${updateId}:0`].choice_argument.transfer,
                      inputHoldingCids: ["00different"],
                    },
                  },
                },
              },
            }
          : listResponse,
      ),
      { status: 200 },
    )) as typeof fetch;

  assert.equal(
    await findLoopDataPurchaseUpdateId(expected, {
      baseUrl: "https://data.example",
      fetch: fetcher,
    }),
    null,
  );
});

test("Loop Data base URL follows the configured network", () => {
  assert.equal(
    loopDataBaseUrl({ APP_NETWORK: "devnet" }),
    "https://data.devnet.looptech.io",
  );
  assert.equal(
    loopDataBaseUrl({ LOOP_DATA_BASE_URL: "https://data.internal/" }),
    "https://data.internal",
  );
});
