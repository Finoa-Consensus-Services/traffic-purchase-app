import type { LedgerApiParams } from "@canton-network/dapp-sdk";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canton update ids are multihashes. A submission or command id is a UUID. */
export function isLedgerUpdateId(value: string): boolean {
  const id = value.trim();
  return id.startsWith("1220") && /^[0-9a-f]+$/i.test(id) && !UUID_PATTERN.test(id);
}

export function needsLedgerUpdateLookup(updateId: string | null | undefined): boolean {
  const id = updateId?.trim() ?? "";
  return id.length === 0 || UUID_PATTERN.test(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Pull the ledger update id for one of the submitted command or submission ids. */
export function completionUpdateId(payload: unknown, ids: string[]): string | null {
  const wanted = new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0));
  return visit(payload, wanted, 0);
}

function visit(node: unknown, wanted: Set<string>, depth: number): string | null {
  if (depth > 8 || node == null) {
    return null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = visit(item, wanted, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isRecord(node)) {
    return null;
  }
  const commandId = readString(node.commandId);
  const submissionId = readString(node.submissionId);
  const updateId = readString(node.updateId);
  const matches =
    (commandId !== null && wanted.has(commandId)) ||
    (submissionId !== null && wanted.has(submissionId));
  if (matches && updateId && isLedgerUpdateId(updateId)) {
    return updateId;
  }
  for (const key of ["Completion", "value", "completionResponse", "result"]) {
    if (key in node) {
      const found = visit(node[key], wanted, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

type LedgerCall = (params: LedgerApiParams) => Promise<unknown>;

export async function readLedgerEndOffset(ledgerApi: LedgerCall): Promise<number> {
  const result = await ledgerApi({
    requestMethod: "get",
    resource: "/v2/state/ledger-end",
  });
  const raw = isRecord(result)
    ? result.offset ??
      result.Offset ??
      (isRecord(result.ledgerEnd) ? result.ledgerEnd.offset : null)
    : null;
  const parsed =
    typeof raw === "string" ? parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error("Ledger did not return an offset");
  }
  return parsed;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Wallet updateId is the submission id. Lighthouse wants the ledger update id. */
export async function resolveSubmittedUpdateId(
  ledgerApi: LedgerCall,
  input: {
    partyId: string;
    userId?: string | null;
    commandOrSubmissionIds: string[];
    beginExclusive: number;
    reportedUpdateId?: string | null;
    attempts?: number;
  },
): Promise<string | null> {
  const reported = input.reportedUpdateId?.trim() ?? "";
  if (reported && isLedgerUpdateId(reported)) {
    return reported;
  }
  const ids = input.commandOrSubmissionIds;
  const attempts = input.attempts ?? 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await ledgerApi({
        requestMethod: "post",
        resource: "/v2/commands/completions",
        body: {
          ...(input.userId ? { userId: input.userId } : {}),
          parties: [input.partyId],
          beginExclusive: input.beginExclusive,
        },
        query: {
          limit: "100",
          stream_idle_timeout_ms: "500",
        },
      });
      const updateId = completionUpdateId(response, ids);
      if (updateId) {
        return updateId;
      }
    } catch {
      // The receipt can still show the command reference if completions are unavailable.
    }
    if (attempt + 1 < attempts) {
      await wait(400);
    }
  }
  return null;
}
