import "server-only";
import { getItemWithToken } from "@/lib/items";
import { plaid } from "@/lib/plaid";
import { refreshRecurring } from "@/lib/recurring/refresh";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { ItemStatus } from "@/lib/supabase/database.types";
import { syncItem } from "@/lib/sync/sync-item";
import type { PlaidJwk } from "@/lib/webhook-verify";

const keyCache = new Map<string, PlaidJwk>();

/** Fetch (and cache) the Plaid public key used to sign webhooks. */
export async function fetchPlaidWebhookKey(kid: string): Promise<PlaidJwk> {
  const cached = keyCache.get(kid);
  if (cached) return cached;
  const { data } = await plaid().webhookVerificationKeyGet({ key_id: kid });
  const jwk = data.key as unknown as PlaidJwk;
  keyCache.set(kid, jwk);
  return jwk;
}

export type PlaidWebhook = {
  webhook_type: string;
  webhook_code: string;
  item_id?: string;
  error?: { error_code?: string } | null;
  consent_expiration_time?: string | null;
};

/** Act on a verified Plaid webhook. Runs after the 200 response is sent. */
export async function handlePlaidWebhook(event: PlaidWebhook) {
  const tag = `${event.webhook_type}.${event.webhook_code}`;
  if (!event.item_id) return;

  const db = supabaseAdmin();
  const { data: item } = await db.from("plaid_items").select("id, user_id").eq("plaid_item_id", event.item_id).maybeSingle();
  if (!item) {
    console.warn(`[webhook] ${tag} for unknown item ${event.item_id}`);
    return;
  }

  const setStatus = (status: ItemStatus, extra: { error_code?: string | null; consent_expires_at?: string | null } = {}) =>
    db.from("plaid_items").update({ status, ...extra }).eq("id", item.id);

  switch (tag) {
    case "TRANSACTIONS.SYNC_UPDATES_AVAILABLE":
      await syncItem(item.id, "webhook");
      return;

    case "TRANSACTIONS.RECURRING_TRANSACTIONS_UPDATE": {
      const { accessToken } = await getItemWithToken(item.id);
      const { data: accounts } = await db.from("accounts").select("id, plaid_account_id").eq("item_id", item.id);
      await refreshRecurring({
        userId: item.user_id,
        accessToken,
        accountMap: new Map((accounts ?? []).map((a) => [a.plaid_account_id, a.id])),
      });
      return;
    }

    case "ITEM.ERROR": {
      const code = event.error?.error_code ?? "UNKNOWN";
      await setStatus(code === "ITEM_LOGIN_REQUIRED" ? "login_required" : "error", { error_code: code });
      return;
    }

    case "ITEM.PENDING_EXPIRATION":
    case "ITEM.PENDING_DISCONNECT":
      await setStatus("pending_expiration", { consent_expires_at: event.consent_expiration_time ?? null });
      return;

    case "ITEM.USER_PERMISSION_REVOKED":
    case "ITEM.USER_ACCOUNT_REVOKED":
      await setStatus("revoked", { error_code: event.webhook_code });
      return;

    case "ITEM.LOGIN_REPAIRED":
      await setStatus("good", { error_code: null });
      await syncItem(item.id, "webhook");
      return;

    default:
      // e.g. WEBHOOK_UPDATE_ACKNOWLEDGED, legacy TRANSACTIONS.DEFAULT_UPDATE (we use /sync)
      console.info(`[webhook] ignored ${tag}`);
  }
}
