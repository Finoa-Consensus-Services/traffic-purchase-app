/** Server-only registry credentials. Do not import this from client components. */
import { ScanError } from "@/lib/scan";
import { transferRegistryBaseUrl } from "@/lib/purchase/transfer-factory-paths";

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let keycloakCache: CachedToken | null = null;

const REFRESH_SKEW_MS = 60_000;

function keycloakConfig():
  | { tokenUrl: string; clientId: string; clientSecret: string; scope?: string }
  | null {
  const tokenUrl = process.env.KEYCLOAK_TOKEN_URL?.trim();
  const clientId = process.env.KEYCLOAK_CLIENT_ID?.trim();
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET?.trim();
  const scope = process.env.KEYCLOAK_SCOPE?.trim();
  if (!tokenUrl || !clientId || !clientSecret) {
    return null;
  }
  return { tokenUrl, clientId, clientSecret, scope: scope || undefined };
}

function explicitRegistryBearer(): string | undefined {
  return process.env.REGISTRY_BEARER_TOKEN?.trim() || undefined;
}

function scanBearer(): string | undefined {
  return process.env.SCAN_BEARER_TOKEN?.trim() || undefined;
}

function registryAuthRequired(): boolean {
  const flag = process.env.REGISTRY_REQUIRE_AUTH?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "no") {
    return false;
  }
  if (flag === "1" || flag === "true" || flag === "yes") {
    return true;
  }
  // Scan-proxy is the authenticated door. The public Scan registry is not.
  const base = transferRegistryBaseUrl() ?? "";
  return base.includes("/scan-proxy");
}

async function fetchKeycloakAccessToken(): Promise<string> {
  const config = keycloakConfig();
  if (!config) {
    throw new ScanError(
      503,
      "Registry auth misconfigured: KEYCLOAK_TOKEN_URL, KEYCLOAK_CLIENT_ID, and KEYCLOAK_CLIENT_SECRET must all be set.",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  if (config.scope) {
    body.set("scope", config.scope);
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    const compact = text.replace(/\s+/g, " ").slice(0, 180);
    throw new ScanError(
      response.status === 401 || response.status === 403 ? response.status : 502,
      `Keycloak token request failed (${response.status}): ${compact || response.statusText}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new ScanError(502, "Keycloak token response was not JSON.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ScanError(502, "Keycloak token response missing access_token.");
  }

  const record = parsed as Record<string, unknown>;
  const rawToken = record.access_token;
  if (typeof rawToken !== "string") {
    throw new ScanError(502, "Keycloak token response missing access_token.");
  }
  const accessToken = rawToken;
  const expiresIn =
    typeof record.expires_in === "number" && Number.isFinite(record.expires_in)
      ? record.expires_in
      : 300;

  keycloakCache = {
    accessToken,
    expiresAtMs: Date.now() + expiresIn * 1000,
  };
  return accessToken;
}

async function keycloakAccessToken(): Promise<string> {
  if (
    keycloakCache &&
    keycloakCache.expiresAtMs - REFRESH_SKEW_MS > Date.now()
  ) {
    return keycloakCache.accessToken;
  }
  return fetchKeycloakAccessToken();
}

function asBearer(token: string): string {
  return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
}

/** Registry bearer. Public Scan needs none, and the browser never supplies it. */
export async function registryAuthorizationHeader(): Promise<string | undefined> {
  const keycloak = keycloakConfig();
  if (keycloak) {
    return asBearer(await keycloakAccessToken());
  }

  const explicit = explicitRegistryBearer();
  if (explicit) {
    return asBearer(explicit);
  }

  if (registryAuthRequired()) {
    const scanToken = scanBearer();
    if (scanToken) {
      return asBearer(scanToken);
    }
    throw new ScanError(
      503,
      "Scan-proxy registry authentication is required. Configure Keycloak (KEYCLOAK_TOKEN_URL, KEYCLOAK_CLIENT_ID, KEYCLOAK_CLIENT_SECRET) or REGISTRY_BEARER_TOKEN on the server.",
    );
  }

  return undefined;
}

/** @internal Tests only */
export function resetRegistryAuthCacheForTests(): void {
  keycloakCache = null;
}
