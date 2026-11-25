import assert from "node:assert/strict";
import test from "node:test";
import { parseTransferFactoryResponse } from "./parse-transfer-factory-response";

test("parseTransferFactoryResponse parses valid payload and normalizes disclosed contracts", () => {
  const parsed = parseTransferFactoryResponse(
    {
      factoryId: "00factory",
      transferKind: "self",
      choiceContext: {
        choiceContextData: { values: { round: "1" } },
        disclosedContracts: [
          {
            templateId: "pkg:Splice.AmuletRules:AmuletRules",
            contractId: "cid-1",
            createdEventBlob: "blob-1",
          },
          { incomplete: true },
        ],
      },
    },
    "global-domain%3A%3A1220",
  );
  assert.equal(parsed.factoryId, "00factory");
  assert.equal(parsed.transferKind, "self");
  assert.deepEqual(parsed.choiceContextData, { values: { round: "1" } });
  assert.equal(parsed.disclosedContracts.length, 1);
  assert.equal(parsed.disclosedContracts[0]?.synchronizerId, "global-domain::1220");
});

test("parseTransferFactoryResponse rejects malformed payloads", () => {
  assert.throws(() => parseTransferFactoryResponse(null, "sync::1"), /not an object/);
  assert.throws(() => parseTransferFactoryResponse({}, "sync::1"), /no factoryId/);
  assert.throws(
    () => parseTransferFactoryResponse({ factoryId: "00f" }, "sync::1"),
    /no choiceContext/,
  );
  assert.throws(
    () =>
      parseTransferFactoryResponse(
        { factoryId: "00f", choiceContext: { disclosedContracts: [] } },
        "sync::1",
      ),
    /no disclosed contracts/,
  );
});
