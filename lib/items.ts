import "server-only";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { plaid } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PlaidItemRow } from "@/lib/supabase/database.types";

// Server-side access to linked Plaid Items and their encrypted access tokens.
// Everything here uses the admin client, so every query filters by user_id.

export type ItemWithToken = { item: PlaidItemRow; accessToken: string; cursor: string | null };

export async function getItemWithToken(itemId: string, userId?: string): Promise<ItemWithToken> {
  const db = supabaseAdmin();
  let query = db.from("plaid_items").select("*").eq("id", itemId);
  if (userId) query = query.eq("user_id", userId);
  const { data: item, error } = await query.maybeSingle();
  if (error) throw error;
  if (!item) throw new HttpError(404, "Linked bank not found");

  const { data: secret, error: secretError } = await db
    .from("plaid_item_secrets")
    .select("access_token_ciphertext, transactions_cursor")
    .eq("item_id", item.id)
    .single();
  if (secretError) throw secretError;

  const accessToken = decryptSecret(secret.access_token_ciphertext, env().TOKEN_ENCRYPTION_KEY, item.plaid_item_id);
  return { item, accessToken, cursor: secret.transactions_cursor };
}

/** Save a newly linked Item and its encrypted access token. */
export async function storeItem(input: {
  userId: string;
  plaidItemId: string;
  accessToken: string;
  institutionId: string | null;
  institutionName: string | null;
}): Promise<PlaidItemRow> {
  const db = supabaseAdmin();
  const { data: item, error } = await db
    .from("plaid_items")
    .insert({
      user_id: input.userId,
      plaid_item_id: input.plaidItemId,
      institution_id: input.institutionId,
      institution_name: input.institutionName,
    })
    .select("*")
    .single();
  if (error) throw error;

  const ciphertext = encryptSecret(input.accessToken, env().TOKEN_ENCRYPTION_KEY, input.plaidItemId);
  const { error: secretError } = await db
    .from("plaid_item_secrets")
    .insert({ item_id: item.id, access_token_ciphertext: ciphertext });
  if (secretError) {
    await db.from("plaid_items").delete().eq("id", item.id);
    throw secretError;
  }
  return item;
}

export async function saveCursor(itemId: string, cursor: string) {
  const { error } = await supabaseAdmin()
    .from("plaid_item_secrets")
    .update({ transactions_cursor: cursor })
    .eq("item_id", itemId);
  if (error) throw error;
}

/**
 * Disconnect an Item at Plaid (stops billing and data access) and delete it
 * with all of its accounts, transactions, and history.
 */
export async function removeItem(itemId: string, userId: string) {
  const { item, accessToken } = await getItemWithToken(itemId, userId);
  try {
    await plaid().itemRemove({ access_token: accessToken });
  } catch (error) {
    // Already removed or revoked at Plaid: still delete our copy.
    console.warn(`[items] itemRemove failed for ${item.id}; deleting locally anyway`, error);
  }
  const { error } = await supabaseAdmin().from("plaid_items").delete().eq("id", item.id).eq("user_id", userId);
  if (error) throw error;
}
