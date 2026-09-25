import { describe, expect, it } from "vitest";
import { cardColors, cardFigures, detectNetwork, hasCard, INK_CARD, luminance, maskedNumber, readableBase } from "@/lib/cards";

const account = (over: Partial<Parameters<typeof detectNetwork>[0]> = {}) => ({
  name: "Adv Plus Banking",
  official_name: null,
  type: "depository",
  subtype: "checking",
  card_network: null,
  ...over,
});

describe("hasCard", () => {
  it("is true for checking and credit, false for savings and loans", () => {
    expect(hasCard({ type: "depository", subtype: "checking" })).toBe(true);
    expect(hasCard({ type: "credit", subtype: "credit card" })).toBe(true);
    expect(hasCard({ type: "depository", subtype: "savings" })).toBe(false);
    expect(hasCard({ type: "depository", subtype: "cd" })).toBe(false);
    expect(hasCard({ type: "loan", subtype: "auto" })).toBe(false);
  });
});

describe("detectNetwork", () => {
  it("prefers the owner's choice", () => {
    expect(detectNetwork(account({ card_network: "amex" }), "Bank of America")).toEqual({ network: "amex", guessed: false });
  });

  it("reads clues from the account name before the bank default", () => {
    const quicksilver = account({ type: "credit", subtype: "credit card", official_name: "Quicksilver World Elite Mastercard" });
    expect(detectNetwork(quicksilver, "Capital One")).toEqual({ network: "mastercard", guessed: true });
    const venture = account({ type: "credit", subtype: "credit card", name: "Venture Visa Signature" });
    expect(detectNetwork(venture, "Capital One")).toEqual({ network: "visa", guessed: true });
  });

  it("falls back to the bank's usual debit network", () => {
    expect(detectNetwork(account(), "Bank of America").network).toBe("visa");
    expect(detectNetwork(account({ name: "360 Checking" }), "Capital One").network).toBe("mastercard");
    expect(detectNetwork(account(), "Some Credit Union").network).toBeNull();
  });

  it("does not match banks by accident", () => {
    expect(detectNetwork(account(), "Citizens Bank").network).toBeNull();
  });

  it("gives savings accounts no network", () => {
    expect(detectNetwork(account({ subtype: "savings" }), "Bank of America")).toEqual({ network: null, guessed: false });
  });
});

describe("cardColors", () => {
  it("uses the curated color for known banks, even over Plaid's", () => {
    expect(cardColors("Bank of America", "#e31837").base).toBe("#012169");
  });

  it("uses Plaid's color for other banks and the ink card when there is none", () => {
    expect(cardColors("First Platypus Bank", "#1a73e8").base).not.toBe(INK_CARD.base);
    expect(cardColors("First Platypus Bank", null)).toEqual(INK_CARD);
    expect(cardColors(null, "not-a-color")).toEqual(INK_CARD);
  });

  it("always leaves white text readable, even on the lighter end of the gradient", () => {
    for (const color of ["#ffd400", "#a6e3e4", "#ffffff", "#d03027"]) {
      expect(1.05 / (luminance(readableBase(color)) + 0.05)).toBeGreaterThanOrEqual(4.5);
      expect(1.05 / (luminance(cardColors(null, color).from) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("cardFigures", () => {
  it("shows balance and available for checking, skipping available when equal", () => {
    const f = cardFigures({ type: "depository", current_balance: 1200, available_balance: 1100, credit_limit: null });
    expect(f).toEqual({ primary: { label: "Balance", value: 1200 }, secondary: { label: "Available", value: 1100 }, utilization: null });
    expect(cardFigures({ type: "depository", current_balance: 50, available_balance: 50, credit_limit: null }).secondary).toBeNull();
  });

  it("shows balance, limit, and utilization for credit", () => {
    const f = cardFigures({ type: "credit", current_balance: 1240, available_balance: 3760, credit_limit: 5000 });
    expect(f.secondary).toEqual({ label: "Limit", value: 5000 });
    expect(f.utilization).toBeCloseTo(0.248);
  });

  it("derives the limit from the available credit when Plaid omits it", () => {
    const f = cardFigures({ type: "credit", current_balance: 250, available_balance: 750, credit_limit: null });
    expect(f.secondary).toEqual({ label: "Limit", value: 1000 });
    expect(f.utilization).toBeCloseTo(0.25);
  });
});

it("masks the number", () => {
  expect(maskedNumber("6782")).toBe("•••• •••• 6782");
  expect(maskedNumber(null)).toBe("•••• •••• ••••");
});
