import { describe, expect, it } from "vitest";
import { fullDate, percent, plural, signedPercent, times, weekdayShort } from "@/lib/format";

describe("number formatting", () => {
  it("formats percentages through Intl", () => {
    expect(percent(0.248)).toBe("25%");
    expect(percent(0.1234, 1)).toBe("12.3%");
    expect(percent(null)).toBe("-");
    expect(signedPercent(0.05)).toBe("+5%");
    expect(signedPercent(-0.05)).toBe("-5%");
    expect(signedPercent(0)).toBe("0%");
  });

  it("pluralizes counts", () => {
    expect(plural(1, "purchase")).toBe("1 purchase");
    expect(plural(3, "purchase")).toBe("3 purchases");
    expect(plural(2, "city", "cities")).toBe("2 cities");
    expect(plural(1200, "transaction")).toBe("1,200 transactions");
  });

  it("formats ratios", () => {
    expect(times(1.44)).toBe("1.4×");
  });
});

describe("date formatting", () => {
  it("spells out full dates and short weekdays", () => {
    expect(fullDate("2026-09-24")).toBe("Thursday, September 24, 2026");
    expect(weekdayShort("2026-09-24")).toBe("Th");
  });
});
