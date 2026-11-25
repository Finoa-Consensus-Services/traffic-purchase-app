import { ScanError } from "@/lib/scan";
import { probeTrafficPurchaseReceiver } from "@/lib/purchase/probe-receiver";
import {
  detectPurchasePath,
  type PurchasePath,
  type PurchasePathStatus,
} from "@/lib/purchase/paths";
import { buildTransferChoiceArguments } from "@/lib/purchase/build-transfer-choice-args";
import { fetchTransferFactoryContextDetailed } from "@/lib/purchase/fetch-transfer-factory";
import { loadPublicPurchaseInputs } from "@/lib/purchase/public-purchase-inputs";
import { buildTrafficPurchaseMemo } from "@/lib/purchase/memo";
import { pickTrafficReceiverPartyId } from "@/lib/purchase/traffic-receiver";

export type ResolvedPurchasePath = PurchasePathStatus & {
  receiverPartyId: string | null;
  transferFactoryAvailable: boolean;
  transferFactoryProbeError: string | null;
  transferFactoryPathUsed: string | null;
};

export { pickTrafficReceiverPartyId };

export async function probeTransferFactory(input: {
    receiverPartyId: string;
    synchronizerId: string;
    migrationId: number;
    instrumentAdmin: string;
    probeSenderPartyId: string;
    memberIdForMemo?: string;
  },
): Promise<{ ok: true; pathUsed: string } | { ok: false; error: string }> {
  try {
    const memo = buildTrafficPurchaseMemo({
      memberId: input.memberIdForMemo ?? "PAR::traffic-probe",
      synchronizerId: input.synchronizerId,
      migrationId: input.migrationId,
    });
    const choiceArguments = buildTransferChoiceArguments({
      senderPartyId: input.probeSenderPartyId,
      receiverPartyId: input.receiverPartyId,
      ccAmount: 0.000001,
      instrumentAdmin: input.instrumentAdmin,
      inputHoldingCids: [],
      memo,
    });
    const result = await fetchTransferFactoryContextDetailed(
      choiceArguments,
      input.synchronizerId,
    );
    return { ok: true, pathUsed: result.pathUsed };
  } catch (error) {
    const message =
      error instanceof ScanError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Transfer factory probe failed";
    return { ok: false, error: message };
  }
}

export async function resolvePurchasePath(
  _token: string | undefined,
  options?: {
    probeSenderPartyId?: string | null;
    synchronizerId?: string | null;
  },
): Promise<ResolvedPurchasePath> {
  const receiver = probeTrafficPurchaseReceiver();
  const base = detectPurchasePath(receiver);
  const receiverPartyId = pickTrafficReceiverPartyId();
  let transferFactoryAvailable = false;
  let transferFactoryProbeError: string | null = null;
  let transferFactoryPathUsed: string | null = null;

  if (receiverPartyId) {
    try {
      const inputs = await loadPublicPurchaseInputs();
      if (
        options?.synchronizerId &&
        options.synchronizerId !== inputs.synchronizerId
      ) {
        throw new Error(
          `Public registry synchronizer is ${inputs.synchronizerId}, not ${options.synchronizerId}.`,
        );
      }
      const probeSender =
        options?.probeSenderPartyId?.trim() ||
        process.env.TRAFFIC_PURCHASE_PROBE_SENDER?.trim() ||
        null;
      if (!probeSender) {
        transferFactoryProbeError =
          "Connect a wallet (or set TRAFFIC_PURCHASE_PROBE_SENDER) so path detection can call transfer-factory with a real sender party.";
      } else {
        const probe = await probeTransferFactory({
          receiverPartyId,
          synchronizerId: inputs.synchronizerId,
          migrationId: inputs.migrationId,
          instrumentAdmin: inputs.dsoPartyId,
          probeSenderPartyId: probeSender,
        });
        if (probe.ok) {
          transferFactoryAvailable = true;
          transferFactoryPathUsed = probe.pathUsed;
        } else {
          transferFactoryProbeError = probe.error;
        }
      }
    } catch (error) {
      transferFactoryProbeError =
        error instanceof Error ? error.message : "Purchase context failed";
    }
  }

  const path: PurchasePath =
    base.tokenStandardAvailable && transferFactoryAvailable
      ? "token-standard"
      : "legacy";

  const detail =
    path === "token-standard"
      ? `Token Standard path ready (transfer-factory: ${transferFactoryPathUsed ?? "ok"}).`
      : transferFactoryProbeError
        ? `${base.detail} Transfer factory probe: ${transferFactoryProbeError}`
        : `${base.detail} Transfer factory not probed.`;

  return {
    ...base,
    path,
    tokenStandardAvailable:
      base.tokenStandardAvailable && transferFactoryAvailable,
    receiverPartyId,
    transferFactoryAvailable,
    transferFactoryProbeError,
    transferFactoryPathUsed,
    detail,
  };
}
