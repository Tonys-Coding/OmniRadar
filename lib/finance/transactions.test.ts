import { describe, expect, it } from "vitest";
import { summarizeTransactions, type SummaryTxn } from "./transactions";

const t = (amount: number, date: string, extra: Partial<SummaryTxn> = {}): SummaryTxn => ({
  amount,
  date,
  pending: false,
  name: `TXN ${amount}`,
  merchant_name: null,
  ...extra,
});

describe("summarizeTransactions", () => {
  it("splits money in and out using Plaid's sign convention", () => {
    const s = summarizeTransactions([t(-1000, "2026-09-01"), t(25.5, "2026-09-02"), t(74.5, "2026-09-03")]);
    expect(s).toMatchObject({ count: 3, money_in: 1000, money_out: 100, net: 900, count_in: 1, count_out: 2 });
  });

  it("finds the largest charge, preferring the merchant name", () => {
    const s = summarizeTransactions([t(20, "2026-09-01"), t(250, "2026-09-05", { name: "AMZN MKTP", merchant_name: "Amazon" }), t(-900, "2026-09-02")]);
    expect(s.largest_out).toEqual({ name: "Amazon", amount: 250, date: "2026-09-05" });
  });

  it("counts pending transactions and the date span", () => {
    const s = summarizeTransactions([t(5, "2026-09-10", { pending: true }), t(5, "2026-08-01"), t(5, "2026-09-20", { pending: true })]);
    expect(s).toMatchObject({ pending: 2, first_date: "2026-08-01", last_date: "2026-09-20" });
  });

  it("handles numeric strings from Postgres numerics and rounds to cents", () => {
    const s = summarizeTransactions([t("0.1" as unknown as number, "2026-09-01"), t(0.2, "2026-09-01")]);
    expect(s.money_out).toBe(0.3);
  });

  it("returns zeros for an empty set", () => {
    expect(summarizeTransactions([])).toMatchObject({ count: 0, money_in: 0, money_out: 0, net: 0, largest_out: null, first_date: null });
  });
});
