import type { Metadata } from "next";
import { FaqAccordion } from "@/components/site/FaqAccordion";
import { SiteFrame } from "@/components/site/SiteFrame";

export const metadata: Metadata = { title: "FAQ" };

const QUESTIONS = [
  {
    question: "What is this app for?",
    answer:
      "Validator Traffic is a non-custodial web interface for purchasing extra network traffic for a Canton validator using Canton Coin (CC) from your own wallet. Operators use it for routine traffic top-ups, to restore submission capacity when a validator has run out of traffic, or to add traffic when setting up a validator. The app only prepares unsigned transaction instructions. Your connected wallet handles signing and submission directly with the network.",
  },
  {
    question: "What am I paying for?",
    answer:
      "When you approve a transaction in your wallet, CC from your wallet is used directly on the Canton network to credit extra traffic to the validator you selected. This app is not a counterparty to the purchase, does not intermediate funds, and does not receive your CC. Once executed on the network, the transaction is final and irreversible. CC spent cannot be refunded, and the credited traffic remains permanently with that validator.",
  },
  {
    question: "Does this app hold my keys or submit transactions?",
    answer:
      "No. At no point does this app access, receive, store, or hold your private keys, signatures, or CC, nor does it sign or submit any transfer or transaction to the Canton network. You connect your own CIP-0103 wallet, and this app only constructs unsigned transaction parameters using public network data. Your wallet alone presents the transaction for your explicit approval, signs with your keys, and submits it to the network. This app also does not process card or fiat payments.",
  },
  {
    question: "How do I choose the validator?",
    answer:
      "Enter a participant ID (PAR::...) or a party ID. Because a single party can be hosted on more than one validator, select the exact validator that should receive the traffic. You are solely responsible for verifying the participant ID, network, and amount on the review screen and in your wallet before approving, as traffic credited to the wrong validator cannot be reversed or reassigned.",
  },
  {
    question: "How is the price set?",
    answer:
      "Extra traffic is priced by the Canton protocol in USD per megabyte and converted to CC using Canton's on-network CC/USD rate (the median of Super Validator votes recorded on the open mining round, not a market exchange rate). Displayed prices and byte amounts are non-binding estimates based on current public network data and may change if a new mining round opens before your wallet executes the transaction. Requests below the network's minimum top-up threshold are rejected by the network.",
  },
  {
    question: "What do I sign in the wallet?",
    answer:
      "By default, your wallet prompts you to approve a Canton Token Standard transfer naming the target validator and network so the network credits extra traffic to that validator. If needed, you can switch to the legacy BuyMemberTraffic flow before confirming. Nothing is signed or submitted until you explicitly approve it in your wallet. If you decline, no transaction is sent and no CC is spent.",
  },
] as const;

export default function FaqPage() {
  return (
    <SiteFrame>
      <main id="main" className="mx-auto w-[min(40rem,calc(100%-2rem))] py-12">
        <h1 className="text-[clamp(2.2rem,4vw,3.2rem)] leading-tight font-bold tracking-tight text-primary">
          FAQ
        </h1>
        <FaqAccordion items={QUESTIONS} />
      </main>
    </SiteFrame>
  );
}
