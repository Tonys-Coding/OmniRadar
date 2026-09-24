import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { addDays, addMonths, startOfMonth, today } from "@/lib/dates";
import { cashflowByMonth, netWorth, spendingByCategory } from "@/lib/finance/aggregate";
import { dailyTotals, startOfWeek } from "@/lib/finance/analytics";
import { loadAnalyticsTxns, loadIncomeTransactionIds, loadStreams, loadVisibleAccounts } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const Query = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) });

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Everything the dashboard's first screen needs, in one call. */
export const GET = withAuth(async (request, auth) => {
  const { months } = readQuery(request, Query);
  const now = today();
  const thisMonth = startOfMonth(now);
  const firstMonth = addMonths(thisMonth, -(months - 1));
  const weekStart = startOfWeek(now, auth.settings.week_start);
  const monthKeys = Array.from({ length: months }, (_, i) => addMonths(firstMonth, i).slice(0, 7));

  const [accounts, streams, incomeIds, items] = await Promise.all([
    loadVisibleAccounts(auth.supabase),
    loadStreams(auth.supabase),
    loadIncomeTransactionIds(auth.supabase),
    auth.supabase.from("plaid_items").select("id, institution_name, status, last_synced_at"),
  ]);
  if (items.error) throw items.error;

  const since = weekStart < firstMonth ? weekStart : firstMonth;
  const txns = await loadAnalyticsTxns(auth.supabase, since, accounts);
  const cashflow = cashflowByMonth(txns, monthKeys, incomeIds);
  const current = cashflow[cashflow.length - 1]!;

  const week = dailyTotals(txns, weekStart, now, incomeIds);
  const todayTotals = week[week.length - 1]!;
  const monthDays = dailyTotals(txns, thisMonth, now, incomeIds);
  const avgDailySpending = round2(current.spending / monthDays.length);

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
  const cash = accounts.filter((a) => a.type === "depository").reduce((sum, a) => sum + (a.current_balance ?? 0), 0);
  const available = accounts
    .filter((a) => a.type === "depository")
    .reduce((sum, a) => sum + (a.available_balance ?? a.current_balance ?? 0), 0);

  return json({
    as_of: now,
    balances: { cash: round2(cash), available: round2(available) },
    net_worth: netWorth(accounts),
    budget: auth.settings.monthly_budget,
    today: {
      date: now,
      spending: todayTotals.spending,
      income: todayTotals.income,
      count: todayTotals.count,
      average_daily_spending: avgDailySpending,
    },
    this_week: {
      start: weekStart,
      income: round2(week.reduce((sum, d) => sum + d.income, 0)),
      spending: round2(week.reduce((sum, d) => sum + d.spending, 0)),
      days: week,
    },
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
