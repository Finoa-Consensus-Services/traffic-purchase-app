import assert from "node:assert/strict";
import test from "node:test";
import { lighthouseTransactionUrl } from "./lighthouse";

const updateId = "1220abcd";

test("lighthouseTransactionUrl uses mainnet unless the scan host is test or dev", () => {
  assert.equal(
    lighthouseTransactionUrl(updateId, "https://scan.sv-1.global.canton.network.sync.global/api/scan"),
    "https://lighthouse.cantonloop.com/transactions/1220abcd",
  );
  assert.equal(
    lighthouseTransactionUrl(
      updateId,
      "https://scan.sv-1.test.global.canton.network.sync.global/api/scan",
    ),
    "https://lighthouse.testnet.cantonloop.com/transactions/1220abcd",
  );
  assert.equal(
    lighthouseTransactionUrl(updateId, "https://scan.devnet.example/api/scan"),
    "https://lighthouse.devnet.cantonloop.com/transactions/1220abcd",
  );
  assert.equal(
    lighthouseTransactionUrl(updateId, "https://scan.dev.example/api/scan"),
    "https://lighthouse.devnet.cantonloop.com/transactions/1220abcd",
  );
  assert.equal(
    lighthouseTransactionUrl("1220ab/cd", "https://scan.testnet.example/api/scan"),
    "https://lighthouse.testnet.cantonloop.com/transactions/1220ab%2Fcd",
  );
});
