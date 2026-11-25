import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import {
  registryAuthorizationHeader,
  resetRegistryAuthCacheForTests,
} from "./registry-auth";

const originalFetch = globalThis.fetch;

describe("registryAuthorizationHeader", () => {
  beforeEach(() => {
    resetRegistryAuthCacheForTests();
    delete process.env.KEYCLOAK_TOKEN_URL;
    delete process.env.KEYCLOAK_CLIENT_ID;
    delete process.env.KEYCLOAK_CLIENT_SECRET;
    delete process.env.REGISTRY_BEARER_TOKEN;
    delete process.env.SCAN_BEARER_TOKEN;
    delete process.env.REGISTRY_REQUIRE_AUTH;
    delete process.env.TRANSFER_REGISTRY_BASE_URL;
    delete process.env.SCAN_TRANSFER_FACTORY_BASE_URL;
    delete process.env.SCAN_BASE_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetRegistryAuthCacheForTests();
  });

  test("uses static REGISTRY_BEARER_TOKEN without Keycloak", async () => {
    process.env.REGISTRY_BEARER_TOKEN = "static-registry-token";
    const header = await registryAuthorizationHeader();
    assert.equal(header, "Bearer static-registry-token");
  });

  test("Keycloak client_credentials when configured", async () => {
    process.env.KEYCLOAK_TOKEN_URL =
      "https://keycloak.example/realms/canton/protocol/openid-connect/token";
    process.env.KEYCLOAK_CLIENT_ID = "traffic-purchase-app";
    process.env.KEYCLOAK_CLIENT_SECRET = "secret";
    process.env.KEYCLOAK_SCOPE = "openid";

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      assert.ok(url.includes("openid-connect/token"));
      assert.equal(init?.method, "POST");
      const body = String(init?.body ?? "");
      assert.ok(body.includes("grant_type=client_credentials"));
      assert.ok(body.includes("client_id=traffic-purchase-app"));
      assert.ok(body.includes("client_secret=secret"));
      return new Response(
        JSON.stringify({ access_token: "kc-access", expires_in: 600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const header = await registryAuthorizationHeader();
    assert.equal(header, "Bearer kc-access");

    const cached = await registryAuthorizationHeader();
    assert.equal(cached, "Bearer kc-access");
    assert.equal(
      (globalThis.fetch as unknown as ReturnType<typeof mock.fn>).mock.callCount(),
      1,
    );
  });

  test("public Scan registry does not require a bearer", async () => {
    process.env.TRANSFER_REGISTRY_BASE_URL =
      "https://scan.sv-1.global.canton.network.digitalasset.com";
    process.env.SCAN_BEARER_TOKEN = "scan-only-token";
    assert.equal(await registryAuthorizationHeader(), undefined);
  });

  test("scan-proxy registry still requires a bearer", async () => {
    process.env.TRANSFER_REGISTRY_BASE_URL =
      "https://validator.example/api/validator/v0/scan-proxy";
    await assert.rejects(
      () => registryAuthorizationHeader(),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Scan-proxy registry authentication/);
        return true;
      },
    );
  });

  test("scan-proxy falls back to SCAN_BEARER_TOKEN without duplicating Bearer prefix", async () => {
    process.env.TRANSFER_REGISTRY_BASE_URL =
      "https://validator.example/api/validator/v0/scan-proxy";
    process.env.SCAN_BEARER_TOKEN = "Bearer already-prefixed";
    assert.equal(await registryAuthorizationHeader(), "Bearer already-prefixed");
  });

  test("REGISTRY_REQUIRE_AUTH overrides scan-proxy and public Scan defaults", async () => {
    process.env.TRANSFER_REGISTRY_BASE_URL =
      "https://validator.example/api/validator/v0/scan-proxy";
    process.env.REGISTRY_REQUIRE_AUTH = "false";
    assert.equal(await registryAuthorizationHeader(), undefined);

    process.env.TRANSFER_REGISTRY_BASE_URL =
      "https://scan.sv-1.global.canton.network.digitalasset.com";
    process.env.REGISTRY_REQUIRE_AUTH = "true";
    await assert.rejects(
      () => registryAuthorizationHeader(),
      /Scan-proxy registry authentication/,
    );
  });

  test("Keycloak maps HTTP, non-JSON, and missing access_token errors", async () => {
    process.env.KEYCLOAK_TOKEN_URL = "https://keycloak.example/token";
    process.env.KEYCLOAK_CLIENT_ID = "client";
    process.env.KEYCLOAK_CLIENT_SECRET = "secret";

    globalThis.fetch = (async () =>
      new Response("unauthorized", { status: 401 })) as typeof fetch;
    await assert.rejects(
      () => registryAuthorizationHeader(),
      (err: unknown) =>
        err instanceof Error &&
        "status" in err &&
        (err as { status: number }).status === 401,
    );

    globalThis.fetch = (async () =>
      new Response("server down", { status: 500 })) as typeof fetch;
    await assert.rejects(
      () => registryAuthorizationHeader(),
      (err: unknown) =>
        err instanceof Error &&
        "status" in err &&
        (err as { status: number }).status === 502,
    );

    globalThis.fetch = (async () =>
      new Response("not json", { status: 200 })) as typeof fetch;
    await assert.rejects(
      () => registryAuthorizationHeader(),
      /not JSON/,
    );

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ token_type: "Bearer" }), { status: 200 })) as typeof fetch;
    await assert.rejects(
      () => registryAuthorizationHeader(),
      /missing access_token/,
    );
  });
});
