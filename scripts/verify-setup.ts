/**
 * Checks that every credential in .env.local works.
 *
 *   npm run verify
 *
 * Prints values only as present/absent, never the secrets themselves.
 */
import { createClient } from "@supabase/supabase-js";
import { CountryCode } from "plaid";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { validateEnv, type Env } from "@/lib/env";
import { plaid, plaidError } from "@/lib/plaid";
import type { Database } from "@/lib/supabase/database.types";

const TABLES = [
  "plaid_items",
  "plaid_item_secrets",
  "accounts",
  "categories",
  "transactions",
  "recurring_streams",
  "balance_snapshots",
  "sync_runs",
] as const;

let failures = 0;
let warnings = 0;
const pass = (msg: string) => console.log(`  \x1b[32m✔\x1b[0m ${msg}`);
const fail = (msg: string, hint?: string) => {
  failures++;
  console.log(`  \x1b[31m✖\x1b[0m ${msg}${hint ? `\n      → ${hint}` : ""}`);
};
const warn = (msg: string, hint?: string) => {
  warnings++;
  console.log(`  \x1b[33m!\x1b[0m ${msg}${hint ? `\n      → ${hint}` : ""}`);
};
const section = (title: string) => console.log(`\n\x1b[1m${title}\x1b[0m`);

function checkEnv(): Env | undefined {
  section("1. Environment (.env.local)");
  const result = validateEnv(process.env);
  if (!result.ok) {
    for (const problem of result.problems) fail(problem);
    return undefined;
  }
  pass(`All required variables present (PLAID_ENV=${result.env.PLAID_ENV})`);
  if (!result.env.PLAID_WEBHOOK_URL) {
    warn("PLAID_WEBHOOK_URL not set", "Fine for local use; run a manual sync (POST /api/sync) instead of webhooks");
  }
  return result.env;
}

function checkEncryption(e: Env) {
  section("2. Token encryption");
  try {
    const sample = "access-sandbox-verify";
    const ok = decryptSecret(encryptSecret(sample, e.TOKEN_ENCRYPTION_KEY, "verify"), e.TOKEN_ENCRYPTION_KEY, "verify") === sample;
    if (ok) pass("TOKEN_ENCRYPTION_KEY encrypts and decrypts");
    else fail("Encryption round-trip returned the wrong value");
  } catch (error) {
    fail(`Encryption failed: ${(error as Error).message}`);
  }
}

async function checkSupabase(e: Env) {
  section("3. Supabase");
  const url = e.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");

  // Publishable key + auth settings
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    });
    if (res.status === 401 || res.status === 403) {
      fail("Publishable key was rejected", "Re-copy NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from Project Settings -> API Keys");
    } else if (!res.ok) {
      fail(`Could not reach Supabase Auth (HTTP ${res.status})`, "Check NEXT_PUBLIC_SUPABASE_URL");
    } else {
      pass("Project URL reachable and publishable key accepted");
      const settings = (await res.json()) as { disable_signup?: boolean };
      if (settings.disable_signup) pass("Public sign-ups are disabled");
      else warn("Public sign-ups are ENABLED", "Authentication -> Sign In / Providers -> turn off 'Allow new users to sign up'");
    }
  } catch (error) {
    fail(`Could not reach ${url}: ${(error as Error).message}`, "Check NEXT_PUBLIC_SUPABASE_URL");
    return;
  }

  const admin = createClient<Database>(url, e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Secret key + schema
  const missingTables: string[] = [];
  for (const table of TABLES) {
    const { error } = await admin.from(table).select("*", { count: "exact", head: true });
    if (!error) continue;
    if (error.message.toLowerCase().includes("invalid api key") || error.code === "401") {
      fail("Secret key was rejected", "Re-copy SUPABASE_SECRET_KEY from Project Settings -> API Keys");
      return;
    }
    missingTables.push(`${table} (${error.code ?? error.message})`);
  }
  if (missingTables.length === 0) pass(`Secret key works and all ${TABLES.length} tables exist`);
  else fail(`Missing tables: ${missingTables.join(", ")}`, "Apply the migrations (see supabase/README.md)");

  // Browser key must NOT be able to read the token table
  const anon = createClient<Database>(url, e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const secrets = await anon.from("plaid_item_secrets").select("item_id").limit(1);
  if (secrets.error) pass("Browser key cannot read plaid_item_secrets (locked down)");
  else fail("Browser key CAN read plaid_item_secrets", "Re-run the migration; row level security is not in place");

  // Exactly one user
  const users = await admin.auth.admin.listUsers({ perPage: 50 });
  if (users.error) {
    fail(`Could not list users: ${users.error.message}`);
  } else if (users.data.users.length === 0) {
    warn("No users yet", "Authentication -> Users -> Add user (tick Auto Confirm User)");
  } else {
    pass(`${users.data.users.length} user(s): ${users.data.users.map((u) => u.email).join(", ")}`);
    if (users.data.users.length > 1) warn("More than one user exists; OmniRadar is meant to be single-user");
  }
}

async function checkPlaid(e: Env) {
  section(`4. Plaid (${e.PLAID_ENV})`);
  try {
    const res = await plaid().institutionsGet({ count: 1, offset: 0, country_codes: [CountryCode.Us] });
    pass(`Keys accepted (${res.data.total.toLocaleString()} US institutions available)`);
  } catch (error) {
    const body = plaidError(error);
    if (body?.error_code === "INVALID_API_KEYS") {
      fail(
        "Plaid rejected the client_id/secret",
        `Make sure PLAID_SECRET is the ${e.PLAID_ENV} secret (sandbox and production secrets differ)`,
      );
    } else {
      fail(`Plaid call failed: ${body?.error_code ?? (error as Error).message}`, body?.error_message);
    }
  }
}

async function main() {
  console.log("\x1b[1mOmniRadar setup check\x1b[0m");
  const e = checkEnv();
  if (e) {
    checkEncryption(e);
    await checkSupabase(e);
    await checkPlaid(e);
  }

  console.log("");
  if (failures > 0) {
    console.log(`\x1b[31m${failures} problem(s)\x1b[0m, ${warnings} warning(s). Fix the ✖ items and run again.`);
    process.exit(1);
  }
  console.log(`\x1b[32mAll checks passed\x1b[0m${warnings ? ` (${warnings} warning(s))` : ""}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
