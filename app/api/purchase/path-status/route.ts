import { NextResponse } from "next/server";
import { fixturePathStatus, uiFixturesEnabled } from "@/lib/server/ui-fixtures";
import { ScanError, bearerFrom, isScanProxy, scanBaseUrl } from "@/lib/scan";
import { resolvePurchasePath } from "@/lib/purchase/resolve-purchase-path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (uiFixturesEnabled()) {
    return NextResponse.json(fixturePathStatus());
  }
  const token = bearerFrom(request);
  const probeSender = request.headers.get("x-probe-sender")?.trim() || null;
  const synchronizerId = new URL(request.url).searchParams.get("synchronizerId");
  try {
    const pathStatus = await resolvePurchasePath(token, {
      probeSenderPartyId: probeSender,
      synchronizerId,
    });
    return NextResponse.json({
      ok: true,
      scanBaseUrl: scanBaseUrl(),
      proxy: isScanProxy(),
      ...pathStatus,
    });
  } catch (error) {
    const status = error instanceof ScanError ? error.status : 502;
    const message =
      error instanceof Error ? error.message : "Purchase path status failed";
    return NextResponse.json(
      { ok: false, error: message, proxy: isScanProxy() },
      { status },
    );
  }
}
