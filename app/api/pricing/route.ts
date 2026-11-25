import { NextResponse } from "next/server";
import { ScanError, bearerFrom, isScanProxy, scanBaseUrl } from "@/lib/scan";
import { fetchPricingSnapshot } from "@/lib/purchase/fetch-external-party-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = bearerFrom(request);
  try {
    const snapshot = await fetchPricingSnapshot(token);
    return NextResponse.json({
      ok: true,
      scanBaseUrl: scanBaseUrl(),
      proxy: isScanProxy(),
      ...snapshot,
    });
  } catch (error) {
    const status = error instanceof ScanError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Pricing failed";
    return NextResponse.json(
      { ok: false, error: message, proxy: isScanProxy() },
      { status },
    );
  }
}
