import { expect, test, type Page } from "@playwright/test";
import {
  DOMAIN_ID,
  MEMBER_ID,
  SECOND_DOMAIN_ID,
  SECOND_MEMBER_ID,
  SUBMISSION_UUID,
  UPDATE_ID,
  memberFixture,
  mockPurchaseApis,
  pricedQuote,
  type MemberFixture,
  type PurchaseApiOptions,
} from "./network";
import { installFakeWallet, type FakeWalletOptions } from "./wallet";

const approvedWallet: FakeWalletOptions = {
  decision: "approve",
  balanceCc: 10_000,
};

async function openBuy(
  page: Page,
  members: MemberFixture[],
  wallet: FakeWalletOptions = approvedWallet,
  apis: PurchaseApiOptions = {},
) {
  await installFakeWallet(page.context(), wallet);
  await mockPurchaseApis(page, members, apis);
  await page.goto("/buy");
  await expect(page.getByRole("button", { name: "Find" })).toBeEnabled();
}

async function findValidator(page: Page, query: string) {
  await page.getByLabel("Validator ID or account").fill(query);
  await page.getByRole("button", { name: "Find" }).click();
}

async function connectWallet(page: Page) {
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect wallet" });
  const wallet = dialog.getByRole("button", { name: "Playwright wallet" });
  await expect(wallet).toBeEnabled();
  await expect(dialog.getByLabel("Wallet API URL")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Add a wallet" }).click();
  await expect(dialog.getByLabel("Wallet API URL")).toBeVisible();
  await wallet.click();
  await expect(page.locator("header").getByRole("button", { name: /alice::1220/ })).toBeVisible();
}

function main(page: Page) {
  return page.locator("#main");
}

async function quoteOneMegabyte(page: Page) {
  await findValidator(page, MEMBER_ID);
  await expect(main(page).getByText("One validator found.")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Traffic in bytes").fill("1000000");
  await expect(page.getByLabel("Traffic in bytes")).toHaveValue("1,000,000");
  await expect(main(page).getByText("600.00 CC")).toBeVisible();
  await expect(main(page).getByText("60.00 USD", { exact: true })).toBeVisible();
}

test("approved purchase credits traffic", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await expect(main(page).getByText(/^Balance /)).toHaveCount(0);
  await expect(page.locator("header").getByText("10,000.00 CC")).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(main(page).getByText("Minimum", { exact: true })).toHaveCount(0);
  await expect(main(page).getByText("12.00 USD (200,000 bytes)")).toHaveCount(0);
  await expect(main(page).getByText("You send")).toBeVisible();
  await expect(main(page).getByText("From wallet")).toBeVisible();
  await expect(main(page).getByText("To validator")).toBeVisible();
  await expect(main(page).getByText("alice::1220…34ef")).toBeVisible();
  await expect(main(page).getByText(MEMBER_ID).first()).toBeVisible();
  await expect(main(page).getByText("Network", { exact: true })).toHaveCount(0);
  await expect(main(page).getByText(DOMAIN_ID)).toHaveCount(0);
  await expect(main(page).getByText("alice::1220abcd1234ef")).toHaveCount(0);
  await expect(
    main(page).getByText("Token Standard receiver is not configured."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Legacy BuyMemberTraffic" }).click();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("heading", { name: "Traffic credited" })).toBeVisible();
  const receiptLink = main(page).getByRole("link", { name: UPDATE_ID });
  await expect(receiptLink).toBeVisible();
  await expect(receiptLink).toHaveAttribute(
    "href",
    `https://lighthouse.cantonloop.com/transactions/${UPDATE_ID}`,
  );

  const prepared = await page.evaluate(
    () =>
      (window as Window & { __playwrightLastPrepare?: { commands?: unknown } })
        .__playwrightLastPrepare,
  );
  expect(JSON.stringify(prepared)).toContain("AmuletRules_BuyMemberTraffic");

  await page.getByRole("button", { name: "Buy again" }).click();
  await expect(page.getByRole("heading", { name: "Validator" })).toBeVisible();
});

test("rejected signature returns to a declined screen", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)], {
    decision: "reject",
    balanceCc: 10_000,
  });
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Legacy BuyMemberTraffic" }).click();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("heading", { name: "Not approved" })).toBeVisible();
  await expect(main(page).getByText("Transaction failed")).toBeVisible();
  await page.getByRole("button", { name: "Back to review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
});

test("the countdown blocks buying until the next CC price and keeps the traffic amount", async ({ page }) => {
  const start = new Date("2026-11-24T15:00:00.000Z").getTime();
  const currentQuote = pricedQuote({
    now: start,
    price: 0.1,
    contractId: "cid-round",
    validForMs: 70_000,
  });
  const nextQuote = pricedQuote({
    now: start + 60_000,
    price: 0.2,
    contractId: "cid-round-next",
    validForMs: 10 * 60 * 1000,
  });
  let released = false;
  await page.clock.install({ time: start });
  await openBuy(page, [memberFixture(MEMBER_ID)], approvedWallet, {
    quote: () => (released ? nextQuote : currentQuote),
    openRoundContractId: () => (released ? "cid-round-next" : "cid-round"),
  });
  await quoteOneMegabyte(page);
  await expect(page.locator("[data-quote-state='ready']")).toBeVisible();

  await page.clock.fastForward(15_000);
  await expect(page.locator("[data-quote-state='warning']")).toBeVisible();
  await expect(main(page).getByText("This CC price updates in under a minute.")).toBeVisible();

  await page.clock.fastForward(45_000);
  await expect(page.locator("[data-quote-state='blocked']")).toBeVisible();
  await expect(main(page).getByText("Buying is paused until the next CC price.")).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Waiting for CC price…" })).toBeDisabled();

  released = true;
  await page.clock.fastForward(3_000);
  await expect(page.locator("[data-quote-state='ready']")).toBeVisible();
  await expect(page.getByLabel("Traffic in bytes")).toHaveValue("1,000,000");
  await expect(main(page).getByText("300.00 CC", { exact: true })).toBeVisible();
  await expect(main(page).locator("[data-cc-refresh='1']")).toHaveText("300.00 CC");
  await expect(main(page).getByText(/Price updated to/)).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "Connect wallet" })).toBeEnabled();
});

