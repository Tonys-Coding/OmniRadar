import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { addDays, addMonths, startOfMonth, today } from "@/lib/dates";
import { spendingByCategory } from "@/lib/finance/aggregate";
import { cumulativeByDay, dailyTotals, topMerchants } from "@/lib/finance/analytics";
import { loadAnalyticsTxns, loadIncomeTransactionIds, loadVisibleAccounts } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const Query = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One month of spending: categories (with last month for comparison), top
 * merchants, and a running total vs last month.
 */
export const GET = withAuth(async (request, auth) => {
  const now = today();
  const month = readQuery(request, Query).month ?? now.slice(0, 7);
  const start = `${month}-01`;
  const nextMonth = addMonths(start, 1);
  const end = addDays(nextMonth, -1) < now ? addDays(nextMonth, -1) : now;
  const prevStart = addMonths(start, -1);
  const prevEnd = addDays(start, -1);

  const [accounts, incomeIds] = await Promise.all([
    loadVisibleAccounts(auth.supabase),
    loadIncomeTransactionIds(auth.supabase),
  ]);
  const txns = (await loadAnalyticsTxns(auth.supabase, prevStart, accounts)).filter((t) => t.date < nextMonth);
  const current = txns.filter((t) => t.date >= start);
  const previous = txns.filter((t) => t.date < start);

  const categories = spendingByCategory(current, incomeIds);
  const prevCategories = new Map(spendingByCategory(previous, incomeIds).map((c) => [c.category, c.total]));
  const total = round2(categories.reduce((sum, c) => sum + c.total, 0));
  const prevTotal = round2([...prevCategories.values()].reduce((sum, v) => sum + v, 0));

  return json({
    month,
    is_current_month: start === startOfMonth(now),
    total,
    previous_total: prevTotal,
    change: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 1000) / 1000 : null,
    categories: categories.map((c) => ({
      ...c,
      share: total > 0 ? Math.round((c.total / total) * 1000) / 1000 : 0,
      previous_total: prevCategories.get(c.category) ?? 0,
    })),
    merchants: topMerchants(current, 10, incomeIds),
    running: {
      current: start <= end ? cumulativeByDay(dailyTotals(current, start, end, incomeIds)) : [],
      previous: cumulativeByDay(dailyTotals(previous, prevStart, prevEnd, incomeIds)),
    },
  });
});
