"use client";

import { WalletModal } from "@partylayer/react";

export function PartyLayerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return <WalletModal isOpen={open} onClose={onClose} />;
}
