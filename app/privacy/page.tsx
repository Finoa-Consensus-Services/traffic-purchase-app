import type { Metadata } from "next";
import { SiteFrame } from "@/components/site/SiteFrame";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <SiteFrame>
    <main id="main" className="mx-auto grid w-[min(40rem,calc(100%-2rem))] gap-6 py-12">
      <h1 className="text-[clamp(2.2rem,4vw,3.2rem)] leading-tight font-bold tracking-tight text-primary">
        Privacy
      </h1>
      <div className="grid gap-5">
        <p>There is no account. The wallet connection stays with the wallet you choose.</p>
        <p>
          The app sends the validator id or party id you enter to Scan so it can price traffic and read traffic status.
          It does not store card numbers, KYC documents, or a copy of your keys.
        </p>
      </div>
    </main>
    </SiteFrame>
  );
}
