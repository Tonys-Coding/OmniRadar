import type { Transaction } from "plaid";
import { describe, expect, it, vi } from "vitest";
import { collectSyncPages, type SyncPage } from "@/lib/sync/collect";

const tx = (id: string) => ({ transaction_id: id }) as Transaction;
const page = (p: Partial<SyncPage> & { next_cursor: string }): SyncPage => ({
  added: [],
  modified: [],
  removed: [],
  has_more: false,
  ...p,
});

class MutationError extends Error {}
const isMutation = (e: unknown) => e instanceof MutationError;

describe("collectSyncPages", () => {
  it("follows has_more across pages and returns the final cursor", async () => {
    const pages: Record<string, SyncPage> = {
      start: page({ added: [tx("a")], next_cursor: "c1", has_more: true }),
      c1: page({ modified: [tx("b")], removed: [{ transaction_id: "x", account_id: "acct" }], next_cursor: "c2" }),
    };
    const fetchPage = vi.fn(async (cursor: string | undefined) => pages[cursor ?? "start"]!);

    const batch = await collectSyncPages(fetchPage, undefined, isMutation);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(batch.added.map((t) => t.transaction_id)).toEqual(["a"]);
    expect(batch.modified.map((t) => t.transaction_id)).toEqual(["b"]);
    expect(batch.removedIds).toEqual(["x"]);
    expect(batch.cursor).toBe("c2");
  });

  it("restarts from the original cursor after a mutation error, discarding partial pages", async () => {
    let calls = 0;
    const fetchPage = vi.fn(async (cursor: string | undefined) => {
      calls++;
      if (calls === 1) return page({ added: [tx("stale")], next_cursor: "c1", has_more: true });
      if (calls === 2) throw new MutationError();
      if (cursor === "orig") return page({ added: [tx("fresh")], next_cursor: "c9" });
      throw new Error(`unexpected cursor ${cursor}`);
    });

    const batch = await collectSyncPages(fetchPage, "orig", isMutation);

    expect(batch.added.map((t) => t.transaction_id)).toEqual(["fresh"]);
    expect(batch.cursor).toBe("c9");
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual(["orig", "c1", "orig"]);
  });

  it("gives up after too many restarts", async () => {
    const fetchPage = vi.fn(async () => {
      throw new MutationError();
    });
    await expect(collectSyncPages(fetchPage, undefined, isMutation, 2)).rejects.toBeInstanceOf(MutationError);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("rethrows other errors immediately", async () => {
    const fetchPage = vi.fn(async () => {
      throw new Error("ITEM_LOGIN_REQUIRED");
    });
    await expect(collectSyncPages(fetchPage, undefined, isMutation)).rejects.toThrow("ITEM_LOGIN_REQUIRED");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
