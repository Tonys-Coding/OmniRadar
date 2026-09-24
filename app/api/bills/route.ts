import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { addDays, today } from "@/lib/dates";
import { loadStreams } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const Query = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });

/** Bills AND subscriptions expected in the next N days (plus up to 3 days overdue). */
export const GET = withAuth(async (request, auth) => {
  const { days } = readQuery(request, Query);
  const start = addDays(today(), -3);
  const end = addDays(today(), days);

  const upcoming = (await loadStreams(auth.supabase))
    .filter(
      (s) =>
        s.direction === "outflow" &&
        (s.effective_kind === "bill" || s.effective_kind === "subscription") &&
        s.predicted_next_date !== null &&
        s.predicted_next_date >= start &&
        s.predicted_next_date <= end,
    )
    .map((s) => ({ ...s, expected_amount: s.last_amount ?? s.average_amount ?? 0, overdue: s.predicted_next_date! < today() }))
    .sort((a, b) => a.predicted_next_date!.localeCompare(b.predicted_next_date!));

  const total = Math.round(upcoming.reduce((sum, b) => sum + b.expected_amount, 0) * 100) / 100;
  return json({ window: { start, end, days }, bills: upcoming, totals: { count: upcoming.length, amount: total } });
});
