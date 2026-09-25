import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { cardColors, cardFigures, detectNetwork, hasCard } from "@/lib/cards";
import { json, readQuery } from "@/lib/http";
import type { CardNetwork, InstitutionBranding, ItemStatus } from "@/lib/supabase/database.types";

const Query = z.object({ include_hidden: z.stringbool().default(false) });

const BASE = "id, name, official_name, mask, type, subtype, current_balance, available_balance, credit_limit, balance_updated_at, is_hidden";
const ITEM = "id, institution_name, status, last_synced_at, created_at";
// Columns added by migrations/20260925000000_card_branding.sql.
const WITH_BRANDING = `${BASE}, card_network, plaid_items(${ITEM}, institution_branding)`;
const WITHOUT_BRANDING = `${BASE}, plaid_items(${ITEM})`;

type Row = {
  id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  balance_updated_at: string | null;
  is_hidden: boolean;
  card_network?: CardNetwork | null;
  plaid_items: {
    id: string;
    institution_name: string | null;
    status: ItemStatus;
    last_synced_at: string | null;
    created_at: string;
    institution_branding?: InstitutionBranding | null;
  } | null;
};

/** Checking first, then credit, then savings and everything else. */
const kindRank = (r: Row) => (r.type === "depository" && hasCard(r) ? 0 : r.type === "credit" ? 1 : r.type === "depository" ? 2 : 3);

/**
 * Every cash and credit account drawn as a card: bank color and logo, the network logo
 * (owner's choice or a guess), last 4, and the balances printed on it.
 */
export const GET = withAuth(async (request, auth) => {
  const { include_hidden } = readQuery(request, Query);
  const load = (columns: string) => {
    // Loans, mortgages, and investments aren't cards; they stay on the Accounts page.
    let query = auth.supabase.from("accounts").select(columns).in("type", ["depository", "credit"]);
    if (!include_hidden) query = query.eq("is_hidden", false);
    return query.returns<Row[]>();
  };

  let setupNeeded = false;
  let { data, error } = await load(WITH_BRANDING);
  if (error?.code === "42703" || error?.code === "PGRST204") {
    // Migration not applied yet: still show cards, with guessed networks and curated colors.
    setupNeeded = true;
    ({ data, error } = await load(WITHOUT_BRANDING));
  }
  if (error) throw error;

  const rows = [...(data ?? [])].sort(
    (a, b) =>
      (a.plaid_items?.created_at ?? "").localeCompare(b.plaid_items?.created_at ?? "") ||
      kindRank(a) - kindRank(b) ||
      a.name.localeCompare(b.name),
  );

  const cards = rows.map(({ plaid_items: item, card_network, ...a }) => {
    const institution = item?.institution_name ?? null;
    const branding = item?.institution_branding ?? null;
    const { network, guessed } = detectNetwork({ ...a, card_network }, institution);
    return {
      ...a,
      card_network: card_network ?? null,
      has_card: hasCard(a),
      network,
      network_guessed: guessed,
      colors: cardColors(institution, branding?.color),
      figures: cardFigures(a),
      institution: item
        ? {
            id: item.id,
            name: institution,
            status: item.status,
            last_synced_at: item.last_synced_at,
            logo: branding?.logo ? `data:image/png;base64,${branding.logo}` : null,
          }
        : null,
    };
  });

  return json({ cards, setup_needed: setupNeeded });
});
