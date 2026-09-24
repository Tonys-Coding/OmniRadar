import { describe, expect, it } from "vitest";
import { cashflowByMonth, netWorth, netWorthSeries, spendingByCategory, type CashflowTxn } from "@/lib/finance/aggregate";

let seq = 0;
const t = (
  date: string,
  amount: number,
  primary: string | null,
  detailed: string | null = null,
  name = "Txn",
  account_type = "depository",
): CashflowTxn => ({
  plaid_transaction_id: `p${seq++}`,
  name,
  account_type,
  date,
  amount,
  category_primary: primary,
  category_detailed: detailed,
});

const txns = [
  t("2026-08-01", -3000, "INCOME", "INCOME_SALARY"),
  t("2026-08-03", 1200, "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"),
  t("2026-08-05", 85.5, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"),
  t("2026-08-06", -20, "FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"), // refund
  t("2026-08-10", 500, "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"), // excluded
  t("2026-08-15", 400, "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"), // excluded
  t("2026-08-20", 15.49, "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"),
  t("2026-09-01", -3000, "INCOME", "INCOME_SALARY"),
  t("2026-09-02", 50, null),
  t("2026-06-30", 999, "TRAVEL", "TRAVEL_FLIGHTS"), // outside window
];

describe("cashflowByMonth", () => {
  it("computes income, spending (net of refunds), and savings rate per month", () => {
    const [aug, sep] = cashflowByMonth(txns, ["2026-08", "2026-09"]);
    expect(aug).toEqual({ month: "2026-08", income: 3000, spending: 1280.99, net: 1719.01, savings_rate: 0.573 });
    expect(sep).toEqual({ month: "2026-09", income: 3000, spending: 50, net: 2950, savings_rate: 0.983 });
  });

  it("counts miscategorized paychecks as income, via payroll wording or a recurring income stream", () => {
    const pay = t("2026-07-03", -810, "FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT", "Sweetgreen inc payroll ppd id");
    const deposit = t("2026-07-17", -500, "GENERAL_SERVICES", null, "ACME CORP");
    const refund = t("2026-07-20", -25, "GENERAL_MERCHANDISE", null, "Store refund");
    const [jul] = cashflowByMonth([pay, deposit, refund], ["2026-07"], new Set([deposit.plaid_transaction_id]));
    expect(jul).toMatchObject({ income: 1310, spending: -25 });
  });

  it("never counts money into a credit card as income", () => {
    const cardPayment = t("2026-07-14", -2835.8, "INCOME", "INCOME_SALARY", "Payment Thank You-Mobile", "credit");
    const cardRefund = t("2026-07-15", -40, "GENERAL_MERCHANDISE", null, "Returned shoes", "credit");
    const cardPurchase = t("2026-07-16", 100, "GENERAL_MERCHANDISE", null, "Shoes", "credit");
    const [jul] = cashflowByMonth([cardPayment, cardRefund, cardPurchase], ["2026-07"]);
    expect(jul).toMatchObject({ income: 0, spending: 60 });
  });

  it("returns zeroed months with no data and a null savings rate", () => {
    expect(cashflowByMonth([], ["2026-07"])).toEqual([
      { month: "2026-07", income: 0, spending: 0, net: 0, savings_rate: null },
    ]);
    const interestOnly = cashflowByMonth([t("2026-07-01", -0.12, "INCOME", "INCOME_INTEREST_EARNED")], ["2026-07"]);
    expect(interestOnly[0]?.savings_rate).toBeNull();
  });
});

describe("spendingByCategory", () => {
  it("groups by primary category, largest first, skipping income and transfers", () => {
    expect(spendingByCategory(txns.filter((x) => x.date.startsWith("2026-08")))).toEqual([
      { category: "RENT_AND_UTILITIES", total: 1200, count: 1 },
      { category: "FOOD_AND_DRINK", total: 65.5, count: 2 },
      { category: "ENTERTAINMENT", total: 15.49, count: 1 },
    ]);
  });
});

describe("netWorth", () => {
  it("subtracts card and loan balances from assets", () => {
    const nw = netWorth([
      { id: "c", type: "depository", current_balance: 2500 },
      { id: "s", type: "depository", current_balance: 10000 },
      { id: "cc", type: "credit", current_balance: 740.25 },
      { id: "l", type: "loan", current_balance: 5000 },
      { id: "i", type: "investment", current_balance: null },
    ]);
    expect(nw).toMatchObject({ assets: 12500, liabilities: 5740.25, net_worth: 6759.75 });
    expect(nw.by_type.depository).toBe(12500);
  });
});

describe("netWorthSeries", () => {
  const accounts = [
    { id: "chk", type: "depository", current_balance: 0 },
    { id: "cc", type: "credit", current_balance: 0 },
  ];

  it("carries balances forward across days without snapshots", () => {
    const points = netWorthSeries(
      accounts,
      [
        { account_id: "chk", snapshot_date: "2026-08-28", current_balance: 1000 },
        { account_id: "cc", snapshot_date: "2026-09-01", current_balance: 200 },
        { account_id: "chk", snapshot_date: "2026-09-02", current_balance: 1500 },
      ],
      "2026-08-31",
      "2026-09-03",
    );
    expect(points.map((p) => [p.date, p.net_worth])).toEqual([
      ["2026-08-31", 1000],
      ["2026-09-01", 800],
      ["2026-09-02", 1300],
      ["2026-09-03", 1300],
    ]);
  });

  it("omits days before any data and ignores unknown (hidden) accounts", () => {
    const points = netWorthSeries(
      accounts,
      [
        { account_id: "chk", snapshot_date: "2026-09-02", current_balance: 50 },
        { account_id: "hidden", snapshot_date: "2026-09-01", current_balance: 9999 },
      ],
      "2026-09-01",
      "2026-09-02",
    );
    expect(points).toEqual([{ date: "2026-09-02", net_worth: 50, assets: 50, liabilities: 0 }]);
  });
});
