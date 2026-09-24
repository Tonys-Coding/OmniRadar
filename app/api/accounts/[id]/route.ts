import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { HttpError, json, readJson } from "@/lib/http";

const Body = z.object({ is_hidden: z.boolean() });

/** Hide or show an account (hidden accounts are left out of every total). */
export const PATCH = withAuth<{ id: string }>(async (request, auth, { params }) => {
  const id = z.uuid().parse((await params).id);
  const body = await readJson(request, Body);
  const { data, error } = await auth.supabase
    .from("accounts")
    .update(body)
    .eq("id", id)
    .select("id, name, is_hidden")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Account not found");
  return json({ account: data });
});
