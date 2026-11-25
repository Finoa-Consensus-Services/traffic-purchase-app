import assert from "node:assert/strict";
import test from "node:test";
import {
  SAVED_WALLETS_KEY,
  forgetSavedWallet,
  readSavedWallets,
  rememberSavedWallet,
} from "./saved-wallets";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

test("rememberSavedWallet stores a wallet and reads it back", () => {
  const storage = memoryStorage();
  assert.equal(rememberSavedWallet("Vala", "https://dev.vala-wallet.cc/api/dapp/v1", storage), true);
  assert.deepEqual(readSavedWallets(storage), [
    { label: "Vala", dappApiUrl: "https://dev.vala-wallet.cc/api/dapp/v1" },
  ]);
});

test("rememberSavedWallet replaces the same URL instead of duplicating it", () => {
  const storage = memoryStorage();
  rememberSavedWallet("Vala", "https://dev.vala-wallet.cc/api/dapp/v1", storage);
  rememberSavedWallet("Vala dev", "https://dev.vala-wallet.cc/api/dapp/v1/", storage);
  assert.deepEqual(readSavedWallets(storage), [
    { label: "Vala dev", dappApiUrl: "https://dev.vala-wallet.cc/api/dapp/v1/" },
  ]);
});

test("readSavedWallets drops invalid entries and broken JSON", () => {
  const storage = memoryStorage();
  storage.setItem(
    SAVED_WALLETS_KEY,
    JSON.stringify([
      { label: "Ok", dappApiUrl: "https://wallet.example/api/dapp/v1" },
      { label: "Bad", dappApiUrl: "javascript:alert(1)" },
      { label: 12, dappApiUrl: "https://wallet.example/other" },
    ]),
  );
  assert.deepEqual(readSavedWallets(storage), [
    { label: "Ok", dappApiUrl: "https://wallet.example/api/dapp/v1" },
    { label: "Remote wallet", dappApiUrl: "https://wallet.example/other" },
  ]);

  storage.setItem(SAVED_WALLETS_KEY, "{");
  assert.deepEqual(readSavedWallets(storage), []);
});

test("forgetSavedWallet removes one wallet and leaves the rest", () => {
  const storage = memoryStorage();
  rememberSavedWallet("Vala", "https://dev.vala-wallet.cc/api/dapp/v1", storage);
  rememberSavedWallet("Other", "http://localhost:3000/api/dapp/v1", storage);
  assert.equal(forgetSavedWallet("https://dev.vala-wallet.cc/api/dapp/v1/", storage), true);
  assert.deepEqual(readSavedWallets(storage), [
    { label: "Other", dappApiUrl: "http://localhost:3000/api/dapp/v1" },
  ]);
  assert.equal(forgetSavedWallet("not a url", storage), false);
});
