import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

let adminClient: ReturnType<typeof create> | undefined;

function create() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = env();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Supabase client with the secret key. BYPASSES row level security.
 * Server only: use for Plaid token storage, syncing, webhooks, and cron jobs,
 * and always filter by user_id explicitly.
 */
export function supabaseAdmin() {
  adminClient ??= create();
  return adminClient;
}

export type AdminClient = ReturnType<typeof supabaseAdmin>;
