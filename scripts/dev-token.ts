/**
 * Mint a short-lived (1 hour) access token for your OmniRadar user, for
 * testing the API with curl, without typing your password.
 *
 *   npm run dev-token              # uses the only user in the project
 *   npm run dev-token you@x.com    # or pick one explicitly
 *
 * The token is written to .dev-token (gitignored) and NOT printed. Use it like:
 *   curl -H "Authorization: Bearer $(cat .dev-token)" localhost:3000/api/auth/session
 *
 * Requires SUPABASE_SECRET_KEY, which can already do anything in the project,
 * so this grants no new power.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

async function main() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env();
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, SUPABASE_SECRET_KEY, opts);

  let email = process.argv[2];
  if (!email) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 2 });
    if (error) throw error;
    if (data.users.length !== 1) throw new Error("Pass an email: the project does not have exactly one user");
    email = data.users[0]!.email!;
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw linkError;

  const anon = createClient(url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, opts);
  const { data, error } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (error || !data.session) throw error ?? new Error("No session returned");

  writeFileSync(".dev-token", data.session.access_token, { mode: 0o600 });
  // One-time browser login: open http://localhost:3100/api/dev/session (dev server only).
  writeFileSync(
    ".dev-session",
    JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    { mode: 0o600 },
  );
  const expires = new Date((data.session.expires_at ?? 0) * 1000).toLocaleTimeString();
  console.log(`Wrote .dev-token and .dev-session for ${email} (token expires ${expires}).`);
  console.log("Browser: open http://localhost:3100/api/dev/session once to sign in.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
