import { withAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { HttpError, json } from "@/lib/http";
import { getItemWithToken } from "@/lib/items";
import { plaid, plaidError } from "@/lib/plaid";

/**
 * Point every existing connection at the current PLAID_WEBHOOK_URL.
 * Run once after you deploy or change the URL; new connections pick it up
 * automatically.
 */
export const POST = withAuth(async (_request, auth) => {
  const url = env().PLAID_WEBHOOK_URL;
  if (!url) throw new HttpError(400, "Set PLAID_WEBHOOK_URL first");

  const { data: items, error } = await auth.supabase.from("plaid_items").select("id, institution_name");
  if (error) throw error;

  const results = [];
  for (const item of items) {
    try {
      const { accessToken } = await getItemWithToken(item.id, auth.userId);
      await plaid().itemWebhookUpdate({ access_token: accessToken, webhook: url });
      results.push({ item_id: item.id, institution_name: item.institution_name, ok: true });
    } catch (e) {
      results.push({ item_id: item.id, institution_name: item.institution_name, ok: false, error: plaidError(e)?.error_code });
    }
  }
  return json({ webhook: url, results });
});
