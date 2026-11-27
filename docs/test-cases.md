# Test Cases & Expected Results

This document describes the automated test suites in `traffic-purchase-app`, what each category covers, and the expected outcomes.

## Test Suites Overview

| Suite | Command | Runner | Files | Test Cases | Runs in CI |
| --- | --- | --- | ---: | ---: | --- |
| Unit & API route tests | `npm test` | `tsx --test` (`node:test`) | 56 | 193 | Yes (every push / PR) |
| Browser E2E (mocked wallet & APIs) | `npm run test:e2e` | Playwright (`chromium`) | 1 | 30 | Yes (every push / PR) |

---

## 1. Unit Tests — Pricing, Rules & Formatting (`lib/*.test.ts`)

### Pricing (`lib/pricing.test.ts` — 10 cases)
| Test Case | Expected Result |
| --- | --- |
| 1 MB conversion with proposal formula | `1,000,000` bytes at `$60/MB` and `$0.10/CC` quotes `$60` USD and `600` CC with `belowMinimum: false`. |
| Below network minimum flagging | `199,999` bytes sets `belowMinimum: true`. |
| App purchase minimum floor | `DEFAULT_PURCHASE_MIN_BYTES` is `200,000`; `purchaseMinBytes()` returns `max(networkMin, 200,000)`, falling back to `200,000` for non-finite or `0` values. |
| Lower execution CC price credit | Quoting at `$0.07661` and executing at `$0.076337` credits `199,287` bytes for `200,000` requested and `209,251` bytes for `210,000` requested. |
| USD / CC round-trip inversion | `quoteFromUsd` and `quoteFromCc` invert back to the original byte count within `1e-6`. |
| `$12` network minimum check | `minimumPurchaseUsd` returns `12`; `coversMinimumPurchaseUsd` returns `true` at `200,000` bytes (`$12`) and within the `$0.005` rounding tolerance (`199,920` bytes), and `false` below it (`199,900` / `199,285` bytes). |
| `trafficBytesFromCc` floor rounding | Exact (`600 CC -> 1,000,000`) and fractional (`600.00005 CC -> 1,000,000`, `157.54 CC @ $0.076172 -> 200,002`) results always floor to whole bytes. |
| Invalid `creditedTrafficBytes` inputs | Throws `/positive/` for `<= 0` or `NaN` byte count or CC prices. |

### Scan Rules & Mining Rounds (`lib/rules.test.ts` — 13 cases)
| Test Case | Expected Result |
| --- | --- |
| Config schedule selection | Picks the latest `futureValues` entry whose timestamp has arrived (supports `{ _1, _2 }`, `{ time, value }`, and `[time, value]` tuple entries); falls back to `initialValue` when all future entries are later. |
| Fee parsing & validation | Reads `extraTrafficPrice` or `trafficPrice`, `minTopupAmount`, `baseRateTrafficLimits.burstAmount`, and `activeSynchronizer`; throws on non-objects, missing fees, non-positive price, or missing minimum. |
| Mining round parsing (`readRound`) | Parses object (`{ number }`), numeric, and string round IDs; reads `tickDuration.microseconds`; throws `/no amulet price/` when `amuletPrice <= 0`; treats a non-positive tick as missing. |
| Open mining round selection | Prefers rounds open at `now` with the highest round number; honors a requested `synchronizerId`; throws naming the synchronizer if none exist on it; supports array and keyed-object round maps; falls back to highest round number if all rounds are closed. |
| Open amulet prices (`listOpenAmuletPrices`) | Returns open-round prices sorted oldest-round first, excluding closed rounds and returning `[]` on invalid input. |

### Scan Client & Contract Normalization (`lib/scan.test.ts`, `lib/scan-contract.test.ts` — 7 cases)
| Test Case | Expected Result |
| --- | --- |
| Scan URL & proxy detection | Strips trailing slashes; `isScanProxy()` returns `true` only when URL contains `/scan-proxy`. |
| Bearer precedence & headers | `bearerFrom()` prefers `x-scan-token` over `SCAN_BEARER_TOKEN`; `scanGet`/`scanPost` attach `Authorization: Bearer …` without double-prefixing existing `Bearer ` tokens. |
| Scan error mapping | Maps 401 to proxy-bearer vs public IP-allowlist guidance, HTML responses to refusal errors, and invalid JSON to `ScanError` with `/non-JSON/`. |
| Disclosed contract normalization | Unwraps `.contract`, accepts both `snake_case` and `camelCase` fields, decodes percent-encoded `synchronizerId`, falls back to caller's synchronizer ID, and returns `null` when required fields are missing. |

