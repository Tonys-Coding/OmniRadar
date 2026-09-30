// Totals for a filtered set of transactions (the Transactions page header).
// Amounts follow Plaid: positive = money out, negative = money in.

export type SummaryTxn = {
  amount: number;
  pending: boolean;
  date: string;
  name: string;
  merchant_name: string | null;
};

export type TransactionSummary = {
  count: number;
  money_in: number;
  money_out: number;
  /** money_in - money_out */
  net: number;
  count_in: number;
  count_out: number;
  pending: number;
  /** The biggest single charge in the set. */
  largest_out: { name: string; amount: number; date: string } | null;
  first_date: string | null;
  last_date: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeTransactions(rows: readonly SummaryTxn[]): TransactionSummary {
  let moneyIn = 0;
  let moneyOut = 0;
  let countIn = 0;
  let countOut = 0;
  let pending = 0;
  let largest: SummaryTxn | null = null;
  let first: string | null = null;
  let last: string | null = null;

  for (const t of rows) {
    const amount = Number(t.amount);
    if (amount < 0) {
      moneyIn -= amount;
      countIn++;
    } else if (amount > 0) {
      moneyOut += amount;
      countOut++;
      if (!largest || amount > Number(largest.amount)) largest = t;
    }
    if (t.pending) pending++;
    if (!first || t.date < first) first = t.date;
    if (!last || t.date > last) last = t.date;
  }

  return {
    count: rows.length,
    money_in: round2(moneyIn),
    money_out: round2(moneyOut),
    net: round2(moneyIn - moneyOut),
    count_in: countIn,
    count_out: countOut,
    pending,
    largest_out: largest ? { name: largest.merchant_name ?? largest.name, amount: round2(Number(largest.amount)), date: largest.date } : null,
    first_date: first,
    last_date: last,
  };
}
