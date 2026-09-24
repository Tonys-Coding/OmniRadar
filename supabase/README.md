# Database (Supabase)

The schema lives in [`migrations/`](migrations/). Apply every file in filename
order to your Supabase project, using **either** option below.

## Option A: SQL Editor (easiest)

1. Supabase dashboard -> your project -> **SQL Editor** -> **New query**
2. Paste the contents of each file in `migrations/`, oldest first, and click **Run**
3. You should see "Success. No rows returned"

## Option B: Supabase CLI

```bash
npx supabase login
```

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

```bash
npx supabase db push
```

`YOUR_PROJECT_REF` is the `abcdefghijklmnop` part of your project URL.

## One-time auth setup (single-user app)

1. **Authentication -> Sign In / Providers**: turn **off** "Allow new users to sign up"
2. **Authentication -> Users -> Add user -> Create new user**: enter your email and a
   strong password, and tick "Auto Confirm User"

## What's in the schema

| Table | Purpose | Browser access |
| --- | --- | --- |
| `plaid_items` | One row per linked bank login | read own |
| `plaid_item_secrets` | Encrypted Plaid access token + sync cursor | **none** (server only) |
| `accounts` | Checking, savings, cards, loans, investments | read own, edit `is_hidden` |
| `transactions` | Every transaction (positive amount = money out) | read own, edit `notes`, `user_category_id` |
| `recurring_streams` | Subscriptions, bills, income | read own, edit `kind_override`, `is_ignored` |
| `balance_snapshots` | Daily balance per account, for net-worth history | read own |
| `categories` | Your own categories | full control of own |
| `sync_runs` | Log of every sync | read own |
