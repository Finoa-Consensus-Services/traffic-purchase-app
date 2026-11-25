import { NextResponse } from "next/server";
import { fixtureQuote, uiFixturesEnabled } from "@/lib/server/ui-fixtures";
import { ScanError, bearerFrom, isScanProxy, scanBaseUrl } from "@/lib/scan";
import { fetchPricingSnapshot } from "@/lib/purchase/fetch-external-party-config";
import { probeTrafficPurchaseReceiver } from "@/lib/purchase/probe-receiver";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (uiFixturesEnabled()) {
    return NextResponse.json(fixtureQuote());
  }
  const token = bearerFrom(request);
  try {
    const snapshot = await fetchPricingSnapshot(token);
    const receiver = probeTrafficPurchaseReceiver();
    return NextResponse.json({
      ok: true,
      scanBaseUrl: scanBaseUrl(),
      proxy: isScanProxy(),
      fees: snapshot.fees,
      round: snapshot.round,
      domainIds: snapshot.domainIds,
      defaultDomainId: snapshot.defaultDomainId,
      quoteSource: snapshot.quoteSource,
      snapshotId: snapshot.snapshotId,
      quotedAt: snapshot.quotedAt,
      validUntil: snapshot.round?.validUntil ?? null,
      rates: snapshot.rates,
      receiver,
    });
  } catch (error) {
    const status = error instanceof ScanError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Quote failed";
    return NextResponse.json(
      { ok: false, error: message, proxy: isScanProxy() },
      { status },
    );
  }
}
