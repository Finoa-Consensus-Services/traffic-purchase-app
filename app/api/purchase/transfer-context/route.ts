import { NextResponse } from "next/server";
import { ScanError } from "@/lib/scan";
import { buildTransferChoiceArguments } from "@/lib/purchase/build-transfer-choice-args";
import { buildTrafficPurchaseMemo } from "@/lib/purchase/memo";
import { fetchTransferFactoryContextDetailed } from "@/lib/purchase/fetch-transfer-factory";
import { loadPublicPurchaseInputs } from "@/lib/purchase/public-purchase-inputs";
import { normalizeMemberId } from "@/lib/validator/normalize-member-id";

export const dynamic = "force-dynamic";

type TransferContextBody = {
  senderPartyId?: unknown;
  receiverPartyId?: unknown;
  memberId?: unknown;
  synchronizerId?: unknown;
  ccAmount?: unknown;
  inputHoldingCids?: unknown;
};

function readParty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readCcAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export async function POST(request: Request) {
  let body: TransferContextBody;
  try {
    body = (await request.json()) as TransferContextBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Body must be JSON" },
      { status: 400 },
    );
  }

  const senderPartyId = readParty(body.senderPartyId);
  const receiverPartyId = readParty(body.receiverPartyId);
  const memberIdRaw = readParty(body.memberId);
  const synchronizerIdOverride = readParty(body.synchronizerId);
  const ccAmount = readCcAmount(body.ccAmount);
  const inputHoldingCids = Array.isArray(body.inputHoldingCids)
    ? body.inputHoldingCids.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  if (!senderPartyId || !receiverPartyId || !memberIdRaw || !ccAmount) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "senderPartyId, receiverPartyId, memberId, and ccAmount are required.",
      },
      { status: 400 },
    );
  }

  const memberId = normalizeMemberId(memberIdRaw);

  try {
    const inputs = await loadPublicPurchaseInputs();
    if (
      synchronizerIdOverride &&
      synchronizerIdOverride !== inputs.synchronizerId
    ) {
      throw new Error(
        `Public registry synchronizer is ${inputs.synchronizerId}, not ${synchronizerIdOverride}.`,
      );
    }
    const synchronizerId = inputs.synchronizerId;
    const memo = buildTrafficPurchaseMemo({
      memberId,
      synchronizerId,
      migrationId: inputs.migrationId,
    });
    const choiceArguments = buildTransferChoiceArguments({
      senderPartyId,
      receiverPartyId,
      ccAmount,
      instrumentAdmin: inputs.dsoPartyId,
      inputHoldingCids,
      memo,
    });
    const fetched = await fetchTransferFactoryContextDetailed(
      choiceArguments,
      synchronizerId,
    );
    return NextResponse.json({
      ok: true,
      receiverPartyId,
      memo,
      synchronizerId,
      migrationId: inputs.migrationId,
      transferFactory: fetched.context,
      choiceArguments: fetched.choiceArguments,
    });
  } catch (error) {
    const status = error instanceof ScanError ? error.status : 502;
    const message =
      error instanceof Error ? error.message : "Transfer context failed";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
