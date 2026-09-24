import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { json } from "@/lib/http";
import { removeItem } from "@/lib/items";

/** Disconnect a bank at Plaid and delete all of its data from OmniRadar. */
export const DELETE = withAuth<{ id: string }>(async (_request, auth, { params }) => {
  const id = z.uuid().parse((await params).id);
  await removeItem(id, auth.userId);
  return json({ ok: true });
});
