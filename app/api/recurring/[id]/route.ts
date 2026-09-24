import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { HttpError, json, readJson } from "@/lib/http";

const Body = z
  .object({
    /** Reclassify, e.g. mark a "subscription" as a "bill". null = back to automatic. */
    kind_override: z.enum(["subscription", "bill", "income", "transfer", "other"]).nullable().optional(),
    /** Hide a false positive from subscriptions and bills. */
    is_ignored: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");

export const PATCH = withAuth<{ id: string }>(async (request, auth, { params }) => {
  const id = z.uuid().parse((await params).id);
  const body = await readJson(request, Body);
  const { data, error } = await auth.supabase
    .from("recurring_streams")
    .update(body)
    .eq("id", id)
    .select("id, description, kind, kind_override, is_ignored")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Recurring item not found");
  return json({ stream: data });
});
