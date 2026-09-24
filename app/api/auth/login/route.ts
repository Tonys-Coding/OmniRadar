import { z } from "zod";
import { errorResponse, HttpError, json, readJson } from "@/lib/http";
import { createCookieClient } from "@/lib/supabase/server";

const Body = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/**
 * Sign in with email + password. Sets the session cookies (for the future UI)
 * and also returns the access token so you can call the API with curl:
 *   Authorization: Bearer <access_token>
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await readJson(request, Body);
    const supabase = await createCookieClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new HttpError(401, "Invalid email or password");

    return json({
      user: { id: data.user.id, email: data.user.email },
      access_token: data.session.access_token,
      expires_at: data.session.expires_at,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
