import type { Metadata } from "next";
import { SiteFrame } from "@/components/site/SiteFrame";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <SiteFrame>
    <main id="main" className="mx-auto grid w-[min(40rem,calc(100%-2rem))] gap-6 py-12">
      <h1 className="text-[clamp(2.2rem,4vw,3.2rem)] leading-tight font-bold tracking-tight text-primary">
        Terms
      </h1>
      <div className="grid gap-5 text-ink">
        <p>
          This app is a non-custodial reference client.
          You connect your own wallet and approve each purchase there. This app does not receive CC, keys, or signatures.
        </p>
        <p>
          CC spent on traffic does not come back. The traffic stays with the validator you chose.
          Check the validator id, network, and CC amount on the review screen before you sign.
        </p>
        <p>
          You confirm that buying traffic is allowed where you are. This app does not offer a card payment or an on-ramp.
          Fiat on-ramp terms are a later milestone.
        </p>
        <p>
          These terms describe how the reference app behaves. They are not a law-firm opinion.
        </p>
      </div>
    </main>
    </SiteFrame>
  );
}
