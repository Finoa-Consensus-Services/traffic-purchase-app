import assert from "node:assert/strict";
import test from "node:test";
import { uiErrorName } from "./ui-error-name";

test("uiErrorName keeps the Scan error name and drops the path and detail", () => {
  const message =
    'Scan 400 on /v0/domains/global-domain%3A%3A1220/members/PAR%3A%3A/traffic-status: { "error" : "Could not decode member ID: Invalid member \'PAR::\', expecting <three-letter-code>::id::fingerprint." }';
  assert.equal(uiErrorName(message), "Could not decode member ID");
});

test("uiErrorName keeps a short message that is already a name", () => {
  assert.equal(
    uiErrorName("The network quote is unavailable."),
    "The network quote is unavailable.",
  );
});

test("uiErrorName uses a JSON error code as the name", () => {
  assert.equal(
    uiErrorName('Scan 404 on /v0/x: { "error": "NOT_FOUND" }'),
    "NOT_FOUND",
  );
});

test("uiErrorName handles non-JSON Scan dumps and empty details", () => {
  assert.equal(
    uiErrorName("Scan 502 on /v0/x: Bad Gateway: upstream reset"),
    "Bad Gateway",
  );
  assert.equal(uiErrorName("Scan 500 on /v0/x: "), "ScanError");
  assert.equal(
    uiErrorName("Scan 502 on /v0/x: {not valid json"),
    "{not valid json",
  );
});
