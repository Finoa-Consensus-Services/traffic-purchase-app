"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { DappProvider } from "@/components/DappProvider";
import { AmuletBalanceProvider } from "@/hooks/useAmuletBalance";

const PartyLayerShell = dynamic(
  () => import("@/components/PartyLayerShell").then((mod) => mod.PartyLayerShell),
  { ssr: false },
);

const PartyLayerSessionSync = dynamic(
  () => import("@/components/PartyLayerSessionSync").then((mod) => mod.PartyLayerSessionSync),
  { ssr: false },
);

export function WalletProviders({
  children,
  appOrigin,
  devnet,
  walletConnectProjectId,
}: {
  children: ReactNode;
  appOrigin: string;
  devnet: boolean;
  walletConnectProjectId?: string;
}) {
  const wallet = (
    <DappProvider appOrigin={appOrigin} partyLayerEnabled={devnet}>
      {devnet ? <PartyLayerSessionSync /> : null}
      <AmuletBalanceProvider>{children}</AmuletBalanceProvider>
    </DappProvider>
  );

  if (!devnet) return wallet;

  return (
    <PartyLayerShell walletConnectProjectId={walletConnectProjectId}>{wallet}</PartyLayerShell>
  );
}
