import { addDays } from "@/lib/dates";
import { isLiability } from "./aggregate";

// Rebuild daily balances from today's balance and transaction history, so
// charts have real history from the day a bank is linked (Plaid returns up
// to 2 years of transactions but only the current balance).
//
// Walking backwards from today:
//   asset (checking, savings, investment): balance before a txn = after + amount
//   liability (card, loan, amount owed):   owed before a txn    = after - amount
// (Plaid amounts: positive = money out of an asset / new charge on a card.)
//
// Only cash and credit card accounts are rebuilt: their transactions fully
// explain the balance. Loans (interest accrues without transactions) and
// investments (market moves) are held at today's balance instead of drifting.

export type HistoryAccount = { id: string; type: string; current_balance: number | null };
export type HistoryTxn = { account_id: string; amount: number; date: string; pending: boolean };
export type BalancePoint = { date: string; cash: number; assets: number; liabilities: number; net_worth: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

const REBUILT_TYPES = new Set(["depository", "credit"]);

export function reconstructBalances(accounts: HistoryAccount[], txns: HistoryTxn[], from: string, to: string): BalancePoint[] {
  const byAccount = new Map(accounts.filter((a) => REBUILT_TYPES.has(a.type)).map((a) => [a.id, a]));
  // Net change per day per account (posted transactions only; the current
  // balance generally excludes pending ones).
  const changes = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (t.pending || !byAccount.has(t.account_id) || t.date > to) continue;
    const day = changes.get(t.date) ?? new Map<string, number>();
    day.set(t.account_id, (day.get(t.account_id) ?? 0) + t.amount);
    changes.set(t.date, day);
  }

  const balance = new Map(accounts.map((a) => [a.id, a.current_balance ?? 0]));
  const points: BalancePoint[] = [];
  for (let day = to; day >= from; day = addDays(day, -1)) {
    let cash = 0;
    let assets = 0;
    let liabilities = 0;
    for (const a of accounts) {
      const b = balance.get(a.id)!;
      if (isLiability(a.type)) liabilities += b;
      else {
        assets += b;
        if (a.type === "depository") cash += b;
      }
    }
    points.push({ date: day, cash: round2(cash), assets: round2(assets), liabilities: round2(liabilities), net_worth: round2(assets - liabilities) });

    // Undo this day's transactions to get the previous day's closing balance.
    for (const [accountId, amount] of changes.get(day) ?? []) {
      const a = byAccount.get(accountId)!;
      balance.set(accountId, balance.get(accountId)! + (isLiability(a.type) ? -amount : amount));
    }
  }
  return points.reverse();
}