test("a new price shows while buying stays paused, then resumes", async ({ page }) => {
  const start = new Date("2026-11-24T15:00:00.000Z").getTime();
  const currentQuote = pricedQuote({
    now: start,
    price: 0.1,
    contractId: "cid-round",
    validForMs: 20_000,
  });
  const pausedQuote = pricedQuote({
    now: start + 12_000,
    price: 0.2,
    contractId: "cid-round-next",
    validForMs: 4_000,
  });
  const resumedQuote = pricedQuote({
    now: start + 16_000,
    price: 0.2,
    contractId: "cid-round-next",
    validForMs: 10 * 60 * 1000,
  });
  let stage: "current" | "paused" | "resumed" = "current";
  await page.clock.install({ time: start });
  await openBuy(page, [memberFixture(MEMBER_ID)], approvedWallet, {
    quote: () => {
      if (stage === "paused") return pausedQuote;
      if (stage === "resumed") return resumedQuote;
      return currentQuote;
    },
  });
  await quoteOneMegabyte(page);
  await page.clock.fastForward(12_000);
  await expect(main(page).getByRole("button", { name: "Waiting for CC price…" })).toBeDisabled();

  stage = "paused";
  await page.clock.fastForward(3_000);
  await expect(main(page).getByText("300.00 CC", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Traffic in bytes")).toHaveValue("1,000,000");
  await expect(main(page).getByRole("button", { name: "Waiting for CC price…" })).toBeDisabled();

  stage = "resumed";
  await page.clock.fastForward(3_000);
  await expect(page.locator("[data-quote-state='ready']")).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Connect wallet" })).toBeEnabled();
});

test("reload returns to the amount step with the same traffic", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await quoteOneMegabyte(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
  await expect(page.getByLabel("Traffic in bytes")).toHaveValue("1,000,000");
  await expect(main(page).getByText("600.00 CC", { exact: true })).toBeVisible();
});

test("reload returns to review with the same traffic", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(main(page).getByText("600.00 CC", { exact: true })).toBeVisible();
  await expect(main(page).getByText("1,000,000 bytes")).toBeVisible();
  await expect(main(page).getByText(MEMBER_ID).first()).toBeVisible();
});

test("a new round keeps the chosen traffic in traffic, USD, and CC modes", async ({ page }) => {
  let nextRound = false;
  await openBuy(page, [memberFixture(MEMBER_ID)], approvedWallet, {
    quote: () =>
      nextRound
        ? pricedQuote({ price: 0.2, contractId: "cid-round-next" })
        : pricedQuote({ price: 0.1, contractId: "cid-round" }),
    openRoundContractId: () => (nextRound ? "cid-round-next" : "cid-round"),
  });
  await findValidator(page, MEMBER_ID);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Traffic in bytes").fill("1000000");
  await expect(main(page).getByText("600.00 CC")).toBeVisible();
  await page.getByRole("button", { name: "CC", exact: true }).click();
  await expect(page.getByLabel("Budget in CC")).toHaveValue("600.00");
  await expect(main(page).getByText("1 MB")).toBeVisible();

  await connectWallet(page);
  nextRound = true;
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
  await expect(page.getByLabel("Budget in CC")).toHaveValue("300.00");
  await expect(main(page).getByText("1 MB")).toBeVisible();
  await expect(main(page).locator("[data-cc-refresh='1']")).toHaveText("300.00 CC");
  await expect(main(page).getByText(/Price updated to/)).toHaveCount(0);

  await page.getByRole("button", { name: "USD", exact: true }).click();
  await expect(page.getByLabel("Budget in USD")).toHaveValue("60.00");
  await expect(main(page).getByText("1 MB")).toBeVisible();
  await page.getByRole("button", { name: "Traffic", exact: true }).click();
  await expect(page.getByLabel("Traffic in bytes")).toHaveValue("1,000,000");
  await expect(main(page).getByText("300.00 CC", { exact: true })).toBeVisible();
});

test("missing quote timing blocks the purchase", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)], approvedWallet, {
    quote: {
      snapshotId: "untimed",
      quotedAt: new Date().toISOString(),
      validUntil: null,
      round: null,
    },
  });
  await findValidator(page, MEMBER_ID);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(main(page).getByText("Quote timing is unavailable.")).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Waiting for CC price…" })).toBeDisabled();
});

