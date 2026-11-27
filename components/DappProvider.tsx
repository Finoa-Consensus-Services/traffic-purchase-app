"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DappClient,
  DiscoveryClient,
  ExtensionAdapter,
  RemoteAdapter,
  SDK_VERSION,
} from "@canton-network/dapp-sdk";
import type {
  ConnectResult,
  LedgerApiParams,
  LedgerApiResult,
  ListAccountsResult,
  PrepareExecuteParams,
  StatusEvent,
  Wallet,
} from "@canton-network/dapp-sdk";
import type { ProviderAdapter, WalletInfo } from "@canton-network/core-wallet-discovery";
import { buildAdditionalAdapters } from "@/lib/dapp/config";
import { dappLog, dappWarn } from "@/lib/dapp/client-log";
import { discoverExtensionAdapters } from "@/lib/dapp/discover-wallets";
import { messageForProviderError } from "@/lib/dapp/errors";
import {
  forgetSavedWallet,
  readSavedWallets,
  rememberSavedWallet,
  walletUrlKey,
} from "@/lib/dapp/saved-wallets";
import { installPopupCapture } from "@/lib/dapp/popup-capture";
import {
  LOCAL_PREVIEW_CC,
  LOCAL_PREVIEW_PARTY_ID,
  LOCAL_PREVIEW_WALLET_ID,
  isWalletUrl,
  localPreviewWalletEnabled,
} from "@/lib/local-preview";
import { normalizeWalletList, primaryWallet } from "@/lib/dapp/normalize";
import { isWalletRpcProvider } from "@/lib/dapp/party-layer-provider";

type SessionProvider = NonNullable<ReturnType<DiscoveryClient["getActiveSession"]>>["provider"];
type WalletOwner = "discovery" | "partylayer" | "preview" | "handoff" | null;

export type WalletChoice = {
  id: string;
  label: string;
  detail?: string;
  removable: boolean;
};

export type ConnectWalletResult = {
  connected: boolean;
  approvalUrl?: string;
};

export type PartyLayerSubmit = (
  params: PrepareExecuteParams,
) => Promise<{ updateId?: string; commandId?: string; transactionHash?: string } | null>;

export type PurchaseSession = {
  prepareExecuteAndWait: DappClient["prepareExecuteAndWait"];
  provider: SessionProvider;
  partyLayerSubmit?: PartyLayerSubmit;
};

type DappContextValue = {
  ready: boolean;
  status: StatusEvent | null;
  connection: ConnectResult | null;
  accounts: Wallet[];
  primaryAccount: Wallet | null;
  wallets: WalletChoice[];
  approvalUrl: string | null;
  error: string | null;
  busy: boolean;
  previewCc: number | null;
  partyLayerEnabled: boolean;
  refreshStatus: () => Promise<StatusEvent | null>;
  adoptPartyLayerProvider: (provider: unknown) => Promise<void>;
  releasePartyLayerProvider: () => void;
  registerPartyLayerDisconnect: (disconnect: (() => Promise<void>) | null) => void;
  registerPartyLayerSubmit: (submit: PartyLayerSubmit | null) => void;
  refreshWallets: () => Promise<void>;
  connectWallet: (providerId: string) => Promise<ConnectWalletResult>;
  disconnectWallet: () => Promise<void>;
  registerRemoteWallet: (label: string, dappApiUrl: string) => void;
  removeSavedWallet: (providerId: string) => Promise<void>;
  clearApprovalUrl: () => void;
  purchaseSession: () => PurchaseSession | null;
  ledgerApi: (params: LedgerApiParams) => Promise<LedgerApiResult>;
};

const DappContext = createContext<DappContextValue | null>(null);

function savedWalletKeys() {
  return new Set(
    readSavedWallets().flatMap((wallet) => {
      const key = walletUrlKey(wallet.dappApiUrl);
      return key ? [key] : [];
    }),
  );
}

/** DiscoveryClient keeps adapters in a private map and has no public unregister. */
function dropAdapter(discovery: DiscoveryClient, providerId: string) {
  const registry = discovery as unknown as {
    adapters?: Map<string, ProviderAdapter>;
  };
  const adapter = registry.adapters?.get(providerId);
  adapter?.teardown();
  registry.adapters?.delete(providerId);
}