### Formatting, Validation, Links & Errors (`lib/amount-format.test.ts`, `lib/coin.test.ts`, `lib/devnet-banner.test.ts`, `lib/holdings.test.ts`, `lib/jurisdiction.test.ts`, `lib/lighthouse.test.ts`, `lib/local-preview.test.ts`, `lib/ui-error-name.test.ts`, `lib/validator/normalize-member-id.test.ts` — 17 cases)
| Module | Expected Result |
| --- | --- |
| `amount-format` | Groups thousands while preserving typed decimals, strips leading zeros and non-numeric chars, parses grouped strings (returning `NaN` for invalid/`Infinity`), and formats `CC` and `USD` to 2 decimals. |
| `coin` | Parses high-precision Scan decimal strings accurately (`"235169.4182689366"`, `"0.0000000000"`). |
| `devnet-banner` | Enables the Devnet banner when `APP_NETWORK=devnet` or a devnet `NEXT_PUBLIC_APP_ORIGIN` is configured, respects explicit `APP_NETWORK=mainnet` overrides, and defaults to `false` when unset. |
| `holdings` | Prefers `total_available_coin`, exposes `unlocked`/`locked`/`asOfRound`, and returns zeroed summary when Scan returns no rows. |
| `jurisdiction` | `purchaseConfirmReady` returns `true` only when both `termsAccepted` and `jurisdictionConfirmed` are `true`. |
| `lighthouse` | Routes mainnet to `lighthouse.cantonloop.com`, `.test.`/`testnet` to `lighthouse.testnet.cantonloop.com`, `.dev.`/`devnet` to `lighthouse.devnet.cantonloop.com`, and URL-encodes the update ID. |
| `local-preview` | `isWalletUrl` accepts `http://` and `https://` URLs and rejects `javascript:`, `ftp:`, non-URL strings, and empty strings. |
| `ui-error-name` | Extracts short error names from JSON `{ "error": "Name: detail" }` bodies, handles plain Scan dumps (`"Scan 502 on ..."`), returns `"ScanError"` on empty dumps, and preserves plain messages. |
| `normalize-member-id` | Prefixes bare participant IDs with `PAR::`, leaves `PAR::` and `MED::` unchanged, and distinguishes member prefixes from party IDs. |

---

## 2. Unit Tests — Wallet / CIP-0103 dApp Layer (`lib/dapp/*.test.ts` — 40 cases)

