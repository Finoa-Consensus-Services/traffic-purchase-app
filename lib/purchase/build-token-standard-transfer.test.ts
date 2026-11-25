import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildTransferChoiceArguments } from "./build-transfer-choice-args";
import { buildTokenStandardTransferRequest } from "./build-token-standard-transfer";
import {
  choiceArgumentsForRegistryPath,
  factoryInterfaceIdForRegistryPath,
} from "./factory-registry";
import { parseTransferFactoryResponse } from "./parse-transfer-factory-response";

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("./fixtures/transfer-factory.json", import.meta.url),
    ),
    "utf8",
  ),
);

test("buildTokenStandardTransferRequest emits TransferFactory_Transfer", () => {
  const factory = parseTransferFactoryResponse(fixture, "sync::domain");
  const choiceArguments = buildTransferChoiceArguments({
    senderPartyId: "alice::party",
    receiverPartyId: "traffic::party",
    ccAmount: 12.5,
    instrumentAdmin: "dso::party",
    inputHoldingCids: ["holding-1"],
    memo: "splice/memo:member-id=PAR%3A%3Ax",
  });
  const request = buildTokenStandardTransferRequest({
    factory,
    choiceArguments,
    providerPartyId: "alice::party",
    synchronizerId: "sync::domain",
    commandId: "cmd-1",
  });
  assert.equal(request.commandId, "cmd-1");
  const command = request.commands[0] as {
    ExerciseCommand?: {
      choice?: string;
      contractId?: string;
      choiceArgument?: {
        transfer?: {
          sender?: string;
          receiver?: string;
          inputHoldingCids?: string[];
          meta?: { values?: Record<string, string> };
        };
      };
    };
  };
  assert.equal(command.ExerciseCommand?.choice, "TransferFactory_Transfer");
  assert.equal(command.ExerciseCommand?.contractId, "00factory-cid");
  assert.ok(request.disclosedContracts && request.disclosedContracts.length > 0);
  const choiceArgument = command.ExerciseCommand?.choiceArgument;
  assert.ok(choiceArgument);
  assert.equal(choiceArgument.transfer?.sender, "alice::party");
  assert.equal(choiceArgument.transfer?.receiver, "traffic::party");
  assert.deepEqual(choiceArgument.transfer?.inputHoldingCids, ["holding-1"]);
  assert.equal(
    choiceArgument.transfer?.meta?.values?.["splice.lfdecentralizedtrust.org/reason"],
    "splice/memo:member-id=PAR%3A%3Ax",
  );
});

test("TransferFactory_Transfer decodes a URL-encoded synchronizer id in the memo", () => {
  const encoded =
    "global-domain%3A%3A1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
  const raw =
    "global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
  const factory = parseTransferFactoryResponse(fixture, encoded);
  const choiceArguments = buildTransferChoiceArguments({
    senderPartyId: "alice::party",
    receiverPartyId: "traffic::party",
    ccAmount: 1,
    instrumentAdmin: "dso::party",
    inputHoldingCids: ["holding-1"],
    memo: `splice/memo:member-id=PAR::abc&synchronizer-id=${encoded}&migration-id=4&forfeit-validator-reward-coupon=true`,
  });
  const request = buildTokenStandardTransferRequest({
    factory,
    choiceArguments,
    providerPartyId: "alice::party",
    synchronizerId: encoded,
  });
  const payload = JSON.stringify(request);
  assert.equal(request.synchronizerId, raw);
  assert.match(payload, /synchronizer-id=global-domain::1220be58/);
  assert.equal(payload.includes(encoded), false);
  assert.equal(payload.includes("%3A"), false);
});

test("v2 registry path uses TransferInstructionV2 actors", () => {
  const v1 = buildTransferChoiceArguments({
    senderPartyId: "alice::party",
    receiverPartyId: "traffic::party",
    ccAmount: 1,
    instrumentAdmin: "dso::party",
    inputHoldingCids: ["holding-1"],
    memo: "splice/memo:member-id=PAR%3A%3Ax",
  });
  const path = "/registry/transfer-instruction/v2/transfer-factory";
  const choiceArguments = choiceArgumentsForRegistryPath(path, v1);
  assert.equal(
    factoryInterfaceIdForRegistryPath(path),
    "#splice-api-token-transfer-instruction-v2:Splice.Api.Token.TransferInstructionV2:TransferFactory",
  );
  assert.equal("expectedAdmin" in choiceArguments, false);
  assert.deepEqual(
    "actors" in choiceArguments ? choiceArguments.actors : [],
    ["alice::party"],
  );
  const factory = parseTransferFactoryResponse(fixture, "sync::domain");
  const request = buildTokenStandardTransferRequest({
    factory: {
      ...factory,
      interfaceId: factoryInterfaceIdForRegistryPath(path),
    },
    choiceArguments,
    providerPartyId: "alice::party",
    synchronizerId: "sync::domain",
  });
  const command = request.commands[0] as {
    ExerciseCommand?: { templateId?: string };
  };
  assert.equal(
    command.ExerciseCommand?.templateId,
    "#splice-api-token-transfer-instruction-v2:Splice.Api.Token.TransferInstructionV2:TransferFactory",
  );
});
