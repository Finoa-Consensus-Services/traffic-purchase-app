import assert from "node:assert/strict";
import test from "node:test";
import { errorCodes, providerErrors, rpcErrors } from "@canton-network/core-rpc-errors";
import {
  isUnsupportedWalletOperation,
  messageForProviderError,
  messageForTxFailure,
  rpcCodeFromProviderError,
} from "./errors";

test("messageForProviderError maps CIP-103 userRejectedRequest", () => {
  const err = providerErrors.userRejectedRequest("User said no");
  assert.equal(
    messageForProviderError(err),
    "You declined the request in your wallet.",
  );
  assert.equal(rpcCodeFromProviderError(err), errorCodes.provider.userRejectedRequest);
});

test("messageForProviderError maps inactive contracts and standard CIP-103 / RPC codes", () => {
  assert.match(
    messageForProviderError(new Error("LOCAL_VERDICT_INACTIVE_CONTRACTS: cid-1")),
    /archived contract/,
  );
  assert.equal(
    messageForProviderError(providerErrors.unauthorized("denied")),
    "Not authorized. Connect your wallet and try again.",
  );
  assert.equal(
    messageForProviderError(providerErrors.unsupportedMethod("nope")),
    "This wallet does not support that operation.",
  );
  assert.equal(
    messageForProviderError(providerErrors.disconnected("gone")),
    "The wallet is disconnected.",
  );
  assert.equal(
    messageForProviderError(providerErrors.chainDisconnected("off")),
    "The wallet is not connected to this network.",
  );
  assert.equal(
    messageForProviderError(rpcErrors.transactionRejected("bad tx")),
    "The transaction was rejected.",
  );
  assert.equal(
    messageForProviderError(rpcErrors.resourceUnavailable("timeout")),
    "The wallet event channel timed out. Try again.",
  );
  assert.equal(messageForProviderError("string-error"), "The wallet request failed.");
  assert.equal(messageForProviderError(null), "The wallet request failed.");
});

test("messageForTxFailure returns trimmed reason or default copy", () => {
  assert.equal(messageForTxFailure("Rejected by ledger"), "Rejected by ledger");
  assert.equal(messageForTxFailure("   "), "The transaction failed in your wallet.");
  assert.equal(messageForTxFailure(), "The transaction failed in your wallet.");
});

test("isUnsupportedWalletOperation detects unsupportedMethod code and message keywords", () => {
  const err = providerErrors.unsupportedMethod("prepareExecute not available");
  assert.equal(isUnsupportedWalletOperation(err), true);
  assert.equal(isUnsupportedWalletOperation(new Error("Unknown choice on factory")), true);
  assert.equal(isUnsupportedWalletOperation(new Error("TransferFactory not registered")), true);
  assert.equal(isUnsupportedWalletOperation(new Error("Wallet does not support this")), true);
  assert.equal(isUnsupportedWalletOperation(providerErrors.userRejectedRequest("no")), false);
  assert.equal(isUnsupportedWalletOperation(null), false);
});