function rememberKernel(info: WalletInfo) {
  try {
    if (info.type === "remote" && info.url) {
      localStorage.setItem(
        "splice_wallet_kernel_discovery",
        JSON.stringify({ walletType: "remote", url: info.url }),
      );
      return;
    }
    if (info.type === "browser") {
      localStorage.setItem(
        "splice_wallet_kernel_discovery",
        JSON.stringify({ walletType: "extension", providerId: info.providerId }),
      );
    }
  } catch {
    // The live session still works when storage is blocked.
  }
}

export function DappProvider({
  children,
  appOrigin,
  partyLayerEnabled = false,
}: {
  children: ReactNode;
  appOrigin: string;
  partyLayerEnabled?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<StatusEvent | null>(null);
  const [connection, setConnection] = useState<ConnectResult | null>(null);
  const [accounts, setAccounts] = useState<Wallet[]>([]);
  const [wallets, setWallets] = useState<WalletChoice[]>([]);
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewCc, setPreviewCc] = useState<number | null>(null);
  const discoveryRef = useRef<DiscoveryClient | null>(null);
  const clientRef = useRef<DappClient | null>(null);
  const providerListenersCleanup = useRef<(() => void) | null>(null);
  const ownerRef = useRef<WalletOwner>(null);
  const externalProviderRef = useRef<SessionProvider | null>(null);
  const adoptGenerationRef = useRef(0);
  const partyLayerDisconnectRef = useRef<(() => Promise<void>) | null>(null);
  const partyLayerSubmitRef = useRef<PartyLayerSubmit | null>(null);

  const syncWallets = useCallback(() => {
    const discovery = discoveryRef.current;
    if (!discovery) return;
    const saved = savedWalletKeys();
    setWallets(
      discovery
        .listWallets()
        .filter((wallet) => !wallet.url || isWalletUrl(wallet.url))
        .map((wallet) => ({
          id: wallet.providerId,
          label: wallet.name,
          detail: wallet.url,
          removable: Boolean(wallet.url && saved.has(walletUrlKey(wallet.url) ?? "")),
        })),
    );
  }, []);

  const refreshAccounts = useCallback(async () => {
    const client = clientRef.current;
    if (!client) {
      setAccounts([]);
      return;
    }
    try {
      const list = await client.listAccounts();
      setAccounts(normalizeWalletList(list as ListAccountsResult));
    } catch {
      setAccounts([]);
    }
  }, []);

  const refreshStatus = useCallback(async (): Promise<StatusEvent | null> => {
    const client = clientRef.current;
    if (!client) {
      setStatus(null);
      setConnection(null);
      setAccounts([]);
      return null;
    }
    try {
      const next = await client.status();
      setStatus(next);
      setConnection(next.connection);
      if (next.connection.isConnected) {
        await refreshAccounts();
      } else {
        setAccounts([]);
      }
      setError(null);
      return next;
    } catch (err) {
      if (discoveryRef.current?.getActiveSession()) {
        setError(messageForProviderError(err));
      }
      return null;
    }
  }, [refreshAccounts]);

  const detachProviderListeners = useCallback(() => {
    providerListenersCleanup.current?.();
    providerListenersCleanup.current = null;
  }, []);

  const attachProviderListeners = useCallback(
    (provider: SessionProvider) => {
      detachProviderListeners();
      const onStatus = (event: StatusEvent) => {
        setStatus(event);
        setConnection(event.connection);
        if (event.connection.isConnected) {
          void refreshAccounts();
        }
      };
      const onAccounts = (event: Wallet[] | Wallet) => {
        setAccounts(normalizeWalletList(event));
      };
      provider.on("statusChanged", onStatus);
      provider.on("accountsChanged", onAccounts);
      providerListenersCleanup.current = () => {
        provider.removeListener("statusChanged", onStatus);
        provider.removeListener("accountsChanged", onAccounts);
      };
    },
    [detachProviderListeners, refreshAccounts],
  );

  const bindSession = useCallback(() => {
    const session = discoveryRef.current?.getActiveSession();
    if (!session) {
      if (ownerRef.current === "discovery") clientRef.current = null;
      return;
    }
    if (ownerRef.current === "partylayer" || ownerRef.current === "preview") return;
    ownerRef.current = "discovery";
    externalProviderRef.current = null;
    const info = session.adapter.getInfo();
    const target = session.adapter instanceof ExtensionAdapter ? session.adapter.target : undefined;
    clientRef.current = new DappClient(session.provider, {
      providerType: info.type,
      target,
    });
    rememberKernel(info);
    attachProviderListeners(session.provider);
  }, [attachProviderListeners]);

  const refreshWallets = useCallback(async () => {
    const discovery = discoveryRef.current;
    if (!discovery) return;
    const found = await discoverExtensionAdapters();
    const known = new Set(discovery.listAdapters().map((adapter) => adapter.providerId));
    for (const adapter of found) {
      if (known.has(adapter.providerId)) continue;
      discovery.registerAdapter(adapter);
      known.add(adapter.providerId);
    }
    syncWallets();
  }, [syncWallets]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        const adapters = buildAdditionalAdapters(appOrigin);
        const knownUrls = new Set(
          adapters.flatMap((adapter) => {
            if (!(adapter instanceof RemoteAdapter)) return [];
            const key = walletUrlKey(adapter.rpcUrl);
            return key ? [key] : [];
          }),
        );
        for (const saved of readSavedWallets()) {
          const key = walletUrlKey(saved.dappApiUrl);
          if (!key || knownUrls.has(key)) continue;
          knownUrls.add(key);
          adapters.push(
            new RemoteAdapter({
              name: saved.label,
              rpcUrl: saved.dappApiUrl,
              description: "Custom CIP-0103 remote wallet URL",
            }),
          );
        }
        const extensions = await discoverExtensionAdapters();
        dappLog("wallet", "SDK init", {
          adapterCount: adapters.length + extensions.length,
          sdkVersion: SDK_VERSION,
        });
        const discovery = await DiscoveryClient.create({
          adapters: [...adapters, ...extensions],
        });
        if (cancelled) {
          discovery.destroy();
          return;
        }
        discoveryRef.current = discovery;
        syncWallets();
        if (discovery.getActiveSession()) {
          bindSession();
          const latest = await refreshStatus();
          dappLog("wallet", "Restored session", {
            providerId: latest?.provider?.id,
            partyId: latest?.session?.userId,
          });
        }
      } catch (err) {
        if (!cancelled) {
          const message = messageForProviderError(err);
          dappWarn("wallet", "Boot failed", { message });
          setError(message);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void boot();
    return () => {
      cancelled = true;
      detachProviderListeners();
      discoveryRef.current?.destroy();
      discoveryRef.current = null;
      clientRef.current = null;
    };
  }, [appOrigin, bindSession, detachProviderListeners, refreshStatus, syncWallets]);

  const connectWallet = useCallback(
    async (providerId: string): Promise<ConnectWalletResult> => {
      if (providerId === LOCAL_PREVIEW_WALLET_ID) {
        if (!localPreviewWalletEnabled()) {
          setError("Local wallet is only available in the local preview.");
          return { connected: false };
        }
        adoptGenerationRef.current += 1;
        ownerRef.current = "handoff";
        await partyLayerDisconnectRef.current?.();
        detachProviderListeners();
        clientRef.current = null;
        ownerRef.current = "preview";
        externalProviderRef.current = null;
        const connection = { isConnected: true, isNetworkConnected: true };
        setError(null);
        setApprovalUrl(null);
        setPreviewCc(LOCAL_PREVIEW_CC);
        setConnection(connection);
        setAccounts([
          {
            primary: true,
            partyId: LOCAL_PREVIEW_PARTY_ID,
            status: "allocated",
            hint: "local",
            publicKey: "local-preview",
            namespace: "1220abcdpreview",
            networkId: "global-domain::local-ui",
            signingProviderId: "local",
          },
        ]);
        setStatus({
          provider: { id: LOCAL_PREVIEW_WALLET_ID, providerType: "remote", url: "http://localhost/fixture" },
          connection,
          network: { networkId: "global-domain::local-ui" },
          session: { userId: LOCAL_PREVIEW_PARTY_ID, accessToken: "local-preview" },
        });
        return { connected: true };
      }
      const discovery = discoveryRef.current;
      if (!discovery) return { connected: false };
      adoptGenerationRef.current += 1;
      ownerRef.current = "handoff";
      await partyLayerDisconnectRef.current?.();
      if (ownerRef.current === "handoff") ownerRef.current = null;
      externalProviderRef.current = null;
      detachProviderListeners();
      clientRef.current = null;
      setBusy(true);
      setError(null);
      setApprovalUrl(null);
      let approval: string | undefined;
      let resolveApproval: ((url: string) => void) | null = null;
      const approvalPromise = new Promise<string>((resolve) => {
        resolveApproval = resolve;
      });
      const restoreCapture = installPopupCapture((url) => {
        approval = url;
        setApprovalUrl(url);
        resolveApproval?.(url);
      });
      const finish = async () => {
        bindSession();
        const latest = await refreshStatus();
        dappLog("wallet", "Connect finished", {
          isConnected: latest?.connection.isConnected === true,
          providerId: latest?.provider?.id,
          networkId: latest?.network?.networkId,
        });
        return latest?.connection.isConnected === true;
      };
      try {
        dappLog("wallet", "Connect started", { providerId });
        const connectPromise = discovery.connect(providerId);
        const outcome = await Promise.race([
          connectPromise.then(() => "connected" as const),
          approvalPromise.then(() => "approval" as const),
        ]);
        if (outcome === "approval") {
          void connectPromise
            .then(() => finish())
            .catch((err: unknown) => {
              setError(messageForProviderError(err));
            });
          return { connected: false, approvalUrl: approval };
        }
        const connected = await finish();
        return { connected, approvalUrl: approval };
      } catch (err) {
        const message = messageForProviderError(err);
        dappWarn("wallet", "Connect failed", { message });
        setError(message);
        return { connected: false, approvalUrl: approval };
      } finally {
        restoreCapture();
        setBusy(false);
      }
    },
    [bindSession, detachProviderListeners, refreshStatus],
  );

  const disconnectWallet = useCallback(async () => {
    setBusy(true);
    setError(null);
    setApprovalUrl(null);
    setPreviewCc(null);
    adoptGenerationRef.current += 1;
    ownerRef.current = null;
    externalProviderRef.current = null;
    try {
      detachProviderListeners();
      await partyLayerDisconnectRef.current?.();
      await discoveryRef.current?.disconnect();
      clientRef.current = null;
      setAccounts([]);
      setStatus(null);
      setConnection(null);
    } catch (err) {
      setError(messageForProviderError(err));
    } finally {
      setBusy(false);
    }
  }, [detachProviderListeners]);

  const registerRemoteWallet = useCallback(
    (label: string, dappApiUrl: string) => {
      const discovery = discoveryRef.current;
      const url = dappApiUrl.trim();
      if (!discovery || !url) return;
      if (!isWalletUrl(url)) {
        setError("Enter a full wallet URL, starting with https://.");
        return;
      }
      const name = label.trim() || "Remote wallet";
      if (!rememberSavedWallet(name, url)) {
        setError("This browser blocked saving the wallet. It will disappear after a refresh.");
      }
      const key = walletUrlKey(url);
      const existing = discovery
        .listWallets()
        .some((wallet) => wallet.url && walletUrlKey(wallet.url) === key);
      if (existing) {
        syncWallets();
        return;
      }
      discovery.registerAdapter(
        new RemoteAdapter({
          name,
          rpcUrl: url,
          description: "Custom CIP-0103 remote wallet URL",
        }),
      );
      dappLog("wallet", "Registered remote adapter", { label: name, rpcUrl: url });
      syncWallets();
    },
    [syncWallets],
  );

  const removeSavedWallet = useCallback(
    async (providerId: string) => {
      const discovery = discoveryRef.current;
      if (!discovery) return;
      const info = discovery.listWallets().find((wallet) => wallet.providerId === providerId);
      if (!info?.url || !walletUrlKey(info.url)) return;
      if (!savedWalletKeys().has(walletUrlKey(info.url) ?? "")) return;
      if (!forgetSavedWallet(info.url)) {
        setError("This browser blocked removing the wallet.");
        return;
      }
      if (discovery.getActiveSession()?.providerId === providerId) {
        await disconnectWallet();
      }
      dropAdapter(discovery, providerId);
      syncWallets();
    },
    [disconnectWallet, syncWallets],
  );

  const purchaseSession = useCallback((): PurchaseSession | null => {
    const client = clientRef.current;
    if (ownerRef.current === "partylayer" && externalProviderRef.current && client) {
      return {
        prepareExecuteAndWait: (params) => client.prepareExecuteAndWait(params),
        provider: externalProviderRef.current,
        partyLayerSubmit: partyLayerSubmitRef.current ?? undefined,
      };
    }
    const session = discoveryRef.current?.getActiveSession();
    if (!session || !client) return null;
    return {
      prepareExecuteAndWait: (params) => client.prepareExecuteAndWait(params),
      provider: session.provider,
    };
  }, []);

  const adoptPartyLayerProvider = useCallback(
    async (provider: unknown) => {
      if (!isWalletRpcProvider(provider)) return;
      const generation = adoptGenerationRef.current;
      if (ownerRef.current === "handoff" || ownerRef.current === "preview") return;
      const discovery = discoveryRef.current;
      if (discovery?.getActiveSession()) {
        try {
          await discovery.disconnect();
        } catch {
          // The PartyLayer session still replaces it below.
        }
      }
      if (generation !== adoptGenerationRef.current) return;
      const sessionProvider = provider as unknown as SessionProvider;
      ownerRef.current = "partylayer";
      externalProviderRef.current = sessionProvider;
      clientRef.current = new DappClient(sessionProvider as never);
      attachProviderListeners(sessionProvider);
      await refreshStatus();
    },
    [attachProviderListeners, refreshStatus],
  );

  const releasePartyLayerProvider = useCallback(() => {
    if (ownerRef.current !== "partylayer") return;
    ownerRef.current = null;
    externalProviderRef.current = null;
    detachProviderListeners();
    clientRef.current = null;
    setAccounts([]);
    setStatus(null);
    setConnection(null);
  }, [detachProviderListeners]);

  const registerPartyLayerDisconnect = useCallback((disconnect: (() => Promise<void>) | null) => {
    partyLayerDisconnectRef.current = disconnect;
  }, []);

  const registerPartyLayerSubmit = useCallback((submit: PartyLayerSubmit | null) => {
    partyLayerSubmitRef.current = submit;
  }, []);

  const ledgerApi = useCallback(async (params: LedgerApiParams) => {
    const client = clientRef.current;
    if (!client) {
      throw new Error("Connect a wallet before reading the ledger.");
    }
    return client.ledgerApi(params);
  }, []);

  const clearApprovalUrl = useCallback(() => setApprovalUrl(null), []);
  const primaryAccount = useMemo(() => primaryWallet(accounts), [accounts]);

  const value = useMemo(
    (): DappContextValue => ({
      ready,
      status,
      connection,
      accounts,
      primaryAccount,
      wallets,
      approvalUrl,
      error,
      busy,
      previewCc,
      partyLayerEnabled,
      refreshStatus,
      adoptPartyLayerProvider,
      releasePartyLayerProvider,
      registerPartyLayerDisconnect,
      registerPartyLayerSubmit,
      refreshWallets,
      connectWallet,
      disconnectWallet,
      registerRemoteWallet,
      removeSavedWallet,
      clearApprovalUrl,
      purchaseSession,
      ledgerApi,
    }),
    [
      ready,
      status,
      connection,
      accounts,
      primaryAccount,
      wallets,
      approvalUrl,
      error,
      busy,
      previewCc,
      partyLayerEnabled,
      refreshStatus,
      adoptPartyLayerProvider,
      releasePartyLayerProvider,
      registerPartyLayerDisconnect,
      registerPartyLayerSubmit,
      refreshWallets,
      connectWallet,
      disconnectWallet,
      registerRemoteWallet,
      removeSavedWallet,
      clearApprovalUrl,
      purchaseSession,
      ledgerApi,
    ],
  );

  return <DappContext.Provider value={value}>{children}</DappContext.Provider>;
}

export function useDappContext(): DappContextValue {
  const ctx = useContext(DappContext);
  if (!ctx) {
    throw new Error("useDappContext must be used within DappProvider");
  }
  return ctx;
}
