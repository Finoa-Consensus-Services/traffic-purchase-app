"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { LedgerApiParams } from "@canton-network/dapp-sdk";
import { dappLog, dappWarn } from "@/lib/dapp/client-log";
import { fetchAmuletBalanceCc } from "@/lib/purchase/amulet-ledger";
import { useDappContext } from "@/components/DappProvider";

export type AmuletBalanceState = {
  totalCc: number | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AmuletBalanceContext = createContext<AmuletBalanceState | null>(null);

/** Single ledger balance query shared by wallet + purchase panels (CIP-0103 ledgerApi). */
export function AmuletBalanceProvider({ children }: { children: ReactNode }) {
  const { connection, primaryAccount, ledgerApi, previewCc } = useDappContext();
  const [totalCc, setTotalCc] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const partyId = primaryAccount?.partyId;
  const canQuery =
    connection?.isConnected === true &&
    connection.isNetworkConnected !== false &&
    primaryAccount?.status === "allocated" &&
    !!partyId;

  const refresh = useCallback(async () => {
    if (previewCc !== null) {
      setTotalCc(previewCc);
      setError(null);
      setLoading(false);
      return;
    }
    if (!canQuery || !partyId) {
      setTotalCc(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const walletLedgerApi = async (params: LedgerApiParams) => {
        const result = await ledgerApi(params);
        return result as Record<string, unknown>;
      };
      const { totalCc: next, holdings } = await fetchAmuletBalanceCc(
        walletLedgerApi,
        partyId,
      );
      setTotalCc(next);
      dappLog("balance", "Loaded via wallet ledgerApi", {
        totalCc: next,
        holdingCount: holdings.length,
        partyPreview: `${partyId.slice(0, 12)}…`,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not load balance from connected wallet";
      dappWarn("balance", "ledgerApi balance query failed", { message });
      setTotalCc(null);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [canQuery, ledgerApi, partyId, previewCc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    (): AmuletBalanceState => ({
      totalCc,
      loading,
      error,
      refresh,
    }),
    [totalCc, loading, error, refresh],
  );

  return (
    <AmuletBalanceContext.Provider value={value}>{children}</AmuletBalanceContext.Provider>
  );
}

export function useAmuletBalance(): AmuletBalanceState {
  const ctx = useContext(AmuletBalanceContext);
  if (!ctx) {
    throw new Error("useAmuletBalance must be used within AmuletBalanceProvider");
  }
  return ctx;
}
