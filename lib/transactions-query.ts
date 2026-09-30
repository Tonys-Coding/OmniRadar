import "server-only";
import { z } from "zod";

// Filters shared by the transactions list and the CSV export, so an export
// always matches what the Transactions page is showing.

const isoDate = z.iso.date();

export const TxnFilters = z.object({
  start: isoDate.optional(),
  end: isoDate.optional(),
  account_id: z.uuid().optional(),
  /** Plaid primary category, e.g. FOOD_AND_DRINK */
  category: z.string().regex(/^[A-Z_]+$/).optional(),
  /** Search merchant, bank description, and notes (case-insensitive). */
  q: z.string().trim().max(100).optional(),
  /** Absolute amount range. */
  min_amount: z.coerce.number().nonnegative().optional(),
  max_amount: z.coerce.number().nonnegative().optional(),
  direction: z.enum(["in", "out"]).optional(),
  pending: z.stringbool().optional(),
  /** Plaid payment channel. */
  channel: z.enum(["online", "in store", "other"]).optional(),
  /** newest/oldest by date; largest_out = biggest charges first; largest_in = biggest deposits first. */
  sort: z.enum(["newest", "oldest", "largest_out", "largest_in"]).default("newest"),
});
export type TxnFilters = z.infer<typeof TxnFilters>;

// Characters that would break a PostgREST or() filter or act as wildcards.
const sanitizeSearch = (q: string) => q.replace(/[,()*%\\"'.:]/g, " ").trim();

/** The subset of the PostgREST builder the filters use (keeps this helper independent of the select). */
type Filterable = {
  gte(column: string, value: unknown): Filterable;
  lte(column: string, value: unknown): Filterable;
  gt(column: string, value: unknown): Filterable;
  lt(column: string, value: unknown): Filterable;
  eq(column: string, value: unknown): Filterable;
  or(filters: string): Filterable;
};

/** Apply every filter in `f` to a transactions query. */
export function applyTxnFilters<Q>(query: Q, f: TxnFilters): Q {
  let q = query as unknown as Filterable;
  if (f.start) q = q.gte("date", f.start);
  if (f.end) q = q.lte("date", f.end);
  if (f.account_id) q = q.eq("account_id", f.account_id);
  if (f.category) q = q.eq("category_primary", f.category);
  if (f.pending !== undefined) q = q.eq("pending", f.pending);
  if (f.channel) q = q.eq("payment_channel", f.channel);
  if (f.direction === "out") q = q.gt("amount", 0);
  if (f.direction === "in") q = q.lt("amount", 0);
  if (f.min_amount !== undefined) q = q.or(`amount.gte.${f.min_amount},amount.lte.${-f.min_amount}`);
  if (f.max_amount !== undefined) q = q.gte("amount", -f.max_amount).lte("amount", f.max_amount);
  const search = f.q ? sanitizeSearch(f.q) : "";
  if (search) q = q.or(`name.ilike.*${search}*,merchant_name.ilike.*${search}*,notes.ilike.*${search}*`);
  return q as unknown as Q;
}

/** Column + direction pairs for `sort` (always tie-broken by id for stable paging). */
export function txnOrder(sort: TxnFilters["sort"]): { column: "date" | "amount"; ascending: boolean }[] {
  switch (sort) {
    case "oldest":
      return [{ column: "date", ascending: true }];
    case "largest_out":
      return [
        { column: "amount", ascending: false },
        { column: "date", ascending: false },
      ];
    case "largest_in":
      return [
        { column: "amount", ascending: true },
        { column: "date", ascending: false },
      ];
    default:
      return [{ column: "date", ascending: false }];
  }
}
