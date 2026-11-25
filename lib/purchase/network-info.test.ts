import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  DEFAULT_NETWORK_INFO_URL,
  fetchMigrationId,
  networkInfoUrl,
  parseMigrationId,
} from "./network-info";

const originalFetch = globalThis.fetch;
const originalUrl = process.env.NETWORK_INFO_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) {
    delete process.env.NETWORK_INFO_URL;
  } else {
    process.env.NETWORK_INFO_URL = originalUrl;
  }
});

test("parseMigrationId reads sv.migration_id", () => {
  assert.equal(
    parseMigrationId({
      network: "mainnet",
      sv: { migration_id: 4, version: "0.9.4" },
    }),
    4,
  );
});

test("parseMigrationId rejects missing or non-integer ids", () => {
  assert.throws(() => parseMigrationId({ sv: {} }), /migration_id/);
  assert.throws(() => parseMigrationId(null), /sv\.migration_id/);
  assert.throws(() => parseMigrationId({ sv: { migration_id: 1.5 } }), /integer/);
  assert.throws(() => parseMigrationId({ sv: { migration_id: "4" } }), /integer/);
});

test("networkInfoUrl defaults and honors NETWORK_INFO_URL", () => {
  delete process.env.NETWORK_INFO_URL;
  assert.equal(networkInfoUrl(), DEFAULT_NETWORK_INFO_URL);
  process.env.NETWORK_INFO_URL = " https://info.example/network ";
  assert.equal(networkInfoUrl(), "https://info.example/network");
});

test("fetchMigrationId parses JSON and surfaces HTTP or non-JSON errors", async () => {
  process.env.NETWORK_INFO_URL = "https://info.example/info";

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ sv: { migration_id: 7 } }), { status: 200 })) as typeof fetch;
  assert.equal(await fetchMigrationId(), 7);

  globalThis.fetch = (async () =>
    new Response("upstream unavailable", { status: 503 })) as typeof fetch;
  await assert.rejects(() => fetchMigrationId(), /Network info 503/);

  globalThis.fetch = (async () =>
    new Response("<html>oops</html>", { status: 200 })) as typeof fetch;
  await assert.rejects(() => fetchMigrationId(), /non-JSON/);
});
