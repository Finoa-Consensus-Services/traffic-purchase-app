"use client";

import dynamic from "next/dynamic";

const Explorer = dynamic(
  () => import("@/components/Explorer").then((mod) => mod.Explorer),
  {
    ssr: false,
    loading: () => <p className="note">Loading app…</p>,
  },
);

/** Client-only shell so @canton-network/dapp-sdk never loads during SSR. */
export function ExplorerRoot() {
  return <Explorer />;
}
