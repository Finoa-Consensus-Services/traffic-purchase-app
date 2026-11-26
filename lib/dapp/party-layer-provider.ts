export type WalletRpcProvider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
};

export function isWalletRpcProvider(value: unknown): value is WalletRpcProvider {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.request === "function" &&
    typeof record.on === "function" &&
    typeof record.removeListener === "function"
  );
}

export type WalletListFilter = {
  requiredCapabilities?: string[];
  includeExperimental?: boolean;
};

type WalletLister = {
  listWallets: (filter?: WalletListFilter) => Promise<unknown>;
};

/**
 * PartyLayer files an announced CIP-0103 extension under the stable channel.
 * A beta Devnet kit would otherwise hide it. Listing every channel keeps
 * installed wallets next to the beta catalog.
 */
export const includeAnnouncedWallets = <T extends WalletLister>(client: T): T => {
  const listWallets = client.listWallets.bind(client);
  client.listWallets = (filter) => listWallets({ ...filter, includeExperimental: true });
  return client;
};
