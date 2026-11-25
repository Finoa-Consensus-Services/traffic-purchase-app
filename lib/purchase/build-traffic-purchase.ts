import type { PrepareExecuteParams } from "@canton-network/dapp-sdk";
import {
  buildBuyMemberTrafficPrepareExecute,
  type LedgerApiFn,
} from "@/lib/purchase/buy-member-traffic";
import { buildTokenStandardTransferRequest } from "@/lib/purchase/build-token-standard-transfer";
import type { PurchasePath } from "@/lib/purchase/paths";
import type {
  PurchaseContext,
  TokenStandardPurchaseContext,
} from "@/lib/purchase/types";
import { normalizeMemberId } from "@/lib/validator/normalize-member-id";

export type TrafficPurchaseBuildInput = {
  path: PurchasePath;
  context: PurchaseContext;
  tokenStandard?: TokenStandardPurchaseContext;
  providerPartyId: string;
  memberId: string;
  /** Legacy path: explicit bytes. Token Standard: derived from cc burn for disclosure only. */
  trafficAmountBytes: number;
  ccAmount: number;
  commandId?: string;
};

export async function buildTrafficPurchasePrepareExecute(
  ledgerApi: LedgerApiFn,
  input: TrafficPurchaseBuildInput,
): Promise<PrepareExecuteParams> {
  const memberId = normalizeMemberId(input.memberId);
  if (input.path === "token-standard") {
    if (!input.tokenStandard) {
      throw new Error(
        "Token Standard path requires transfer factory context from /api/purchase/transfer-context.",
      );
    }
    return buildTokenStandardTransferRequest({
      factory: input.tokenStandard.transferFactory,
      choiceArguments: input.tokenStandard.choiceArguments,
      providerPartyId: input.providerPartyId,
      synchronizerId: input.context.synchronizerId,
      commandId: input.commandId,
    });
  }
  return buildBuyMemberTrafficPrepareExecute(ledgerApi, {
    context: input.context,
    providerPartyId: input.providerPartyId,
    memberId,
    trafficAmountBytes: input.trafficAmountBytes,
    ccAmount: input.ccAmount,
    commandId: input.commandId,
  });
}
