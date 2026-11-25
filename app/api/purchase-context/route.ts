import { NextResponse } from "next/server";
import { fixturePurchaseContext, uiFixturesEnabled } from "@/lib/server/ui-fixtures";
import { ScanError, bearerFrom, scanBaseUrl } from "@/lib/scan";
import { fetchPurchaseContext } from "@/lib/purchase/fetch-scan-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (uiFixturesEnabled()) {
    return NextResponse.json(fixturePurchaseContext());
  }
  const token = bearerFrom(request);
  const synchronizerId = new URL(request.url).searchParams.get("synchronizerId");
  try {
    const context = await fetchPurchaseContext(token, { synchronizerId });
    return NextResponse.json({
      ok: true,
      scanBaseUrl: scanBaseUrl(),
      context,
    });
  } catch (error) {
    const status = error instanceof ScanError ? error.status : 502;
    const message =
      error instanceof Error ? error.message : "Purchase context failed";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
