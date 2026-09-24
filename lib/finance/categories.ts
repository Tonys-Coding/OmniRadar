import type { StreamDirection, StreamFrequency, StreamKind } from "@/lib/supabase/database.types";

// Rules built on Plaid's personal finance categories (PFC v2 taxonomy:
// https://plaid.com/documents/pfc-taxonomy-all.csv).
//
// Amount sign follows Plaid: positive = money out, negative = money in.

/** Money moving between your own accounts or borrowed money: not income, not spending. */
const CASHFLOW_EXCLUDED_PRIMARY = new Set(["TRANSFER_IN", "TRANSFER_OUT", "LOAN_DISBURSEMENTS"]);
const CASHFLOW_EXCLUDED_DETAILED = new Set(["LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"]);

/**
 * Whether a transaction is ignored by income/spending totals. Card payments are
 * excluded because the purchases on the card are already counted.
 */
export function isCashflowExcluded(primary: string | null, detailed: string | null): boolean {
  return CASHFLOW_EXCLUDED_PRIMARY.has(primary ?? "") || CASHFLOW_EXCLUDED_DETAILED.has(detailed ?? "");
}

const BILL_PRIMARY = new Set(["RENT_AND_UTILITIES", "LOAN_PAYMENTS"]);
const BILL_DETAILED = new Set(["GENERAL_SERVICES_INSURANCE", "GENERAL_SERVICES_CHILDCARE", "GENERAL_SERVICES_EDUCATION"]);
const SUBSCRIPTION_PRIMARY = new Set(["ENTERTAINMENT", "GENERAL_SERVICES", "PERSONAL_CARE", "GENERAL_MERCHANDISE", "OTHER"]);

/** Classify a recurring stream as subscription, bill, income, transfer, or other. */
export function classifyStream(
  direction: StreamDirection,
  primary: string | null,
  detailed: string | null,
): StreamKind {
  if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT" || primary === "LOAN_DISBURSEMENTS") return "transfer";
  if (direction === "inflow") return "income";
  if (BILL_PRIMARY.has(primary ?? "") || BILL_DETAILED.has(detailed ?? "")) return "bill";
  if (primary === null || SUBSCRIPTION_PRIMARY.has(primary)) return "subscription";
  // Recurring groceries, gas, restaurants, etc. are habits, not subscriptions.
  return "other";
}

/** Multiply a per-occurrence amount by this to get a monthly equivalent. */
export const MONTHLY_FACTOR: Record<StreamFrequency, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  SEMI_MONTHLY: 2,
  MONTHLY: 1,
  QUARTERLY: 1 / 3,
  ANNUALLY: 1 / 12,
  UNKNOWN: 1,
};

export function monthlyEquivalent(amount: number | null, frequency: StreamFrequency): number {
  return Math.round((amount ?? 0) * MONTHLY_FACTOR[frequency] * 100) / 100;
}

export function effectiveKind(stream: { kind: StreamKind; kind_override: StreamKind | null }): StreamKind {
  return stream.kind_override ?? stream.kind;
}
