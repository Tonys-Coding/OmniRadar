-- Cards: bank branding and card networks for the "My Cards" view.
--
--   * plaid_items.institution_branding caches the bank's brand color and logo
--     from Plaid (/institutions/get_by_id with optional metadata):
--       { "color": "#004977" | null, "logo": "<base64 PNG>" | null, "fetched_at": "..." }
--     NULL means it hasn't been fetched yet; the next sync fills it in.
--   * accounts.card_network is the owner's choice of Visa / Mastercard / Amex /
--     Discover for the card art. Plaid doesn't report the network, so NULL
--     means "guess from the bank and account name".

alter table public.plaid_items
  add column if not exists institution_branding jsonb;

alter table public.accounts
  add column if not exists card_network text
  check (card_network in ('visa', 'mastercard', 'amex', 'discover'));

grant update (card_network) on public.accounts to authenticated;
