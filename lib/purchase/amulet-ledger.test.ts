import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  amuletAmountFromContract,
  assertInputAmuletCidsActive,
  formatInsufficientAmuletBalance,
  HOLDING_INTERFACE_ID,
  listAmuletHoldings,
  listLegacyInputAmuletHoldings,
  selectInputAmuletCids,
  selectLegacyInputAmuletCids,
  totalAmuletBalanceCc,
} from "./amulet-ledger";

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));

test("amuletAmountFromContract reads holding interface view", () => {
  const amount = amuletAmountFromContract({
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId: "cid-1",
          interfaceViews: [
            {
              interfaceId: HOLDING_INTERFACE_ID,
              viewValue: {
                instrumentId: { admin: "dso", id: "Amulet" },
                amount: "12.5",
                lock: null,
              },
            },
          ],
        },
      },
    },
  });
  assert.equal(amount, 12.5);
});

test("amuletAmountFromContract reads legacy initialAmount", () => {
  const amount = amuletAmountFromContract({
    createdEvent: {
      templateId: "Splice.Amulet:Amulet",
      createArgument: {
        amount: { initialAmount: "3" },
      },
    },
  });
  assert.equal(amount, 3);
});

test("totalAmuletBalanceCc sums holdings", () => {
  const total = totalAmuletBalanceCc([
    { contractId: "a", amountCc: 1 },
    { contractId: "b", amountCc: 2.25 },
  ]);
  assert.equal(total, 3.25);
});

test("formatInsufficientAmuletBalance is readable", () => {
  const msg = formatInsufficientAmuletBalance(1.2, 3.456);
  assert.match(msg, /1\.2000 CC/);
  assert.match(msg, /3\.4560 CC/);
});

test("listAmuletHoldings queries Holding V2 and skips locked rows", async () => {
  const holdingV2 =
    "#splice-api-token-holding-v2:Splice.Api.Token.HoldingV2:Holding";
  const ledgerApi = async (params: {
    resource: string;
    body?: unknown;
  }): Promise<Record<string, unknown>> => {
    if (params.resource === "/v2/state/ledger-end") {
      return { offset: 50 };
    }
    if (
      params.resource === "/v2/state/active-contracts" &&
      JSON.stringify(params.body).includes(holdingV2)
    ) {
      return [
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: "locked-v2",
                interfaceViews: [
                  {
                    interfaceId: holdingV2,
                    viewValue: {
                      instrumentId: { admin: "dso", id: "Amulet" },
                      amount: "9",
                      lock: { expiresAt: "2999-01-01T00:00:00Z" },
                    },
                  },
                ],
              },
            },
          },
        },
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: "unlocked-v2",
                interfaceViews: [
                  {
                    interfaceId: holdingV2,
                    viewValue: {
                      instrumentId: { admin: "dso", id: "Amulet" },
                      amount: "4",
                      lock: null,
                    },
                  },
                ],
              },
            },
          },
        },
      ] as unknown as Record<string, unknown>;
    }
    return [] as unknown as Record<string, unknown>;
  };
  const holdings = await listAmuletHoldings(ledgerApi, "cip103::1220fixture");
  assert.deepEqual(
    holdings.map((row) => row.contractId),
    ["unlocked-v2"],
  );
  assert.equal(holdings[0]?.amountCc, 4);
});

test("listAmuletHoldings parses v2 holding-interface ACS fixture", async () => {
  const raw = await readFile(
    path.join(fixtureDir, "fixtures/acs-holding-amulet.json"),
    "utf8",
  );
  const fixture = JSON.parse(raw) as unknown;
  const ledgerApi = async (params: {
    resource: string;
  }): Promise<Record<string, unknown>> => {
    if (params.resource === "/v2/state/ledger-end") {
      return { offset: 12345 };
    }
    if (params.resource === "/v2/state/active-contracts") {
      return fixture as Record<string, unknown>;
    }
    throw new Error(`unexpected ledger resource: ${params.resource}`);
  };
  const holdings = await listAmuletHoldings(ledgerApi, "cip103::1220fixture");
  assert.equal(holdings.length, 1);
  assert.equal(holdings[0]?.amountCc, 11042.5);
  assert.equal(holdings[0]?.contractId, "0084a1c2exampleholdingcid");
});

