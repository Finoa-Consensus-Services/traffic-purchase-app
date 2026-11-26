import assert from "node:assert/strict";
import test from "node:test";
import { includeAnnouncedWallets, isWalletRpcProvider } from "./party-layer-provider";

test("a CIP-0103 provider has request, on, and removeListener", () => {
  assert.equal(isWalletRpcProvider(null), false);
  assert.equal(isWalletRpcProvider({ request() {}, on() {} }), false);
  assert.equal(
    isWalletRpcProvider({
      request() {},
      on() {},
      removeListener() {},
    }),
    true,
  );
});

test("announced wallets stay visible on the beta channel", async () => {
  const calls: Array<{ includeExperimental?: boolean; requiredCapabilities?: string[] } | undefined> = [];
  const client = includeAnnouncedWallets({
    async listWallets(filter?: { includeExperimental?: boolean; requiredCapabilities?: string[] }) {
      calls.push(filter);
      return [];
    },
  });

  await client.listWallets();
  await client.listWallets({ requiredCapabilities: ["connect"] });

  assert.deepEqual(calls, [
    { includeExperimental: true },
    { requiredCapabilities: ["connect"], includeExperimental: true },
  ]);
});
