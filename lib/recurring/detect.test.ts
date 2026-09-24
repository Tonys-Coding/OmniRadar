import { describe, expect, it } from "vitest";
import { addDays, addMonths } from "@/lib/dates";
import { detectRecurring, merchantKey, type DetectInput } from "@/lib/recurring/detect";

const USER = "user-1";
let seq = 0;

function tx(date: string, amount: number, merchant: string, extra: Partial<DetectInput> = {}): DetectInput {
  return {
    plaid_transaction_id: `t${seq++}`,
    account_id: "acct-1",
    amount,
    date,
    name: merchant.toUpperCase(),
    merchant_name: merchant,
    category_primary: "ENTERTAINMENT",
    category_detailed: "ENTERTAINMENT_TV_AND_MOVIES",
    pending: false,
    ...extra,
  };
}

const monthly = (start: string, n: number, amount: number, merchant: string, extra?: Partial<DetectInput>) =>
  Array.from({ length: n }, (_, i) => tx(addMonths(start, i), amount, merchant, extra));

describe("merchantKey", () => {
  it("normalizes noisy descriptors", () => {
    expect(merchantKey({ merchant_name: null, name: "NETFLIX.COM 866-579-7172 CA" })).toBe("netflix com ca");
    expect(merchantKey({ merchant_name: "Spotify", name: "whatever" })).toBe("spotify");
  });
});

describe("detectRecurring", () => {
  it("finds a monthly subscription and predicts the next charge", () => {
    const streams = detectRecurring(monthly("2026-03-15", 6, 15.49, "Netflix"), USER, "2026-09-01");
    expect(streams).toHaveLength(1);
    const s = streams[0]!;
    expect(s).toMatchObject({
      frequency: "MONTHLY",
      direction: "outflow",
      kind: "subscription",
      description: "Netflix",
      last_date: "2026-08-15",
      predicted_next_date: "2026-09-15",
      average_amount: 15.49,
      is_active: true,
      source: "local",
    });
    expect(s.transaction_ids).toHaveLength(6);
    expect(s.stream_key).toMatch(/^local:[0-9a-f]{32}$/);
  });

  it("detects biweekly paychecks as income", () => {
    const pay = Array.from({ length: 8 }, (_, i) =>
      tx(addDays("2026-05-01", i * 14), -2100, "Acme Payroll", {
        category_primary: "INCOME",
        category_detailed: "INCOME_SALARY",
      }),
    );
    const [s] = detectRecurring(pay, USER, "2026-08-10");
    expect(s).toMatchObject({ frequency: "BIWEEKLY", direction: "inflow", kind: "income", average_amount: 2100 });
  });

  it("detects semi-monthly pay on the 1st and 15th", () => {
    const dates = ["2026-05-01", "2026-05-15", "2026-06-01", "2026-06-15", "2026-07-01", "2026-07-15", "2026-08-01"];
    const pay = dates.map((d) => tx(d, -1800, "Employer", { category_primary: "INCOME", category_detailed: "INCOME_SALARY" }));
    expect(detectRecurring(pay, USER, "2026-08-05")[0]?.frequency).toBe("SEMI_MONTHLY");
  });

  it("classifies utilities as bills and tolerates varying amounts", () => {
    const amounts = [82.1, 95.4, 110.2, 78.9];
    const txs = amounts.map((a, i) =>
      tx(addMonths("2026-04-20", i), a, "City Power", {
        category_primary: "RENT_AND_UTILITIES",
        category_detailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
      }),
    );
    expect(detectRecurring(txs, USER, "2026-08-01")[0]).toMatchObject({ kind: "bill", frequency: "MONTHLY" });
  });

  it("marks a stream inactive once charges stop", () => {
    const [s] = detectRecurring(monthly("2025-10-05", 4, 9.99, "OldApp"), USER, "2026-09-01");
    expect(s?.is_active).toBe(false);
  });

  it("ignores irregular spending and one-off purchases", () => {
    const random = ["2026-06-02", "2026-06-05", "2026-06-20", "2026-07-21", "2026-07-23", "2026-08-30"].map((d, i) =>
      tx(d, 20 + i * 37, "Grocer", { category_primary: "FOOD_AND_DRINK", category_detailed: "FOOD_AND_DRINK_GROCERIES" }),
    );
    expect(detectRecurring([...random, tx("2026-07-01", 999, "Laptop Store")], USER, "2026-09-01")).toEqual([]);
  });

  it("skips pending transactions and keeps different accounts separate", () => {
    const a = monthly("2026-04-10", 4, 10, "Gym", { account_id: "acct-A" });
    const b = monthly("2026-04-10", 4, 10, "Gym", { account_id: "acct-B", pending: true });
    const streams = detectRecurring([...a, ...b], USER, "2026-08-01");
    expect(streams).toHaveLength(1);
    expect(streams[0]?.account_id).toBe("acct-A");
  });
});
