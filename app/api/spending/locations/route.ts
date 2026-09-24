import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { addDays, today } from "@/lib/dates";
import { spendingByLocation } from "@/lib/finance/analytics";
import { loadAnalyticsTxns, loadIncomeTransactionIds, loadVisibleAccounts } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const Query = z.object({ days: z.coerce.number().int().min(1).max(730).default(90) });

/** Where money was spent: by city and state, plus online and unknown. */
export const GET = withAuth(async (request, auth) => {
  const { days } = readQuery(request, Query);
  const from = addDays(today(), -(days - 1));
  const [accounts, incomeIds] = await Promise.all([
    loadVisibleAccounts(auth.supabase),
    loadIncomeTransactionIds(auth.supabase),
  ]);
  const txns = await loadAnalyticsTxns(auth.supabase, from, accounts);
  return json({ from, ...spendingByLocation(txns, incomeIds) });
});
