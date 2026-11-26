import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { POST } from "./route";

const originalFetch = globalThis.fetch;
const originalBaseUrl = process.env.LOOP_DATA_BASE_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBaseUrl === undefined) delete process.env.LOOP_DATA_BASE_URL;
  else process.env.LOOP_DATA_BASE_URL = originalBaseUrl;
});

test("POST /api/purchase/confirmation validates the reviewed transfer", async () => {
  const response = await POST(
    new Request("http://localhost/api/purchase/confirmation", {
      method: "POST",
      body: JSON.stringify({ senderPartyId: "alice::1220" }),
    }),
  );

  assert.equal(response.status, 400);
});

test("POST /api/purchase/confirmation returns a matching Loop Data update", async () => {
  process.env.LOOP_DATA_BASE_URL = "https://data.example";
  const updateId =
    "12201dfe7a8ee46330cd355818379864691f93bab3ca6e3957d410863b0ea8bb147f";
  const transfer = {
    senderPartyId: "alice::1220",
    receiverPartyId: "splice_traffic-manager::1220",
    amount: "12.5",
    memo: "splice/memo:member-id=PAR::member",
    inputHoldingCids: ["00holding"],
    submittedAfter: new Date(Date.now() - 1_000).toISOString(),
  };
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    new Response(
      JSON.stringify(
        String(input).includes("/api/transactions/")
          ? {
              events: {
                [`${updateId}:0`]: {
                  acting_parties: [transfer.senderPartyId],
                  choice: "TransferFactory_Transfer",
                  choice_argument: {
                    transfer: {
                      sender: transfer.senderPartyId,
                      receiver: transfer.receiverPartyId,
                      amount: transfer.amount,
                      inputHoldingCids: transfer.inputHoldingCids,
                      meta: { values: { memo: transfer.memo } },
                    },
                  },
                },
              },
            }
          : {
              transactions: [
                {
                  update_id: updateId,
                  record_time: new Date().toISOString(),
                  choice: "TransferFactory_Transfer",
                },
              ],
            },
      ),
      { status: 200 },
    )) as typeof fetch;

  const response = await POST(
    new Request("http://localhost/api/purchase/confirmation", {
      method: "POST",
      body: JSON.stringify(transfer),
    }),
  );
  const body = (await response.json()) as { ok: boolean; updateId: string };

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.updateId, updateId);
});
