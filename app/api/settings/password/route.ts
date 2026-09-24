import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { HttpError, json, readJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

const Body = z.object({
  current_password: z.string().min(1),
  new_password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(128)
    .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Include at least one letter and one number"),
});

/** Change password after re-checking the current one. */
export const POST = withAuth(async (request, auth) => {
  const { current_password, new_password } = await readJson(request, Body);
  if (!auth.email) throw new HttpError(400, "This account has no email address");
  if (current_password === new_password) throw new HttpError(400, "The new password must be different");

  // Verify the current password on a throwaway client so the browser session is untouched.
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();
  const probe = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await probe.auth.signInWithPassword({ email: auth.email, password: current_password });
  if (signInError) throw new HttpError(400, "Current password is incorrect");
  await probe.auth.signOut({ scope: "local" });

  const { error } = await supabaseAdmin().auth.admin.updateUserById(auth.userId, { password: new_password });
  if (error) throw new HttpError(400, error.message);
  return json({ ok: true });
});
