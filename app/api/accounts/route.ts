import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { isLiability, netWorth } from "@/lib/finance/aggregate";
import { json, readQuery } from "@/lib/http";

const Query = z.object({ include_hidden: z.stringbool().default(false) });

/** Every account with its bank and balances, plus totals. */
export const GET = withAuth(async (request, auth) => {
  const { include_hidden } = readQuery(request, Query);
  let query = auth.supabase
    .from("accounts")
    .select(
      "id, name, official_name, mask, type, subtype, current_balance, available_balance, credit_limit, iso_currency_code, balance_updated_at, is_hidden, plaid_items(id, institution_name, status)",
    )
    .order("type")
    .order("name");
  if (!include_hidden) query = query.eq("is_hidden", false);
  const { data, error } = await query;
  if (error) throw error;

  const accounts = data.map(({ plaid_items, ...a }) => ({
    ...a,
    is_liability: isLiability(a.type),
    institution: plaid_items,
    credit_utilization:
      a.type === "credit" && a.credit_limit ? Math.round(((a.current_balance ?? 0) / a.credit_limit) * 1000) / 1000 : null,
  }));
  return json({ accounts, totals: netWorth(accounts.filter((a) => !a.is_hidden)) });
});
