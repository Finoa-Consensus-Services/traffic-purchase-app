const MAINNET = "https://lighthouse.cantonloop.com";
const TESTNET = "https://lighthouse.testnet.cantonloop.com";
const DEVNET = "https://lighthouse.devnet.cantonloop.com";

/** Lighthouse transaction page for a ledger update id. */
export function lighthouseTransactionUrl(updateId: string, scanBaseUrl: string): string {
  const host = scanBaseUrl.toLowerCase();
  const base = host.includes("devnet") || host.includes(".dev.")
    ? DEVNET
    : host.includes("testnet") || host.includes(".test.")
      ? TESTNET
      : MAINNET;
  return `${base}/transactions/${encodeURIComponent(updateId)}`;
}
