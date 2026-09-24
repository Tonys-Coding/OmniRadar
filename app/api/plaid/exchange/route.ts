import { after } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { json, readJson } from "@/lib/http";
import { exchangePublicToken } from "@/lib/plaid-link";
import { syncItem } from "@/lib/sync/sync-item";

export const maxDuration = 60;

const Body = z.object({
  public_token: z.string().min(1),
  allow_duplicate: z.boolean().optional(),
});

/**
 * Called after Plaid Link succeeds. Stores the connection, then starts the
 * first sync in the background (poll GET /api/items for last_synced_at).
 */
export const POST = withAuth(async (request, auth) => {
  const { public_token, allow_duplicate } = await readJson(request, Body);
  const item = await exchangePublicToken(auth.userId, public_token, allow_duplicate);
  after(() => syncItem(item.id, "link", { waitForData: true }));
  return json({ item: { id: item.id, institution_name: item.institution_name, status: item.status } }, { status: 201 });
});
