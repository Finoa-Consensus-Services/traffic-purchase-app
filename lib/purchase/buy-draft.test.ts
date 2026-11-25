import assert from "node:assert/strict";
import test from "node:test";
import {
  BUY_DRAFT_KEY,
  buyDraftStep,
  readBuyDraft,
  writeBuyDraft,
  type BuyDraft,
} from "./buy-draft";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const draft: BuyDraft = {
  step: "review",
  domainId: "global-domain::1",
  lookupQuery: "PAR::validator",
  members: [
    {
      memberId: "PAR::validator",
      totalConsumed: 0,
      totalLimit: 1,
      totalPurchased: 0,
      availableBytes: 1,
    },
  ],
  selectedMemberId: "PAR::validator",
  mode: "bytes",
  rawAmount: "1,000,000",
  requestedBytes: 1_000_000,
};

test("a buy draft round-trips through storage", () => {
  const storage = memoryStorage();
  writeBuyDraft(draft, storage);
  assert.deepEqual(readBuyDraft(storage), draft);
  assert.equal(storage.getItem(BUY_DRAFT_KEY)?.includes("review"), true);
});

test("an in-flight purchase reloads on review", () => {
  const storage = memoryStorage();
  writeBuyDraft({ ...draft, step: "processing" as BuyDraft["step"] }, storage);
  assert.equal(readBuyDraft(storage)?.step, "review");
  assert.equal(buyDraftStep("processing"), "review");
  assert.equal(buyDraftStep("complete"), "complete");
});

test("a broken draft is ignored", () => {
  const storage = memoryStorage();
  storage.setItem(BUY_DRAFT_KEY, "{");
  assert.equal(readBuyDraft(storage), null);
  storage.setItem(BUY_DRAFT_KEY, JSON.stringify({ step: "quote" }));
  assert.equal(readBuyDraft(storage), null);
  assert.equal(readBuyDraft(null), null);
});
