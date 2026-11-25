import type { TrafficPurchaseReceiverProbe } from "@/lib/purchase/probe-receiver";

export type PurchasePath = "token-standard" | "legacy";

export type PurchasePathStatus = {
  path: PurchasePath;
  tokenStandardAvailable: boolean;
  receiver: TrafficPurchaseReceiverProbe;
  detail: string;
};

export function detectPurchasePath(
  receiver: TrafficPurchaseReceiverProbe,
): PurchasePathStatus {
  const configured =
    receiver.status === "configured" && Boolean(receiver.partyId);
  if (!configured) {
    return {
      path: "legacy",
      tokenStandardAvailable: false,
      receiver,
      detail: receiver.detail,
    };
  }
  return {
    path: "token-standard",
    tokenStandardAvailable: true,
    receiver,
    detail: receiver.detail,
  };
}
