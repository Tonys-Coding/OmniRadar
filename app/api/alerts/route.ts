import { buildAlerts } from "@/lib/alerts";
import { withAuth } from "@/lib/auth";
import { addDays, startOfMonth, today } from "@/lib/dates";
import { classifyCashflow } from "@/lib/finance/aggregate";
import { loadAnalyticsTxns, loadIncomeTransactionIds, loadStreams, loadVisibleAccounts } from "@/lib/finance/queries";
import { json } from "@/lib/http";

/** Notification bell: connection problems, low balances, big purchases, bills, budget pace. */
export const GET = withAuth(async (_request, auth) => {
  const now = today();
  const monthStart = startOfMonth(now);
  const weekAgo = addDays(now, -6);
  const since = weekAgo < monthStart ? weekAgo : monthStart;

  const [accounts, streams, incomeIds, items] = await Promise.all([
    loadVisibleAccounts(auth.supabase),
    loadStreams(auth.supabase),
    loadIncomeTransactionIds(auth.supabase),
    auth.supabase.from("plaid_items").select("id, institution_name, status"),
  ]);
  if (items.error) throw items.error;
  const txns = await loadAnalyticsTxns(auth.supabase, since, accounts);
  const spending = txns.filter((t) => classifyCashflow(t, incomeIds) === "spending");

  const [y, m] = now.split("-").map(Number) as [number, number];
  const alerts = buildAlerts({
    today: now,
    settings: auth.settings,
    items: items.data,
    accounts,
    recentSpending: spending
      .filter((t) => t.date >= weekAgo && t.amount > 0)
      .map((t) => ({ id: t.plaid_transaction_id, name: t.merchant_name ?? t.name, amount: t.amount, date: t.date })),
    bills: streams
      .filter((s) => s.direction === "outflow" && (s.effective_kind === "bill" || s.effective_kind === "subscription") && s.predicted_next_date)
      .map((s) => ({ id: s.id, name: s.merchant_name ?? s.description, amount: s.last_amount ?? s.average_amount ?? 0, due: s.predicted_next_date! })),
    month: {
      spending: spending.filter((t) => t.date >= monthStart).reduce((sum, t) => sum + t.amount, 0),
      dayOfMonth: Number(now.slice(8, 10)),
      daysInMonth: new Date(y, m, 0).getDate(),
    },
  });
  return json({ alerts });
});
