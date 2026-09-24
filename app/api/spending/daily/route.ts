import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { addDays, today } from "@/lib/dates";
import { dailyTotals } from "@/lib/finance/analytics";
import { loadAnalyticsTxns, loadIncomeTransactionIds, loadVisibleAccounts } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const Query = z.object({ days: z.coerce.number().int().min(1).max(730).default(84) });

/** Spending and income per day for the last N days (activity heatmap). */
export const GET = withAuth(async (request, auth) => {
  const { days } = readQuery(request, Query);
  const to = today();
  const from = addDays(to, -(days - 1));
  const [accounts, incomeIds] = await Promise.all([
    loadVisibleAccounts(auth.supabase),
    loadIncomeTransactionIds(auth.supabase),
  ]);
  const txns = await loadAnalyticsTxns(auth.supabase, from, accounts);
  const series = dailyTotals(txns, from, to, incomeIds);
  const spendingDays = series.filter((d) => d.spending > 0);
  return json({
    from,
    to,
    days: series,
    stats: {
      total: Math.round(series.reduce((sum, d) => sum + d.spending, 0) * 100) / 100,
      active_days: spendingDays.length,
      max: Math.max(0, ...series.map((d) => d.spending)),
    },
  });
});
