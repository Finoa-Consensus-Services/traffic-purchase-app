import assert from "node:assert/strict";
import test from "node:test";
import {
  firstOpenRound,
  listOpenAmuletPrices,
  readFees,
  readRound,
  selectAmuletConfig,
  selectOpenMiningRoundForPurchase,
} from "./rules";

const initial = {
  decentralizedSynchronizer: {
    activeSynchronizer: "sync::initial",
    fees: {
      extraTrafficPrice: "60.0",
      minTopupAmount: "200000",
      baseRateTrafficLimits: { burstAmount: "400000" },
    },
  },
};

const current = {
  decentralizedSynchronizer: {
    activeSynchronizer: "sync::current",
    fees: {
      trafficPrice: "70",
      minTopupAmount: "250000",
      baseRateTrafficLimits: { burstAmount: "500000" },
    },
  },
};

test("selects the latest config whose time has arrived", () => {
  const payload = {
    configSchedule: {
      initialValue: initial,
      futureValues: [
        { _1: "2020-01-01T00:00:00Z", _2: current },
        { time: "2099-01-01T00:00:00Z", value: initial },
      ],
    },
  };
  const selected = selectAmuletConfig(payload, new Date("2026-09-28T00:00:00Z"));
  const fees = readFees(selected);
  assert.equal(fees.extraTrafficPriceUsdPerMb, 70);
  assert.equal(fees.minTopupBytes, 250000);
  assert.equal(fees.baseRateBurstBytes, 500000);
  assert.equal(fees.activeSynchronizer, "sync::current");
});

test("selectOpenMiningRoundForPurchase prefers an open round by time and number", () => {
  const closed = {
    domain_id: "global-domain::old",
    contract: {
      payload: {
        round: { number: "10" },
        amuletPrice: "0.2",
        opensAt: "2020-01-01T00:00:00Z",
        targetClosesAt: "2020-01-02T00:00:00Z",
      },
    },
  };
  const open = {
    domain_id: "global-domain::new",
    contract: {
      payload: {
        round: { number: "12" },
        amuletPrice: "0.2",
        opensAt: "2026-01-01T00:00:00Z",
        targetClosesAt: "2099-01-01T00:00:00Z",
      },
    },
  };
  const picked = selectOpenMiningRoundForPurchase(
    [closed, open],
    new Date("2026-11-09T12:00:00Z"),
  );
  assert.equal(
    (picked as { domain_id: string }).domain_id,
    "global-domain::new",
  );
});

test("selectOpenMiningRoundForPurchase keeps the requested synchronizer", () => {
  const other = {
    domain_id: "global-domain::other",
    contract: {
      payload: {
        round: { number: "20" },
        amuletPrice: "0.2",
        opensAt: "2026-01-01T00:00:00Z",
        targetClosesAt: "2099-01-01T00:00:00Z",
      },
    },
  };
  const selected = {
    domain_id: "global-domain::selected",
    contract: {
      payload: {
        round: { number: "11" },
        amuletPrice: "0.2",
        opensAt: "2026-01-01T00:00:00Z",
        targetClosesAt: "2099-01-01T00:00:00Z",
      },
    },
  };
  const picked = selectOpenMiningRoundForPurchase(
    [other, selected],
    new Date("2026-11-12T12:00:00Z"),
    "global-domain::selected",
  );
  assert.equal(
    (picked as { domain_id: string }).domain_id,
    "global-domain::selected",
  );
});

test("selectOpenMiningRoundForPurchase rejects a synchronizer with no open round", () => {
  const open = {
    domain_id: "global-domain::only",
    contract: {
      payload: {
        round: { number: "12" },
        amuletPrice: "0.2",
        opensAt: "2026-01-01T00:00:00Z",
        targetClosesAt: "2099-01-01T00:00:00Z",
      },
    },
  };
  assert.throws(
    () =>
      selectOpenMiningRoundForPurchase(
        [open],
        new Date("2026-11-12T12:00:00Z"),
        "global-domain::missing",
      ),
    /global-domain::missing/,
  );
});

test("readRound keeps the tick duration that bounds the CC price", () => {
  const parsed = readRound({
    payload: {
      round: { number: "7" },
      amuletPrice: "0.1",
      opensAt: "2026-01-01T00:00:00.000Z",
      tickDuration: { microseconds: "600000000" },
    },
  });
  assert.equal(parsed.tickDurationMicros, 600_000_000);
  assert.equal(
    readRound({
      payload: { round: { number: "8" }, amuletPrice: "0.1", tickDuration: { microseconds: "0" } },
    }).tickDurationMicros,
    null,
  );
});

