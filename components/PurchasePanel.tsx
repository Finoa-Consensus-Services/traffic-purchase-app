"use client";

import { useState } from "react";
import { purchaseMinBytes, type TrafficRates } from "@/lib/pricing";
import { formatInsufficientAmuletBalance } from "@/lib/purchase/amulet-ledger";
import { PathMenu } from "@/components/buy/PathMenu";
import { PriceEstimateInfo } from "@/components/buy/PriceEstimateInfo";
import { useTrafficPurchase } from "@/hooks/useTrafficPurchase";
import { uiErrorName } from "@/lib/ui-error-name";

type Props = {
  domainId: string;
  memberId: string | null;
  rates: TrafficRates;
  minTopupBytes: number;
  onPurchased?: () => void;
};

export function PurchasePanel({
  domainId,
  memberId,
  rates,
  minTopupBytes,
  onPurchased,
}: Props) {
  const minimum = purchaseMinBytes(minTopupBytes);
  const [bytes, setBytes] = useState(String(minimum));
  const purchase = useTrafficPurchase({
    domainId,
    memberId,
    rates,
    bytes,
    onPurchased,
  });

  return (
    <section className="panel">
      <h2>Purchase traffic</h2>
      <p className="note">
        Signs a traffic purchase through your connected CIP-0103 wallet (
        <code>prepareExecute</code>). Prefer{" "}
        <code>TransferFactory_Transfer</code> when the registry and receiver
        party are configured; otherwise{" "}
        <code>AmuletRules_BuyMemberTraffic</code>.
      </p>
      {purchase.contextError ? <p className="error">{uiErrorName(purchase.contextError)}</p> : null}
      {purchase.pathError ? <p className="error">{uiErrorName(purchase.pathError)}</p> : null}
      {!purchase.connection?.isConnected ? (
        <p className="note">Connect a wallet to purchase traffic.</p>
      ) : null}
      {purchase.connection?.isConnected && purchase.connection.isNetworkConnected === false ? (
        <p className="error">
          Wallet is not connected to a Canton network (
          {purchase.connection.networkReason ?? "network unavailable"}).
        </p>
      ) : null}
      <div className="fields">
        <PathMenu value={purchase.pathMode} onChange={purchase.setPathMode} />
        <label>
          Traffic bytes
          <input
            value={bytes}
            onChange={(event) => setBytes(event.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>
      {purchase.pathStatus ? (
        <p className="note">
          Network path: <strong>{purchase.pathLabel}</strong>. {purchase.pathStatus.detail}
          {purchase.pathStatus.receiverPartyId ? (
            <>
              {" "}
              Receiver: <code>{purchase.pathStatus.receiverPartyId}</code>
            </>
          ) : null}
          {purchase.pathStatus.transferFactoryPathUsed ? (
            <>
              {" "}
              Factory route: <code>{purchase.pathStatus.transferFactoryPathUsed}</code>
            </>
          ) : null}
        </p>
      ) : null}
      {purchase.pathStatus?.transferFactoryProbeError ? (
        <p className="error">{uiErrorName(purchase.pathStatus.transferFactoryProbeError)}</p>
      ) : null}
      {purchase.connection?.isConnected ? (
        <dl className="facts">
          <div>
            <dt>Wallet balance</dt>
            <dd>
              {purchase.balanceLoading
                ? "Loading…"
                : purchase.balanceError
                  ? purchase.balanceError
                  : purchase.totalCc !== null
                    ? `${purchase.totalCc.toFixed(4)} CC`
                    : "—"}
            </dd>
          </div>
        </dl>
      ) : null}
      {purchase.priced ? (
        <dl className="facts">
          <div>
            <dt>CC to burn</dt>
            <dd className="inline-flex items-baseline gap-1.5">
              <span>{purchase.priced.cc.toFixed(6)}</span>
              <PriceEstimateInfo align="start" />
            </dd>
          </div>
          <div>
            <dt>USD estimate</dt>
            <dd className="inline-flex items-baseline gap-1.5">
              <span>{purchase.priced.usd.toFixed(4)}</span>
              <PriceEstimateInfo showEst={false} align="start" />
            </dd>
          </div>
          {purchase.resolvedPath === "token-standard" && purchase.effectiveBytes !== null ? (
            <div>
              <dt>Effective bytes (TS)</dt>
              <dd>{purchase.effectiveBytes.toLocaleString()} (rounded down from CC burn)</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {purchase.insufficientBalance && purchase.priced && purchase.totalCc !== null ? (
        <p className="error">
          {formatInsufficientAmuletBalance(purchase.totalCc, purchase.priced.cc)}
        </p>
      ) : null}
      {purchase.priced?.belowMinimum ? (
        <p className="error">Below purchase minimum ({minimum} bytes).</p>
      ) : null}
      {!memberId ? <p className="note">Look up a validator member before purchasing.</p> : null}
      {purchase.resolvedPath === "token-standard" &&
      purchase.pathMode === "token-standard" &&
      !purchase.pathStatus?.transferFactoryAvailable ? (
        <p className="error">
          Forced Token Standard but transfer-factory probe failed (see message above).
          Check TRANSFER_REGISTRY_BASE_URL and connect a wallet for probing.
          The receiver defaults to the reserved splice_traffic-manager party.
        </p>
      ) : null}
      {purchase.submitError ? <p className="error">{uiErrorName(purchase.submitError)}</p> : null}
      {purchase.phase ? <p className="note">{purchase.phase}</p> : null}
      <div className="row">
        <button
          type="button"
          disabled={!purchase.canPurchase || purchase.busy}
          onClick={() => void purchase.onPurchase()}
        >
          {purchase.busy ? "Purchasing…" : `Purchase traffic (${purchase.pathLabel})`}
        </button>
      </div>
    </section>
  );
}
