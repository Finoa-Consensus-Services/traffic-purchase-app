/** True on devnet. APP_NETWORK=mainnet forces it off. */
export function devnetBannerEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  const network = env["APP_NETWORK"]?.trim().toLowerCase();
  if (network === "devnet") return true;
  if (network === "mainnet" || network === "main") return false;
  const origin = env["NEXT_PUBLIC_APP_ORIGIN"]?.trim().toLowerCase() ?? "";
  return origin.includes("devnet");
}
