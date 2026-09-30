/**
 * Checks that every credential in .env.local works.
 *
 *   npm run verify
 *
 * Prints values only as present/absent, never the secrets themselves.
 */
import { createClient } from "@supabase/supabase-js";
import { CountryCode, Products } from "plaid";
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

  // Later migrations (columns on existing tables)
  const cards = await admin.from("accounts").select("card_network, plaid_items(institution_branding)").limit(1);
  if (!cards.error) pass("Card branding migration applied");
  else warn("Card branding migration not applied", "Run supabase/migrations/20260925000000_card_branding.sql in the SQL Editor");

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
    reportPlaidFailure(e, error);
    return;
  }

  // The same Link token the app asks for: proves Transactions is enabled for this environment.
  try {
    await plaid().linkTokenCreate({
      user: { client_user_id: "omniradar-verify" },
      client_name: "OmniRadar",
      language: "en",
      country_codes: [CountryCode.Us],
      products: [Products.Transactions],
      transactions: { days_requested: 730 },
      ...(e.PLAID_REDIRECT_URI && { redirect_uri: e.PLAID_REDIRECT_URI }),
    });
    pass("Link token created with Transactions (the Connect bank button will work)");
  } catch (error) {
    const body = plaidError(error);
    fail(
      `Could not create a Link token: ${body?.error_code ?? (error as Error).message}`,
      body?.error_code === "INVALID_FIELD" && e.PLAID_REDIRECT_URI
        ? "Add PLAID_REDIRECT_URI to Plaid dashboard -> Developers -> API -> Allowed redirect URIs, or leave it blank"
        : body?.error_message,
    );
  }

  if (e.PLAID_ENV === "production" && !e.PLAID_REDIRECT_URI) {
    pass("No redirect URI: OAuth banks (Bank of America, Chase, …) open their login in a pop-up");
  }
}

function reportPlaidFailure(e: Env, error: unknown) {
  const body = plaidError(error);
  if (body?.error_code === "INVALID_API_KEYS") {
    fail("Plaid rejected the client_id/secret", `Make sure PLAID_SECRET is the ${e.PLAID_ENV} secret (sandbox and production secrets differ)`);
  } else {
    fail(`Plaid call failed: ${body?.error_code ?? (error as Error).message}`, body?.error_message);
  }
}

/** Linked banks must belong to the current PLAID_ENV: a sandbox bank can't sync with production keys (and mixes fake data in). */
async function checkLinkedBanks(e: Env) {
  section("5. Linked banks");
  const admin = createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, ""), e.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: items, error } = await admin
    .from("plaid_items")
    .select("id, plaid_item_id, institution_id, institution_name, status, created_at, plaid_item_secrets(access_token_ciphertext)")
    .order("created_at");
  if (error) {
    fail(`Could not read linked banks: ${error.message}`);
    return;
  }
  if (items.length === 0) {
    pass(`No banks linked yet${e.PLAID_ENV === "production" ? ": ready for your first real bank" : ""}`);
    return;
  }
  for (const item of items) {
    const name = item.institution_name ?? "Unknown bank";
    const secret = Array.isArray(item.plaid_item_secrets) ? item.plaid_item_secrets[0] : item.plaid_item_secrets;
    let tokenEnv = "unknown";
    try {
      const token = secret ? decryptSecret(secret.access_token_ciphertext, e.TOKEN_ENCRYPTION_KEY, item.plaid_item_id) : "";
      tokenEnv = token.startsWith("access-sandbox-") ? "sandbox" : token.startsWith("access-production-") ? "production" : "unknown";
    } catch {
      fail(`${name}: its access token can't be decrypted`, "TOKEN_ENCRYPTION_KEY changed since it was linked; remove the bank and link it again");
      continue;
    }
    if (tokenEnv === e.PLAID_ENV) pass(`${name} (${tokenEnv}, status ${item.status})`);
    else if (tokenEnv === "sandbox")
      fail(
        `${name} is a sandbox test bank, but PLAID_ENV=production`,
        "Its fake data would mix with your real accounts and it can't sync. Accounts -> Remove bank… (safe: it deletes only that bank's data)",
      );
    else warn(`${name} was linked in ${tokenEnv}, but PLAID_ENV=${e.PLAID_ENV}`, "It won't sync until PLAID_ENV matches");
  }

  const byInstitution = new Map<string, number>();
  for (const item of items) if (item.institution_id) byInstitution.set(item.institution_id, (byInstitution.get(item.institution_id) ?? 0) + 1);
  for (const [institutionId, count] of byInstitution) {
    if (count < 2) continue;
    const name = items.find((i) => i.institution_id === institutionId)?.institution_name ?? institutionId;
    warn(`${name} is linked ${count} times`, "Every account and transaction is counted once per link, so totals are inflated. Remove the extra link on Accounts");
  }
}

async function main() {
  console.log("\x1b[1mOmniRadar setup check\x1b[0m");
  const e = checkEnv();
  if (e) {
    checkEncryption(e);
    await checkSupabase(e);
    await checkPlaid(e);
    await checkLinkedBanks(e);
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
