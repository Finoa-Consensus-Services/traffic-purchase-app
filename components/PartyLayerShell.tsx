"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { PartyLayerLocaleProvider, PartyLayerProvider, ThemeProvider } from "@partylayer/react";
import { createPartyLayer, type PartyLayerClient } from "@partylayer/sdk";
import { includeAnnouncedWallets } from "@/lib/dapp/party-layer-provider";

export function PartyLayerShell({
  children,
  walletConnectProjectId,
}: {
  children: ReactNode;
  walletConnectProjectId?: string;
}) {
  const client = useMemo(() => {
    const created = createPartyLayer({
      deferInitialization: true,
      network: "devnet",
      channel: "beta",
      app: {
        name: "Traffic purchase",
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
      },
      walletConnect: walletConnectProjectId ? { projectId: walletConnectProjectId } : undefined,
    });
    return includeAnnouncedWallets(created);
  }, [walletConnectProjectId]);
  const mountedClientRef = useRef<PartyLayerClient | null>(null);

  useEffect(() => {
    mountedClientRef.current = client;
    client.initialize();
    return () => {
      mountedClientRef.current = null;
      queueMicrotask(() => {
        if (mountedClientRef.current !== client) client.destroy();
      });
    };
  }, [client]);

  return (
    <PartyLayerLocaleProvider>
      <ThemeProvider theme="light">
        <PartyLayerProvider client={client} network="devnet">
          {children}
        </PartyLayerProvider>
      </ThemeProvider>
    </PartyLayerLocaleProvider>
  );
}
