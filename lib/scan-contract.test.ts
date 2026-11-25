import assert from "node:assert/strict";
import test from "node:test";
import { disclosedFromScanContract } from "./scan-contract";

test("disclosedFromScanContract normalizes snake_case Scan wrappers and decodes synchronizerId", () => {
  const ref = disclosedFromScanContract(
    {
      contract: {
        contract_id: "cid-1",
        template_id: "pkg:Splice.AmuletRules:AmuletRules",
        created_event_blob: "blob-1",
        domain_id: "global-domain%3A%3A1220abcd",
      },
    },
    "fallback::domain",
  );
  assert.deepEqual(ref, {
    contractId: "cid-1",
    templateId: "pkg:Splice.AmuletRules:AmuletRules",
    createdEventBlob: "blob-1",
    synchronizerId: "global-domain::1220abcd",
  });
});

test("disclosedFromScanContract supports camelCase contracts and fallback synchronizerId", () => {
  const ref = disclosedFromScanContract(
    {
      contractId: "cid-2",
      templateId: "pkg:Splice.Round:OpenMiningRound",
      createdEventBlob: "blob-2",
    },
    "global-domain%3A%3Afallback",
  );
  assert.deepEqual(ref, {
    contractId: "cid-2",
    templateId: "pkg:Splice.Round:OpenMiningRound",
    createdEventBlob: "blob-2",
    synchronizerId: "global-domain::fallback",
  });
});

test("disclosedFromScanContract returns null for non-objects or missing required fields", () => {
  assert.equal(disclosedFromScanContract(null, "sync::1"), null);
  assert.equal(disclosedFromScanContract({ contractId: "cid" }, "sync::1"), null);
  assert.equal(
    disclosedFromScanContract(
      { contractId: "cid", templateId: "tpl" },
      "sync::1",
    ),
    null,
  );
});