test("confirm shows a changed CC price instead of submitting it", async ({ page }) => {
  let nextRound = false;
  await openBuy(page, [memberFixture(MEMBER_ID)], approvedWallet, {
    quote: () =>
      nextRound
        ? pricedQuote({ price: 0.2, contractId: "cid-round-next" })
        : pricedQuote({ price: 0.1, contractId: "cid-round" }),
    openRoundContractId: () => (nextRound ? "cid-round-next" : "cid-round"),
  });
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Legacy BuyMemberTraffic" }).click();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();
  await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeEnabled();

  nextRound = true;
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(main(page).getByText("300.00 CC", { exact: true })).toBeVisible();
  await expect(main(page).getByText("1,000,000 bytes")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Traffic credited" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeEnabled();

  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("heading", { name: "Traffic credited" })).toBeVisible();
  await expect(main(page).getByText("300.00 CC", { exact: true })).toBeVisible();
  await expect(main(page).getByText("1,000,000 bytes")).toBeVisible();
});

test("a changed mining round returns to review without opening the wallet", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)], approvedWallet, {
    openRoundContractId: "cid-round-other",
  });
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Legacy BuyMemberTraffic" }).click();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(main(page).getByText("The CC price changed. Review the updated amount.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not approved" })).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: "Waiting for CC price…" })).toBeDisabled();
});

test("a quote under the minimum stays unchanged and blocks review", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await findValidator(page, MEMBER_ID);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("Traffic in bytes")).toHaveValue("200,000");
  await connectWallet(page);
  await page.getByLabel("Traffic in bytes").fill("1000");
  await expect(page.getByLabel("Traffic in bytes")).toHaveValue("1,000");
  await expect(main(page).getByText("Minimum is 200,000 bytes.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review" })).toBeDisabled();
  await page.getByLabel("Traffic in bytes").fill("");
  await expect(page.getByRole("button", { name: "Review" })).toBeDisabled();
});

