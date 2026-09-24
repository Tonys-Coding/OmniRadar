import { readFile, rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import { errorResponse, HttpError } from "@/lib/http";
import { createCookieClient } from "@/lib/supabase/server";

const SESSION_FILE = ".dev-session";

/**
 * DEVELOPMENT ONLY: sign the browser in using the one-time session written by
 * `npm run dev-token`, then redirect to the dashboard. The file is deleted on
 * first use, and the route does not exist in production builds.
 */
export async function GET(request: Request) {
  try {
    if (process.env.NODE_ENV !== "development") throw new HttpError(404, "Not found");
    let session: { access_token: string; refresh_token: string };
    try {
      session = JSON.parse(await readFile(SESSION_FILE, "utf8"));
    } catch {
      throw new HttpError(404, "No dev session. Run `npm run dev-token` first.");
    } finally {
      await rm(SESSION_FILE, { force: true });
    }
    const supabase = await createCookieClient();
    const { error } = await supabase.auth.setSession(session);
    if (error) throw new HttpError(401, error.message);
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    return errorResponse(error);
  }
}
