import { describe, expect, it } from "vitest";
import { classifyStream, effectiveKind, isCashflowExcluded, monthlyEquivalent } from "@/lib/finance/categories";

describe("isCashflowExcluded", () => {
  it("excludes transfers, loan disbursements, and card payments", () => {
    expect(isCashflowExcluded("TRANSFER_OUT", "TRANSFER_OUT_SAVINGS")).toBe(true);
    expect(isCashflowExcluded("TRANSFER_IN", "TRANSFER_IN_ACCOUNT_TRANSFER")).toBe(true);
    expect(isCashflowExcluded("LOAN_DISBURSEMENTS", "LOAN_DISBURSEMENTS_PERSONAL")).toBe(true);
    expect(isCashflowExcluded("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")).toBe(true);
  });

  it("keeps real income and spending, including loan payments", () => {
    expect(isCashflowExcluded("INCOME", "INCOME_SALARY")).toBe(false);
    expect(isCashflowExcluded("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE")).toBe(false);
    expect(isCashflowExcluded("LOAN_PAYMENTS", "LOAN_PAYMENTS_MORTGAGE_PAYMENT")).toBe(false);
    expect(isCashflowExcluded(null, null)).toBe(false);
  });
});

describe("classifyStream", () => {
  it.each([
    ["inflow", "INCOME", "INCOME_SALARY", "income"],
    ["inflow", "TRANSFER_IN", "TRANSFER_IN_SAVINGS", "transfer"],
    ["outflow", "TRANSFER_OUT", "TRANSFER_OUT_SAVINGS", "transfer"],
    ["outflow", "RENT_AND_UTILITIES", "RENT_AND_UTILITIES_INTERNET_AND_CABLE", "bill"],
    ["outflow", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CAR_PAYMENT", "bill"],
    ["outflow", "LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "bill"],
    ["outflow", "GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE", "bill"],
    ["outflow", "ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES", "subscription"],
    ["outflow", "PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "subscription"],
    ["outflow", null, null, "subscription"],
    ["outflow", "FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE", "other"],
  ] as const)("%s %s/%s -> %s", (direction, primary, detailed, expected) => {
    expect(classifyStream(direction, primary, detailed)).toBe(expected);
  });
});

describe("monthlyEquivalent", () => {
  it("normalizes by frequency", () => {
    expect(monthlyEquivalent(120, "ANNUALLY")).toBe(10);
    expect(monthlyEquivalent(15.49, "MONTHLY")).toBe(15.49);
    expect(monthlyEquivalent(10, "WEEKLY")).toBe(43.33);
    expect(monthlyEquivalent(null, "MONTHLY")).toBe(0);
  });
});

describe("effectiveKind", () => {
  it("prefers the user's override", () => {
    expect(effectiveKind({ kind: "subscription", kind_override: null })).toBe("subscription");
    expect(effectiveKind({ kind: "subscription", kind_override: "bill" })).toBe("bill");
  });
});
