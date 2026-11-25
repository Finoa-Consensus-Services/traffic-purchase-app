import {
  RESERVED_TRAFFIC_PURCHASE_RECEIVER_PARTY_ID,
  trafficPurchaseReceiverFromEnv,
} from "@/lib/purchase/traffic-receiver";

/** Traffic-purchase receiver. Not an ANS name. */
export type TrafficPurchaseReceiverProbe = {
  status: "configured" | "not-configured";
  partyId: string | null;
  detail: string;
  source: "env" | "reserved" | "none";
};

const RECEIVER_DOC =
  "https://docs.canton.network/global-synchronizer/deployment/synchronizer-traffic#buying-traffic-with-a-token-standard-transfer";

export function probeTrafficPurchaseReceiver(): TrafficPurchaseReceiverProbe {
  const partyId = trafficPurchaseReceiverFromEnv();
  const fromEnv = Boolean(process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID?.trim());
  return {
    status: "configured",
    partyId,
    detail: fromEnv
      ? "TRAFFIC_PURCHASE_RECEIVER_PARTY_ID is set (Canton splice_traffic-manager receiver)."
      : `Using the reserved traffic-purchase receiver ${RESERVED_TRAFFIC_PURCHASE_RECEIVER_PARTY_ID}. See ${RECEIVER_DOC}.`,
    source: fromEnv ? "env" : "reserved",
  };
}