test("reads the first contract from a scan-proxy round array", () => {
  const round = firstOpenRound([
    {
      domain_id: "global-domain::abc",
      contract: {
        payload: {
          round: { number: "12" },
          amuletPrice: "0.2",
          opensAt: null,
          targetClosesAt: null,
        },
      },
    },
  ]);
  assert.equal(
    (round as { domain_id: string }).domain_id,
    "global-domain::abc",
  );
});
test("falls back to the initial config when every future value is later", () => {
  const payload = {
    configSchedule: {
      initialValue: initial,
      futureValues: [{ time: "2099-01-01T00:00:00Z", value: current }],
    },
  };
  const fees = readFees(
    selectAmuletConfig(payload, new Date("2026-09-28T00:00:00Z")),
  );
  assert.equal(fees.extraTrafficPriceUsdPerMb, 60);
  assert.equal(fees.activeSynchronizer, "sync::initial");
});

test("listOpenAmuletPrices returns open rounds oldest first", () => {
  const round = (number: string, price: string) => ({
    contract: {
      payload: {
        round: { number },
        amuletPrice: price,
        opensAt: "2026-01-01T00:00:00Z",
        targetClosesAt: "2099-01-01T00:00:00Z",
      },
    },
  });
  const prices = listOpenAmuletPrices(
    [round("12", "0.076337"), round("11", "0.076498"), round("10", "0.07661")],
    new Date("2026-11-23T14:00:00Z"),
  );
  assert.deepEqual(prices, [0.07661, 0.076498, 0.076337]);
});

test("selectAmuletConfig accepts tuple [time, value] schedule entries", () => {
  const payload = {
    configSchedule: {
      initialValue: initial,
      futureValues: [["2025-01-01T00:00:00Z", current]],
    },
  };
  const fees = readFees(
    selectAmuletConfig(payload, new Date("2026-09-28T00:00:00Z")),
  );
  assert.equal(fees.extraTrafficPriceUsdPerMb, 70);
  assert.equal(fees.minTopupBytes, 250000);
});

test("readFees rejects missing or non-positive traffic price and missing minimum", () => {
  assert.throws(() => readFees(null), /not an object/);
  assert.throws(() => readFees({}), /fees/);
  assert.throws(
    () =>
      readFees({
        decentralizedSynchronizer: {
          fees: { extraTrafficPrice: "0", minTopupAmount: "200000" },
        },
      }),
    /missing/,
  );
  assert.throws(
    () =>
      readFees({
        decentralizedSynchronizer: {
          fees: { extraTrafficPrice: "60" },
        },
      }),
    /missing/,
  );
});

test("readRound parses numeric/string/object round identifiers and rejects invalid prices", () => {
  assert.equal(
    readRound({ payload: { round: 42, amuletPrice: "0.15" } }).round,
    "42",
  );
  assert.equal(
    readRound({ payload: { round: "43", amuletPrice: 0.2 } }).round,
    "43",
  );
  assert.throws(
    () => readRound({ payload: { round: { number: "1" }, amuletPrice: "0" } }),
    /no amulet price/,
  );
});

test("selectOpenMiningRoundForPurchase reads keyed-object round maps and falls back when all are closed", () => {
  const roundsMap = {
    a: {
      domain_id: "global-domain::a",
      contract: {
        payload: {
          round: { number: "5" },
          amuletPrice: "0.1",
          opensAt: "2020-01-01T00:00:00Z",
          targetClosesAt: "2020-01-02T00:00:00Z",
        },
      },
    },
    b: {
      domain_id: "global-domain::a",
      contract: {
        payload: {
          round: { number: "6" },
          amuletPrice: "0.12",
          opensAt: "2020-01-02T00:00:00Z",
          targetClosesAt: "2020-01-03T00:00:00Z",
        },
      },
    },
  };
  const picked = selectOpenMiningRoundForPurchase(
    roundsMap,
    new Date("2026-11-23T00:00:00Z"),
  );
  assert.equal(readRound(picked).round, "6");
});

test("listOpenAmuletPrices excludes closed rounds and returns empty on invalid input", () => {
  const closed = {
    contract: {
      payload: {
        round: { number: "9" },
        amuletPrice: "0.09",
        opensAt: "2020-01-01T00:00:00Z",
        targetClosesAt: "2020-01-02T00:00:00Z",
      },
    },
  };
  const open = {
    contract: {
      payload: {
        round: { number: "10" },
        amuletPrice: "0.08",
        opensAt: "2026-01-01T00:00:00Z",
        targetClosesAt: "2099-01-01T00:00:00Z",
      },
    },
  };
  assert.deepEqual(
    listOpenAmuletPrices([closed, open], new Date("2026-11-23T00:00:00Z")),
    [0.08],
  );
  assert.deepEqual(listOpenAmuletPrices(null), []);
});
