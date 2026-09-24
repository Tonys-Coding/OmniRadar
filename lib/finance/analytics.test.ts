import { describe, expect, it } from "vitest";
import { cumulativeByDay, dailyTotals, spendingByLocation, startOfWeek, topMerchants, type AnalyticsTxn } from "@/lib/finance/analytics";
import { reconstructBalances } from "@/lib/finance/balance-history";

let seq = 0;
function tx(date: string, amount: number, extra: Partial<AnalyticsTxn> = {}): AnalyticsTxn {
  return {
    plaid_transaction_id: `p${seq++}`,
    name: "Txn",
    amount,
    date,
    category_primary: "FOOD_AND_DRINK",
    category_detailed: "FOOD_AND_DRINK_COFFEE",
    account_type: "depository",
    merchant_name: null,
    logo_url: null,
    payment_channel: "in store",
    location: null,
    ...extra,
  };
}

describe("dailyTotals", () => {
  it("fills every day and splits income from spending", () => {
    const days = dailyTotals(
      [
        tx("2026-09-01", 4.5),
        tx("2026-09-01", 20),
        tx("2026-09-03", -1000, { category_primary: "INCOME", category_detailed: "INCOME_SALARY" }),
        tx("2026-09-03", 300, { category_primary: "TRANSFER_OUT", category_detailed: "TRANSFER_OUT_SAVINGS" }),
      ],
      "2026-09-01",
      "2026-09-03",
    );
    expect(days).toEqual([
      { date: "2026-09-01", spending: 24.5, income: 0, count: 2 },
      { date: "2026-09-02", spending: 0, income: 0, count: 0 },
      { date: "2026-09-03", spending: 0, income: 1000, count: 0 },
    ]);
    expect(cumulativeByDay(days).map((d) => d.total)).toEqual([24.5, 24.5, 24.5]);
  });
});

describe("startOfWeek", () => {
  it("returns Monday", () => {
    expect(startOfWeek("2026-09-24")).toBe("2026-09-21"); // Thursday
    expect(startOfWeek("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21"); // Sunday
  });

  it("can start weeks on Sunday", () => {
    expect(startOfWeek("2026-09-24", "sunday")).toBe("2026-09-20");
    expect(startOfWeek("2026-09-27", "sunday")).toBe("2026-09-27");
  });
});

describe("topMerchants", () => {
  it("ranks merchants by net spending, case-insensitively", () => {
    const list = topMerchants([
      tx("2026-09-01", 50, { merchant_name: "Target", logo_url: "t.png" }),
      tx("2026-09-02", 30, { merchant_name: "TARGET" }),
      tx("2026-09-03", -10, { merchant_name: "Target" }),
      tx("2026-09-03", 60, { merchant_name: "Costco" }),
    ]);
    expect(list).toEqual([
      { merchant: "Target", logo_url: "t.png", total: 70, count: 2, category: "FOOD_AND_DRINK" },
      { merchant: "Costco", logo_url: null, total: 60, count: 1, category: "FOOD_AND_DRINK" },
    ]);
  });
});

describe("spendingByLocation", () => {
  it("groups by city and state, with online and unknown buckets", () => {
    const result = spendingByLocation([
      tx("2026-09-01", 10, { location: { city: "Austin", region: "tx" } }),
      tx("2026-09-02", 15, { location: { city: "austin", region: "TX", lat: 30.27, lon: -97.74 } }),
      tx("2026-09-02", 40, { location: { city: "Dallas", region: "TX" } }),
      tx("2026-09-03", 12, { payment_channel: "online" }),
      tx("2026-09-03", 7),
      tx("2026-09-03", -5, { location: { city: "Austin", region: "TX" } }), // refund: ignored for places
    ]);
    expect(result.places).toEqual([
      { city: "Dallas", region: "TX", country: null, lat: null, lon: null, total: 40, count: 1 },
      { city: "Austin", region: "TX", country: null, lat: 30.27, lon: -97.74, total: 25, count: 2 },
    ]);
    expect(result.regions).toEqual([{ region: "TX", total: 65, count: 3 }]);
    expect(result.online).toEqual({ total: 12, count: 1 });
    expect(result.unknown).toEqual({ total: 7, count: 1 });
  });
});

describe("reconstructBalances", () => {
  const accounts = [
    { id: "chk", type: "depository", current_balance: 1000 },
    { id: "cc", type: "credit", current_balance: 300 },
  ];

  it("walks balances backwards from today using transactions", () => {
    const points = reconstructBalances(
      accounts,
      [
        { account_id: "chk", amount: -2000, date: "2026-09-02", pending: false }, // paycheck in
        { account_id: "chk", amount: 500, date: "2026-09-03", pending: false }, // card payment out
        { account_id: "cc", amount: -500, date: "2026-09-03", pending: false }, // card payment in
        { account_id: "cc", amount: 100, date: "2026-09-02", pending: false }, // purchase
        { account_id: "chk", amount: 999, date: "2026-09-03", pending: true }, // ignored
      ],
      "2026-09-01",
      "2026-09-03",
    );
    expect(points).toEqual([
      { date: "2026-09-01", cash: -500, assets: -500, liabilities: 700, net_worth: -1200 },
      { date: "2026-09-02", cash: 1500, assets: 1500, liabilities: 800, net_worth: 700 },
      { date: "2026-09-03", cash: 1000, assets: 1000, liabilities: 300, net_worth: 700 },
    ]);
  });

  it("holds loans and investments at today's balance", () => {
    const points = reconstructBalances(
      [{ id: "loan", type: "loan", current_balance: 5000 }],
      [{ account_id: "loan", amount: -400, date: "2026-09-02", pending: false }],
      "2026-09-01",
      "2026-09-02",
    );
    expect(points.map((p) => p.liabilities)).toEqual([5000, 5000]);
  });
});
