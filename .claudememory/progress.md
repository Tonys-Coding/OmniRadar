# Progress & Deployment Roadmap

_Last updated: 2026-09-29_

## What is Working
- [x] Database schema with RLS on every table (migration applied in Supabase, verified by `npm run verify`).
- [x] Core authentication: Supabase email and password, cookie sessions, bearer tokens for scripts, and a revoked-session recovery path.
- [x] Plaid, tested in **sandbox**:
  - link, exchange, and encrypted token storage
  - cursor-based sync
  - balance snapshots
  - recurring streams, with a local detector as fallback
  - signature-verified webhook receiver
  - cron sync endpoint
- [x] Analytics APIs: summary, net worth and rebuilt balance history, daily totals, category and merchant breakdowns, spending by location, and alerts.
- [x] Every UI page, plus the settings page, collapsible sidebar, profile modal, privacy mode, and interactive map.
- [x] **Cards** (`/cards` page and the dashboard's "My Cards" row): each cash and credit account drawn as a card, with the bank's color, a network logo (guessed, or picked per card), the last 4 digits, and balances or credit used where EXP and CVV would go. Plaid never provides expiry dates or CVVs, and we must never store them.
- [x] **Web Interface Guidelines pass** (2026-09-25): keyboard access for every chart and the map, focus rings, skip link, Sheet focus trap, reduced motion, URL-synced filters and ranges, hydration-safe dates, live regions, and copy fixes.
- [x] Brand: the new radar logo, the Outfit wordmark, the teal accent palette, and the favicon.
- [x] **Transactions redesign** (2026-09-28): the detail sheet is gone; full-width rows show every detail with inline notes, click-to-filter, status/channel/amount/custom-date filters, sorting, whole-set totals, and filtered CSV export. `components/Sheet.tsx` is now unused.
- [x] **Subscriptions build-out** (2026-09-29): insights (duplicates, price changes, renewals, stopped), a 30-day timeline, detailed rows with total spent and history, sort and account filter, a cancel planner, cost by category, and a 12-month spend chart. The sandbox data shows every subscription as a possible duplicate because First Platypus Bank was linked twice (2026-09-24 and 09-25), which also doubles every total. The sandbox-link route now refuses a second copy unless `allow_duplicate` is set.
- [x] **Dashboard "Upcoming bills"** (2026-09-29): a wrapping grid of up to 6 bill cards (`BillCard fluid`) plus a "+N more" tile, instead of a sideways carousel.
- [x] **Real-bank readiness** (2026-09-29):
  - README "Going live" covers the Plaid Trial plan: 10 connected banks, and removing one doesn't free a slot.
  - Leave the redirect URI blank for desktop OAuth pop-ups; the env check rejects `http://` redirect URIs in production.
  - `npm run verify` now creates a Link token with Transactions, and flags linked banks from the wrong environment or linked twice.
  - After linking with no webhook, `syncNewItem` keeps syncing every 30 seconds for up to 6 minutes until the history is complete.
- [x] Typecheck and lint pass; 111 unit tests pass. The last full `npm run build` was on 2026-09-28 (run it again after stopping `next dev`).

## What is Broken / Tech Debt
- [x] **Card migration:** applied (confirmed by `npm run verify` on 2026-09-29).
- [ ] **Still on sandbox:** `PLAID_ENV=sandbox`, and the First Platypus Bank test bank is linked **twice**. Remove both on Accounts, then follow the README "Going live" steps for Bank of America.
- [x] **Supabase sign-ups:** off (confirmed by `npm run verify` on 2026-09-29).
- [ ] **Timezone for "today":** `today()` uses the server's local timezone, which is CDT locally but UTC on Vercel, so "today" can shift on the server. Consider making the timezone a user setting.
- [ ] **Plaid recurring add-on:** it may not be enabled on the production Trial plan. The local detector covers it, but check the results with real data.
- [ ] **Categories:** there's no UI to create or assign custom categories yet. The `categories` table and `user_category_id` exist.
- [ ] **Database types:** `lib/supabase/database.types.ts` is hand-written. Regenerate it after schema changes.
- [ ] **Session revocation:** one browser session was revoked during testing for an unknown reason. It's handled now via `/api/auth/expired`, but keep an eye out.
- [ ] **Production build over dev:** `next build` while `next dev` runs shares `.next/`. Stop dev before building locally.

## Deployment Blockers
- [ ] Create the Vercel project and set every variable from `.env.example`. Use the production Plaid secret with `PLAID_ENV=production`, and a new `CRON_SECRET`.
- [ ] Switch to production Plaid, then connect Bank of America and Capital One. Complete any OAuth registration Plaid requires, and set `PLAID_REDIRECT_URI` to `/oauth-return` if needed.
- [ ] Add a `vercel.json` cron for `GET /api/cron/sync` (for example, daily).
- [ ] Set `PLAID_WEBHOOK_URL=https://<domain>/api/plaid/webhook`, then call `POST /api/plaid/update-webhooks` once.
- [ ] Confirm the dev-only routes (`/api/dev/session`, `/api/dev/sandbox-link`) are inert in production. They check `NODE_ENV` and `PLAID_ENV` respectively.
- [x] The production build (`npm run build`) succeeds.