test("two validators require a choice before continue", async ({ page }) => {
  await openBuy(page, [
    memberFixture(MEMBER_ID),
    memberFixture(SECOND_MEMBER_ID),
  ]);
  await findValidator(page, "operator::example");
  await expect(
    main(page).getByText(
      "This account is linked to more than one validator. Choose one.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await page.getByRole("radio", { name: SECOND_MEMBER_ID }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
});

test("a short balance blocks review and names the shortfall", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)], {
    decision: "approve",
    balanceCc: 1,
  });
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await expect(main(page).getByText("Need 599.00 CC more.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review" })).toBeDisabled();
});

test("an unknown validator stays on the target step", async ({ page }) => {
  await openBuy(page, []);
  await findValidator(page, "PAR::missing");
  await expect(main(page).getByText("No validator found.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("a token-standard purchase submits TransferFactory_Transfer", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)], approvedWallet, {
    path: "token-standard",
  });
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(main(page).getByText(/Token Standard transfer/)).toHaveCount(0);
  await expect(main(page).getByText(/transfer-factory/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Purchase path" })).toBeVisible();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Token transfer" }).click();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("heading", { name: "Traffic credited" })).toBeVisible();

  const prepared = await page.evaluate(
    () =>
      (window as Window & { __playwrightLastPrepare?: { commands?: unknown } })
        .__playwrightLastPrepare,
  );
  const payload = JSON.stringify(prepared);
  expect(payload).toContain("TransferFactory_Transfer");
  expect(payload).toContain("cid-amulet-playwright");
  expect(payload).toContain("splice/memo:");
  expect(payload).toContain(`synchronizer-id=${DOMAIN_ID}`);
  expect(payload).not.toContain("%3A");
  expect(payload).toContain("splice_traffic-manager");
  expect(payload).not.toContain("AmuletRules_BuyMemberTraffic");
});

test("a validator with no traffic left cannot continue", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID, 0)]);
  await findValidator(page, MEMBER_ID);
  await expect(
    main(page).getByText("This validator has no traffic left to submit."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("price estimates explain Canton's protocol CC/USD rate on hover and click", async ({
  page,
}) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await quoteOneMegabyte(page);

  await expect(main(page).getByText("est.", { exact: true }).first()).toBeVisible();

  const rateInfoButton = main(page).getByRole("button", { name: "About the CC price" });
  await rateInfoButton.click();
  await expect(page.getByRole("tooltip")).toContainText("last 10 seconds");
  await page.keyboard.press("Escape");

  const amountInfoButton = main(page).getByRole("button", {
    name: "About price estimates",
  });
  await expect(amountInfoButton).toBeVisible();

  await amountInfoButton.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Super Validator votes");
  await expect(tooltip).toContainText("open mining round");

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);

  await amountInfoButton.click();
  await expect(tooltip).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);

  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();

  const reviewInfoButton = main(page).getByRole("button", {
    name: "About price estimates",
  });
  await expect(reviewInfoButton).toBeVisible();
  await reviewInfoButton.click();
  await expect(page.getByRole("tooltip")).toBeVisible();
});

test("submission UUID resolves to the ledger update id on the receipt", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)], {
    decision: "approve",
    balanceCc: 10_000,
    reportedUpdateId: SUBMISSION_UUID,
    resolvedUpdateId: UPDATE_ID,
  });
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Legacy BuyMemberTraffic" }).click();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("heading", { name: "Traffic credited" })).toBeVisible();
  const receiptLink = main(page).getByRole("link", { name: UPDATE_ID });
  await expect(receiptLink).toBeVisible();
  await expect(main(page).getByText(SUBMISSION_UUID)).toHaveCount(0);
});

test("USD and CC amount modes convert to traffic and carry through to review", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await findValidator(page, MEMBER_ID);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "USD", exact: true }).click();
  await page.getByLabel("Budget in USD").fill("60");
  await expect(main(page).getByText("1 MB")).toBeVisible();

  await page.getByRole("button", { name: "CC", exact: true }).click();
  await expect(page.getByLabel("Budget in CC")).toHaveValue("600.00");
  await page.getByLabel("Budget in CC").fill("1200");
  await expect(main(page).getByText("2 MB")).toBeVisible();

  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(main(page).getByText("1,200.00 CC")).toBeVisible();
  await expect(main(page).getByText("2 MB")).toBeVisible();
  await expect(main(page).getByText("2,000,000 bytes")).toBeVisible();
});

