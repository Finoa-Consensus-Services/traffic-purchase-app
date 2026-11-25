import type { DisclosedContractRef } from "@/lib/scan-contract";
import type { TransferFactoryContext } from "@/lib/purchase/fetch-transfer-factory";
import type { FactoryChoiceArguments } from "@/lib/purchase/factory-registry";

export type PurchaseContext = {
  scanBaseUrl: string;
  synchronizerId: string;
  migrationId: number;
  dsoPartyId: string;
  amuletRules: DisclosedContractRef;
  openMiningRound: DisclosedContractRef;
  amuletRulesTemplateId: string;
};

export type TokenStandardPurchaseContext = {
  receiverPartyId: string;
  transferFactory: TransferFactoryContext;
  choiceArguments: FactoryChoiceArguments;
};
