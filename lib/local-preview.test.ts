import assert from "node:assert/strict";
import test from "node:test";
import { isWalletUrl } from "./local-preview";

test("a wallet address must be an http URL", () => {
  assert.equal(isWalletUrl("https://dev.vala-wallet.cc/api/dapp/v1"), true);
  assert.equal(isWalletUrl("http://localhost:3000/api/dapp/v1"), true);
  assert.equal(isWalletUrl("javascript:alert(1)"), false);
  assert.equal(isWalletUrl("ftp://wallet.example"), false);
  assert.equal(isWalletUrl("adasaas"), false);
  assert.equal(isWalletUrl(""), false);
});
