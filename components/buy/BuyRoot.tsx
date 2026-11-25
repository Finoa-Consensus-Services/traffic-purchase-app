"use client";

import dynamic from "next/dynamic";

const BuyWizard = dynamic(
  () => import("@/components/buy/BuyWizard").then((mod) => mod.BuyWizard),
  {
    ssr: false,
    loading: () => <p className="px-6 pt-24 text-sm text-ink-muted">Loading app…</p>,
  },
);

/** Client-only shell so the wallet SDK never loads during SSR. */
export function BuyRoot() {
  return <BuyWizard />;
}
