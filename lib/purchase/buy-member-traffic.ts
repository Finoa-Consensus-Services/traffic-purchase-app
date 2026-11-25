import type { PrepareExecuteParams } from "@canton-network/dapp-sdk";
import type { PurchaseContext } from "@/lib/purchase/types";
import {
  assertInputAmuletCidsActive,
  selectLegacyInputAmuletCids,
  type LedgerApiFn,
} from "@/lib/purchase/amulet-ledger";
import { legacyBuyMemberTrafficInputMinCc } from "@/lib/purchase/legacy-input-buffer";
import { rawSynchronizerId } from "@/lib/purchase/synchronizer-id";

export type { LedgerApiFn } from "@/lib/purchase/amulet-ledger";

export function buildBuyMemberTrafficRequest(input: {
  context: PurchaseContext;
  providerPartyId: string;
  memberId: string;
  trafficAmountBytes: number;
  ccAmount: number;
  inputAmuletCids: string[];
  commandId?: string;
}): PrepareExecuteParams {
  const {
    context,
    providerPartyId,
    memberId,
    trafficAmountBytes,
    inputAmuletCids,
  } = input;
  if (!Number.isInteger(trafficAmountBytes) || trafficAmountBytes <= 0) {
    throw new Error("trafficAmount must be positive");
  }
  const disclosed = [context.amuletRules, context.openMiningRound];
  const synchronizerId = rawSynchronizerId(context.synchronizerId);
  const choiceArgument = {
    context: {
      openMiningRound: context.openMiningRound.contractId,
      issuingMiningRounds: [],
      validatorRights: [],
      featuredAppRight: null,
    },
    inputs: inputAmuletCids.map((cid) => ({
      tag: "InputAmulet",
      value: cid,
    })),
    provider: providerPartyId,
    memberId,
    synchronizerId,
    migrationId: String(context.migrationId),
    trafficAmount: String(trafficAmountBytes),
    expectedDso: context.dsoPartyId,
  };

  return {
    commandId: input.commandId,
    actAs: [providerPartyId],
    synchronizerId,
    disclosedContracts: disclosed.map((d) => ({
      templateId: d.templateId,
      contractId: d.contractId,
      createdEventBlob: d.createdEventBlob,
      synchronizerId: rawSynchronizerId(d.synchronizerId),
    })),
    commands: [
      {
        ExerciseCommand: {
          templateId: context.amuletRulesTemplateId,
          contractId: context.amuletRules.contractId,
          choice: "AmuletRules_BuyMemberTraffic",
          choiceArgument,
        },
      },
    ],
  };
}

export async function buildBuyMemberTrafficPrepareExecute(
  ledgerApi: LedgerApiFn,
  input: {
    context: PurchaseContext;
    providerPartyId: string;
    memberId: string;
    trafficAmountBytes: number;
    ccAmount: number;
    commandId?: string;
  },
): Promise<PrepareExecuteParams> {
  const inputMinCc = legacyBuyMemberTrafficInputMinCc(input.ccAmount);
  const inputAmuletCids = await selectLegacyInputAmuletCids(
    ledgerApi,
    input.providerPartyId,
    inputMinCc,
  );
  await assertInputAmuletCidsActive(
    ledgerApi,
    input.providerPartyId,
    inputAmuletCids,
  );
  return buildBuyMemberTrafficRequest({ ...input, inputAmuletCids });
}
