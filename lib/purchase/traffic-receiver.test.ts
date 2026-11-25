import assert from "node:assert/strict";
import test from "node:test";
import {
  pickTrafficReceiverPartyId,
  trafficPurchaseReceiverFromEnv,
} from "./traffic-receiver";

test("trafficPurchaseReceiverFromEnv uses the reserved splice receiver when unset", () => {
  const previous = process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
  delete process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
  try {
    const reserved =
      "splice_traffic-manager::1220000000000000000000000000000000000000000000000000000000000000abcd";
    assert.equal(trafficPurchaseReceiverFromEnv(), reserved);
    assert.equal(pickTrafficReceiverPartyId(), reserved);
  } finally {
    if (previous === undefined) {
      delete process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
    } else {
      process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID = previous;
    }
  }
});

test("trafficPurchaseReceiverFromEnv reads TRAFFIC_PURCHASE_RECEIVER_PARTY_ID", () => {
  const previous = process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
  process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID =
    "splice_traffic-manager::1220abcd";
  try {
    assert.equal(
      trafficPurchaseReceiverFromEnv(),
      "splice_traffic-manager::1220abcd",
    );
    assert.equal(
      pickTrafficReceiverPartyId(),
      "splice_traffic-manager::1220abcd",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
    } else {
      process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID = previous;
    }
  }
});
