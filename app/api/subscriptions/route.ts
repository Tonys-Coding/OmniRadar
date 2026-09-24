import { withAuth } from "@/lib/auth";
import { loadStreams } from "@/lib/finance/queries";
import { json } from "@/lib/http";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Active subscriptions with monthly and yearly cost, most expensive first. */
export const GET = withAuth(async (_request, auth) => {
  const subscriptions = (await loadStreams(auth.supabase))
    .filter((s) => s.direction === "outflow" && s.effective_kind === "subscription")
    .sort((a, b) => b.monthly_amount - a.monthly_amount);

  const monthly = round2(subscriptions.reduce((sum, s) => sum + s.monthly_amount, 0));
  return json({ subscriptions, totals: { count: subscriptions.length, monthly, yearly: round2(monthly * 12) } });
});
