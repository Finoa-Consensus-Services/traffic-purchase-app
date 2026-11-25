"use client";

import type { ReactNode } from "react";
import { DappProvider } from "@/components/DappProvider";
import { AmuletBalanceProvider } from "@/hooks/useAmuletBalance";

export function WalletProviders({
  children,
  appOrigin,
}: {
  children: ReactNode;
  appOrigin: string;
}) {
  return (
    <DappProvider appOrigin={appOrigin}>
      <AmuletBalanceProvider>{children}</AmuletBalanceProvider>
    </DappProvider>
  );
}
