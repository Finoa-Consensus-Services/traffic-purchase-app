import type { Wallet } from "@canton-network/dapp-sdk";

export function normalizeWalletList(
  accounts: Wallet[] | Wallet | null | undefined,
): Wallet[] {
  if (accounts == null) {
    return [];
  }
  if (Array.isArray(accounts)) {
    return accounts;
  }
  return [accounts];
}

export function primaryWallet(accounts: Wallet[]): Wallet | null {
  const list = normalizeWalletList(accounts);
  return list.find((w) => w.primary) ?? list[0] ?? null;
}
