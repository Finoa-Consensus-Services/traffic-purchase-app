import assert from "node:assert/strict";
import test from "node:test";
import { fixtureLookup, uiFixturesEnabled } from "./ui-fixtures";

test("sample Scan answers are only for local development", () => {
  assert.equal(uiFixturesEnabled({ UI_FIXTURES: "1", NODE_ENV: "development" }), true);
  assert.equal(uiFixturesEnabled({ UI_FIXTURES: "1", NODE_ENV: "production" }), false);
  assert.equal(uiFixturesEnabled({ NODE_ENV: "development" }), false);
  assert.equal(uiFixturesEnabled({ UI_FIXTURES: "0", NODE_ENV: "development" }), false);
});

test("fixtureLookup keeps PAR/MED ids and defaults party queries to local preview", () => {
  assert.equal(fixtureLookup("PAR::custom").members[0]?.memberId, "PAR::custom");
  assert.equal(fixtureLookup("MED::mediator").members[0]?.memberId, "MED::mediator");
  assert.equal(fixtureLookup("alice::1220party").members[0]?.memberId, "PAR::local-preview");
});
