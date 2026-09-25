import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { HttpError, json, readJson } from "@/lib/http";

const Body = z
  .object({
    is_hidden: z.boolean().optional(),
    /** Network logo on the card; null goes back to guessing. */
    card_network: z.enum(["visa", "mastercard", "amex", "discover"]).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to update");

/** Hide or show an account (hidden accounts are left out of every total), or set its card network. */
export const PATCH = withAuth<{ id: string }>(async (request, auth, { params }) => {
  const id = z.uuid().parse((await params).id);
  const body = await readJson(request, Body);
  const { data, error } = await auth.supabase
    .from("accounts")
    .update(body)
    .eq("id", id)
    .select("id, name, is_hidden")
    .maybeSingle();
  if (error?.code === "42703" || error?.code === "PGRST204") {
    throw new HttpError(503, "Apply supabase/migrations/20260925000000_card_branding.sql in the Supabase SQL Editor first");
  }
  if (error) throw error;
  if (!data) throw new HttpError(404, "Account not found");
  return json({ account: data });
});
