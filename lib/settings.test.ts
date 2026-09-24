import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/settings";

describe("parseSettings", () => {
  it("fills every default from nothing", () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      privacy_mode: false,
      show_cents: true,
      week_start: "monday",
      default_range: "3M",
      monthly_budget: null,
      alerts: { low_balance: { enabled: true, threshold: 100 }, bill_reminders: { days_before: 3 } },
    });
  });

  it("keeps saved values and fills nested defaults", () => {
    const s = parseSettings({ privacy_mode: true, monthly_budget: 2500, alerts: { low_balance: { threshold: 250 } } });
    expect(s.privacy_mode).toBe(true);
    expect(s.monthly_budget).toBe(2500);
    expect(s.alerts.low_balance).toEqual({ enabled: true, threshold: 250 });
    expect(s.alerts.large_transaction.threshold).toBe(500);
  });

  it("drops only the invalid fields", () => {
    const s = parseSettings({ week_start: "friday", privacy_mode: true, monthly_budget: -5 });
    expect(s.week_start).toBe("monday");
    expect(s.privacy_mode).toBe(true);
    expect(s.monthly_budget).toBeNull();
  });
});