| File | Scenarios Covered | Expected Result |
| --- | --- | --- |
| `errors.test.ts` (4) | CIP-0103 provider errors (`userRejectedRequest`, `unauthorized`, `unsupportedMethod`, `disconnected`, `chainDisconnected`), RPC errors (`transactionRejected`, `resourceUnavailable`), `LOCAL_VERDICT_INACTIVE_CONTRACTS`, non-object errors, `messageForTxFailure`, `isUnsupportedWalletOperation` code + keyword checks. | Returns user-friendly copy for every known error code/pattern; identifies unsupported operations by code or message (`unknown choice`, `transferfactory`, `not support`) without false positives on user rejection. |
| `normalize.test.ts` (1) | Single wallet, array, `null`/`undefined`, primary vs non-primary selection. | Normalizes to array (`[]` for nullish) and picks `primary: true`, falling back to first entry or `null`. |
| `tx-match.test.ts` (7) | Exact `commandId` match, single mismatched `executed` event, multiple ambiguous `executed` events, mismatched `failed` event, non-terminal events (`pending`), `watchTransaction` listener attachment/timeout/cancel cleanup, blocked popup URL capture (`trackPopupOpen`). | Exact `commandId` wins; single mismatched `executed` matches while mismatched `failed` and ambiguous pairs return `null`; timeout and `cancel()` both reject and detach listeners; blocked popups emit the assigned approval URL. |
| `transactions.test.ts` (10) | `submitPrepareExecute` sync-capable (`browser`) `prepareExecuteAndWait` success/failure/throw fallback to `prepareExecute` + `txChanged`; a Vala result that carries an update id without `status`; PartyLayer's receipt finishing the purchase without a second wallet request; Loop Data remaining available when PartyLayer does not report an update; `txChanged` or an independently confirmed ledger result arriving while the wallet callback remains open; `remote` provider skipping sync path; `prepareExecute` rejection cleaning up listeners with no unhandled promise rejection; timeout returning `timedOut: true`; missing provider error; `submitPrepareExecuteWithLegacyFallback` retrying legacy only on unsupported errors (never on user rejection). | Returns `{ ok: true, commandId, updateId }` from the PartyLayer receipt first, then from the wallet callback, and from Loop Data only when neither reports the update. |
| `loop-cip103-adapter.test.ts` (5) | Native Loop capability declaration, CIP-0103 connection, Loop `canton:devnet` mapped to PartyLayer `canton:da-devnet`, unrestricted `ledger-end` forwarding, and one-step `prepareExecuteAndWait`. | Replaces PartyLayer's legacy Loop adapter without adding a wallet entry, omits unsupported separate signing, accepts Loop's Devnet id, and returns only a real executed update. |
| `party-layer-provider.test.ts` (2) | Object with `request`, `on`, and `removeListener`. Listing wallets on the beta channel. | Accepts a CIP-0103 provider surface and rejects incomplete objects. Announced extensions stay in the list beside the beta catalog. |
| `party-layer-receipt.test.ts` (3) | A submitted PartyLayer receipt that carries an update id, a Vala result nested under `tx.payload`, and a rejected status. | Reads the ledger update from PartyLayer's own receipt and ignores a rejected status. |
| `ledger-response.test.ts` (4) | Direct ledger-end offset, PartyLayer `response` JSON envelope, active-contract rows inside that envelope, and a payload with no offset. | Balance and contract reads use the same ledger object whether the wallet returns it directly or inside PartyLayer's response string. |
| `saved-wallets.test.ts` (4) | Store and reload a wallet URL, replace the same URL including a trailing slash, drop invalid entries and broken JSON, remove one saved wallet. | User-added wallets persist in `localStorage` under `traffic-purchase-saved-wallets` and can be removed without affecting the rest of the list. |

---

## 3. Unit Tests — Traffic Purchase Pipeline (`lib/purchase/*.test.ts` — 78 cases)

