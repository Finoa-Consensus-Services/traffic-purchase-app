import type { Metadata } from "next";
import { SiteFrame } from "@/components/site/SiteFrame";

export const metadata: Metadata = { title: "Imprint" };

export default function ImprintPage() {
  return (
    <SiteFrame>
    <main id="main" className="mx-auto grid w-[min(40rem,calc(100%-2rem))] gap-6 py-12">
      <h1 className="text-[clamp(2.2rem,4vw,3.2rem)] leading-tight font-bold tracking-tight text-primary">
        Imprint
      </h1>
      <div className="grid gap-5 text-ink">
        <p>
          The app prepares a traffic purchase for you to sign in your own wallet.
          It does not hold CC, keys, or signatures, and it does not take a card payment.
        </p>
      </div>
    </main>
    </SiteFrame>
  );
}
