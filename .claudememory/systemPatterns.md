# System Patterns

## Codebase Structure
- `app/(app)/*`: signed-in pages (dashboard at `/`, transactions, spending, subscriptions, bills, accounts, settings, oauth-return). The `(app)/layout.tsx` server component is the authoritative auth check.
- `app/login`: the sign-in page.
- `app/api/**/route.ts`: all backend endpoints (reference table in README.md).
- `components/`:
  - `ui.tsx`: Card, Button, Pill, Segmented, Switch, and other design-system pieces
  - `shell/`: sidebar, mobile nav, page header
  - `charts/`: custom SVG charts, including `SpendingMap`
  - `brand/Logo.tsx`: the logo
  - `BankCard.tsx`: an account drawn as a payment card, plus network logos
- `lib/`:
  - `env.ts`: validated env vars
  - `auth.ts`, `http.ts`: route wrappers and JSON errors
  - `supabase/`: clients and database types
  - `plaid.ts`, `plaid-link.ts`, `items.ts`, `crypto.ts`: Plaid and token storage
  - `sync/`: the sync engine
  - `recurring/`: subscription and bill detection
  - `finance/`: aggregation and analytics
  - `geo/`: map geometry and viewport math
  - `alerts.ts`, `settings.ts`
  - `cards.ts`: card network guess, bank colors, and card figures; `institutions.ts`: caches bank branding from Plaid
  - `client/`: browser-only API client, response types, settings context
- `supabase/migrations/`: SQL schema with RLS.
- `scripts/`:
  - `verify-setup.ts`: `npm run verify`
  - `dev-token.ts`
  - `brand/build_brand.py`: regenerates the `public/brand/` logo files
- `test/`: test stubs; unit tests sit next to their code as `*.test.ts`.

## Design Decisions
- **Data fetching:** client components with SWR against our own API; no server actions. The server layout only reads the session, settings, and sidebar cookie for the first paint.
- **Styling:** Tailwind CSS 4, with tokens in `app/globals.css` under `@theme`:
  - `ink` #121214 for text and dark surfaces
  - a teal scale from the logo: `brand`, `brand-ink` for text on white, `brand-bright` for dark surfaces, `brand-soft`, `brand-pale`, `brand-deep`
  - Outfit font
  - layout: a dark frame around a white rounded canvas; cards at 28px radius
- **Charts:** hand-written SVG. No chart library.
- **Authentication:** Supabase Auth with `@supabase/ssr`. `proxy.ts` refreshes the session and redirects signed-out visitors to `/login`. A revoked session goes through `/api/auth/expired` to clear its cookies, which prevents a redirect loop.
- **Money sign convention:** Plaid's: **positive amount = money out, negative = money in.** The UI flips it for display (`txnAmount`).

## Critical Rules
- **Validate all input with zod:** use `readJson` / `readQuery` in `lib/http.ts`. Env access goes through `env()`.
- **Guard server-only modules:** they start with `import "server-only"`. Never import `lib/env.ts`, `lib/supabase/admin.ts`, or `lib/plaid.ts` into client components.
- **Pick the right Supabase client:** user-facing reads use `auth.supabase` so RLS applies. Use `supabaseAdmin()` only for token and sync work, and filter by `user_id`.
- **Plaid access tokens:** never return or log them, and never store them unencrypted. The browser can't read `plaid_item_secrets` (RLS, no grants).
- **Income and spending rules** live in `classifyCashflow` (`lib/finance/aggregate.ts`); don't duplicate them.
  - Transfers, card payments, and loan disbursements are excluded.
  - Money into a card or loan is never income.
  - Payroll deposits count as income even when Plaid miscategorizes them.
- **Never store or show card expiry dates, CVVs, or full numbers.** Cards show the last 4 and balances only.
- **Plaid categories use the v2 taxonomy.** Request `personal_finance_category_version: v2`.
- **Next.js route files** may only export route handlers and route config; put helpers in `lib/`.
- **Keep pure logic unit-testable:** `lib/finance`, `lib/recurring`, `lib/geo`, `lib/alerts`. Run `npm test`, `npm run typecheck`, and `npm run lint` before committing.
- **Git workflow:** commit and push to `Tonys-Coding/OmniRadar` `main` after each feature. Before each push, scan staged changes for secrets and make sure no `.env*` file (other than `.env.example`), `.dev-token`, or `.dev-session` is staged.
