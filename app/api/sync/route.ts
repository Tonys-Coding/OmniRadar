import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { HttpError, json, readJson } from "@/lib/http";
import { syncItems } from "@/lib/sync/sync-item";

export const maxDuration = 60;

const Body = z.object({ item_id: z.uuid().optional() });

/** Pull the latest data now, for one bank or all of them. */
export const POST = withAuth(async (request, auth) => {
  const { item_id } = await readJson(request, Body);

  let query = auth.supabase.from("plaid_items").select("id").in("status", ["good", "error"]);
  if (item_id) query = query.eq("id", item_id);
  const { data, error } = await query;
  if (error) throw error;
  if (item_id && data.length === 0) throw new HttpError(404, "Bank not found or it needs to be re-linked first");

  const results = await syncItems(
    data.map((i) => i.id),
    "manual",
  );
  return json({ results });
});
