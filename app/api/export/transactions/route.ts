import { withAuth } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { today } from "@/lib/dates";
import { loadAll } from "@/lib/finance/queries";
import { readQuery } from "@/lib/http";
import { applyTxnFilters, TxnFilters, txnOrder } from "@/lib/transactions-query";

const COLUMNS = ["date", "description", "merchant", "amount", "category", "subcategory", "account", "pending", "notes", "channel"];

/**
 * Download transactions as CSV: every transaction, or only those matching the
 * same filters the Transactions page uses (`?category=...&start=...`).
 * Amount uses the everyday convention: negative = money out, positive = money in.
 */
export const GET = withAuth(async (request, auth) => {
  const f = readQuery(request, TxnFilters);
  const rows = await loadAll((from, to) => {
    let query = auth.supabase
      .from("transactions")
      .select("date, name, merchant_name, amount, category_primary, category_detailed, pending, notes, payment_channel, accounts(name, mask)");
    for (const o of txnOrder(f.sort)) query = query.order(o.column, { ascending: o.ascending });
    return applyTxnFilters(query.order("id"), f).range(from, to);
  });

  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    const account = r.accounts ? `${r.accounts.name}${r.accounts.mask ? ` ${r.accounts.mask}` : ""}` : "";
    lines.push(
      [r.date, r.name, r.merchant_name, (-r.amount).toFixed(2), r.category_primary, r.category_detailed, account, r.pending ? "yes" : "no", r.notes, r.payment_channel]
        .map(csvCell)
        .join(","),
    );
  }

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="omniradar-transactions-${today()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
