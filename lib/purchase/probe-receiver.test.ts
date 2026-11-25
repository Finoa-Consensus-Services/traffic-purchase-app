import assert from "node:assert/strict";
import test from "node:test";
import { probeTrafficPurchaseReceiver } from "./probe-receiver";

test("probeTrafficPurchaseReceiver uses the reserved receiver without env", () => {
  const prev = process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
  delete process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
  try {
    const probe = probeTrafficPurchaseReceiver();
    assert.equal(probe.status, "configured");
    assert.equal(
      probe.partyId,
      "splice_traffic-manager::1220000000000000000000000000000000000000000000000000000000000000abcd",
    );
    assert.equal(probe.source, "reserved");
  } finally {
    if (prev === undefined) {
      delete process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
    } else {
      process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID = prev;
    }
  }
});

test("probeTrafficPurchaseReceiver reports env source when override is set", () => {
  const prev = process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
  process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID = "splice_traffic-manager::1220custom";
  try {
    const probe = probeTrafficPurchaseReceiver();
    assert.equal(probe.status, "configured");
    assert.equal(probe.partyId, "splice_traffic-manager::1220custom");
    assert.equal(probe.source, "env");
  } finally {
    if (prev === undefined) {
      delete process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
    } else {
      process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID = prev;
    }
  }
});
