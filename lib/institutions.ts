import "server-only";
import { CountryCode } from "plaid";
import { plaid } from "@/lib/plaid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { InstitutionBranding, PlaidItemRow } from "@/lib/supabase/database.types";

const HEX = /^#[0-9a-f]{6}$/i;

/** A bank's name and brand (color + base64 PNG logo) from Plaid. */
export async function fetchInstitution(institutionId: string) {
  const { data } = await plaid().institutionsGetById({
    institution_id: institutionId,
    country_codes: [CountryCode.Us],
    options: { include_optional_metadata: true },
  });
  const { name, primary_color, logo } = data.institution;
  const branding: InstitutionBranding = {
    color: primary_color && HEX.test(primary_color) ? primary_color.toLowerCase() : null,
    logo: logo ?? null,
    fetched_at: new Date().toISOString(),
  };
  return { name, branding };
}

/**
 * Fill in the bank's color and logo the first time an item syncs. Skipped when
 * already cached, and when the column is missing (card migration not applied,
 * so the row has no `institution_branding` key at all). Never throws.
 */
export async function ensureBranding(item: PlaidItemRow) {
  if (!item.institution_id || item.institution_branding !== null) return;
  try {
    const { branding } = await fetchInstitution(item.institution_id);
    const { error } = await supabaseAdmin()
      .from("plaid_items")
      .update({ institution_branding: branding })
      .eq("id", item.id)
      .eq("user_id", item.user_id);
    if (error) throw error;
  } catch (error) {
    console.warn(`[sync] could not cache branding for ${item.id}`, error instanceof Error ? error.message : error);
  }
}
