import type { RemovedTransaction, Transaction } from "plaid";

export type SyncPage = {
  added: Transaction[];
  modified: Transaction[];
  removed: RemovedTransaction[];
  next_cursor: string;
  has_more: boolean;
  transactions_update_status?: string;
};

export type SyncBatch = {
  added: Transaction[];
  modified: Transaction[];
  removedIds: string[];
  cursor: string | undefined;
  updateStatus: string | undefined;
};

/**
 * Page through /transactions/sync from `startCursor` until has_more is false.
 *
 * If Plaid reports the data changed mid-pagination, all pages are discarded and
 * pagination restarts from the original cursor (Plaid's documented recovery).
 * Nothing is written until the full batch is collected, so a failure never
 * leaves a half-applied sync.
 */
export async function collectSyncPages(
  fetchPage: (cursor: string | undefined) => Promise<SyncPage>,
  startCursor: string | undefined,
  isMutationError: (error: unknown) => boolean,
  maxRestarts = 3,
): Promise<SyncBatch> {
  for (let attempt = 0; ; attempt++) {
    const batch: SyncBatch = { added: [], modified: [], removedIds: [], cursor: startCursor, updateStatus: undefined };
    try {
      let hasMore = true;
      while (hasMore) {
        const page = await fetchPage(batch.cursor);
        batch.added.push(...page.added);
        batch.modified.push(...page.modified);
        batch.removedIds.push(...page.removed.map((r) => r.transaction_id).filter((id): id is string => !!id));
        batch.cursor = page.next_cursor;
        batch.updateStatus = page.transactions_update_status;
        hasMore = page.has_more;
      }
      return batch;
    } catch (error) {
      if (attempt < maxRestarts && isMutationError(error)) continue;
      throw error;
    }
  }
}