| File | Scenarios Covered | Expected Result |
| --- | --- | --- |
| `amulet-ledger.test.ts` (9) | Holding V1/V2 interface views, legacy `initialAmount`, ACS JSON fixture parsing, active vs expired locks, non-Amulet instrument skipping (`USDC`), ACS request-body fallback when earlier queries fail, largest-UTXO-first selection (`selectInputAmuletCids`), insufficient/empty balance errors, legacy template preference (`listLegacyInputAmuletHoldings`), and `assertInputAmuletCidsActive`. | Holding-interface rows sum unlocked Amulet only and skip an unexpired lock. Legacy template rows are preferred for the legacy input list and are not passed through that lock check. Selection takes the fewest largest UTXOs covering `minCc`, throws on an empty or short balance, and `assertInputAmuletCidsActive` rejects a spent or archived input cid. |
| `build-token-standard-transfer.test.ts` (3) | V1 `TransferFactory_Transfer` command construction, decoding percent-encoded `synchronizer-id` in memo and command fields, V2 `TransferInstructionV2` (`actors` instead of `expectedAdmin`). | Emits single `ExerciseCommand` with disclosed contracts, raw unencoded synchronizer IDs everywhere, and correct V1/V2 template IDs and choice arguments. |
| `build-traffic-purchase.test.ts` (3) | Dispatcher for `token-standard` (missing context throws, valid context emits `TransferFactory_Transfer`) and `legacy` (normalizes bare `memberId` to `PAR::` and emits `AmuletRules_BuyMemberTraffic`). | Routes cleanly to the requested path and enforces required Token Standard context. |
| `buy-member-traffic.test.ts` (4) | Single `ExerciseCommand` (`AmuletRules_BuyMemberTraffic`), rejecting `0`/`-1`/`1.5`/`NaN` traffic amounts, decoding percent-encoded synchronizer IDs, `buildBuyMemberTrafficPrepareExecute` applying fee buffer (`100 CC -> 107 CC` input minimum) and verifying active inputs. | Produces valid legacy command with disclosed `AmuletRules` + `OpenMiningRound`, raw synchronizer IDs, and fee-buffered active UTXOs. |
| `fetch-external-party-config.test.ts` (4) | Parsing external-party config fixture, falling back to open-round `amuletPrice` or returning `null` when absent, `parseOpenMiningRoundPricingSnapshot`, `fetchPricingSnapshot` fallback from external-party 404 to `AmuletRules`, and scan-proxy `GET` endpoint routing. | Selects external-party config when available, derives `validUntil` from `opensAt + tickDuration`, leaves `validUntil` null when the tick duration is non-positive, and switches to `GET` endpoints on scan-proxy. |
| `quote-validity.test.ts` (4) | `opensAt + tickDuration` validity, missing or malformed timing, ready/warning/blocked/expired boundaries, submission gate without a round contract, and countdown copy. | The CC quote expires one tick after its round opens, blocks submission for the final 10 seconds, and fails closed when timing is unusable. |
| `buy-draft.test.ts` (3) | Saving and reloading the buy step, mapping an in-flight purchase back to Review, and ignoring broken JSON. | A browser refresh can reopen the same step, network, validator, and traffic amount. |
| `fetch-scan-context.test.ts` (3) | Rejecting scan-proxy with `404 ScanError`, assembling disclosed contracts / `migrationId` / `dsoPartyId` (including `party_id` fallback), rejecting synchronizer mismatches and missing blobs/migration/DSO fields. | Guarantees disclosed contracts match the requested synchronizer before returning `PurchaseContext`. |
| `fetch-transfer-factory.test.ts` (4) | Unconfigured registry (`404 ScanError`), V1 `404` falling back to V2 with `actors` payload and V2 `interfaceId`, a `401` ScanError aborting without a V2 retry (only `404` and `405` continue to the next path; this test asserts `401`, not `500`), network errors wrapped as `502 ScanError`, non-JSON rejection. | Handles V1/V2 registry negotiation accurately without hiding auth or server errors. |
| `ledger-update-id.test.ts` (7) | Distinguishing submission UUIDs from `1220...` ledger update IDs, `needsLedgerUpdateLookup` for UUIDs/empty/nullish values, `completionUpdateId` matching `commandId` or `submissionId` (and ignoring non-`1220` IDs), `readLedgerEndOffset` (numeric/string/nested/missing), `resolveSubmittedUpdateId` short-circuiting real update IDs, retrying transient errors, and returning `null` when exhausted. | Avoids unnecessary ledger calls for real `1220...` IDs and reliably resolves submission UUIDs to Lighthouse-indexable ledger update IDs. |
| `legacy-input-buffer.test.ts` (2) | Fee slack calculation (`100 -> 107`, `350 -> 357`, `1000 -> 1020`) and rejecting `<= 0` / non-finite inputs. | Adds `max(7, 2%)` CC fee slack for legacy inputs and throws on invalid amounts. |
| `memo.test.ts` (5) | Keeping `:` unencoded in member and synchronizer IDs, decoding URL-copied synchronizer IDs, optional `forfeit-validator-reward-coupon`, escaping `&`/`=`/`%`, and `memoWithRawSynchronizerId`. | Produces exact `splice/memo:...` strings accepted by Splice without percent-encoding colons. |
| `network-info.test.ts` (4) | Parsing `sv.migration_id`, rejecting missing/non-integer/string IDs, `NETWORK_INFO_URL` override, `fetchMigrationId` success/HTTP 503/non-JSON errors. | Returns integer migration ID or throws descriptive errors. |
| `parse-transfer-factory-response.test.ts` (2) | Valid response parsing + filtering incomplete disclosed contracts, rejecting non-objects / missing `factoryId` / missing `choiceContext` / empty `disclosedContracts`. | Ensures downstream transaction building always receives a factory ID and at least one disclosed contract. |
| `paths.test.ts`, `probe-receiver.test.ts`, `traffic-receiver.test.ts` (6) | Reserved `splice_traffic-manager` receiver default, `TRAFFIC_PURCHASE_RECEIVER_PARTY_ID` override, `detectPurchasePath` configured vs not-configured. | Defaults to reserved Splice receiver (`source: "reserved"`), respects env override (`source: "env"`), and falls back to `legacy` when unconfigured. |
| `public-purchase-inputs.test.ts` (1) | Caching DSO, synchronizer, and migration ID across calls and invalidating via `resetPublicPurchaseInputsCacheForTests()`. | Issues 2 upstream fetches on cold load, 0 on cached hit, and 2 again after reset. |
| `registry-reference.test.ts` (2) | Extracting `dso` and `activeSynchronizer` from `AmuletRules` `debugPayload`, rejecting missing `choiceContext` or missing debug fields. | Returns `{ dsoPartyId, synchronizerId }` or throws on incomplete registry responses. |
| `resolve-purchase-path.test.ts` (3) | Successful probe enabling `token-standard`, missing probe sender falling back to `legacy` with guidance, synchronizer mismatch or HTTP `400` probe error falling back to `legacy`. | Reports `tokenStandardAvailable: true` only when receiver, synchronizer, and transfer-factory probe all succeed. |
| `synchronizer-id.test.ts` (2) | Trimming whitespace, single and double percent-decoding (`%3A`, `%253A`), and leaving malformed `%ZZ` escapes intact. | Always yields canonical raw synchronizer strings without throwing on invalid escapes. |
| `token-standard-constants.test.ts` (2) | `formatCcAmount` trimming trailing zeros and rejecting `<= 0` / non-finite values; `defaultRequestedAtIso` (past) and `defaultExecuteBeforeIso` (future). | Emits clean decimal strings and valid time windows for Token Standard transfers. |
| `transfer-factory-paths.test.ts` (3) | Public Scan without registry env (`null` / `[]`), `TRANSFER_REGISTRY_BASE_URL` returning V1 + V2 paths, `SCAN_TRANSFER_FACTORY_PATH` override, scan-proxy base fallback, and `transferFactoryRequestUrl` throwing when unconfigured. | Never mistakes `/api/scan` for a registry base; builds exact registry request URLs. |
| `wait-for-purchase-confirmation.test.ts` (2) | Posting the exact reviewed Token Standard transfer and accepting a returned `1220...` update id. Reading that transfer back from the submitted `TransferFactory_Transfer` command. | Lets an accepted purchase finish when the wallet callback remains open, using the command the wallet received. |

