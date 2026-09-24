import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { addDays, addMonths, startOfMonth, today } from "@/lib/dates";
import { cashflowByMonth, netWorth, spendingByCategory } from "@/lib/finance/aggregate";
import { loadCashflowTxns, loadIncomeTransactionIds, loadStreams, loadVisibleAccounts } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const Query = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) });

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Everything the dashboard's first screen needs, in one call. */
export const GET = withAuth(async (request, auth) => {
  const { months } = readQuery(request, Query);
  const now = today();
  const thisMonth = startOfMonth(now);
  const firstMonth = addMonths(thisMonth, -(months - 1));
  const monthKeys = Array.from({ length: months }, (_, i) => addMonths(firstMonth, i).slice(0, 7));

  const [accounts, streams, incomeIds, items] = await Promise.all([
    loadVisibleAccounts(auth.supabase),
    loadStreams(auth.supabase),
    loadIncomeTransactionIds(auth.supabase),
    auth.supabase.from("plaid_items").select("id, institution_name, status, last_synced_at"),
  ]);
  if (items.error) throw items.error;

  const txns = await loadCashflowTxns(auth.supabase, firstMonth, accounts);
  const cashflow = cashflowByMonth(txns, monthKeys, incomeIds);
  const current = cashflow[cashflow.length - 1]!;

  const outflows = streams.filter((s) => s.direction === "outflow");
  const sumMonthly = (list: typeof streams) => round2(list.reduce((sum, s) => sum + s.monthly_amount, 0));
  const in30 = addDays(now, 30);
  const upcomingBills = outflows.filter(
    (s) =>
      (s.effective_kind === "bill" || s.effective_kind === "subscription") &&
      s.predicted_next_date !== null &&
      s.predicted_next_date >= now &&
      s.predicted_next_date <= in30,
  );

  const syncTimes = items.data.map((i) => i.last_synced_at).filter((t): t is string => t !== null);

  return json({
    as_of: now,
    net_worth: netWorth(accounts),
    this_month: {
      ...current,
      spending_by_category: spendingByCategory(
        txns.filter((t) => t.date >= thisMonth),
        incomeIds,
      ),
    },
    cashflow,
    recurring: {
      subscriptions_monthly: sumMonthly(outflows.filter((s) => s.effective_kind === "subscription")),
      bills_monthly: sumMonthly(outflows.filter((s) => s.effective_kind === "bill")),
      income_monthly: sumMonthly(streams.filter((s) => s.effective_kind === "income")),
      upcoming_30_days: {
        count: upcomingBills.length,
        amount: round2(upcomingBills.reduce((sum, s) => sum + (s.last_amount ?? s.average_amount ?? 0), 0)),
      },
    },
    connections: {
      total: items.data.length,
      needing_attention: items.data.filter((i) => i.status !== "good"),
      oldest_sync: syncTimes.sort()[0] ?? null,
    },
  });
});
