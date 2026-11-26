"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const WalletProviders = dynamic(
  () => import("@/components/WalletProviders").then((mod) => mod.WalletProviders),
  { ssr: false },
);

export function ClientProviders({
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
  return (
    <WalletProviders
      appOrigin={appOrigin}
      devnet={devnet}
      walletConnectProjectId={walletConnectProjectId}
    >
      {children}
    </WalletProviders>
  );
}
