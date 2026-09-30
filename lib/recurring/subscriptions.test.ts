import { describe, expect, it } from "vitest";
import { buildInsights, findDuplicates, type InsightSub, monthlySpend, priceChange, serviceKey, upcomingCharges } from "./subscriptions";

const charges = (...amounts: number[]) => amounts.map((amount, i) => ({ date: `2026-${String(i + 1).padStart(2, "0")}-15`, amount }));

const sub = (over: Partial<InsightSub> = {}): InsightSub => ({
  id: "s1",
  merchant_name: "Netflix",
  description: "NETFLIX.COM",
  frequency: "MONTHLY",
  last_date: "2026-09-15",
  predicted_next_date: "2026-10-15",
  last_amount: 17.99,
  average_amount: 17.99,
  monthly_amount: 17.99,
  price_change: null,
  duplicate_key: null,
  ...over,
});

describe("priceChange", () => {
  it("finds the latest change that stuck", () => {
    expect(priceChange(charges(15.49, 15.49, 17.99, 17.99))).toEqual({ from: 15.49, to: 17.99, date: "2026-03-15" });
  });

  it("ignores flat prices, cent-level noise, and one-off blips", () => {
    expect(priceChange(charges(10, 10, 10))).toBeNull();
    expect(priceChange(charges(10, 10.01, 10.02))).toBeNull();
    // The latest charge went back to the old price, so the "change" didn't stick.
    expect(priceChange(charges(10, 10, 14, 10))).toBeNull();
  });

  it("reports price cuts too", () => {
    expect(priceChange(charges(20, 20, 12))).toEqual({ from: 20, to: 12, date: "2026-03-15" });
  });
});

describe("serviceKey / findDuplicates", () => {
  it("normalizes bank descriptors", () => {
    expect(serviceKey("OPENAI *CHATGPT SUBSCR")).toBe("openai chatgpt");
    expect(serviceKey("Spotify")).toBe("spotify");
  });

  it("groups the same service, and only groups of two or more", () => {
    const dupes = findDuplicates([
      { id: "a", merchant_name: "Spotify", description: "SPOTIFY" },
      { id: "b", merchant_name: null, description: "SPOTIFY USA" },
      { id: "c", merchant_name: "Netflix", description: "NETFLIX" },
    ]);
    // "spotify" vs "spotify usa": different keys, so not grouped; exact service names are.
    expect(dupes.size).toBe(0);
    const same = findDuplicates([
      { id: "a", merchant_name: "Spotify", description: "x" },
      { id: "b", merchant_name: "Spotify", description: "y" },
      { id: "c", merchant_name: "Netflix", description: "z" },
    ]);
    expect([...same.entries()]).toEqual([
      ["a", "spotify"],
      ["b", "spotify"],
    ]);
  });
});

describe("monthlySpend", () => {
  it("buckets charges into the trailing months, oldest first, across a year boundary", () => {
    const out = monthlySpend(
      [
        { date: "2025-11-03", amount: 10 },
        { date: "2026-01-20", amount: 5.5 },
        { date: "2026-01-21", amount: 4.5 },
        { date: "2025-06-01", amount: 99 }, // outside the window
      ],
      "2026-02",
      4,
    );
    expect(out).toEqual([
      { month: "2025-11", amount: 10 },
      { month: "2025-12", amount: 0 },
      { month: "2026-01", amount: 10 },
      { month: "2026-02", amount: 0 },
    ]);
  });
});

describe("upcomingCharges", () => {
  it("lists expected charges in the window, soonest first", () => {
    const weekly = sub({ id: "w", frequency: "WEEKLY", last_date: "2026-09-25", predicted_next_date: "2026-10-02", last_amount: 5 });
    const monthly = sub({ id: "m", predicted_next_date: "2026-10-15" });
    const out = upcomingCharges([monthly, weekly], "2026-09-29", 14);
    expect(out.map((c) => `${c.date}:${c.sub.id}`)).toEqual(["2026-10-02:w", "2026-10-09:w"]);
  });
});

describe("buildInsights", () => {
  it("prices a duplicate as the cheaper copies' yearly cost", () => {
    const a = sub({ id: "a", monthly_amount: 12.65, duplicate_key: "spotify" });
    const b = sub({ id: "b", monthly_amount: 10, duplicate_key: "spotify" });
    const [insight] = buildInsights([a, b], "2026-09-29");
    expect(insight).toMatchObject({ kind: "duplicate", key: "spotify", extra_yearly: 120 });
  });

  it("flags recent price increases with their yearly cost, but not old ones", () => {
    const recent = sub({ price_change: { from: 15.49, to: 17.99, date: "2026-09-15" } });
    const old = sub({ id: "old", price_change: { from: 8, to: 9, date: "2025-01-15" } });
    const out = buildInsights([recent, old], "2026-09-29");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "price_up", extra_yearly: 30 });
  });

  it("warns about yearly renewals in the next 30 days and sorts by money", () => {
    const yearly = sub({ id: "y", frequency: "ANNUALLY", predicted_next_date: "2026-10-10", last_amount: 139 });
    const later = sub({ id: "z", frequency: "ANNUALLY", predicted_next_date: "2026-12-01", last_amount: 99 });
    const bump = sub({ id: "p", price_change: { from: 10, to: 11, date: "2026-09-01" } });
    const out = buildInsights([bump, yearly, later], "2026-09-29");
    expect(out.map((i) => i.kind)).toEqual(["renewal", "price_up"]);
  });
});
