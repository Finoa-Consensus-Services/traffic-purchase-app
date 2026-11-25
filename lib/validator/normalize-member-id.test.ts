import assert from "node:assert/strict";
import test from "node:test";
import { isMemberIdInput, normalizeMemberId } from "./normalize-member-id";

test("normalizeMemberId prefixes bare participant ids", () => {
  assert.equal(normalizeMemberId("1220abc"), "PAR::1220abc");
});

test("normalizeMemberId leaves PAR and MED prefixes", () => {
  assert.equal(normalizeMemberId("PAR::1220abc"), "PAR::1220abc");
  assert.equal(normalizeMemberId("MED::1220abc"), "MED::1220abc");
});

test("isMemberIdInput detects member prefixes", () => {
  assert.equal(isMemberIdInput("PAR::x"), true);
  assert.equal(isMemberIdInput("party::x"), false);
});
