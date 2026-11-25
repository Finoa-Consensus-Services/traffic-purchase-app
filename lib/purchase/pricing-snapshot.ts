import type { TrafficFees } from "@/lib/rules";
import type { TrafficRates } from "@/lib/pricing";
import type { QuoteRound } from "@/lib/purchase/quote-validity";

export type PricingQuoteSource =
  | "external-party-config"
  | "open-mining-round";

export type PricingSnapshot = {
  quoteSource: PricingQuoteSource;
  snapshotId: string;
  rates: TrafficRates;
  quotedAt: string;
  fees: TrafficFees;
  round: QuoteRound | null;
  domainIds: string[];
  defaultDomainId: string | null;
};
