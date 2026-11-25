"use client";

import { useState } from "react";
import { SDK_VERSION } from "@canton-network/dapp-sdk";
import { gatewayUrlFromEnv, walletPresetsFromEnv } from "@/lib/dapp/config";
import { useDappContext } from "@/components/DappProvider";
import { useAmuletBalance } from "@/hooks/useAmuletBalance";

export function WalletConnectPanel() {
  const {
    ready,
    status,
    connection,
    primaryAccount,
    error,
    busy,
    wallets,
    connectWallet,
    disconnectWallet,
    registerRemoteWallet,
  } = useDappContext();
  const [remoteLabel, setRemoteLabel] = useState("Remote wallet");
  const [remoteUrl, setRemoteUrl] = useState("");
  const presets = walletPresetsFromEnv();
  const gateway = gatewayUrlFromEnv();
  const { totalCc, loading: balanceLoading, error: balanceError, refresh } =
    useAmuletBalance();

  const connected = connection?.isConnected === true;
  const networkId = status?.network?.networkId;
  const providerLabel = status?.provider
    ? `${status.provider.id} (${status.provider.providerType}) v${status.provider.version}`
    : "No wallet";

  return (
    <section className="panel">
      <h2>CIP-0103 wallet</h2>
      <p className="note">
        Connect any CIP-0103 wallet: browser extension, Wallet Gateway, or a
        remote async dApp API URL. The built-in picker lists detected providers
        and configured presets. Saved remote gateways can be renamed in the
        picker (dapp-sdk {SDK_VERSION}).
      </p>
      {!ready ? <p className="note">Starting wallet SDK…</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <dl className="facts">
        <div>
          <dt>Provider</dt>
          <dd>{providerLabel}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{networkId ? <code>{networkId}</code> : "—"}</dd>
        </div>
        <div>
          <dt>Primary party</dt>
          <dd>
            {primaryAccount?.partyId ? (
              <code>{primaryAccount.partyId}</code>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{connected ? "Connected" : "Not connected"}</dd>
        </div>
        <div>
          <dt>Canton Coin (Amulet)</dt>
          <dd>
            {!connected ? (
              "—"
            ) : balanceLoading ? (
              "Loading…"
            ) : balanceError ? (
              <span className="error">{balanceError}</span>
            ) : totalCc !== null ? (
              `${totalCc.toFixed(4)} CC`
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      {connected && totalCc !== null && !balanceError ? (
        <p className="note">Balance from connected wallet (CIP-0103 ledgerApi).</p>
      ) : null}
      {connected ? (
        <div className="row">
          <button type="button" disabled={balanceLoading} onClick={() => void refresh()}>
            Refresh balance
          </button>
        </div>
      ) : null}
      <div className="row">
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            type="button"
            onClick={() => void connectWallet(wallet.id)}
            disabled={busy || !ready}
          >
            {busy ? "Connecting…" : wallet.label}
          </button>
        ))}
        {connected ? (
          <button type="button" onClick={() => void disconnectWallet()} disabled={busy}>
            Disconnect
          </button>
        ) : null}
      </div>
      {gateway ? (
        <p className="note">
          Dev preset: Wallet Gateway at <code>{gateway}</code> (registered at startup).
        </p>
      ) : null}
      {presets.length > 0 ? (
        <ul>
          {presets.map((preset) => (
            <li key={preset.dappApiUrl}>
              Preset <code>{preset.label}</code>: <code>{preset.dappApiUrl}</code>
            </li>
          ))}
        </ul>
      ) : null}
      {!connected ? (
        <>
          <div className="fields">
            <label>
              Remote wallet label
              <input
                value={remoteLabel}
                onChange={(event) => setRemoteLabel(event.target.value)}
              />
            </label>
            <label className="wide">
              Remote dApp API base URL
              <input
                value={remoteUrl}
                onChange={(event) => setRemoteUrl(event.target.value)}
                placeholder="https://wallet.example.com/api/dapp/v1"
              />
            </label>
          </div>
          <div className="row">
            <button
              type="button"
              disabled={!remoteUrl.trim()}
              onClick={() => {
                registerRemoteWallet(remoteLabel, remoteUrl);
                setRemoteUrl("");
              }}
            >
              Add wallet
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
