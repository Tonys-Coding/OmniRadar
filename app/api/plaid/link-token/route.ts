import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { json, readJson } from "@/lib/http";
import { createLinkToken } from "@/lib/plaid-link";

const Body = z.object({
  /** Pass to repair an existing connection (Plaid Link "update mode"). */
  item_id: z.uuid().optional(),
});

/** Create a short-lived token that opens the Plaid Link widget. */
export const POST = withAuth(async (request, auth) => {
  const { item_id } = await readJson(request, Body);
  return json(await createLinkToken(auth.userId, item_id));
});
