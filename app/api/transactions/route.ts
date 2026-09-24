import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { json, readQuery } from "@/lib/http";

const isoDate = z.iso.date();

const Query = z.object({
  start: isoDate.optional(),
  end: isoDate.optional(),
  account_id: z.uuid().optional(),
  /** Plaid primary category, e.g. FOOD_AND_DRINK */
  category: z.string().regex(/^[A-Z_]+$/).optional(),
  /** Search name / merchant (case-insensitive). */
  q: z.string().trim().max(100).optional(),
  /** Absolute amount range. */
  min_amount: z.coerce.number().nonnegative().optional(),
  max_amount: z.coerce.number().nonnegative().optional(),
  direction: z.enum(["in", "out"]).optional(),
  pending: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Characters that would break a PostgREST or() filter or act as wildcards.
const sanitizeSearch = (q: string) => q.replace(/[,()*%\\"'.:]/g, " ").trim();

/**
 * Transactions, newest first, with filters and pagination.
 * Amounts follow Plaid: positive = money out, negative = money in.
 */
export const GET = withAuth(async (request, auth) => {
  const f = readQuery(request, Query);
  let query = auth.supabase
    .from("transactions")
    .select(
      "id, account_id, amount, iso_currency_code, date, authorized_date, name, merchant_name, logo_url, website, category_primary, category_detailed, payment_channel, pending, user_category_id, notes, accounts(name, mask, type)",
      { count: "exact" },
    )
    .order("date", { ascending: false })
    .order("id")
    .range(f.offset, f.offset + f.limit - 1);

  if (f.start) query = query.gte("date", f.start);
  if (f.end) query = query.lte("date", f.end);
  if (f.account_id) query = query.eq("account_id", f.account_id);
  if (f.category) query = query.eq("category_primary", f.category);
  if (f.pending !== undefined) query = query.eq("pending", f.pending);
  if (f.direction === "out") query = query.gt("amount", 0);
  if (f.direction === "in") query = query.lt("amount", 0);
  if (f.min_amount !== undefined) query = query.or(`amount.gte.${f.min_amount},amount.lte.${-f.min_amount}`);
  if (f.max_amount !== undefined) query = query.gte("amount", -f.max_amount).lte("amount", f.max_amount);
  const search = f.q ? sanitizeSearch(f.q) : "";
  if (search) query = query.or(`name.ilike.*${search}*,merchant_name.ilike.*${search}*`);

  const { data, count, error } = await query;
  if (error) throw error;
  return json({
    transactions: data,
    total: count ?? 0,
    limit: f.limit,
    offset: f.offset,
    has_more: f.offset + data.length < (count ?? 0),
  });
});
