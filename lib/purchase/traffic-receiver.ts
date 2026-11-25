/** Reserved traffic-purchase receiver from splice #8012. */
export const RESERVED_TRAFFIC_PURCHASE_RECEIVER_PARTY_ID =
  "splice_traffic-manager::1220000000000000000000000000000000000000000000000000000000000000abcd";

export function trafficPurchaseReceiverFromEnv(): string {
  const value = process.env.TRAFFIC_PURCHASE_RECEIVER_PARTY_ID?.trim();
  return value && value.length > 0
    ? value
    : RESERVED_TRAFFIC_PURCHASE_RECEIVER_PARTY_ID;
}

export function pickTrafficReceiverPartyId(): string {
  return trafficPurchaseReceiverFromEnv();
}
