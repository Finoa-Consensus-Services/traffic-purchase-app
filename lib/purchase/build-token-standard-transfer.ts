import type { PrepareExecuteParams } from "@canton-network/dapp-sdk";
import type { FactoryChoiceArguments } from "@/lib/purchase/factory-registry";
import type { TransferFactoryContext } from "@/lib/purchase/fetch-transfer-factory";
import {
  TRANSFER_FACTORY_INTERFACE_ID,
} from "@/lib/purchase/token-standard-constants";
import { memoWithRawSynchronizerId } from "@/lib/purchase/memo";
import { rawSynchronizerId } from "@/lib/purchase/synchronizer-id";
import {
  selectInputAmuletCids,
  type LedgerApiFn,
} from "@/lib/purchase/amulet-ledger";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildTokenStandardTransferRequest(input: {
  factory: TransferFactoryContext;
  choiceArguments: FactoryChoiceArguments;
  providerPartyId: string;
  synchronizerId: string;
  commandId?: string;
}): PrepareExecuteParams {
  const contextData = isRecord(input.factory.choiceContextData)
    ? input.factory.choiceContextData
    : { values: {} };
  const transferMeta = { ...input.choiceArguments.transfer.meta.values };
  for (const key of Object.keys(transferMeta)) {
    const value = transferMeta[key];
    if (value?.includes("synchronizer-id=")) {
      transferMeta[key] = memoWithRawSynchronizerId(value);
    }
  }
  const choiceArgument: FactoryChoiceArguments = {
    ...input.choiceArguments,
    transfer: {
      ...input.choiceArguments.transfer,
      meta: { values: transferMeta },
    },
    extraArgs: {
      ...input.choiceArguments.extraArgs,
      context: {
        ...contextData,
        values: isRecord(contextData.values)
          ? (contextData.values as Record<string, unknown>)
          : {},
      },
    },
  };

  const synchronizerId = rawSynchronizerId(input.synchronizerId);
  return {
    commandId: input.commandId,
    actAs: [input.providerPartyId],
    synchronizerId,
    disclosedContracts: input.factory.disclosedContracts.map((d) => ({
      templateId: d.templateId,
      contractId: d.contractId,
      createdEventBlob: d.createdEventBlob,
      synchronizerId: rawSynchronizerId(d.synchronizerId),
    })),
    commands: [
      {
        ExerciseCommand: {
          templateId:
            input.factory.interfaceId ?? TRANSFER_FACTORY_INTERFACE_ID,
          contractId: input.factory.factoryId,
          choice: "TransferFactory_Transfer",
          choiceArgument,
        },
      },
    ],
  };
}

export async function buildTokenStandardTransferPrepareExecute(
  ledgerApi: LedgerApiFn,
  input: {
    factory: TransferFactoryContext;
    senderPartyId: string;
    receiverPartyId: string;
    ccAmount: number;
    instrumentAdmin: string;
    memo: string;
    synchronizerId: string;
    commandId?: string;
  },
): Promise<PrepareExecuteParams> {
  const inputHoldingCids = await selectInputAmuletCids(
    ledgerApi,
    input.senderPartyId,
    input.ccAmount,
  );
  const { buildTransferChoiceArguments } = await import(
    "@/lib/purchase/build-transfer-choice-args"
  );
  const choiceArguments = buildTransferChoiceArguments({
    senderPartyId: input.senderPartyId,
    receiverPartyId: input.receiverPartyId,
    ccAmount: input.ccAmount,
    instrumentAdmin: input.instrumentAdmin,
    inputHoldingCids,
    memo: input.memo,
  });
  return buildTokenStandardTransferRequest({
    factory: input.factory,
    choiceArguments,
    providerPartyId: input.senderPartyId,
    synchronizerId: input.synchronizerId,
    commandId: input.commandId,
  });
}
