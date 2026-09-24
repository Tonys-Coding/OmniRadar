import "server-only";
import { PersonalFinanceCategoryVersion, type TransactionStream } from "plaid";
import { today } from "@/lib/dates";
import { classifyStream } from "@/lib/finance/categories";
import { plaid, plaidError, RELINK_ERROR_CODES } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { StreamDirection, StreamFrequency } from "@/lib/supabase/database.types";
import { applyMajorityCategory, type TxnCategory } from "./categorize";
import { detectRecurring, type DetectInput } from "./detect";
import type { StreamInsert } from "./types";

const PLAID_FREQUENCIES = new Set<StreamFrequency>(["WEEKLY", "BIWEEKLY", "SEMI_MONTHLY", "MONTHLY", "ANNUALLY"]);

export function mapPlaidStream(
  stream: TransactionStream,
  direction: StreamDirection,
  userId: string,
  accountId: string,
): StreamInsert {
  const primary = stream.personal_finance_category?.primary ?? null;
  const detailed = stream.personal_finance_category?.detailed ?? null;
  const frequency = PLAID_FREQUENCIES.has(stream.frequency as StreamFrequency)
    ? (stream.frequency as StreamFrequency)
    : "UNKNOWN";
  return {
    user_id: userId,
    account_id: accountId,
    stream_key: stream.stream_id,
    source: "plaid",
    direction,
    kind: classifyStream(direction, primary, detailed),
    description: stream.description,
    merchant_name: stream.merchant_name ?? null,
    category_primary: primary,
    category_detailed: detailed,
    frequency,
    first_date: stream.first_date,
    last_date: stream.last_date,
    predicted_next_date: stream.predicted_next_date ?? null,
    average_amount: Math.abs(stream.average_amount.amount ?? 0),
    last_amount: Math.abs(stream.last_amount.amount ?? 0),
    is_active: stream.is_active && stream.status !== "TOMBSTONED",
    transaction_ids: stream.transaction_ids,
  };
}

async function upsertStreams(streams: StreamInsert[], accountIds: string[], source: "plaid" | "local") {
  const db = supabaseAdmin();
  if (streams.length > 0) {
    // kind_override / is_ignored are not in the payload, so user choices survive.
    const { error } = await db.from("recurring_streams").upsert(streams, { onConflict: "stream_key" });
    if (error) throw error;
  }
  // Streams no longer reported for these accounts: keep them (and their user
  // overrides) but mark inactive.
  const keep = streams.map((s) => s.stream_key);
  let stale = db
    .from("recurring_streams")
    .update({ is_active: false })
    .in("account_id", accountIds)
    .eq("source", source);
  if (keep.length > 0) stale = stale.not("stream_key", "in", `(${keep.map((k) => `"${k}"`).join(",")})`);
  const { error } = await stale;
  if (error) throw error;
}

async function loadTransactionsForDetection(accountIds: string[]): Promise<DetectInput[]> {
  const db = supabaseAdmin();
  const rows: DetectInput[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("transactions")
      .select("plaid_transaction_id, account_id, amount, date, name, merchant_name, category_primary, category_detailed, pending")
      .in("account_id", accountIds)
      .order("date", { ascending: true })
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function loadTransactionCategories(plaidTransactionIds: string[]): Promise<Map<string, TxnCategory>> {
  const db = supabaseAdmin();
  const categories = new Map<string, TxnCategory>();
  // Chunked to keep the request URL short.
  for (let i = 0; i < plaidTransactionIds.length; i += 100) {
    const { data, error } = await db
      .from("transactions")
      .select("plaid_transaction_id, category_primary, category_detailed")
      .in("plaid_transaction_id", plaidTransactionIds.slice(i, i + 100));
    if (error) throw error;
    for (const t of data) {
      categories.set(t.plaid_transaction_id, { primary: t.category_primary, detailed: t.category_detailed });
    }
  }
  return categories;
}

export type RecurringResult = { source: "plaid" | "local"; streams: number; note?: string };

/**
 * Refresh subscriptions / bills / income streams for one Item.
 * Uses Plaid's recurring endpoint when available, otherwise the local detector.
 */
export async function refreshRecurring(input: {
  userId: string;
  accessToken: string;
  accountMap: Map<string, string>; // plaid_account_id -> accounts.id
}): Promise<RecurringResult> {
  const accountIds = [...input.accountMap.values()];
  if (accountIds.length === 0) return { source: "plaid", streams: 0 };

  try {
    const { data } = await plaid().transactionsRecurringGet({
      access_token: input.accessToken,
      // Same taxonomy as synced transactions, so stream and transaction categories agree.
      options: {
        include_personal_finance_category: true,
        personal_finance_category_version: PersonalFinanceCategoryVersion.V2,
      },
    });
    const streams: StreamInsert[] = [];
    for (const [list, direction] of [
      [data.outflow_streams, "outflow"],
      [data.inflow_streams, "inflow"],
    ] as const) {
      for (const stream of list) {
        const accountId = input.accountMap.get(stream.account_id);
        if (accountId) streams.push(mapPlaidStream(stream, direction, input.userId, accountId));
      }
    }
    const categories = await loadTransactionCategories(streams.flatMap((s) => s.transaction_ids ?? []));
    await upsertStreams(
      streams.map((s) => applyMajorityCategory(s, categories)),
      accountIds,
      "plaid",
    );
    return { source: "plaid", streams: streams.length };
  } catch (error) {
    const body = plaidError(error);
    if (!body || RELINK_ERROR_CODES.has(body.error_code ?? "")) throw error;
    // Recurring add-on not enabled, product not ready, etc.: fall back.
    const streams = detectRecurring(await loadTransactionsForDetection(accountIds), input.userId, today());
    await upsertStreams(streams, accountIds, "local");
    return { source: "local", streams: streams.length, note: `Plaid recurring unavailable (${body.error_code})` };
  }
}
