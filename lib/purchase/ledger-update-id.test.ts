import assert from "node:assert/strict";
import test from "node:test";
import {
  completionUpdateId,
  isLedgerUpdateId,
  needsLedgerUpdateLookup,
  readLedgerEndOffset,
  resolveSubmittedUpdateId,
} from "./ledger-update-id";

const SUBMISSION_ID = "008a1c33-21d3-40c8-aeba-ebd0039ed70d";
const UPDATE_ID =
  "1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";

test("a submission UUID is not a ledger update id", () => {
  assert.equal(isLedgerUpdateId(SUBMISSION_ID), false);
  assert.equal(needsLedgerUpdateLookup(SUBMISSION_ID), true);
  assert.equal(isLedgerUpdateId(UPDATE_ID), true);
  assert.equal(needsLedgerUpdateLookup(UPDATE_ID), false);
});

test("completionUpdateId reads the update id for the submitted command", () => {
  const response = [
    {
      completionResponse: {
        Completion: {
          value: {
            commandId: SUBMISSION_ID,
            submissionId: SUBMISSION_ID,
            updateId: UPDATE_ID,
          },
        },
      },
    },
  ];
  assert.equal(completionUpdateId(response, [SUBMISSION_ID]), UPDATE_ID);
  assert.equal(completionUpdateId(response, ["other-command"]), null);
});

test("resolveSubmittedUpdateId keeps a real update id without calling the ledger", async () => {
  let calls = 0;
  const resolved = await resolveSubmittedUpdateId(
    async () => {
      calls += 1;
      return {};
    },
    {
      partyId: "alice::party",
      commandOrSubmissionIds: [UPDATE_ID],
      beginExclusive: 1,
      reportedUpdateId: UPDATE_ID,
    },
  );
  assert.equal(resolved, UPDATE_ID);
  assert.equal(calls, 0);
});

test("resolveSubmittedUpdateId replaces a submission UUID with the completion update id", async () => {
  const resolved = await resolveSubmittedUpdateId(
    async () => [
      {
        completionResponse: {
          Completion: {
            value: {
              commandId: SUBMISSION_ID,
              updateId: UPDATE_ID,
            },
          },
        },
      },
    ],
    {
      partyId: "alice::party",
      commandOrSubmissionIds: [SUBMISSION_ID],
      beginExclusive: 4,
      reportedUpdateId: SUBMISSION_ID,
      attempts: 1,
    },
  );
  assert.equal(resolved, UPDATE_ID);
});

test("needsLedgerUpdateLookup handles empty/nullish values and completionUpdateId matches submissionId", () => {
  assert.equal(needsLedgerUpdateLookup(null), true);
  assert.equal(needsLedgerUpdateLookup(undefined), true);
  assert.equal(needsLedgerUpdateLookup("   "), true);

  const bySubmission = [
    {
      completionResponse: {
        Completion: {
          value: {
            commandId: "unrelated",
            submissionId: SUBMISSION_ID,
            updateId: UPDATE_ID,
          },
        },
      },
    },
  ];
  assert.equal(completionUpdateId(bySubmission, [SUBMISSION_ID]), UPDATE_ID);

  const nonMultihashUpdate = [
    {
      completionResponse: {
        Completion: {
          value: {
            commandId: SUBMISSION_ID,
            updateId: "not-a-1220-id",
          },
        },
      },
    },
  ];
  assert.equal(completionUpdateId(nonMultihashUpdate, [SUBMISSION_ID]), null);
});

test("readLedgerEndOffset parses numeric, string, and nested offsets and rejects missing", async () => {
  assert.equal(await readLedgerEndOffset(async () => ({ offset: 12 })), 12);
  assert.equal(await readLedgerEndOffset(async () => ({ Offset: "34" })), 34);
  assert.equal(
    await readLedgerEndOffset(async () => ({ ledgerEnd: { offset: "56" } })),
    56,
  );
  await assert.rejects(
    () => readLedgerEndOffset(async () => ({})),
    /did not return an offset/,
  );
});

test("resolveSubmittedUpdateId retries transient errors and returns null when exhausted", async () => {
  let calls = 0;
  const recovered = await resolveSubmittedUpdateId(
    async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("temporary network glitch");
      }
      return [
        {
          completionResponse: {
            Completion: {
              value: { commandId: SUBMISSION_ID, updateId: UPDATE_ID },
            },
          },
        },
      ];
    },
    {
      partyId: "alice::party",
      userId: "alice-user",
      commandOrSubmissionIds: [SUBMISSION_ID],
      beginExclusive: 1,
      reportedUpdateId: SUBMISSION_ID,
      attempts: 2,
    },
  );
  assert.equal(recovered, UPDATE_ID);
  assert.equal(calls, 2);

  const missing = await resolveSubmittedUpdateId(
    async () => [],
    {
      partyId: "alice::party",
      commandOrSubmissionIds: [SUBMISSION_ID],
      beginExclusive: 1,
      reportedUpdateId: SUBMISSION_ID,
      attempts: 1,
    },
  );
  assert.equal(missing, null);
});
