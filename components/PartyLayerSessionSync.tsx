"use client";

import { useEffect } from "react";
import { useAccount, usePartyLayer } from "@partylayer/react";
import { useDappContext } from "@/components/DappProvider";
import {
  commandIdFromPartyLayerStatus,
  updateIdFromPartyLayerStatus,
} from "@/lib/dapp/party-layer-receipt";

export function PartyLayerSessionSync() {
  const client = usePartyLayer();
  const { isConnected } = useAccount();
  const {
    adoptPartyLayerProvider,
    releasePartyLayerProvider,
    registerPartyLayerDisconnect,
    registerPartyLayerSubmit,
  } = useDappContext();

  useEffect(() => {
    registerPartyLayerDisconnect(() => client.disconnect());
    return () => registerPartyLayerDisconnect(null);
  }, [client, registerPartyLayerDisconnect]);

  useEffect(() => {
    if (!isConnected) {
      registerPartyLayerSubmit(null);
      releasePartyLayerProvider();
      return;
    }
    registerPartyLayerSubmit((params) => client.submitTransaction({ signedTx: params }));
    void adoptPartyLayerProvider(client.asProvider());
    return () => registerPartyLayerSubmit(null);
  }, [
    adoptPartyLayerProvider,
    client,
    isConnected,
    registerPartyLayerSubmit,
    releasePartyLayerProvider,
  ]);

  useEffect(() => {
    if (!isConnected) return;
    return client.on("tx:status", (event) => {
      const updateId = updateIdFromPartyLayerStatus(event);
      if (!updateId) return;
      client.asProvider().emit("txChanged", {
        status: "executed",
        commandId: commandIdFromPartyLayerStatus(event) ?? updateId,
        payload: { updateId, completionOffset: 0 },
      });
    });
  }, [client, isConnected]);

  return null;
}
