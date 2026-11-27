import assert from "node:assert/strict";
import test from "node:test";
import {
  updateIdFromPartyLayerReceipt,
  updateIdFromPartyLayerStatus,
} from "@/lib/dapp/party-layer-receipt";

const updateId =
  "1220fecae432eb780ec8a0c4d9831b72f70906faa4f6c07b57ce3508c4e800be5def";

test("PartyLayer receipt update id is accepted when the status is only submitted", () => {
  assert.equal(
    updateIdFromPartyLayerStatus({
      status: "submitted",
      txId: "not-a-ledger-id",
      raw: { updateId, commandId: "cmd-1" },
    }),
    updateId,
  );
});

test("Vala result nested under tx.payload is a PartyLayer ledger update", () => {
  assert.equal(
    updateIdFromPartyLayerReceipt({
      tx: { commandId: "cmd-1", payload: { updateId } },
    }),
    updateId,
  );
});

test("a rejected PartyLayer status does not confirm a purchase", () => {
  assert.equal(
    updateIdFromPartyLayerStatus({
      status: "rejected",
      raw: { updateId },
    }),
    null,
  );
  assert.equal(updateIdFromPartyLayerReceipt({ transactionHash: "pending" }), null);
});
