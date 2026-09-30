import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { loadAll } from "@/lib/finance/queries";
import { summarizeTransactions } from "@/lib/finance/transactions";
import { json, readQuery } from "@/lib/http";
import { applyTxnFilters, TxnFilters, txnOrder } from "@/lib/transactions-query";

const Query = TxnFilters.extend({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const COLUMNS =
  "id, account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, logo_url, website, category_primary, category_detailed, payment_channel, pending, user_category_id, notes, location:raw->location, accounts(name, mask, type)";

/**
 * Transactions with filters, sorting, and pagination. The first page (offset 0)
 * also carries `summary`: totals over every matching transaction, not just this page.
 * Amounts follow Plaid: positive = money out, negative = money in.
 */
export const GET = withAuth(async (request, auth) => {
  const f = readQuery(request, Query);

  let list = auth.supabase.from("transactions").select(COLUMNS, { count: "exact" });
  for (const o of txnOrder(f.sort)) list = list.order(o.column, { ascending: o.ascending });
  list = list.order("id");

  const summaryRows =
    f.offset === 0
      ? loadAll((from, to) =>
          applyTxnFilters(
            auth.supabase.from("transactions").select("amount, pending, date, name, merchant_name").order("date", { ascending: false }).order("id"),
            f,
          ).range(from, to),
        )
      : null;

  const [{ data, count, error }, summary] = await Promise.all([
    applyTxnFilters(list, f).range(f.offset, f.offset + f.limit - 1),
    summaryRows?.then(summarizeTransactions),
  ]);
  if (error) throw error;
  return json({
    transactions: data,
    total: count ?? 0,
    limit: f.limit,
    offset: f.offset,
    has_more: f.offset + data.length < (count ?? 0),
    ...(summary ? { summary } : {}),
  });
});
