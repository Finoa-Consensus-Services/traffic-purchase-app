import assert from "node:assert/strict";
import test from "node:test";
import {
  formatQuoteCountdown,
  quoteAllowsSubmission,
  quoteClock,
  quoteStatusMessage,
  validUntilFromRound,
} from "./quote-validity";

test("quote validity ends one tick after the round opens", () => {
  assert.equal(
    validUntilFromRound({
      opensAt: "2026-01-01T00:00:00.000Z",
      tickDurationMicros: 600_000_000,
    }),
    "2026-01-01T00:10:00.000Z",
  );
  assert.equal(validUntilFromRound({ opensAt: null, tickDurationMicros: 600_000_000 }), null);
  assert.equal(
    validUntilFromRound({ opensAt: "2026-01-01T00:00:00.000Z", tickDurationMicros: 0 }),
    null,
  );
  assert.equal(
    validUntilFromRound({ opensAt: "not-a-time", tickDurationMicros: 600_000_000 }),
    null,
  );
});

test("quote clock moves from ready to warning, blocked, and expired", () => {
  const validUntil = "2026-01-01T00:10:00.000Z";
  const until = Date.parse(validUntil);
  assert.equal(quoteClock(validUntil, until - 60_001).state, "ready");
  assert.equal(quoteClock(validUntil, until - 60_000).state, "warning");
  assert.equal(quoteClock(validUntil, until - 10_001).state, "warning");
  assert.deepEqual(quoteClock(validUntil, until - 10_000), {
    state: "blocked",
    remainingMs: 10_000,
  });
  assert.equal(quoteClock(validUntil, until - 1).state, "blocked");
  assert.deepEqual(quoteClock(validUntil, until), { state: "expired", remainingMs: 0 });
  assert.equal(quoteClock(null, until).state, "invalid");
  assert.equal(quoteClock("not-a-time", until).state, "invalid");
});

test("submission stays closed without a round contract or inside the safety window", () => {
  const ready = quoteClock("2026-01-01T00:10:00.000Z", Date.parse("2026-01-01T00:00:00.000Z"));
  const blocked = quoteClock("2026-01-01T00:10:00.000Z", Date.parse("2026-01-01T00:09:55.000Z"));
  assert.equal(quoteAllowsSubmission(ready, "cid-round"), true);
  assert.equal(quoteAllowsSubmission(ready, null), false);
  assert.equal(quoteAllowsSubmission(ready, ""), false);
  assert.equal(quoteAllowsSubmission(blocked, "cid-round"), false);
  assert.equal(quoteAllowsSubmission(quoteClock(null, 0), "cid-round"), false);
});

test("countdown copy formats the remaining tick and the safety states", () => {
  assert.equal(formatQuoteCountdown("ready", 70_000), "1:10");
  assert.equal(formatQuoteCountdown("warning", 59_100), "1:00");
  assert.equal(formatQuoteCountdown("blocked", 10_000), "0:10");
  assert.equal(formatQuoteCountdown("ready", 3_600_000), "1:00:00");
  assert.equal(formatQuoteCountdown("expired", 0), "Updating");
  assert.equal(formatQuoteCountdown("invalid", null), "Unavailable");
  assert.equal(quoteStatusMessage("blocked"), "Buying is paused until the next CC price.");
  assert.equal(quoteStatusMessage("invalid"), "Quote timing is unavailable.");
  assert.equal(quoteStatusMessage("ready"), "");
});
