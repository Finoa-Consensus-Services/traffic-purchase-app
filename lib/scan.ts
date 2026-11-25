export class ScanError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ScanError";
    this.status = status;
  }
}

const DEFAULT_SCAN_BASE = "http://localhost:58412/api/scan";

export function scanBaseUrl(): string {
  return process.env.SCAN_BASE_URL?.replace(/\/$/, "") || DEFAULT_SCAN_BASE;
}

/** True when SCAN_BASE_URL points at a validator scan-proxy, not public Scan (`…/api/scan`). */
export function isScanProxy(): boolean {
  return scanBaseUrl().includes("/scan-proxy");
}

/** Bearer for Scan pricing routes. Not used for the token registry. */
export function bearerFrom(request: Request): string | undefined {
  const header = request.headers.get("x-scan-token")?.trim();
  if (header) {
    return header;
  }
  const fromEnv = process.env.SCAN_BEARER_TOKEN?.trim();
  return fromEnv || undefined;
}

async function scan(
  path: string,
  init: RequestInit | undefined,
  token: string | undefined,
): Promise<unknown> {
  const authorization = token
    ? token.toLowerCase().startsWith("bearer ")
      ? token
      : `Bearer ${token}`
    : undefined;
  const response = await fetch(`${scanBaseUrl()}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
      ...(authorization ? { authorization } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const compact = text.replace(/\s+/g, " ").slice(0, 180);
    const detail =
      response.status === 401
        ? isScanProxy()
          ? "The scan proxy requires a bearer token. Set SCAN_BEARER_TOKEN or send x-scan-token."
          : "Scan returned 401. Public Scan is usually limited by IP, and no bearer is set."
        : compact.includes("<html")
          ? `Scan refused ${path} (${response.status}). The host answered, and this network is not allowed through.`
          : `Scan ${response.status} on ${path}: ${compact || response.statusText}`;
    throw new ScanError(response.status, detail);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ScanError(response.status, `Scan returned non-JSON for ${path}`);
  }
}

export function scanGet(path: string, token?: string): Promise<unknown> {
  return scan(path, { method: "GET" }, token);
}

export function scanPost(
  path: string,
  body: unknown,
  token?: string,
): Promise<unknown> {
  return scan(path, { method: "POST", body: JSON.stringify(body) }, token);
}