---

## 4. Unit Tests — Server Auth, Confirmation & Local Fixtures (`lib/server/*.test.ts` — 13 cases)

| File | Scenarios Covered | Expected Result |
| --- | --- | --- |
| `registry-auth.test.ts` (7) | Static `REGISTRY_BEARER_TOKEN`, Keycloak `client_credentials` token fetch + in-memory cache reuse, public Scan needing no bearer, scan-proxy requiring auth (503 when unset), `SCAN_BEARER_TOKEN` fallback without duplicating `Bearer `, `REGISTRY_REQUIRE_AUTH` (`true`/`false`) overrides, Keycloak error mapping (`401`, `500 -> 502`, non-JSON, missing `access_token`). | Returns the right `Authorization` header strictly on server-side rules and reuses a Keycloak token until 60 seconds before expiry (`REFRESH_SKEW_MS`). |
| `loop-data-confirmation.test.ts` (4) | Sender/receiver/amount/memo correlation, accepting a different input coin for that same transfer, rejecting a different memo or amount, and Devnet/configured Loop Data base URLs. | Uses the accepted transaction only when it is the transfer reviewed by the user. |
| `ui-fixtures.test.ts` (2) | `uiFixturesEnabled` gate (`UI_FIXTURES=1` allowed only when `NODE_ENV !== "production"`), `fixtureLookup` preserving `PAR::`/`MED::` IDs and defaulting party queries to `PAR::local-preview`. | Prevents mock fixtures from ever activating in production builds. |

---

## 5. API Route Unit Tests (`app/api/**/route.test.ts` — 15 cases)

