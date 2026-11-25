import {
  CANTON_ANNOUNCE_PROVIDER_EVENT,
  CANTON_REQUEST_PROVIDER_EVENT,
} from "@canton-network/core-types";
import { ExtensionAdapter } from "@canton-network/dapp-sdk";

type AnnouncedProvider = {
  id: string;
  name: string;
  icon?: string;
  target?: string;
};

export async function discoverExtensionAdapters(timeoutMs = 300) {
  if (typeof window === "undefined") return [];
  const discovered = new Map<string, AnnouncedProvider>();
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AnnouncedProvider>).detail;
    if (!detail?.id || !detail?.name || discovered.has(detail.id)) return;
    discovered.set(detail.id, detail);
  };
  window.addEventListener(CANTON_ANNOUNCE_PROVIDER_EVENT, handler);
  try {
    window.dispatchEvent(new CustomEvent(CANTON_REQUEST_PROVIDER_EVENT, { detail: {} }));
    await new Promise((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    });
  } finally {
    window.removeEventListener(CANTON_ANNOUNCE_PROVIDER_EVENT, handler);
  }

  const adapters: ExtensionAdapter[] = [];
  for (const item of discovered.values()) {
    const adapter = new ExtensionAdapter({
      providerId: `browser:ext:${item.id}`,
      name: item.name,
      icon: item.icon,
      description: "Connect via a browser extension wallet",
      target: item.target ?? item.id,
    });
    if (await adapter.detect()) adapters.push(adapter);
  }
  return adapters;
}
