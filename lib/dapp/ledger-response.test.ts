import assert from "node:assert/strict";
import test from "node:test";
import { ledgerOffset, unwrapLedgerPayload } from "@/lib/dapp/ledger-response";

test("ledger offset reads a direct CIP-0103 ledger-end object", () => {
  assert.equal(ledgerOffset({ offset: 42 }), 42);
  assert.equal(ledgerOffset({ Offset: "34" }), 34);
  assert.equal(ledgerOffset({ ledgerEnd: { offset: "56" } }), 56);
});

test("ledger offset reads PartyLayer's JSON response envelope", () => {
  assert.equal(ledgerOffset({ response: '{"offset":"81"}' }), 81);
  assert.equal(ledgerOffset({ response: { offset: { absolute: "9" } } }), 9);
});

test("active-contract rows unwrap from a PartyLayer response string", () => {
  const rows = [{ contractId: "cid-1" }];
  assert.deepEqual(unwrapLedgerPayload({ response: JSON.stringify(rows) }), rows);
});

test("a ledger response without an offset still fails", () => {
  assert.throws(() => ledgerOffset({ response: "{}" }), /offset/);
});