test("confirm requires both terms and jurisdiction checkboxes", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Legacy BuyMemberTraffic" }).click();

  const confirm = page.getByRole("button", { name: "Confirm in wallet" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await expect(confirm).toBeDisabled();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();
  await expect(confirm).toBeEnabled();
});

test("review blocks confirm when the refreshed quote fails", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Legacy BuyMemberTraffic" }).click();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();

  await page.route("**/api/quote", async (route) => {
    await route.fulfill({
      status: 502,
      json: { ok: false, error: "Upstream Scan unavailable" },
    });
  });

  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(main(page).getByText("Upstream Scan unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeDisabled();
});

test("switching network clears the previous validator lookup", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)], approvedWallet, {
    quote: {
      domainIds: [DOMAIN_ID, SECOND_DOMAIN_ID],
      defaultDomainId: DOMAIN_ID,
    },
  });
  await findValidator(page, MEMBER_ID);
  await expect(main(page).getByText("One validator found.")).toBeVisible();
  await page.getByRole("button", { name: "Network" }).click();
  await page.getByRole("option", { name: SECOND_DOMAIN_ID }).click();
  await expect(main(page).getByText("One validator found.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("disconnected wallet network shows a warning and blocks confirm", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)], {
    decision: "approve",
    balanceCc: 10_000,
    networkConnected: false,
  });
  await quoteOneMegabyte(page);
  await connectWallet(page);
  await expect(
    main(page).getByText("Wallet is not connected to a Canton network (synchronizer offline)."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Purchase path" }).click();
  await page.getByRole("option", { name: "Legacy BuyMemberTraffic" }).click();
  await page.getByRole("checkbox", { name: "I agree to the Terms" }).check();
  await page.getByRole("checkbox", { name: "I may buy traffic in my jurisdiction." }).check();
  await expect(page.getByRole("button", { name: "Confirm in wallet" })).toBeDisabled();
});

test("an added wallet stays after reload and can be removed", async ({ page }) => {
  await openBuy(page, [memberFixture(MEMBER_ID)]);
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  const dialog = page.getByRole("dialog", { name: "Connect wallet" });
  await dialog.getByRole("button", { name: "Add a wallet" }).click();
  await dialog.getByLabel("Wallet label").fill("Vala");
  await dialog.getByLabel("Wallet API URL").fill("https://dev.vala-wallet.cc/api/dapp/v1");
  await dialog.getByRole("button", { name: "Add wallet" }).click();
  const valaName = /^Vala\s+https:\/\/dev\.vala-wallet\.cc\/api\/dapp\/v1$/;
  await expect(dialog.getByRole("button", { name: valaName })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove Vala" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Remove Playwright wallet" })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Find" })).toBeEnabled();
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  const reopened = page.getByRole("dialog", { name: "Connect wallet" });
  await expect(reopened.getByRole("button", { name: valaName })).toBeVisible();
  await expect(reopened.getByText("https://dev.vala-wallet.cc/api/dapp/v1")).toBeVisible();

  await reopened.getByRole("button", { name: "Remove Vala" }).click();
  await expect(reopened.getByRole("button", { name: /Vala/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "Find" })).toBeEnabled();
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  const cleared = page.getByRole("dialog", { name: "Connect wallet" });
  await expect(cleared.getByRole("button", { name: "Playwright wallet" })).toBeVisible();
  await expect(cleared.getByRole("button", { name: /Vala/ })).toHaveCount(0);
});

test("lookup errors show the cleaned Scan error name", async ({ page }) => {
  await openBuy(page, [], approvedWallet, {
    lookupError: {
      status: 400,
      error:
        'Scan 400 on /v0/domains/x/members/PAR%3A%3A/traffic-status: { "error": "Could not decode member ID: Invalid member" }',
    },
  });
  await findValidator(page, "PAR::");
  await expect(main(page).getByText("Could not decode member ID")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});
