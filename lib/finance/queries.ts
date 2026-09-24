import "server-only";
import type { UserClient } from "@/lib/supabase/server";
import type { RecurringStreamRow } from "@/lib/supabase/database.types";
import type { AnalyticsTxn, PlaidLocation } from "./analytics";
import { effectiveKind, monthlyEquivalent } from "./categories";

// Read helpers for API routes. They run as the signed-in user (RLS applies).

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Read every row, 1000 at a time (PostgREST caps a single response). */
export async function loadAll<T>(fetchRange: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await fetchRange(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

/** Accounts that count toward totals (not hidden by the user). */
export async function loadVisibleAccounts(supabase: UserClient) {
  const { data, error } = await supabase
    .from("accounts")
    .select("id, item_id, name, official_name, mask, type, subtype, current_balance, available_balance, credit_limit, iso_currency_code, balance_updated_at, is_hidden")
    .eq("is_hidden", false)
    .order("type")
    .order("name");
  if (error) throw error;
  return data;
}

/**
 * Transactions since a date on the given (visible) accounts, with the fields
 * analytics need: category, merchant, logo, and Plaid's location.
 */
export async function loadAnalyticsTxns(
  supabase: UserClient,
  since: string,
  accounts: { id: string; type: string }[],
): Promise<AnalyticsTxn[]> {
  if (accounts.length === 0) return [];
  const types = new Map(accounts.map((a) => [a.id, a.type]));
  const rows = await loadAll((from, to) =>
    supabase
      .from("transactions")
      .select(
        "account_id, plaid_transaction_id, name, merchant_name, logo_url, payment_channel, amount, date, category_primary, category_detailed, location:raw->location",
      )
      .in("account_id", [...types.keys()])
      .gte("date", since)
      .order("date")
      .order("id")
      .range(from, to),
  );
  return rows.map(({ account_id, location, ...t }) => ({
    ...t,
    account_type: types.get(account_id) ?? "other",
    location: (location ?? null) as PlaidLocation,
  }));
}

/** Posted and pending amounts per account since a date (for balance history). */
export async function loadHistoryTxns(supabase: UserClient, since: string, accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return loadAll((from, to) =>
    supabase
      .from("transactions")
      .select("account_id, amount, date, pending")
      .in("account_id", accountIds)
      .gte("date", since)
      .order("date")
      .order("id")
      .range(from, to),
  );
}

/** Plaid transaction ids that belong to recurring income streams (paychecks). */
export async function loadIncomeTransactionIds(supabase: UserClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("recurring_streams")
    .select("kind, kind_override, transaction_ids")
    .eq("direction", "inflow")
    .eq("is_ignored", false);
  if (error) throw error;
  return new Set(data.filter((s) => effectiveKind(s) === "income").flatMap((s) => s.transaction_ids));
}

export type StreamView = Omit<RecurringStreamRow, "user_id" | "transaction_ids" | "created_at"> & {
  effective_kind: RecurringStreamRow["kind"];
  monthly_amount: number;
  transaction_count: number;
  account: { name: string; mask: string | null } | null;
  logo_url: string | null;
  website: string | null;
};

/** Recurring streams with effective kind and monthly-equivalent amount. */
export async function loadStreams(
  supabase: UserClient,
  opts: { includeInactive?: boolean; includeIgnored?: boolean } = {},
): Promise<StreamView[]> {
  let query = supabase
    .from("recurring_streams")
    .select(
      "id, account_id, stream_key, source, direction, kind, kind_override, description, merchant_name, category_primary, category_detailed, frequency, first_date, last_date, predicted_next_date, average_amount, last_amount, is_active, is_ignored, updated_at, transaction_ids, accounts(name, mask)",
    )
    .order("predicted_next_date");
  if (!opts.includeInactive) query = query.eq("is_active", true);
  if (!opts.includeIgnored) query = query.eq("is_ignored", false);
  const { data, error } = await query;
  if (error) throw error;

  // Streams have no logo of their own: borrow the one on their latest charge.
  const latestIds = data.map((s) => s.transaction_ids[s.transaction_ids.length - 1]).filter((id): id is string => !!id);
  const logos = new Map<string, { logo_url: string | null; website: string | null }>();
  for (let i = 0; i < latestIds.length; i += 100) {
    const { data: rows, error: logoError } = await supabase
      .from("transactions")
      .select("plaid_transaction_id, logo_url, website")
      .in("plaid_transaction_id", latestIds.slice(i, i + 100));
    if (logoError) throw logoError;
    for (const r of rows) logos.set(r.plaid_transaction_id, { logo_url: r.logo_url, website: r.website });
  }

  return data.map(({ transaction_ids, accounts, ...s }) => {
    const logo = logos.get(transaction_ids[transaction_ids.length - 1] ?? "");
    return {
      ...s,
      effective_kind: effectiveKind(s),
      monthly_amount: monthlyEquivalent(s.average_amount, s.frequency),
      transaction_count: transaction_ids.length,
      account: accounts ?? null,
      logo_url: logo?.logo_url ?? null,
      website: logo?.website ?? null,
    };
  });
}
