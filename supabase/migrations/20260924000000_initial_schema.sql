-- OmniRadar initial schema
--
-- Conventions
--   * Every table carries user_id and has row level security (RLS) enabled.
--   * The browser (anon / authenticated roles) can only read its own rows and
--     only update the few user-editable columns granted below.
--   * Plaid access tokens live in plaid_item_secrets, which no client role can
--     touch at all. Only the server (secret key) reads it.
--   * Amounts follow Plaid's sign convention:
--       positive = money leaving the account (spending, payments)
--       negative = money entering the account (income, refunds)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- plaid_items: one row per linked bank login (Plaid "Item")
-- ---------------------------------------------------------------------------
create table public.plaid_items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  plaid_item_id      text not null unique,
  institution_id     text,
  institution_name   text,
  status             text not null default 'good'
                     check (status in ('good', 'login_required', 'pending_expiration', 'revoked', 'error')),
  error_code         text,
  consent_expires_at timestamptz,
  last_synced_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index plaid_items_user_id_idx on public.plaid_items (user_id);

-- ---------------------------------------------------------------------------
-- plaid_item_secrets: encrypted access token + sync cursor (server only)
-- ---------------------------------------------------------------------------
create table public.plaid_item_secrets (
  item_id                 uuid primary key references public.plaid_items (id) on delete cascade,
  access_token_ciphertext text not null,
  transactions_cursor     text,
  updated_at              timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------
create table public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  item_id            uuid not null references public.plaid_items (id) on delete cascade,
  plaid_account_id   text not null unique,
  name               text not null,
  official_name      text,
  mask               text,
  type               text not null,   -- depository | credit | loan | investment | other
  subtype            text,            -- checking | savings | credit card | mortgage | ...
  current_balance    numeric(14, 2),  -- for credit/loan: amount owed
  available_balance  numeric(14, 2),
  credit_limit       numeric(14, 2),
  iso_currency_code  text,
  balance_updated_at timestamptz,
  is_hidden          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index accounts_user_id_idx on public.accounts (user_id);
create index accounts_item_id_idx on public.accounts (item_id);

-- ---------------------------------------------------------------------------
-- categories: user-defined categories (overrides / budgets later)
-- ---------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  color      text,
  parent_id  uuid references public.categories (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------
create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade,
  account_id             uuid not null references public.accounts (id) on delete cascade,
  plaid_transaction_id   text not null unique,
  amount                 numeric(14, 2) not null,  -- positive = outflow, negative = inflow
  iso_currency_code      text,
  date                   date not null,
  authorized_date        date,
  name                   text not null,
  merchant_name          text,
  merchant_entity_id     text,
  logo_url               text,
  website                text,
  category_primary       text,  -- Plaid personal_finance_category.primary
  category_detailed      text,  -- Plaid personal_finance_category.detailed
  category_confidence    text,
  payment_channel        text,
  pending                boolean not null default false,
  pending_transaction_id text,
  user_category_id       uuid references public.categories (id) on delete set null,
  notes                  text,
  raw                    jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_date_idx on public.transactions (account_id, date desc);
create index transactions_user_category_idx on public.transactions (user_id, category_primary);

-- ---------------------------------------------------------------------------
-- recurring_streams: subscriptions, bills, and income detected from history
-- ---------------------------------------------------------------------------
create table public.recurring_streams (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  account_id          uuid references public.accounts (id) on delete cascade,
  stream_key          text not null unique,  -- Plaid stream_id, or "local:<hash>" for our detector
  source              text not null check (source in ('plaid', 'local')),
  direction           text not null check (direction in ('inflow', 'outflow')),
  kind                text not null check (kind in ('subscription', 'bill', 'income', 'transfer', 'other')),
  kind_override       text check (kind_override in ('subscription', 'bill', 'income', 'transfer', 'other')),
  description         text not null,
  merchant_name       text,
  category_primary    text,
  category_detailed   text,
  frequency           text not null,  -- WEEKLY | BIWEEKLY | SEMI_MONTHLY | MONTHLY | QUARTERLY | ANNUALLY | UNKNOWN
  first_date          date,
  last_date           date,
  predicted_next_date date,
  average_amount      numeric(14, 2),  -- always positive
  last_amount         numeric(14, 2),  -- always positive
  is_active           boolean not null default true,
  is_ignored          boolean not null default false,
  transaction_ids     text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index recurring_streams_user_idx on public.recurring_streams (user_id, is_active);

-- ---------------------------------------------------------------------------
-- balance_snapshots: one row per account per day, for net-worth history
-- ---------------------------------------------------------------------------
create table public.balance_snapshots (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  account_id        uuid not null references public.accounts (id) on delete cascade,
  snapshot_date     date not null,
  current_balance   numeric(14, 2),
  available_balance numeric(14, 2),
  created_at        timestamptz not null default now(),
  unique (account_id, snapshot_date)
);
create index balance_snapshots_user_date_idx on public.balance_snapshots (user_id, snapshot_date);

-- ---------------------------------------------------------------------------
-- sync_runs: audit log of each sync, for debugging and the health check
-- ---------------------------------------------------------------------------
create table public.sync_runs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     uuid not null references public.plaid_items (id) on delete cascade,
  trigger     text not null,  -- link | manual | webhook | cron
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  added       integer not null default 0,
  modified    integer not null default 0,
  removed     integer not null default 0,
  error       text
);
create index sync_runs_item_idx on public.sync_runs (item_id, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger plaid_items_updated_at before update on public.plaid_items
  for each row execute function public.set_updated_at();
create trigger plaid_item_secrets_updated_at before update on public.plaid_item_secrets
  for each row execute function public.set_updated_at();
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger recurring_streams_updated_at before update on public.recurring_streams
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.plaid_items        enable row level security;
alter table public.plaid_item_secrets enable row level security;
alter table public.accounts           enable row level security;
alter table public.categories         enable row level security;
alter table public.transactions       enable row level security;
alter table public.recurring_streams  enable row level security;
alter table public.balance_snapshots  enable row level security;
alter table public.sync_runs          enable row level security;

-- Secrets: no policies and no grants. Only the server's secret key can read.
revoke all on public.plaid_item_secrets from anon, authenticated;

-- Nothing is readable while signed out.
revoke all on
  public.plaid_items, public.accounts, public.categories, public.transactions,
  public.recurring_streams, public.balance_snapshots, public.sync_runs
from anon;

-- Signed-in user: read own rows. Writes happen on the server, except the
-- specific user-editable columns granted further down.
revoke insert, update, delete on
  public.plaid_items, public.accounts, public.transactions,
  public.recurring_streams, public.balance_snapshots, public.sync_runs
from authenticated;

create policy "own items" on public.plaid_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own accounts" on public.accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own transactions" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own recurring streams" on public.recurring_streams
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own balance snapshots" on public.balance_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own sync runs" on public.sync_runs
  for select to authenticated using ((select auth.uid()) = user_id);

-- User-editable columns only.
grant update (is_hidden) on public.accounts to authenticated;
grant update (notes, user_category_id) on public.transactions to authenticated;
grant update (kind_override, is_ignored) on public.recurring_streams to authenticated;

create policy "update own accounts" on public.accounts
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "update own transactions" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "update own recurring streams" on public.recurring_streams
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Categories are fully user-managed.
create policy "own categories" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