| Route | Scenarios Covered | Expected Result |
| --- | --- | --- |
| `POST /api/lookup` (4) | Scan-proxy rejection (`404`), malformed JSON & missing `query`/`domainId` (`400`), direct `PAR::` traffic status lookup with `availableBytes` clamped at `0`, party lookup resolving up to `8` participants (`404` if empty), propagating `ScanError` status (`400`). | Validates inputs strictly, returns normalized member traffic summaries, and propagates upstream Scan status codes. |
| `POST /api/purchase/transfer-context` (3) | Invalid JSON / missing required fields / `ccAmount <= 0` (`400`), normalizing bare `memberId` (`1220bare -> PAR::1220bare`), filtering non-string/empty `inputHoldingCids`, building unencoded memo and `choiceArguments`, and returning `502` on synchronizer mismatch. | Returns `{ ok: true, memo, migrationId, transferFactory, choiceArguments }` or appropriate `400`/`502` JSON errors. |
| `GET /api/purchase-context` (2) | Propagating `404` on scan-proxy; returning local fixture context when `UI_FIXTURES=1` in non-production. | Blocks unsupported scan-proxy calls cleanly and serves local fixtures in dev. |
| `GET /api/purchase/path-status` (1) | Forwarding `x-probe-sender` header and `synchronizerId` query parameter to `resolvePurchasePath`. | Returns `{ ok: true, path: "token-standard", tokenStandardAvailable: true }` using the supplied sender party. |
| `POST /api/purchase/confirmation` (2) | Rejecting an incomplete transfer and returning the Loop Data update id for an exact match. | Never marks Processing complete from a loosely related transaction. |
| `GET /api/quote` (2) | Returning local fixture quote when `UI_FIXTURES=1`, including `quotedAt`, `validUntil`, and the local round contract; propagating upstream `ScanError` status (`401`) with `proxy` flag. | Returns a timed quote schema or upstream error status. |
| `GET /api/pricing` (1) | Mapping upstream Scan `503` failures into `{ ok: false, proxy: false }` with status `503`. | Preserves upstream HTTP failure status. |

---

## 6. Browser E2E Tests (`e2e/buy.spec.ts` — 30 cases)

Runs against the local Next.js app (`http://localhost:3107/buy`) with `APP_NETWORK=devnet`, using a mocked CIP-0103 browser extension wallet (`e2e/wallet.ts`) and mocked `/api/**` routes (`e2e/network.ts`). Devnet opens PartyLayer first. The current wallet list stays under **Other connection methods**.

