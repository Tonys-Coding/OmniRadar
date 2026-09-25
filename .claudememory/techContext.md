# Technical Context

## Core Stack
- **Frontend/Backend:** Next.js 16 (App Router) with React 19. API lives in Route Handlers under `app/api/**/route.ts`; `proxy.ts` replaces the old `middleware.ts`. Next 16 differs from older versions: check `node_modules/next/dist/docs/` before using an unfamiliar API.
- **Language:** TypeScript, `strict: true` plus `noUncheckedIndexedAccess`.
- **Database:** Supabase Postgres (hosted, same database in dev and prod). No local database file.
- **ORM:** None. Queries use `@supabase/supabase-js` with hand-written types in `lib/supabase/database.types.ts` (regenerate with `npx supabase gen types typescript --linked`). Schema lives in `supabase/migrations/*.sql` and is applied manually in the Supabase SQL Editor.
- **Auth:** Supabase Auth (email + password, single user, public sign-ups meant to be off). Sessions in cookies via `@supabase/ssr`.
- **Bank data:** Plaid (`plaid` SDK, `react-plaid-link`). Trial plan: 10 live Items, free. `PLAID_ENV` is `sandbox` or `production`.
- **Other libraries:** zod 4 (validation), SWR (client fetching), Tailwind CSS 4, lucide-react (icons), jose (webhook JWT checks), vitest (tests), tsx (scripts).
- **Runtime:** Node 22+ (developed on Node 24). Dev server: `npm run dev` on **port 3100** (the owner's other app uses 3000).

## Architecture & Data Flow
- **Browser → API:** client components fetch `/api/*` with SWR (`lib/client/api.ts`), authenticated by the Supabase session cookie. Scripts and curl can send `Authorization: Bearer <token>` instead (`npm run dev-token` writes one to `.dev-token`).
- **API → database:** every route is wrapped in `withAuth` (`lib/auth.ts`), which verifies the user with Supabase and gives the handler:
  - `auth.supabase`: a user-scoped client, so row-level security applies
  - `auth.settings`: the user's preferences
- **Server-only work** (Plaid tokens, sync, webhooks, cron) uses `supabaseAdmin()` (`lib/supabase/admin.ts`, secret key, bypasses RLS). Always filter by `user_id` there.
- **Plaid flow:**
  1. `link-token`, then Plaid Link in the browser
  2. `exchange`: the access token is encrypted (AES-256-GCM) into `plaid_item_secrets`
  3. `syncItem` (`lib/sync/sync-item.ts`): accounts and balances, then cursor-based `/transactions/sync`, then recurring streams
- **Totals** (income, spending, net worth, balance history) are computed in pure, tested TypeScript in `lib/finance/*`, not in SQL.
- **Global client state:** `SettingsProvider` (`lib/client/settings.tsx`) for profile + preferences; SWR cache for everything else. Preferences are stored in Supabase `user_metadata.settings` (validated by `lib/settings.ts`), not in a table.

## Deployment Strategy
- **Target platform:** Vercel (not deployed yet). `maxDuration` is already set on long routes, and `/api/cron/sync` expects Vercel Cron's `Authorization: Bearer <CRON_SECRET>`.
- **Production DB:** already Postgres on Supabase; no migration needed.
- **Secrets:** `.env.local` locally (see `.env.example`), and Vercel environment variables in production. Never commit them; `npm run verify` checks them all.
