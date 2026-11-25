import { isScanProxy, scanBaseUrl } from "@/lib/scan";

/** Registry base. A Scan URL ending in `/api/scan` is not the registry. */
export function transferRegistryBaseUrl(): string | null {
  const explicit =
    process.env.TRANSFER_REGISTRY_BASE_URL?.trim() ||
    process.env.SCAN_TRANSFER_FACTORY_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  if (isScanProxy()) {
    return scanBaseUrl().replace(/\/$/, "");
  }
  return null;
}

/** @deprecated Use transferRegistryBaseUrl */
export function transferFactoryRegistryBaseUrl(): string | null {
  return transferRegistryBaseUrl();
}

/** Paths relative to the registry base (scan-proxy or standalone registry). */
export function transferFactoryPostPaths(): string[] {
  const fromEnv = process.env.SCAN_TRANSFER_FACTORY_PATH?.trim();
  if (fromEnv) {
    return [fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`];
  }

  if (!transferRegistryBaseUrl()) {
    return [];
  }

  // Try the deployed V1 registry, then V2. A 404 on one path falls through.
  return [
    "/registry/transfer-instruction/v1/transfer-factory",
    "/registry/transfer-instruction/v2/transfer-factory",
  ];
}

export function transferFactoryRequestUrl(path: string): string {
  const base = transferRegistryBaseUrl();
  if (!base) {
    throw new Error("TRANSFER_REGISTRY_BASE_URL is not configured");
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