| # | Test Case | Expected Result |
| ---: | --- | --- |
| 1 | Approved purchase credits traffic | Completes validator lookup -> 1 MB quote (`600.00 CC` / `60.00 USD`) -> wallet connect (balance stays in the header only) -> Review (no minimum row) -> Legacy `AmuletRules_BuyMemberTraffic` submit -> **Traffic credited** receipt with clickable Lighthouse link (`https://lighthouse.cantonloop.com/transactions/<1220...>`) -> **Buy again** returns to Validator step. |
| 2 | Rejected signature returns to a declined screen | Failed wallet execution opens **Not approved** (`Transaction failed`); **Back to review** returns to Review. |
| 3 | PartyLayer connect buys traffic | **Connect Wallet** opens the PartyLayer window while **Playwright wallet** stays hidden. Connecting it there and confirming the legacy purchase reaches **Traffic credited**. |
| 4 | Wallet request declined with CIP-0103 4001 | `prepareExecute` returns code `4001`. **Not approved** shows `You declined the request in your wallet.` |
| 5 | Unsupported wallet method CIP-0103 4200 | `prepareExecute` returns code `4200`. **Not approved** shows `This wallet does not support that operation.` |
| 6 | Disconnect clears the connected party | Disconnect returns the header to **Connect wallet**. The current wallet list stays collapsed. |
| 7 | Countdown blocks buying until the next CC price | A mocked clock takes the quote from ready to warning, then pauses buying for the final 10 seconds. The next round updates the price to `300.00 CC` while `1,000,000` bytes stay unchanged and buying resumes. |
| 8 | A new price shows during the pause, then resumes | After the pause, a newer CC price replaces the amount while buying stays paused. The following valid quote resumes buying without a reload. |
| 9 | Reload returns to Amount | Reloading on Amount reopens Amount with the same `1,000,000` bytes and `600.00 CC`. |
| 10 | Reload returns to Review | Reloading on Review reopens Review with the same traffic, CC amount, and validator. |
| 11 | New round keeps chosen traffic in all calculators | A CC-budget purchase stays at `1 MB` when the round price doubles. The CC field becomes `300.00`, USD stays `60.00`, and Traffic returns to `1,000,000` bytes. |
| 12 | Missing quote timing blocks the purchase | A quote without round timing shows `Quote timing is unavailable.` and disables buying. |
| 13 | Confirm shows a changed CC price instead of submitting it | Confirm fetches a new round, stays on Review at `300.00 CC` and `1,000,000` bytes, and submits only the second click after the new amount is visible. |
| 14 | Changed mining round returns to Review | When purchase context uses a different open-round contract, confirm shows `The CC price changed. Review the updated amount.` and does not open the wallet. |
| 15 | Under-minimum entry stays unchanged and blocks Review | Typing `1,000` bytes keeps that value, shows `Minimum is 200,000 bytes.`, and disables **Review**; clearing the input keeps **Review** disabled. |
| 16 | Two validators require a choice before continue | Multi-validator party lookup shows choice prompt and disables **Continue** until a radio option is selected. |
| 17 | Short balance blocks review and names the shortfall | Wallet with `1 CC` on a `600 CC` quote shows `Need 599.00 CC more.` and disables **Review**. |
| 18 | Unknown validator stays on target step | Empty lookup displays `No validator found.` and keeps **Continue** disabled. |
| 19 | Token-standard purchase submits `TransferFactory_Transfer` | Review hides the Token Standard transfer-factory ready sentence. Submits `TransferFactory_Transfer` with `cid-amulet-playwright`, raw `synchronizer-id=` memo (no `%3A`), `splice_traffic-manager` receiver, and no `AmuletRules_BuyMemberTraffic`, reaching **Traffic credited**. |
| 20 | Token-standard purchase completes when the wallet callback hangs | A wallet that submits but never answers `prepareExecuteAndWait` still reaches **Traffic credited** after Loop Data confirms the reviewed sender, receiver, amount, and memo. |
| 21 | Validator with no traffic left cannot continue | Member with `availableBytes: 0` shows `This validator has no traffic left to submit.` and disables **Continue**. |
| 22 | Price estimates explain Canton's protocol CC/USD rate on hover and click | On Amount and Review, the CC-price icon explains the 10-second pause, and `est.` tooltips reveal Canton's protocol CC/USD rate note on hover and stay open when toggled by click, closing on Escape. |
| 23 | Submission UUID resolves to ledger update ID on receipt | Wallet returning a submission UUID triggers `/v2/commands/completions`; receipt shows the resolved `1220...` Lighthouse link and hides the raw UUID. |
| 24 | USD and CC amount modes convert to traffic and carry through to review | Switching between `USD` (`$60 -> 1 MB`) and `CC` (`600.00 -> 1200 -> 2 MB`) carries `1,200.00 CC` and `2 MB` / `2,000,000 bytes` into Review. |
| 25 | Confirm requires both Terms and Jurisdiction checkboxes | **Confirm in wallet** stays disabled with 0 or 1 checkbox checked and enables only when both are checked. |
| 26 | Review blocks confirm when refreshed quote fails | When `/api/quote` fails (`502`) on confirm, displays `Upstream Scan unavailable`, stays on Review, and disables **Confirm in wallet**. |
| 27 | Switching network clears previous validator lookup | Selecting a second domain in **Network** clears prior validator results and disables **Continue**. |
| 28 | Disconnected wallet network shows warning and blocks confirm | Wallet with `isNetworkConnected: false` shows `Wallet is not connected to a Canton network (synchronizer offline).` and keeps **Confirm in wallet** disabled. |
| 29 | Added wallet persists and can be removed | A wallet added under **Other connection methods** is still listed after reload, shows a **Remove** control, and stays gone after that control is used and the page reloads. Discovered extension wallets have no remove control. |
| 30 | Lookup errors show cleaned Scan error name | Raw Scan `400` path/JSON error renders concisely as `Could not decode member ID` and keeps **Continue** disabled. |
