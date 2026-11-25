export const BUY_DRAFT_KEY = "traffic-purchase-draft";

export type BuyDraftStep = "target" | "quote" | "review" | "rejected" | "complete";
export type BuyDraftMode = "bytes" | "usd" | "cc";

export type BuyDraftMember = {
  memberId: string;
  totalConsumed: number;
  totalLimit: number;
  totalPurchased: number;
  availableBytes: number;
};

export type BuyDraft = {
  step: BuyDraftStep;
  domainId: string;
  lookupQuery: string;
  members: BuyDraftMember[];
  selectedMemberId: string | null;
  mode: BuyDraftMode;
  rawAmount: string;
  requestedBytes: number | null;
};

type DraftStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const STEPS = new Set<BuyDraftStep>(["target", "quote", "review", "rejected", "complete"]);
const MODES = new Set<BuyDraftMode>(["bytes", "usd", "cc"]);

function isMember(value: unknown): value is BuyDraftMember {
  if (typeof value !== "object" || value === null) return false;
  const member = value as BuyDraftMember;
  return (
    typeof member.memberId === "string" &&
    Number.isFinite(member.totalConsumed) &&
    Number.isFinite(member.totalLimit) &&
    Number.isFinite(member.totalPurchased) &&
    Number.isFinite(member.availableBytes)
  );
}

export function buyDraftStep(step: string): BuyDraftStep {
  if (step === "processing") return "review";
  return STEPS.has(step as BuyDraftStep) ? (step as BuyDraftStep) : "target";
}

export function readBuyDraft(storage: DraftStorage | null): BuyDraft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BUY_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BuyDraft> & { step?: string };
    if (!parsed || typeof parsed.lookupQuery !== "string" || typeof parsed.domainId !== "string") {
      return null;
    }
    if (!parsed.step || !MODES.has(parsed.mode as BuyDraftMode)) return null;
    if (typeof parsed.rawAmount !== "string") return null;
    if (parsed.requestedBytes !== null && !Number.isFinite(parsed.requestedBytes)) return null;
    if (parsed.selectedMemberId !== null && typeof parsed.selectedMemberId !== "string") return null;
    if (!Array.isArray(parsed.members) || !parsed.members.every(isMember)) return null;
    return {
      step: buyDraftStep(parsed.step),
      domainId: parsed.domainId,
      lookupQuery: parsed.lookupQuery,
      members: parsed.members,
      selectedMemberId: parsed.selectedMemberId ?? null,
      mode: parsed.mode as BuyDraftMode,
      rawAmount: parsed.rawAmount,
      requestedBytes: parsed.requestedBytes ?? null,
    };
  } catch {
    return null;
  }
}

export function writeBuyDraft(draft: BuyDraft, storage: DraftStorage | null): void {
  storage?.setItem(BUY_DRAFT_KEY, JSON.stringify({ ...draft, step: buyDraftStep(draft.step) }));
}

function browserStorage(): DraftStorage | null {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

export function readBrowserBuyDraft(): BuyDraft | null {
  return readBuyDraft(browserStorage());
}

export function writeBrowserBuyDraft(draft: BuyDraft): void {
  writeBuyDraft(draft, browserStorage());
}
