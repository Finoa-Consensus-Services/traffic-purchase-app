import { fetchMigrationId } from "@/lib/purchase/network-info";
import {
  fetchRegistryReference,
  type RegistryReference,
} from "@/lib/purchase/registry-reference";

export type PublicPurchaseInputs = RegistryReference & {
  migrationId: number;
};

const CACHE_MS = 60_000;
let cache: { at: number; value: PublicPurchaseInputs } | null = null;

export function resetPublicPurchaseInputsCacheForTests(): void {
  cache = null;
}

/** DSO, synchronizer, and migration id from public endpoints. No Scan and no token. */
export async function loadPublicPurchaseInputs(): Promise<PublicPurchaseInputs> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.value;
  }
  const [reference, migrationId] = await Promise.all([
    fetchRegistryReference(),
    fetchMigrationId(),
  ]);
  const value = { ...reference, migrationId };
  cache = { at: Date.now(), value };
  return value;
}
