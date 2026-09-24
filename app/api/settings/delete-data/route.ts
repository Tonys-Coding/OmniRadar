import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { json, readJson } from "@/lib/http";
import { removeItem } from "@/lib/items";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

const Body = z.object({ confirm: z.literal("DELETE", { error: 'Type "DELETE" to confirm' }) });

/**
 * Disconnect every bank at Plaid and delete all financial data (accounts,
 * transactions, recurring streams, history, categories). The login itself
 * and preferences are kept.
 */
export const POST = withAuth(async (request, auth) => {
  await readJson(request, Body);
  const db = supabaseAdmin();
  const { data: items, error } = await db.from("plaid_items").select("id").eq("user_id", auth.userId);
  if (error) throw error;

  for (const item of items) await removeItem(item.id, auth.userId);
  const { error: catError } = await db.from("categories").delete().eq("user_id", auth.userId);
  if (catError) throw catError;

  return json({ ok: true, banks_removed: items.length });
});
