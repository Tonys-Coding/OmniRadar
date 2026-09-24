import { describe, expect, it } from "vitest";
import { occurrences } from "@/lib/recurring/occurrences";

describe("occurrences", () => {
  it("marks past charges as paid and projects future ones", () => {
    const monthly = { frequency: "MONTHLY" as const, last_date: "2026-09-05", predicted_next_date: "2026-10-05" };
    expect(occurrences(monthly, "2026-09-01", "2026-11-30")).toEqual([
      { date: "2026-09-05", paid: true },
      { date: "2026-10-05", paid: false },
      { date: "2026-11-05", paid: false },
    ]);
  });

  it("handles weekly streams inside a single month", () => {
    const weekly = { frequency: "WEEKLY" as const, last_date: "2026-09-18", predicted_next_date: "2026-09-25" };
    expect(occurrences(weekly, "2026-09-01", "2026-09-30").map((o) => `${o.date}:${o.paid ? "paid" : "due"}`)).toEqual([
      "2026-09-04:paid",
      "2026-09-11:paid",
      "2026-09-18:paid",
      "2026-09-25:due",
    ]);
  });

  it("returns nothing outside the window", () => {
    const yearly = { frequency: "ANNUALLY" as const, last_date: "2026-02-01", predicted_next_date: "2027-02-01" };
    expect(occurrences(yearly, "2026-09-01", "2026-09-30")).toEqual([]);
  });
});