test("listAmuletHoldings skips non-Amulet instruments, allows expired locks, and falls back when earlier ACS bodies throw", async () => {
  let activeCalls = 0;
  const ledgerApi = async (params: {
    resource: string;
  }): Promise<Record<string, unknown>> => {
    if (params.resource === "/v2/state/ledger-end") {
      return { ledgerEnd: { offset: "99" } };
    }
    activeCalls += 1;
    if (activeCalls === 1) {
      throw new Error("eventFormat required");
    }
    return {
      activeContracts: [
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: "cid-usdc",
                interfaceViews: [
                  {
                    interfaceId: HOLDING_INTERFACE_ID,
                    viewValue: {
                      instrumentId: { admin: "dso", id: "USDC" },
                      amount: "500",
                      lock: null,
                    },
                  },
                ],
              },
            },
          },
        },
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: "cid-expired-lock",
                interfaceViews: [
                  {
                    interfaceId: HOLDING_INTERFACE_ID,
                    viewValue: {
                      instrumentId: { admin: "dso", id: "Amulet" },
                      amount: "15",
                      lock: { expiresAt: "2020-01-01T00:00:00Z" },
                    },
                  },
                ],
              },
            },
          },
        },
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: "cid-small",
                interfaceViews: [
                  {
                    interfaceId: HOLDING_INTERFACE_ID,
                    viewValue: {
                      instrumentId: { admin: "dso", id: "Amulet" },
                      amount: "5",
                      lock: null,
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    };
  };
  const holdings = await listAmuletHoldings(ledgerApi, "alice::1220");
  assert.equal(activeCalls, 2);
  assert.deepEqual(
    holdings.map((h) => [h.contractId, h.amountCc]),
    [
      ["cid-expired-lock", 15],
      ["cid-small", 5],
    ],
  );
});

test("selectInputAmuletCids picks largest UTXOs first and throws on insufficient or zero balance", async () => {
  const mkApi = (amounts: Array<[string, string]>) => async (params: { resource: string }) => {
    if (params.resource === "/v2/state/ledger-end") return { offset: 10 };
    return {
      activeContracts: amounts.map(([cid, amount]) => ({
        createdEvent: {
          contractId: cid,
          interfaceViews: [
            {
              interfaceId: HOLDING_INTERFACE_ID,
              viewValue: { instrumentId: { admin: "dso", id: "Amulet" }, amount, lock: null },
            },
          ],
        },
      })),
    };
  };

  const single = await selectInputAmuletCids(
    mkApi([
      ["cid-small", "10"],
      ["cid-big", "100"],
    ]),
    "alice::1",
    50,
  );
  assert.deepEqual(single, ["cid-big"]);

  const pair = await selectInputAmuletCids(
    mkApi([
      ["cid-a", "30"],
      ["cid-b", "80"],
      ["cid-c", "5"],
    ]),
    "alice::1",
    100,
  );
  assert.deepEqual(pair, ["cid-b", "cid-a"]);

  await assert.rejects(
    () => selectInputAmuletCids(mkApi([["cid-a", "10"]]), "alice::1", 25),
    /Holdings cover 10\.0000 CC/,
  );

  await assert.rejects(
    () => selectInputAmuletCids(mkApi([]), "alice::1", 1),
    /No unlocked Canton Coin holdings/,
  );
});

test("listLegacyInputAmuletHoldings prefers template rows and assertInputAmuletCidsActive detects spent inputs", async () => {
  const ledgerApi = async (params: {
    resource: string;
    body?: unknown;
  }): Promise<Record<string, unknown>> => {
    if (params.resource === "/v2/state/ledger-end") {
      return { offset: 42 };
    }
    if (JSON.stringify(params.body).includes("TemplateFilter")) {
      return {
        activeContracts: [
          {
            createdEvent: {
              contractId: "cid-template-1",
              templateId: "#splice-amulet:Splice.Amulet:Amulet",
              createArgument: { amount: { initialAmount: "50" } },
            },
          },
        ],
      };
    }
    return { activeContracts: [] };
  };

  const legacy = await listLegacyInputAmuletHoldings(ledgerApi, "alice::1");
  assert.deepEqual(
    legacy.map((h) => h.contractId),
    ["cid-template-1"],
  );
  const selected = await selectLegacyInputAmuletCids(ledgerApi, "alice::1", 40);
  assert.deepEqual(selected, ["cid-template-1"]);

  await assertInputAmuletCidsActive(ledgerApi, "alice::1", ["cid-template-1"]);
  await assertInputAmuletCidsActive(ledgerApi, "alice::1", []);
  await assert.rejects(
    () => assertInputAmuletCidsActive(ledgerApi, "alice::1", ["cid-archived-0000000000"]),
    /no longer active/,
  );
});
