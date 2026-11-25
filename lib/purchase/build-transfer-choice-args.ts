import {
  AMULET_INSTRUMENT_ID,
  SPLICE_TRANSFER_MEMO_KEY,
  defaultExecuteBeforeIso,
  defaultRequestedAtIso,
  formatCcAmount,
} from "@/lib/purchase/token-standard-constants";

export type TransferFactoryChoiceArguments = {
  expectedAdmin: string;
  transfer: {
    sender: string;
    receiver: string;
    amount: string;
    instrumentId: { admin: string; id: string };
    requestedAt: string;
    executeBefore: string;
    inputHoldingCids: string[];
    meta: { values: Record<string, string> };
  };
  extraArgs: {
    context: { values: Record<string, unknown> };
    meta: { values: Record<string, string> };
  };
};

export function buildTransferChoiceArguments(input: {
  senderPartyId: string;
  receiverPartyId: string;
  ccAmount: number;
  instrumentAdmin: string;
  inputHoldingCids: string[];
  memo: string;
  instrumentId?: string;
  executeBeforeIso?: string;
}): TransferFactoryChoiceArguments {
  const amount = formatCcAmount(input.ccAmount);
  const memo = input.memo.trim();
  const metaValues: Record<string, string> = {};
  if (memo) {
    metaValues.memo = memo;
    metaValues[SPLICE_TRANSFER_MEMO_KEY] = memo;
  }
  return {
    expectedAdmin: input.instrumentAdmin,
    transfer: {
      sender: input.senderPartyId,
      receiver: input.receiverPartyId,
      amount,
      instrumentId: {
        admin: input.instrumentAdmin,
        id: input.instrumentId ?? AMULET_INSTRUMENT_ID,
      },
      requestedAt: defaultRequestedAtIso(),
      executeBefore: input.executeBeforeIso ?? defaultExecuteBeforeIso(),
      inputHoldingCids: input.inputHoldingCids,
      meta: { values: metaValues },
    },
    extraArgs: {
      context: { values: {} },
      meta: { values: {} },
    },
  };
}
