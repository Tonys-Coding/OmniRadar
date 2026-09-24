import { NextResponse } from "next/server";
import { createCookieClient } from "@/lib/supabase/server";

/**
 * The session cookie is still well-formed but the server no longer accepts it
 * (revoked, signed out elsewhere). Clear the cookies here, since server
 * components can't, then show the login page. Without this, proxy.ts (which
 * only checks the token signature) and the app layout (which asks Supabase)
 * would disagree and redirect back and forth.
 */
export async function GET(request: Request) {
  const supabase = await createCookieClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return NextResponse.redirect(new URL("/login?expired=1", request.url));
}
