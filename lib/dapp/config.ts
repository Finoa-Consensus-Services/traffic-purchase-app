import { RemoteAdapter, WalletConnectAdapter } from "@canton-network/dapp-sdk";
import type { ProviderAdapter } from "@canton-network/core-wallet-discovery";

export type WalletPreset = {
  label: string;
  dappApiUrl: string;
};

function parsePresets(raw: string | undefined): WalletPreset[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry) => {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as WalletPreset).label === "string" &&
        typeof (entry as WalletPreset).dappApiUrl === "string"
      ) {
        return [entry as WalletPreset];
      }
      return [];
    });
  } catch {
    return [];
  }
}

export function walletPresetsFromEnv(): WalletPreset[] {
  return parsePresets(process.env.NEXT_PUBLIC_WALLET_PRESETS);
}

export function gatewayUrlFromEnv(): string | undefined {
  const url = process.env.NEXT_PUBLIC_WALLET_GATEWAY_URL?.trim();
  return url || undefined;
}

export function walletConnectProjectIdFromEnv(): string | undefined {
  const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
  return id || undefined;
}

/** Additional CIP-0103 adapters registered at SDK init (remote URLs, optional WC). */
export function buildAdditionalAdapters(appOrigin: string): ProviderAdapter[] {
  const adapters: ProviderAdapter[] = [];
  const seen = new Set<string>();

  const gateway = gatewayUrlFromEnv();
  if (gateway && !seen.has(gateway)) {
    seen.add(gateway);
    adapters.push(
      new RemoteAdapter({
        name: "Wallet Gateway",
        rpcUrl: gateway,
        description: "Splice Wallet Gateway (CIP-0103 remote)",
      }),
    );
  }

  for (const preset of walletPresetsFromEnv()) {
    const url = preset.dappApiUrl.trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    adapters.push(
      new RemoteAdapter({
        name: preset.label,
        rpcUrl: url,
        description: "Configured remote wallet (CIP-0103 async)",
      }),
    );
  }

  const wcProjectId = walletConnectProjectIdFromEnv();
  if (wcProjectId) {
    adapters.push(
      WalletConnectAdapter.create({
        projectId: wcProjectId,
        metadata: {
          name: "Traffic purchase",
          description: "Buy synchronizer traffic on Canton Network",
          url: appOrigin,
          icons: [],
        },
      }),
    );
  }

  return adapters;
}
