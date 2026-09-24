import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { addDays, addMonths, today } from "@/lib/dates";
import { netWorth } from "@/lib/finance/aggregate";
import { reconstructBalances } from "@/lib/finance/balance-history";
import { loadHistoryTxns, loadVisibleAccounts } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const RANGES = { "1W": 7, "1M": 30, "3M": 90, "6M": 182, "1Y": 365, ALL: 730 } as const;
const Query = z.object({ range: z.enum(Object.keys(RANGES) as [keyof typeof RANGES]).default("3M") });

/**
 * Current net worth plus daily cash and net-worth history, rebuilt from
 * today's balances and transaction history (up to 2 years).
 */
export const GET = withAuth(async (request, auth) => {
  const { range } = readQuery(request, Query);
  const to = today();
  const from = range === "ALL" ? addMonths(to, -24) : addDays(to, -(RANGES[range] - 1));

  const accounts = await loadVisibleAccounts(auth.supabase);
  const txns = await loadHistoryTxns(
    auth.supabase,
    from,
    accounts.map((a) => a.id),
  );

  // Don't draw a flat line before the first transaction we know about.
  const firstTxn = txns.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  const start = firstTxn && firstTxn > from ? firstTxn : from;

  return json({ range, current: netWorth(accounts), series: reconstructBalances(accounts, txns, start, to) });
});
