import { after } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { json, readJson } from "@/lib/http";
import { exchangePublicToken } from "@/lib/plaid-link";
import { syncNewItem } from "@/lib/sync/sync-item";

export const maxDuration = 60;

const Body = z.object({
  public_token: z.string().min(1),
  allow_duplicate: z.boolean().optional(),
});

/**
 * Called after Plaid Link succeeds. Stores the connection, then starts the
 * first sync in the background (poll GET /api/items for last_synced_at). With
 * no webhook configured, the background sync keeps going until Plaid has
 * delivered the full transaction history.
 */
export const POST = withAuth(async (request, auth) => {
  const { public_token, allow_duplicate } = await readJson(request, Body);
  const item = await exchangePublicToken(auth.userId, public_token, allow_duplicate);
  after(() => syncNewItem(item.id, { webhooks: Boolean(env().PLAID_WEBHOOK_URL) }));
  return json({ item: { id: item.id, institution_name: item.institution_name, status: item.status } }, { status: 201 });
});
