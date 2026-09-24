import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { HttpError, json, readJson } from "@/lib/http";

const Body = z
  .object({
    notes: z.string().trim().max(500).nullable().optional(),
    user_category_id: z.uuid().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");

/** Add a note or assign one of your own categories to a transaction. */
export const PATCH = withAuth<{ id: string }>(async (request, auth, { params }) => {
  const id = z.uuid().parse((await params).id);
  const body = await readJson(request, Body);
  const { data, error } = await auth.supabase
    .from("transactions")
    .update(body)
    .eq("id", id)
    .select("id, name, amount, date, notes, user_category_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Transaction not found");
  return json({ transaction: data });
});
