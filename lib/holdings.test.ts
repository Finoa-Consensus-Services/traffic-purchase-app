import assert from "node:assert/strict";
import test from "node:test";
import { parseHoldingsSummary } from "./holdings";

test("parseHoldingsSummary prefers available unlocked coin", () => {
  const balance = parseHoldingsSummary(
    {
      record_time: "2026-09-29T12:00:00Z",
      computed_as_of_round: 116375,
      summaries: [
        {
          party_id: "Alice::1220",
          total_unlocked_coin: "10.5",
          total_locked_coin: "1.5",
          total_coin_holdings: "12",
          total_available_coin: "10.4",
        },
      ],
    },
    "Alice::1220",
  );
  assert.equal(balance.available, 10.4);
  assert.equal(balance.unlocked, 10.5);
  assert.equal(balance.locked, 1.5);
  assert.equal(balance.asOfRound, "116375");
});

test("parseHoldingsSummary is zero when Scan returns no rows", () => {
  const balance = parseHoldingsSummary({ summaries: [] }, "Bob::1220");
  assert.equal(balance.partyId, "Bob::1220");
  assert.equal(balance.available, 0);
  assert.equal(balance.total, 0);
});
