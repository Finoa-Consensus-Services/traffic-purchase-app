import { NextResponse } from "next/server";
import {
  findLoopDataPurchaseUpdateId,
  type LoopDataPurchase,
} from "@/lib/server/loop-data-confirmation";

export const dynamic = "force-dynamic";

type ConfirmationBody = Partial<Record<keyof LoopDataPurchase, unknown>>;

const readString = (value: unknown, maxLength: number): string | null =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maxLength
    ? value.trim()
    : null;

export async function POST(request: Request) {
  let body: ConfirmationBody;
  try {
    body = (await request.json()) as ConfirmationBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  const senderPartyId = readString(body.senderPartyId, 512);
  const receiverPartyId = readString(body.receiverPartyId, 512);
  const amount = readString(body.amount, 128);
  const memo = readString(body.memo, 2_048);
  const submittedAfter = readString(body.submittedAfter, 64);
  const rawInputHoldingCids = body.inputHoldingCids;
  const rawInputHoldingCount = Array.isArray(rawInputHoldingCids)
    ? rawInputHoldingCids.length
    : -1;
  const inputHoldingCids = Array.isArray(rawInputHoldingCids)
    ? rawInputHoldingCids.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0 && value.length <= 512,
      )
    : null;
  const submittedAt = submittedAfter ? Date.parse(submittedAfter) : NaN;
  const now = Date.now();

  if (
    !senderPartyId ||
    !receiverPartyId ||
    !amount ||
    !/^\d+(?:\.\d+)?$/.test(amount) ||
    !memo ||
    !memo.startsWith("splice/memo:") ||
    !submittedAfter ||
    !Number.isFinite(submittedAt) ||
    submittedAt < now - 15 * 60_000 ||
    submittedAt > now + 60_000 ||
    !inputHoldingCids ||
    inputHoldingCids.length === 0 ||
    inputHoldingCids.length > 50 ||
    inputHoldingCids.length !== rawInputHoldingCount
  ) {
    return NextResponse.json(
      { ok: false, error: "A complete Token Standard transfer is required." },
      { status: 400 },
    );
  }

  try {
    const updateId = await findLoopDataPurchaseUpdateId(
      {
        senderPartyId,
        receiverPartyId,
        amount,
        memo,
        inputHoldingCids,
        submittedAfter,
      },
      { signal: request.signal },
    );
    return NextResponse.json(
      { ok: true, updateId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Confirmation lookup failed.",
      },
      { status: 502 },
    );
  }
}
