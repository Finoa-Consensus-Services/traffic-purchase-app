import assert from "node:assert/strict";
import test from "node:test";
import {
  TIMEOUT_MESSAGE,
  blockedApprovalUrl,
  matchInFlightTx,
  trackPopupOpen,
  watchTransaction,
  type InFlightTx,
} from "./tx-match";

test("a matching command id wins over any other event", () => {
  const matched = matchInFlightTx("cmd-1", [
    { commandId: "other", status: "executed" },
    { commandId: "cmd-1", status: "executed" },
  ]);
  assert.equal(matched?.commandId, "cmd-1");
});

test("the only executed event counts when its command id does not match", () => {
  const matched = matchInFlightTx("cmd-1", [{ commandId: "wallet-submission", status: "executed" }]);
  assert.equal(matched?.status, "executed");
  assert.equal(matched?.commandId, "wallet-submission");
});

test("two different executed events are not treated as this purchase", () => {
  assert.equal(
    matchInFlightTx("cmd-1", [
      { commandId: "a", status: "executed" },
      { commandId: "b", status: "executed" },
    ]),
    null,
  );
});

test("the listener is attached before the wallet reports the transaction", async () => {
  const listeners = new Set<(event: InFlightTx) => void>();
  const provider = {
    on(_event: "txChanged", listener: (event: InFlightTx) => void) {
      listeners.add(listener);
    },
    removeListener(_event: "txChanged", listener: (event: InFlightTx) => void) {
      listeners.delete(listener);
    },
  };
  const watched = watchTransaction(provider, "cmd-1", 1_000);
  assert.equal(listeners.size, 1);
  for (const listener of listeners) {
    listener({ commandId: "other", status: "executed" });
  }
  const tx = await watched.promise;
  assert.equal(tx.status, "executed");
  assert.equal(listeners.size, 0);
});

test("a blocked popup returns the wallet url", () => {
  assert.equal(blockedApprovalUrl(false, " https://wallet.example/approve "), "https://wallet.example/approve");
  assert.equal(blockedApprovalUrl(true, "https://wallet.example/approve"), undefined);
  assert.equal(blockedApprovalUrl(false, " "), undefined);

  const seen: string[] = [];
  const open = trackPopupOpen(() => null, (url) => seen.push(url));
  const popup = open("", "wallet-popup");
  popup!.location.href = "https://wallet.example/approve?id=1";
  assert.deepEqual(seen, ["https://wallet.example/approve?id=1"]);
});

test("a mismatched failed event is not treated as this purchase", () => {
  assert.equal(
    matchInFlightTx("cmd-1", [{ commandId: "other", status: "failed" }]),
    null,
  );
  assert.equal(
    matchInFlightTx("cmd-1", [{ commandId: "cmd-1", status: "failed" }])?.status,
    "failed",
  );
  assert.equal(
    matchInFlightTx("cmd-1", [{ commandId: "cmd-1", status: "pending" }]),
    null,
  );
});

test("watchTransaction ignores non-terminal events, times out, and cleans up on cancel", async () => {
  const listeners = new Set<(event: InFlightTx) => void>();
  const provider = {
    on(_event: "txChanged", listener: (event: InFlightTx) => void) {
      listeners.add(listener);
    },
    removeListener(_event: "txChanged", listener: (event: InFlightTx) => void) {
      listeners.delete(listener);
    },
  };

  const timedOut = watchTransaction(provider, "cmd-timeout", 15);
  for (const listener of listeners) {
    listener({ commandId: "cmd-timeout", status: "pending" });
  }
  await assert.rejects(() => timedOut.promise, new RegExp(TIMEOUT_MESSAGE));
  assert.equal(listeners.size, 0);

  const cancelled = watchTransaction(provider, "cmd-cancel", 5_000);
  assert.equal(listeners.size, 1);
  cancelled.cancel();
  await assert.rejects(() => cancelled.promise, /Purchase submit stopped/);
  assert.equal(listeners.size, 0);
});
