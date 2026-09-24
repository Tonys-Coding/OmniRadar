import { describe, expect, it } from "vitest";
import { buildAlerts, type AlertInputs } from "@/lib/alerts";
import { csvCell } from "@/lib/csv";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/settings";

const base: AlertInputs = {
  today: "2026-09-24",
  settings: DEFAULT_SETTINGS,
  items: [],
  accounts: [],
  recentSpending: [],
  bills: [],
  month: { spending: 0, dayOfMonth: 24, daysInMonth: 30 },
};

describe("buildAlerts", () => {
  it("is empty when nothing needs attention", () => {
    expect(buildAlerts(base)).toEqual([]);
  });

  it("flags broken connections, low balances, large purchases, and bills due soon", () => {
    const alerts = buildAlerts({
      ...base,
      items: [{ id: "i1", institution_name: "Chase", status: "login_required" }],
      accounts: [
        { id: "a1", name: "Checking", mask: "1234", type: "depository", current_balance: 80, available_balance: 60 },
        { id: "a2", name: "Card", mask: null, type: "credit", current_balance: 20, available_balance: null },
      ],
      recentSpending: [
        { id: "t1", name: "Best Buy", amount: 899, date: "2026-09-23" },
        { id: "t2", name: "Coffee", amount: 5, date: "2026-09-23" },
      ],
      bills: [
        { id: "b1", name: "Rent", amount: 1500, due: "2026-09-26" },
        { id: "b2", name: "Gym", amount: 40, due: "2026-10-10" },
      ],
    });
    expect(alerts.map((a) => a.kind)).toEqual(["connection", "low_balance", "large_transaction", "bill_due"]);
    expect(alerts[1]!.body).toContain("$60.00");
  });

  it("respects disabled alerts and custom thresholds", () => {
    const settings = parseSettings({ alerts: { low_balance: { enabled: false }, large_transaction: { threshold: 1000 } } });
    const alerts = buildAlerts({
      ...base,
      settings,
      accounts: [{ id: "a1", name: "Checking", mask: null, type: "depository", current_balance: 5, available_balance: 5 }],
      recentSpending: [{ id: "t1", name: "Best Buy", amount: 899, date: "2026-09-23" }],
    });
    expect(alerts).toEqual([]);
  });

  it("warns about budget pace and overspending", () => {
    const settings = parseSettings({ monthly_budget: 2000 });
    const pace = buildAlerts({ ...base, settings, month: { spending: 1800, dayOfMonth: 20, daysInMonth: 30 } });
    expect(pace[0]).toMatchObject({ kind: "budget", severity: "warning" });
    const over = buildAlerts({ ...base, settings, month: { spending: 2100, dayOfMonth: 24, daysInMonth: 30 } });
    expect(over[0]).toMatchObject({ kind: "budget", severity: "critical" });
  });
});

describe("csvCell", () => {
  it("quotes and escapes, and defuses spreadsheet formulas", () => {
    expect(csvCell("Coffee")).toBe("Coffee");
    expect(csvCell('Joe "The" Shop, Inc')).toBe('"Joe ""The"" Shop, Inc"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell(null)).toBe("");
  });
});
