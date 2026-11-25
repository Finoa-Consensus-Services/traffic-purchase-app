import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, test } from "node:test";
import { ScanError } from "@/lib/scan";
import { resetRegistryAuthCacheForTests } from "@/lib/server/registry-auth";
import { buildTransferChoiceArguments } from "./build-transfer-choice-args";
import { fetchTransferFactoryContextDetailed } from "./fetch-transfer-factory";
import { TRANSFER_FACTORY_INTERFACE_ID_V2 } from "./token-standard-constants";

const fixture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/transfer-factory.json", import.meta.url)),
    "utf8",
  ),
);

const originalFetch = globalThis.fetch;
const envKeys = [
  "TRANSFER_REGISTRY_BASE_URL",
  "SCAN_TRANSFER_FACTORY_BASE_URL",
  "SCAN_TRANSFER_FACTORY_PATH",
  "SCAN_BASE_URL",
  "REGISTRY_BEARER_TOKEN",
  "REGISTRY_REQUIRE_AUTH",
  "KEYCLOAK_TOKEN_URL",
  "KEYCLOAK_CLIENT_ID",
  "KEYCLOAK_CLIENT_SECRET",
] as const;

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  resetRegistryAuthCacheForTests();
  for (const key of envKeys) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetRegistryAuthCacheForTests();
  for (const key of envKeys) {
    const prev = savedEnv.get(key);
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

const sampleArgs = buildTransferChoiceArguments({
  senderPartyId: "alice::1220",
  receiverPartyId: "splice_traffic-manager::1220",
  ccAmount: 12.5,
  instrumentAdmin: "DSO::1220",
  inputHoldingCids: ["cid-1"],
  memo: "splice/memo:member-id=PAR::a&synchronizer-id=sync::1&migration-id=0",
});

test("fetchTransferFactoryContextDetailed throws 404 ScanError when registry is unconfigured", async () => {
  process.env.SCAN_BASE_URL = "https://scan.example/api/scan";
  await assert.rejects(
    () => fetchTransferFactoryContextDetailed(sampleArgs, "sync::1"),
    (err: unknown) =>
      err instanceof ScanError &&
      err.status === 404 &&
      /TRANSFER_REGISTRY_BASE_URL/.test(err.message),
  );
});

test("fetchTransferFactoryContextDetailed falls back from V1 404 to V2 with actors payload", async () => {
  process.env.TRANSFER_REGISTRY_BASE_URL = "https://scan.example";
  const seen: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    seen.push({ url, body });
    if (url.includes("/v1/")) {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(fixture), { status: 200 });
  }) as typeof fetch;

  const result = await fetchTransferFactoryContextDetailed(sampleArgs, "sync::1");
  assert.equal(seen.length, 2);
  assert.ok(seen[0]?.url.endsWith("/registry/transfer-instruction/v1/transfer-factory"));
  assert.ok(seen[1]?.url.endsWith("/registry/transfer-instruction/v2/transfer-factory"));
  assert.equal(result.pathUsed, "/registry/transfer-instruction/v2/transfer-factory");
  assert.equal(result.context.interfaceId, TRANSFER_FACTORY_INTERFACE_ID_V2);
  assert.equal("expectedAdmin" in result.choiceArguments, false);
  assert.deepEqual(
    "actors" in result.choiceArguments ? result.choiceArguments.actors : [],
    ["alice::1220"],
  );
});

test("fetchTransferFactoryContextDetailed does not fall back on 500 or 401 errors", async () => {
  process.env.TRANSFER_REGISTRY_BASE_URL = "https://scan.example";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("unauthorized", { status: 401 });
  }) as typeof fetch;

  await assert.rejects(
    () => fetchTransferFactoryContextDetailed(sampleArgs, "sync::1"),
    (err: unknown) => err instanceof ScanError && err.status === 401,
  );
  assert.equal(calls, 1);
});

test("fetchTransferFactoryContextDetailed wraps network failures as 502 ScanError and rejects non-JSON", async () => {
  process.env.TRANSFER_REGISTRY_BASE_URL = "https://scan.example";
  globalThis.fetch = (async () => {
    throw new Error("socket hang up");
  }) as typeof fetch;

  await assert.rejects(
    () => fetchTransferFactoryContextDetailed(sampleArgs, "sync::1"),
    (err: unknown) =>
      err instanceof ScanError && err.status === 502 && /socket hang up/.test(err.message),
  );

  globalThis.fetch = (async () => new Response("not json", { status: 200 })) as typeof fetch;
  await assert.rejects(
    () => fetchTransferFactoryContextDetailed(sampleArgs, "sync::1"),
    (err: unknown) => err instanceof ScanError && /non-JSON/.test(err.message),
  );
});
