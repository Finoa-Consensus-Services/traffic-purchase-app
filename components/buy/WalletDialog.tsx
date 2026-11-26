"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSmoothSize } from "@/components/buy/useSmoothSize";
import { SDK_VERSION } from "@canton-network/dapp-sdk";
import { useDappContext } from "@/components/DappProvider";
import { useAmuletBalance } from "@/hooks/useAmuletBalance";
import { LOCAL_PREVIEW_WALLET_ID, isWalletUrl, localPreviewWalletEnabled } from "@/lib/local-preview";

const PartyLayerModal = dynamic(
  () => import("@/components/buy/PartyLayerModal").then((mod) => mod.PartyLayerModal),
  { ssr: false },
);

const primaryButton =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-accent px-5 text-sm font-bold tracking-tight text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink";
const secondaryButton =
  "inline-flex h-12 w-full items-center justify-center rounded-full border border-line bg-surface px-5 text-sm font-bold tracking-tight text-primary disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink";
const ghostButton =
  "inline-flex h-12 w-full items-center justify-center rounded-full px-5 text-sm font-bold tracking-tight text-ink-muted hover:text-primary";

export function WalletDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useSmoothSize<HTMLDialogElement>();
  const {
    ready,
    status,
    connection,
    primaryAccount,
    wallets,
    approvalUrl,
    error,
    busy,
    refreshWallets,
    connectWallet,
    disconnectWallet,
    registerRemoteWallet,
    removeSavedWallet,
    partyLayerEnabled,
  } = useDappContext();
  const { totalCc, loading, error: balanceError } = useAmuletBalance();
  const [remoteLabel, setRemoteLabel] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [partyLayerOpen, setPartyLayerOpen] = useState(false);
  const connected = connection?.isConnected === true;
  const showChooser = !connected || switching;
  const wasConnected = useRef(connected);

  useEffect(() => {
    const loggedIn = connected && !wasConnected.current;
    wasConnected.current = connected;
    if (open && loggedIn) {
      setSwitching(false);
      setPartyLayerOpen(false);
      onClose();
    }
    if (loggedIn) setPartyLayerOpen(false);
  }, [connected, open, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setAdding(false);
      return;
    }
    void refreshWallets();
  }, [open, refreshWallets]);

  const handleOpenPartyLayer = () => {
    dialogRef.current?.close();
    setPartyLayerOpen(true);
  };

  const handleConnect = (providerId: string) => {
    void connectWallet(providerId).then((result) => {
      if (result.connected) {
        setSwitching(false);
        onClose();
      }
    });
  };

  const handleRemoveWallet = (providerId: string) => {
    void removeSavedWallet(providerId);
  };

  const handleAddWallet = () => {
    const url = remoteUrl.trim();
    if (!url) return;
    if (!isWalletUrl(url)) return;
    registerRemoteWallet(remoteLabel, url);
    setRemoteLabel("");
    setRemoteUrl("");
    setAdding(false);
  };

  const preview = localPreviewWalletEnabled();
  const showAddForm = wallets.length === 0 || adding;

  const title = showChooser ? "Connect wallet" : "Wallet";
  const legacyChooser = (
    <>
      {preview ? (
        <button
          type="button"
          className={secondaryButton}
          disabled={busy || !ready}
          onClick={() => handleConnect(LOCAL_PREVIEW_WALLET_ID)}
        >
          <span className="grid min-w-0 text-left">
            <span>Local wallet</span>
            <span className="truncate text-xs font-medium text-ink-muted">Preview only. Not a real wallet.</span>
          </span>
        </button>
      ) : null}
      {wallets.length === 0 && !preview ? (
        <p className="text-sm text-ink-muted">No saved wallets yet. Add one with its API URL.</p>
      ) : wallets.length > 0 ? (
        <ul className="grid gap-2" aria-label="Saved wallets">
          {wallets.map((wallet) => (
            <li key={wallet.id} className="relative">
              <button
                type="button"
                className={`flex min-h-12 w-full items-center rounded-full border border-line bg-surface py-2 text-left text-sm font-bold tracking-tight text-primary disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-ink ${wallet.removable ? "pr-12 pl-5" : "px-5"}`}
                disabled={busy || !ready}
                onClick={() => handleConnect(wallet.id)}
              >
                <span className="grid min-w-0 text-left">
                  <span className="truncate">{wallet.label}</span>
                  {wallet.detail ? (
                    <span className="truncate text-xs font-medium text-ink-muted">{wallet.detail}</span>
                  ) : null}
                </span>
              </button>
              {wallet.removable ? (
                <button
                  type="button"
                  aria-label={`Remove ${wallet.label}`}
                  className="absolute top-1.5 right-2 z-10 inline-flex size-7 items-center justify-center rounded-full text-lg leading-none text-ink-muted hover:bg-surface-sunken hover:text-danger"
                  disabled={busy}
                  onClick={() => handleRemoveWallet(wallet.id)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {wallets.length > 0 && !showAddForm ? (
        <button
          type="button"
          className={secondaryButton}
          aria-label="Add a wallet"
          onClick={() => setAdding(true)}
        >
          <span aria-hidden="true">+</span>
          <span className="ml-2">Add</span>
        </button>
      ) : null}
      {showAddForm ? (
        <div className="grid gap-2">
          <label className="text-sm font-bold" htmlFor="remote-label">
            Wallet label
          </label>
          <input
            id="remote-label"
            className="h-12 rounded-md border border-line px-4"
            value={remoteLabel}
            placeholder="My wallet"
            onChange={(event) => setRemoteLabel(event.target.value)}
          />
          <label className="text-sm font-bold" htmlFor="remote-url">
            Wallet API URL
          </label>
          <input
            id="remote-url"
            className="h-12 rounded-md border border-line px-4"
            value={remoteUrl}
            placeholder="https://wallet.example.com/api/dapp/v1"
            onChange={(event) => setRemoteUrl(event.target.value)}
          />
          <button
            type="button"
            className={secondaryButton}
            disabled={!remoteUrl.trim()}
            onClick={handleAddWallet}
          >
            Add wallet
          </button>
        </div>
      ) : null}
      {approvalUrl ? (
        <a className={primaryButton} href={approvalUrl} target="_blank" rel="noreferrer">
          Open wallet
        </a>
      ) : null}
    </>
  );

  return (
    <>
      {partyLayerEnabled ? (
        <PartyLayerModal open={partyLayerOpen} onClose={() => setPartyLayerOpen(false)} />
      ) : null}
      <dialog
      ref={dialogRef}
      className="vt-dialog"
      aria-labelledby="wallet-dialog-title"
      onClose={onClose}
    >
      <div className="grid gap-5">
        <h2 id="wallet-dialog-title" className="text-[1.8rem] leading-tight font-bold tracking-tight text-primary">
          {title}
        </h2>
        <p className="text-sm text-ink-muted">
          {showChooser ? "Connect your wallet." : "This wallet will approve the purchase."}
        </p>
        {!ready ? <p className="text-sm text-ink-muted">Starting wallet SDK…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {connection?.isConnected && connection.isNetworkConnected === false ? (
          <p className="text-sm text-danger">
            Wallet is not connected to a Canton network ({connection.networkReason ?? "network unavailable"}).
          </p>
        ) : null}
        {!showChooser && primaryAccount?.partyId ? (
          <div className="grid gap-2 rounded-md bg-surface-sunken p-4">
            <p className="font-mono break-all">{primaryAccount.partyId}</p>
            <p className="text-sm text-ink-muted">
              {loading
                ? "Reading balance…"
                : balanceError
                  ? balanceError
                  : totalCc !== null
                    ? `${totalCc.toFixed(4)} CC unlocked`
                    : "Balance unavailable"}
            </p>
            {status?.provider ? (
              <p className="text-sm text-ink-muted">
                {status.provider.id} · dapp-sdk {SDK_VERSION}
              </p>
            ) : null}
          </div>
        ) : null}
        {showChooser ? (
          <div className="grid gap-3">
            {partyLayerEnabled ? (
              <>
                <button type="button" className={primaryButton} onClick={handleOpenPartyLayer}>
                  Connect Wallet
                </button>
                <details>
                  <summary className="flex h-12 list-none items-center justify-center rounded-full border border-line bg-surface px-5 text-sm font-bold tracking-tight text-primary">
                    Other connection methods
                  </summary>
                  <div className="mt-3 grid gap-3">{legacyChooser}</div>
                </details>
              </>
            ) : (
              legacyChooser
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            <button
              type="button"
              className={primaryButton}
              disabled={busy || !ready}
              onClick={() => setSwitching(true)}
            >
              Switch wallet
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={busy}
              onClick={() => void disconnectWallet()}
            >
              Disconnect
            </button>
          </div>
        )}
        <button type="button" className={ghostButton} onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
    </>
  );
}
