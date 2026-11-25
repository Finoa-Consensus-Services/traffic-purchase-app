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
}: {
  children: ReactNode;
  appOrigin: string;
}) {
  return <WalletProviders appOrigin={appOrigin}>{children}</WalletProviders>;
}
