import assert from "node:assert/strict";
import test from "node:test";
import { purchaseConfirmReady } from "./jurisdiction";

test("purchase confirm requires terms and a jurisdiction confirmation", () => {
  assert.equal(
    purchaseConfirmReady({ termsAccepted: false, jurisdictionConfirmed: false }),
    false,
  );
  assert.equal(
    purchaseConfirmReady({ termsAccepted: true, jurisdictionConfirmed: false }),
    false,
  );
  assert.equal(
    purchaseConfirmReady({ termsAccepted: false, jurisdictionConfirmed: true }),
    false,
  );
  assert.equal(
    purchaseConfirmReady({ termsAccepted: true, jurisdictionConfirmed: true }),
    true,
  );
});
