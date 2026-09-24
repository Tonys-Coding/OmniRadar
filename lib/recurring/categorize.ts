import { classifyStream } from "@/lib/finance/categories";
import type { StreamInsert } from "./types";

export type TxnCategory = { primary: string | null; detailed: string | null };

/**
 * Re-categorize a stream by the most common category among its own
 * transactions. Plaid's stream-level category can disagree with the
 * transactions (seen: a ChatGPT subscription tagged TRANSFER_OUT while every
 * charge is GENERAL_SERVICES); the transactions are what the user sees.
 */
export function applyMajorityCategory(stream: StreamInsert, categories: Map<string, TxnCategory>): StreamInsert {
  const counts = new Map<string, { cat: TxnCategory; n: number }>();
  for (const id of stream.transaction_ids ?? []) {
    const cat = categories.get(id);
    if (!cat?.primary) continue;
    const key = `${cat.primary}|${cat.detailed}`;
    const entry = counts.get(key) ?? { cat, n: 0 };
    entry.n++;
    counts.set(key, entry);
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) return stream;
  return {
    ...stream,
    category_primary: best.cat.primary,
    category_detailed: best.cat.detailed,
    kind: classifyStream(stream.direction, best.cat.primary, best.cat.detailed),
  };
}
