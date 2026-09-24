import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { addDays, today } from "@/lib/dates";
import { netWorth, netWorthSeries } from "@/lib/finance/aggregate";
import { loadAll, loadVisibleAccounts } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const Query = z.object({ days: z.coerce.number().int().min(1).max(3650).default(90) });

/**
 * Net worth today and as a daily series. History starts the day the first
 * bank was linked (from daily balance snapshots taken at each sync).
 */
export const GET = withAuth(async (request, auth) => {
  const { days } = readQuery(request, Query);
  const to = today();
  const from = addDays(to, -(days - 1));

  const accounts = await loadVisibleAccounts(auth.supabase);
  const ids = accounts.map((a) => a.id);
  const snapshots =
    ids.length === 0
      ? []
      : await loadAll((start, end) =>
          auth.supabase
            .from("balance_snapshots")
            .select("account_id, snapshot_date, current_balance")
            .in("account_id", ids)
            .order("snapshot_date")
            .order("id")
            .range(start, end),
        );

  return json({ current: netWorth(accounts), series: netWorthSeries(accounts, snapshots, from, to) });
});
