import "server-only";
import { PersonalFinanceCategoryVersion } from "plaid";
import { today } from "@/lib/dates";
import { ensureBranding } from "@/lib/institutions";
import { getItemWithToken, saveCursor } from "@/lib/items";
import { plaid, plaidError, RELINK_ERROR_CODES } from "@/lib/plaid";
import { refreshRecurring, type RecurringResult } from "@/lib/recurring/refresh";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ItemStatus, SyncRunRow } from "@/lib/supabase/database.types";
import { collectSyncPages, type SyncBatch } from "./collect";
import { mapAccount, mapTransaction } from "./map";

export type SyncTrigger = SyncRunRow["trigger"];

export type SyncResult = {
  item_id: string;
  institution_name: string | null;
  status: ItemStatus;
  added: number;
  modified: number;
  removed: number;
  update_status?: string;
  recurring?: RecurringResult;
  error?: { code: string; message: string };
};

const CHUNK = 500;
const chunks = <T>(list: T[]) =>
  Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function statusForError(code: string | undefined): ItemStatus {
  if (code === "PENDING_EXPIRATION" || code === "PENDING_DISCONNECT") return "pending_expiration";
  if (code === "USER_PERMISSION_REVOKED" || code === "ACCESS_NOT_GRANTED") return "revoked";
  if (code && RELINK_ERROR_CODES.has(code)) return "login_required";
  return "error";
}

/** Refresh accounts + balances, record today's balance snapshot, return plaid_account_id -> id. */
async function refreshAccounts(userId: string, itemId: string, accessToken: string) {
  const db = supabaseAdmin();
  const { data } = await plaid().accountsGet({ access_token: accessToken });
  const now = new Date().toISOString();
  const rows = data.accounts.map((a) => mapAccount(a, userId, itemId, now));
  const { data: saved, error } = await db
    .from("accounts")
    .upsert(rows, { onConflict: "plaid_account_id" })
    .select("id, plaid_account_id, current_balance, available_balance");
  if (error) throw error;

  const snapshotDate = today();
  const { error: snapError } = await db.from("balance_snapshots").upsert(
    saved.map((a) => ({
      user_id: userId,
      account_id: a.id,
      snapshot_date: snapshotDate,
      current_balance: a.current_balance,
      available_balance: a.available_balance,
    })),
    { onConflict: "account_id,snapshot_date" },
  );
  if (snapError) throw snapError;

  return new Map(saved.map((a) => [a.plaid_account_id, a.id]));
}

/**
 * Pull everything new for one linked bank: accounts, balances, transactions
 * (cursor-based), and recurring streams. Never throws for Plaid/bank errors:
 * they are recorded on the item and returned in the result.
 *
 * `waitForData` polls briefly when Plaid hasn't finished the first pull yet
 * (right after linking).
 */
export async function syncItem(itemId: string, trigger: SyncTrigger, opts: { waitForData?: boolean } = {}): Promise<SyncResult> {
  const db = supabaseAdmin();
  const { item, accessToken, cursor } = await getItemWithToken(itemId);
  const result: SyncResult = {
    item_id: item.id,
    institution_name: item.institution_name,
    status: item.status,
    added: 0,
    modified: 0,
    removed: 0,
  };

  const { data: run } = await db
    .from("sync_runs")
    .insert({ user_id: item.user_id, item_id: item.id, trigger })
    .select("id")
    .single();

  try {
    const accountMap = await refreshAccounts(item.user_id, item.id, accessToken);
    await ensureBranding(item);

    const fetchPage = async (c: string | undefined) =>
      (
        await plaid().transactionsSync({
          access_token: accessToken,
          cursor: c,
          count: 500,
          options: {
            include_personal_finance_category: true,
            personal_finance_category_version: PersonalFinanceCategoryVersion.V2,
          },
        })
      ).data;
    const isMutation = (e: unknown) => plaidError(e)?.error_code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

    // Right after linking, Plaid may report INITIAL_UPDATE_COMPLETE while still
    // returning nothing, so keep polling until data arrives or history is done.
    const stillLoading = (b: SyncBatch) =>
      b.added.length === 0 && b.updateStatus !== "HISTORICAL_UPDATE_COMPLETE";
    let batch = await collectSyncPages(fetchPage, cursor ?? undefined, isMutation);
    for (let tries = 0; opts.waitForData && stillLoading(batch) && tries < 15; tries++) {
      await sleep(2000);
      batch = await collectSyncPages(fetchPage, cursor ?? undefined, isMutation);
    }
    result.update_status = batch.updateStatus;

    const rows = [...batch.added, ...batch.modified].flatMap((t) => {
      const accountId = accountMap.get(t.account_id);
      if (!accountId) console.warn(`[sync] transaction ${t.transaction_id} for unknown account ${t.account_id}`);
      return accountId ? [mapTransaction(t, item.user_id, accountId)] : [];
    });
    for (const chunk of chunks(rows)) {
      const { error } = await db.from("transactions").upsert(chunk, { onConflict: "plaid_transaction_id" });
      if (error) throw error;
    }
    for (const chunk of chunks(batch.removedIds)) {
      const { error } = await db.from("transactions").delete().in("plaid_transaction_id", chunk);
      if (error) throw error;
    }
    if (batch.cursor) await saveCursor(item.id, batch.cursor);

    result.added = batch.added.length;
    result.modified = batch.modified.length;
    result.removed = batch.removedIds.length;
    result.status = "good";

    try {
      result.recurring = await refreshRecurring({ userId: item.user_id, accessToken, accountMap });
    } catch (error) {
      console.warn(`[sync] recurring refresh failed for ${item.id}`, plaidError(error) ?? error);
    }

    await db
      .from("plaid_items")
      .update({ status: "good", error_code: null, last_synced_at: new Date().toISOString() })
      .eq("id", item.id);
  } catch (error) {
    const body = plaidError(error);
    const code = body?.error_code ?? "INTERNAL_ERROR";
    result.status = statusForError(body?.error_code);
    result.error = { code, message: body?.display_message ?? body?.error_message ?? (error as Error).message };
    if (!body) console.error(`[sync] ${item.id} failed`, error);
    await db.from("plaid_items").update({ status: result.status, error_code: code }).eq("id", item.id);
  } finally {
    if (run) {
      await db
        .from("sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          added: result.added,
          modified: result.modified,
          removed: result.removed,
          error: result.error ? `${result.error.code}: ${result.error.message}` : null,
        })
        .eq("id", run.id);
    }
  }
  return result;
}

/** Sync several items one after another (keeps Plaid rate limits happy). */
export async function syncItems(itemIds: string[], trigger: SyncTrigger) {
  const results: SyncResult[] = [];
  for (const id of itemIds) results.push(await syncItem(id, trigger));
  return results;
}
