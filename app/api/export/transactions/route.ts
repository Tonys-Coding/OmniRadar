import { withAuth } from "@/lib/auth";
import { csvCell } from "@/lib/csv";
import { today } from "@/lib/dates";
import { loadAll } from "@/lib/finance/queries";

const COLUMNS = ["date", "description", "merchant", "amount", "category", "subcategory", "account", "pending", "notes"];

/**
 * Download every transaction as CSV. Amount uses the everyday convention:
 * negative = money out, positive = money in.
 */
export const GET = withAuth(async (_request, auth) => {
  const rows = await loadAll((from, to) =>
    auth.supabase
      .from("transactions")
      .select("date, name, merchant_name, amount, category_primary, category_detailed, pending, notes, accounts(name, mask)")
      .order("date", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    const account = r.accounts ? `${r.accounts.name}${r.accounts.mask ? ` ${r.accounts.mask}` : ""}` : "";
    lines.push(
      [r.date, r.name, r.merchant_name, (-r.amount).toFixed(2), r.category_primary, r.category_detailed, account, r.pending ? "yes" : "no", r.notes]
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
