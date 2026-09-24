import { errorResponse, json } from "@/lib/http";
import { createCookieClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createCookieClient();
    await supabase.auth.signOut();
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
