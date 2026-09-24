import { isCashflowExcluded } from "./categories";

// Pure aggregation over rows already loaded from the database.
// Sign convention (Plaid): positive amount = money out, negative = money in.

export type CashflowTxn = {
  plaid_transaction_id: string;
  name: string;
  amount: number;
  date: string;
  category_primary: string | null;
  category_detailed: string | null;
  /** Account type (depository, credit, loan, ...). */
  account_type: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const PAYROLL = /\b(payroll|direct dep|dir dep|salary)\b/i;
const LIABILITY_TYPES = new Set(["credit", "loan"]);
export const isLiability = (type: string) => LIABILITY_TYPES.has(type);

export type CashflowKind = "income" | "spending" | "excluded";

/**
 * Decide how a transaction counts toward income and spending:
 *   - transfers, loan disbursements, and card payments: excluded
 *   - money INTO a credit card or loan is never income: it is a payment
 *     (excluded) unless it carries a spending category (a refund, which
 *     offsets spending). Seen: a card payment Plaid labeled INCOME_SALARY.
 *   - income: INCOME category, or a deposit in a recurring income stream or
 *     that looks like payroll. Seen: "Sweetgreen inc payroll" labeled as a
 *     restaurant because of the employer's name.
 *   - everything else is spending; refunds (negative) reduce it.
 */
export function classifyCashflow(t: CashflowTxn, incomeIds: ReadonlySet<string> = new Set()): CashflowKind {
  if (isCashflowExcluded(t.category_primary, t.category_detailed)) return "excluded";
  if (isLiability(t.account_type)) {
    return t.amount < 0 && (t.category_primary === "INCOME" || t.category_primary === null) ? "excluded" : "spending";
  }
  if (t.category_primary === "INCOME") return "income";
  if (t.amount < 0 && (incomeIds.has(t.plaid_transaction_id) || PAYROLL.test(t.name))) return "income";
  return "spending";
}

export type MonthCashflow = {
  month: string; // YYYY-MM
  income: number;
  spending: number;
  net: number;
  /** Share of income kept (net / income), or null with no income. */
  savings_rate: number | null;
};

/** Income and spending per month, using classifyCashflow(). */
export function cashflowByMonth(
  txns: CashflowTxn[],
  months: string[],
  incomeIds: ReadonlySet<string> = new Set(),
): MonthCashflow[] {
  const totals = new Map(months.map((m) => [m, { income: 0, spending: 0 }]));
  for (const t of txns) {
    const bucket = totals.get(t.date.slice(0, 7));
    const kind = classifyCashflow(t, incomeIds);
    if (!bucket || kind === "excluded") continue;
    if (kind === "income") bucket.income -= t.amount;
    else bucket.spending += t.amount;
  }
  return months.map((month) => {
    const { income, spending } = totals.get(month)!;
    const net = income - spending;
    return {
      month,
      income: round2(income),
      spending: round2(spending),
      net: round2(net),
      // Under $1 of income (e.g. only bank interest) makes a rate meaningless.
      savings_rate: income >= 1 ? Math.round((net / income) * 1000) / 1000 : null,
    };
  });
}

export type CategoryTotal = { category: string; total: number; count: number };

/** Spending per Plaid primary category, largest first (refunds net out). */
export function spendingByCategory(txns: CashflowTxn[], incomeIds: ReadonlySet<string> = new Set()): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const t of txns) {
    if (classifyCashflow(t, incomeIds) !== "spending") continue;
    const category = t.category_primary ?? "UNCATEGORIZED";
    const entry = totals.get(category) ?? { category, total: 0, count: 0 };
    entry.total += t.amount;
    entry.count++;
    totals.set(category, entry);
  }
  return [...totals.values()]
    .map((c) => ({ ...c, total: round2(c.total) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

export type BalanceAccount = { id: string; type: string; current_balance: number | null };

export type NetWorth = {
  net_worth: number;
  assets: number;
  liabilities: number;
  by_type: Record<string, number>;
};

/** Assets (cash, investments) minus liabilities (card and loan balances owed). */
export function netWorth(accounts: BalanceAccount[]): NetWorth {
  let assets = 0;
  let liabilities = 0;
  const byType: Record<string, number> = {};
  for (const a of accounts) {
    const balance = a.current_balance ?? 0;
    if (isLiability(a.type)) liabilities += balance;
    else assets += balance;
    byType[a.type] = round2((byType[a.type] ?? 0) + balance);
  }
  return { net_worth: round2(assets - liabilities), assets: round2(assets), liabilities: round2(liabilities), by_type: byType };
}
