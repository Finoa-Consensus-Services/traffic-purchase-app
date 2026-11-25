import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWalletList, primaryWallet } from "./normalize";

test("normalizeWalletList accepts array or single wallet", () => {
  const wallet = {
    primary: true,
    partyId: "p::1",
    status: "allocated" as const,
    hint: "h",
    publicKey: "pk",
    namespace: "ns",
    networkId: "canton:test",
    signingProviderId: "sp",
  };
  assert.equal(normalizeWalletList([wallet]).length, 1);
  assert.equal(normalizeWalletList(wallet)[0]?.partyId, "p::1");
  assert.equal(normalizeWalletList(null).length, 0);
  assert.equal(normalizeWalletList(undefined).length, 0);
  assert.equal(primaryWallet([wallet])?.partyId, "p::1");
  assert.equal(primaryWallet([]), null);
  const secondary = { ...wallet, primary: false, partyId: "p::2" };
  assert.equal(primaryWallet([secondary, wallet])?.partyId, "p::1");
  assert.equal(primaryWallet([secondary])?.partyId, "p::2");
});
