import assert from "node:assert/strict";
import test from "node:test";
import { buildTrafficPurchasePrepareExecute } from "./build-traffic-purchase";
import { buildTransferChoiceArguments } from "./build-transfer-choice-args";
import { HOLDING_INTERFACE_ID } from "./amulet-ledger";
import type { PurchaseContext } from "./types";

const context: PurchaseContext = {
  scanBaseUrl: "https://scan.example/api/scan",
  synchronizerId: "global-domain::1220",
  migrationId: 2,
  dsoPartyId: "DSO::1220",
  amuletRulesTemplateId: "pkg:Splice.AmuletRules:AmuletRules",
  amuletRules: {
    templateId: "pkg:Splice.AmuletRules:AmuletRules",
    contractId: "cid-rules",
    createdEventBlob: "blob-rules",
    synchronizerId: "global-domain::1220",
  },
  openMiningRound: {
    templateId: "pkg:Splice.Round:OpenMiningRound",
    contractId: "cid-round",
    createdEventBlob: "blob-round",
    synchronizerId: "global-domain::1220",
  },
};

const ledgerApi = async (params: { resource: string }) => {
  if (params.resource === "/v2/state/ledger-end") {
    return { offset: 5 };
  }
  return {
    activeContracts: [
      {
        createdEvent: {
          contractId: "cid-amulet-1",
          templateId: "#splice-amulet:Splice.Amulet:Amulet",
          createArgument: { amount: { initialAmount: "1000" } },
          interfaceViews: [
            {
              interfaceId: HOLDING_INTERFACE_ID,
              viewValue: {
                instrumentId: { admin: "DSO::1220", id: "Amulet" },
                amount: "1000",
                lock: null,
              },
            },
          ],
        },
      },
    ],
  };
};

test("buildTrafficPurchasePrepareExecute requires tokenStandard context on token-standard path", async () => {
  await assert.rejects(
    () =>
      buildTrafficPurchasePrepareExecute(ledgerApi, {
        path: "token-standard",
        context,
        providerPartyId: "alice::1220",
        memberId: "1220validator",
        trafficAmountBytes: 200_000,
        ccAmount: 120,
      }),
    /transfer factory context/,
  );
});

test("buildTrafficPurchasePrepareExecute emits TransferFactory_Transfer on token-standard path", async () => {
  const choiceArguments = buildTransferChoiceArguments({
    senderPartyId: "alice::1220",
    receiverPartyId: "splice_traffic-manager::1220",
    ccAmount: 120,
    instrumentAdmin: "DSO::1220",
    inputHoldingCids: ["cid-amulet-1"],
    memo: "splice/memo:member-id=PAR::1220validator&synchronizer-id=global-domain::1220&migration-id=2",
  });
  const request = await buildTrafficPurchasePrepareExecute(ledgerApi, {
    path: "token-standard",
    context,
    tokenStandard: {
      receiverPartyId: "splice_traffic-manager::1220",
      transferFactory: {
        factoryId: "00factory",
        transferKind: "self",
        choiceContextData: { values: {} },
        disclosedContracts: [context.amuletRules],
      },
      choiceArguments,
    },
    providerPartyId: "alice::1220",
    memberId: "1220validator",
    trafficAmountBytes: 200_000,
    ccAmount: 120,
    commandId: "cmd-ts",
  });
  assert.equal(request.commandId, "cmd-ts");
  assert.match(JSON.stringify(request.commands), /TransferFactory_Transfer/);
});

test("buildTrafficPurchasePrepareExecute normalizes bare memberId on legacy path", async () => {
  const request = await buildTrafficPurchasePrepareExecute(ledgerApi, {
    path: "legacy",
    context,
    providerPartyId: "alice::1220",
    memberId: "1220validator",
    trafficAmountBytes: 200_000,
    ccAmount: 120,
    commandId: "cmd-legacy",
  });
  assert.equal(request.commandId, "cmd-legacy");
  const command = request.commands[0] as {
    ExerciseCommand: { choice: string; choiceArgument: { memberId: string } };
  };
  assert.equal(command.ExerciseCommand.choice, "AmuletRules_BuyMemberTraffic");
  assert.equal(command.ExerciseCommand.choiceArgument.memberId, "PAR::1220validator");
});
