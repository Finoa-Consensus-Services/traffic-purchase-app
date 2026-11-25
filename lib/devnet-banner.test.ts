import assert from "node:assert/strict";
import test from "node:test";
import { devnetBannerEnabled } from "./devnet-banner";

test("the Devnet banner follows the deployment, not a local default", () => {
  assert.equal(devnetBannerEnabled({ APP_NETWORK: "devnet" }), true);
  assert.equal(devnetBannerEnabled({ APP_NETWORK: "mainnet" }), false);
  assert.equal(
    devnetBannerEnabled({ NEXT_PUBLIC_APP_ORIGIN: "https://devnet-app.trafficpurchase.cc" }),
    true,
  );
  assert.equal(
    devnetBannerEnabled({
      APP_NETWORK: "mainnet",
      NEXT_PUBLIC_APP_ORIGIN: "https://devnet-app.trafficpurchase.cc",
    }),
    false,
  );
  assert.equal(devnetBannerEnabled({}), false);
});
