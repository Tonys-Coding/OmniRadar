import { withAuth } from "@/lib/auth";
import { today } from "@/lib/dates";
import { loadStreamCharges, loadStreams } from "@/lib/finance/queries";
import { json } from "@/lib/http";
import { findDuplicates, monthlySpend, priceChange } from "@/lib/recurring/subscriptions";

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Charges sent per subscription (enough for a year of weekly ones). */
const MAX_CHARGES = 60;

/**
 * Subscriptions with their charge history: active ones (most expensive first),
 * ones that stopped charging, and hidden outflows. Each carries its charges,
 * total spent, latest price change, and a duplicate group when the same
 * service is charged more than once. `history` is subscription spend per month
 * for the last 12 months.
 */
export const GET = withAuth(async (_request, auth) => {
  const outflows = (await loadStreams(auth.supabase, { includeInactive: true, includeIgnored: true })).filter((s) => s.direction === "outflow");
  const subs = outflows.filter((s) => !s.is_ignored && s.effective_kind === "subscription");
  const charges = await loadStreamCharges(auth.supabase, subs.map((s) => s.id));
  const duplicates = findDuplicates(subs.filter((s) => s.is_active));

  const enriched = subs
    .map((s) => {
      const list = charges.get(s.id) ?? [];
      return {
        ...s,
        charges: list.slice(-MAX_CHARGES),
        total_spent: round2(list.reduce((sum, c) => sum + c.amount, 0)),
        price_change: priceChange(list),
        duplicate_key: duplicates.get(s.id) ?? null,
      };
    })
    .sort((a, b) => b.monthly_amount - a.monthly_amount || a.description.localeCompare(b.description));

  const subscriptions = enriched.filter((s) => s.is_active);
  const monthly = round2(subscriptions.reduce((sum, s) => sum + s.monthly_amount, 0));
  return json({
    subscriptions,
    stopped: enriched.filter((s) => !s.is_active).sort((a, b) => (b.last_date ?? "").localeCompare(a.last_date ?? "")),
    hidden: outflows.filter((s) => s.is_ignored),
    totals: { count: subscriptions.length, monthly, yearly: round2(monthly * 12) },
    history: monthlySpend([...charges.values()].flat(), today().slice(0, 7)),
  });
});
