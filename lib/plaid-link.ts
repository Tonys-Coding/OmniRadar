import "server-only";
import { CountryCode, Products, type LinkTokenCreateRequest } from "plaid";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { fetchInstitution } from "@/lib/institutions";
import { getItemWithToken, storeItem } from "@/lib/items";
import { plaid } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Maximum transaction history Plaid will fetch on first link (about 2 years). */
const DAYS_REQUESTED = 730;

/**
 * Create a Link token for the Plaid Link widget.
 * With `itemId`, Link opens in "update mode" to repair a broken connection.
 */
export async function createLinkToken(userId: string, itemId?: string) {
  const { PLAID_WEBHOOK_URL, PLAID_REDIRECT_URI } = env();
  const request: LinkTokenCreateRequest = {
    user: { client_user_id: userId },
    client_name: "OmniRadar",
    language: "en",
    country_codes: [CountryCode.Us],
    ...(PLAID_WEBHOOK_URL && { webhook: PLAID_WEBHOOK_URL }),
    ...(PLAID_REDIRECT_URI && { redirect_uri: PLAID_REDIRECT_URI }),
  };

  if (itemId) {
    const { accessToken } = await getItemWithToken(itemId, userId);
    request.access_token = accessToken;
  } else {
    request.products = [Products.Transactions];
    request.transactions = { days_requested: DAYS_REQUESTED };
  }

  const { data } = await plaid().linkTokenCreate(request);
  return { link_token: data.link_token, expiration: data.expiration };
}

async function institutionName(institutionId: string | null | undefined) {
  if (!institutionId) return null;
  try {
    return (await fetchInstitution(institutionId)).name;
  } catch {
    return null;
  }
}

/**
 * Exchange the public token from Link for a permanent access token and store
 * the Item. Refuses a second connection to a bank that is already linked
 * unless `allowDuplicate` is set (duplicates double-count every transaction).
 */
export async function exchangePublicToken(userId: string, publicToken: string, allowDuplicate = false) {
  const client = plaid();
  const { data: exchange } = await client.itemPublicTokenExchange({ public_token: publicToken });
  const { data: itemData } = await client.itemGet({ access_token: exchange.access_token });
  const institutionId = itemData.item.institution_id ?? null;

  if (institutionId && !allowDuplicate) {
    const { data: existing } = await supabaseAdmin()
      .from("plaid_items")
      .select("id, institution_name")
      .eq("user_id", userId)
      .eq("institution_id", institutionId)
      .limit(1)
      .maybeSingle();
    if (existing) {
      await client.itemRemove({ access_token: exchange.access_token }).catch(() => undefined);
      throw new HttpError(409, `${existing.institution_name ?? "This bank"} is already linked`, {
        existing_item_id: existing.id,
        hint: "Remove the existing connection first, or pass allow_duplicate: true for a second login at the same bank.",
      });
    }
  }

  return storeItem({
    userId,
    plaidItemId: exchange.item_id,
    accessToken: exchange.access_token,
    institutionId,
    institutionName: await institutionName(institutionId),
  });
}
