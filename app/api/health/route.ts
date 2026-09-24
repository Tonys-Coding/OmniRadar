import { validateEnv } from "@/lib/env";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Public liveness check. Reports which variables are missing, never their values. */
export async function GET() {
  const envResult = validateEnv();
  if (!envResult.ok) {
    return json(
      { ok: false, env: { ok: false, problems: envResult.problems.map((p) => p.split(" ")[0]) } },
      { status: 503 },
    );
  }

  const { error } = await supabaseAdmin().from("plaid_items").select("id", { count: "exact", head: true });
  const database = error ? "unreachable or schema missing" : "ok";

  return json(
    { ok: !error, env: { ok: true, plaid_env: envResult.env.PLAID_ENV }, database, time: new Date().toISOString() },
    { status: error ? 503 : 200 },
  );
}
