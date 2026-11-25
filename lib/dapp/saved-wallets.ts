import { isWalletUrl } from "@/lib/local-preview";

export const SAVED_WALLETS_KEY = "traffic-purchase-saved-wallets";

export type SavedWallet = {
  label: string;
  dappApiUrl: string;
};

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Same wallet URL with or without a trailing slash counts as one entry. */
export function walletUrlKey(value: string): string | null {
  if (!isWalletUrl(value)) return null;
  const url = new URL(value.trim());
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.protocol}//${url.host}${path}${url.search}`;
}

export function readSavedWallets(storage: Storage | null = browserStorage()): SavedWallet[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(SAVED_WALLETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const wallets: SavedWallet[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const label = "label" in entry && typeof entry.label === "string" ? entry.label.trim() : "";
      const dappApiUrl =
        "dappApiUrl" in entry && typeof entry.dappApiUrl === "string" ? entry.dappApiUrl.trim() : "";
      const key = walletUrlKey(dappApiUrl);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      wallets.push({ label: label || "Remote wallet", dappApiUrl });
    }
    return wallets;
  } catch {
    return [];
  }
}

function writeSavedWallets(wallets: SavedWallet[], storage: Storage | null): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVED_WALLETS_KEY, JSON.stringify(wallets));
    return true;
  } catch {
    return false;
  }
}

export function rememberSavedWallet(
  label: string,
  dappApiUrl: string,
  storage: Storage | null = browserStorage(),
): boolean {
  const url = dappApiUrl.trim();
  const key = walletUrlKey(url);
  if (!key) return false;
  const next = readSavedWallets(storage).filter((wallet) => walletUrlKey(wallet.dappApiUrl) !== key);
  next.push({ label: label.trim() || "Remote wallet", dappApiUrl: url });
  return writeSavedWallets(next, storage);
}

export function forgetSavedWallet(
  dappApiUrl: string,
  storage: Storage | null = browserStorage(),
): boolean {
  const key = walletUrlKey(dappApiUrl);
  if (!key) return false;
  const next = readSavedWallets(storage).filter((wallet) => walletUrlKey(wallet.dappApiUrl) !== key);
  return writeSavedWallets(next, storage);
}
