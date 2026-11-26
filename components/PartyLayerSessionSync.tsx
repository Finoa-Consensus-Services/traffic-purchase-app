"use client";

import { useEffect } from "react";
import { useAccount, usePartyLayer } from "@partylayer/react";
import { useDappContext } from "@/components/DappProvider";

export function PartyLayerSessionSync() {
  const client = usePartyLayer();
  const { isConnected } = useAccount();
  const { adoptPartyLayerProvider, releasePartyLayerProvider, registerPartyLayerDisconnect } =
    useDappContext();

  useEffect(() => {
    registerPartyLayerDisconnect(() => client.disconnect());
    return () => registerPartyLayerDisconnect(null);
  }, [client, registerPartyLayerDisconnect]);

  useEffect(() => {
    if (!isConnected) {
      releasePartyLayerProvider();
      return;
    }
    void adoptPartyLayerProvider(client.asProvider());
  }, [adoptPartyLayerProvider, client, isConnected, releasePartyLayerProvider]);

  return null;
}
