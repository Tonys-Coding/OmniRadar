import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { errorResponse, HttpError, json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncItems } from "@/lib/sync/sync-item";

export const maxDuration = 300;

function authorized(request: Request) {
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled sync of every healthy connection. Call with
 *   Authorization: Bearer <CRON_SECRET>
 * (Vercel Cron sends this header automatically when CRON_SECRET is set.)
 */
export async function GET(request: Request) {
  try {
    if (!authorized(request)) throw new HttpError(401, "Unauthorized");
    const { data, error } = await supabaseAdmin().from("plaid_items").select("id").in("status", ["good", "error"]);
    if (error) throw error;
    const results = await syncItems(
      data.map((i) => i.id),
      "cron",
    );
    return json({ synced: results.length, failed: results.filter((r) => r.error).length, results });
  } catch (error) {
    return errorResponse(error);
  }
}
