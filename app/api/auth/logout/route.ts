import { z } from "zod";
import { errorResponse, json, readJson } from "@/lib/http";
import { createCookieClient } from "@/lib/supabase/server";

const Body = z.object({
  /** "global" signs out every device and browser, not just this one. */
  scope: z.enum(["local", "global"]).default("local"),
});

export async function POST(request: Request) {
  try {
    const { scope } = await readJson(request, Body);
    const supabase = await createCookieClient();
    await supabase.auth.signOut({ scope });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
