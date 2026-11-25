import { NextResponse } from "next/server";
import { fixtureLookup, uiFixturesEnabled } from "@/lib/server/ui-fixtures";
import { ScanError, bearerFrom, isScanProxy, scanGet } from "@/lib/scan";
import {
  isMemberIdInput,
  normalizeMemberId,
} from "@/lib/validator/normalize-member-id";

export const dynamic = "force-dynamic";

type LookupBody = {
  query?: unknown;
  domainId?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function participantIds(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.participant_ids)) {
    throw new Error("Scan did not return participant ids");
  }
  return payload.participant_ids.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

function readTraffic(payload: unknown): {
  totalConsumed: number;
  totalLimit: number;
  totalPurchased: number;
  availableBytes: number;
} {
  if (!isRecord(payload) || !isRecord(payload.traffic_status)) {
    throw new Error("Scan did not return traffic status");
  }
  const status = payload.traffic_status;
  const actual = isRecord(status.actual) ? status.actual : null;
  const target = isRecord(status.target) ? status.target : null;
  if (!actual || !target) {
    throw new Error("Traffic status was missing actual or target counters");
  }
  const totalConsumed = Number(actual.total_consumed);
  const totalLimit = Number(actual.total_limit);
  const totalPurchased = Number(target.total_purchased);
  const availableBytes =
    Number.isFinite(totalLimit) && Number.isFinite(totalConsumed)
      ? Math.max(0, totalLimit - totalConsumed)
      : 0;
  return {
    totalConsumed,
    totalLimit,
    totalPurchased,
    availableBytes,
  };
}

async function trafficFor(domainId: string, memberId: string, token: string | undefined) {
  const payload = await scanGet(
    `/v0/domains/${encodeURIComponent(domainId)}/members/${encodeURIComponent(memberId)}/traffic-status`,
    token,
  );
  return { memberId, ...readTraffic(payload) };
}

export async function POST(request: Request) {
  if (isScanProxy()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This scan proxy publishes the price and ANS names. It does not publish participant lookup or member traffic status.",
      },
      { status: 404 },
    );
  }
  const token = bearerFrom(request);
  let body: LookupBody;
  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Lookup body must be JSON" },
      { status: 400 },
    );
  }
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const domainId = typeof body.domainId === "string" ? body.domainId.trim() : "";
  if (!query || !domainId) {
    return NextResponse.json(
      { ok: false, error: "Enter a participant or party id and a synchronizer id" },
      { status: 400 },
    );
  }
  if (uiFixturesEnabled()) {
    return NextResponse.json(fixtureLookup(query));
  }

  try {
    const memberIds = isMemberIdInput(query)
      ? [normalizeMemberId(query)]
      : participantIds(
          await scanGet(
            `/v1/domains/${encodeURIComponent(domainId)}/parties/${encodeURIComponent(query)}/participant-id`,
            token,
          ),
        );
    if (memberIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "That party is not hosted on a participant" },
        { status: 404 },
      );
    }
    const members = await Promise.all(
      memberIds.slice(0, 8).map((memberId) => trafficFor(domainId, memberId, token)),
    );
    return NextResponse.json({
      ok: true,
      inputKind: isMemberIdInput(query) ? "member" : "party",
      domainId,
      members,
    });
  } catch (error) {
    const status = error instanceof ScanError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Lookup failed";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
