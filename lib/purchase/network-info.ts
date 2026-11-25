export const DEFAULT_NETWORK_INFO_URL =
  "https://docs.global.canton.network.sync.global/info";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function networkInfoUrl(): string {
  return process.env.NETWORK_INFO_URL?.trim() || DEFAULT_NETWORK_INFO_URL;
}

export function parseMigrationId(payload: unknown): number {
  if (!isRecord(payload) || !isRecord(payload.sv)) {
    throw new Error("Network info response has no sv.migration_id");
  }
  const migrationId = payload.sv.migration_id;
  if (typeof migrationId !== "number" || !Number.isInteger(migrationId)) {
    throw new Error("Network info migration_id was not an integer");
  }
  return migrationId;
}

export async function fetchMigrationId(): Promise<number> {
  const url = networkInfoUrl();
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) {
    const compact = text.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(
      `Network info ${response.status} on ${url}: ${compact || response.statusText}`,
    );
  }
  try {
    return parseMigrationId(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Network info returned non-JSON for ${url}`);
    }
    throw error;
  }
}
