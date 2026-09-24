# OmniRadar

A personal finance visibility dashboard: balances, transactions, subscriptions,
bills, income, and savings in one place, in the spirit of Rocket Money.

- **Bank data**: [Plaid](https://plaid.com) (Trial plan: 10 live connections, free)
- **Database + auth**: [Supabase](https://supabase.com) (Postgres with row level security)
- **App**: Next.js (App Router, TypeScript). Backend first; UI comes later.

## Status

Backend under construction. There is no UI yet beyond a placeholder page.

## Setup

1. Install dependencies

   ```bash
   npm install
   ```

2. Create your env file and fill it in (see comments inside for where each value comes from)

   ```bash
   cp .env.example .env.local
   ```

3. Apply the database schema (see [supabase/README.md](supabase/README.md))

4. Check every credential

   ```bash
   npm run verify
   ```

5. Run the dev server

   ```bash
   npm run dev
   ```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on http://localhost:3000 |
| `npm run verify` | Check Supabase, Plaid, and encryption settings |
| `npm test` | Run unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Security notes

- `.env.local` is gitignored. Never commit it.
- Plaid access tokens are encrypted (AES-256-GCM) before being stored, and the
  table holding them is unreadable from the browser.
- Public sign-ups should be disabled in Supabase; this is a single-user app.
