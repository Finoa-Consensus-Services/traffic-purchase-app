import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBuyMemberTrafficPrepareExecute,
  buildBuyMemberTrafficRequest,
} from "./buy-member-traffic";
import type { PurchaseContext } from "./types";

const context: PurchaseContext = {
  scanBaseUrl: "https://scan.example/api/scan",
  synchronizerId: "sync::domain",
  migrationId: 3,
  dsoPartyId: "dso::party",
  amuletRulesTemplateId: "#pkg:Splice.AmuletRules:AmuletRules",
  amuletRules: {
    templateId: "#pkg:Splice.AmuletRules:AmuletRules",
    contractId: "rules-cid",
    createdEventBlob: "rules-blob",
    synchronizerId: "sync::domain",
  },
  openMiningRound: {
    templateId: "#pkg:Round:OpenMiningRound",
    contractId: "round-cid",
    createdEventBlob: "round-blob",
    synchronizerId: "sync::domain",
  },
};

test("buildBuyMemberTrafficRequest produces a single ExerciseCommand", () => {
  const request = buildBuyMemberTrafficRequest({
    context,
    providerPartyId: "alice::party",
    memberId: "PAR::member",
    trafficAmountBytes: 500_000,
    ccAmount: 1.5,
    inputAmuletCids: ["amulet-1", "amulet-2"],
    commandId: "test-command",
  });
  assert.equal(request.commandId, "test-command");
  assert.equal(request.actAs?.[0], "alice::party");
  assert.ok(Array.isArray(request.commands));
  assert.equal(request.commands.length, 1);
  const command = request.commands[0] as {
    ExerciseCommand?: { choice?: string; choiceArgument?: Record<string, unknown> };
  };
  assert.equal(command.ExerciseCommand?.choice, "AmuletRules_BuyMemberTraffic");
  const args = command.ExerciseCommand?.choiceArgument;
  assert.equal(args?.memberId, "PAR::member");
  assert.equal(args?.trafficAmount, "500000");
  assert.equal(args?.migrationId, "3");
  assert.equal(args?.expectedDso, "dso::party");
  assert.equal(request.disclosedContracts?.length, 2);
});

test("buildBuyMemberTrafficRequest rejects a non-positive traffic amount", () => {
  for (const trafficAmountBytes of [0, -1, 1.5, Number.NaN]) {
    assert.throws(
      () =>
        buildBuyMemberTrafficRequest({
          context,
          providerPartyId: "alice::party",
          memberId: "PAR::member",
          trafficAmountBytes,
          ccAmount: 1.5,
          inputAmuletCids: ["amulet-1"],
        }),
      /trafficAmount must be positive/,
    );
  }
});

test("buildBuyMemberTrafficRequest decodes percent-encoded synchronizer ids", () => {
  const encoded = "global-domain%3A%3A1220abcd";
  const request = buildBuyMemberTrafficRequest({
    context: {
      ...context,
      synchronizerId: encoded,
      amuletRules: { ...context.amuletRules, synchronizerId: encoded },
      openMiningRound: { ...context.openMiningRound, synchronizerId: encoded },
    },
    providerPartyId: "alice::party",
    memberId: "PAR::member",
    trafficAmountBytes: 200_000,
    ccAmount: 100,
    inputAmuletCids: ["amulet-1"],
  });
  assert.equal(request.synchronizerId, "global-domain::1220abcd");
  assert.equal(request.disclosedContracts?.[0]?.synchronizerId, "global-domain::1220abcd");
  const payload = JSON.stringify(request);
  assert.equal(payload.includes("%3A"), false);
});

test("buildBuyMemberTrafficPrepareExecute applies legacy fee buffer and verifies active inputs", async () => {
  let activeCalls = 0;
  const ledgerApi = async (params: { resource: string }) => {
    if (params.resource === "/v2/state/ledger-end") {
      return { offset: 12 };
    }
    activeCalls += 1;
    return {
      activeContracts: [
        {
          createdEvent: {
            contractId: "cid-100",
            templateId: "#splice-amulet:Splice.Amulet:Amulet",
            createArgument: { amount: { initialAmount: "100" } },
          },
        },
        {
          createdEvent: {
            contractId: "cid-10",
            templateId: "#splice-amulet:Splice.Amulet:Amulet",
            createArgument: { amount: { initialAmount: "10" } },
          },
        },
      ],
    };
  };

  // 100 CC quoted needs 107 CC input (fee slack), so both UTXOs must be selected.
  const prepared = await buildBuyMemberTrafficPrepareExecute(ledgerApi, {
    context,
    providerPartyId: "alice::party",
    memberId: "PAR::member",
    trafficAmountBytes: 200_000,
    ccAmount: 100,
  });
  const command = prepared.commands[0] as {
    ExerciseCommand: { choiceArgument: { inputs: Array<{ value: string }> } };
  };
  assert.deepEqual(
    command.ExerciseCommand.choiceArgument.inputs.map((i) => i.value),
    ["cid-100", "cid-10"],
  );
  assert.ok(activeCalls >= 2);
});
