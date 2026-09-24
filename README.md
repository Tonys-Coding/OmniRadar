# OmniRadar

A personal finance visibility dashboard: balances, transactions, subscriptions,
bills, income, and savings in one place, in the spirit of Rocket Money.

- **Bank data**: [Plaid](https://plaid.com) (Trial plan: 10 live connections, free)
- **Database + auth**: [Supabase](https://supabase.com) (Postgres with row level security)
- **App**: Next.js 16 (App Router, TypeScript), Tailwind CSS, custom SVG charts

## Status

Backend and UI are built and verified against Plaid sandbox, on desktop and phone widths.

| Page | What's on it |
| --- | --- |
| Dashboard | Today / this week / this month, current balance, balance or net-worth history, spending heatmap, upcoming bills, recent transactions, income vs spending, categories, fixed costs, spending map |
| Transactions | Search and filters, grouped by day, notes |
| Spending | Month view: vs last month, categories, top merchants, heatmap, map |
| Subscriptions | Monthly/yearly cost, possibly-cancelled, fix misclassifications |
| Bills | Upcoming charges, calendar of bills and paydays |
| Accounts | Net worth, banks and accounts, connect / repair / remove via Plaid Link |

## Going live with your real banks

1. Remove the sandbox test bank (Accounts -> First Platypus Bank -> Remove)
2. In `.env.local`, set `PLAID_ENV=production` and `PLAID_SECRET` to your **production** secret
3. Restart the dev server, open Accounts, and click **Connect a bank**

Banks like Bank of America and Capital One sign you in on their own site (OAuth) inside the
Plaid popup. If Plaid says a bank is unavailable, check your Plaid dashboard for any remaining
production or OAuth registration steps.

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

5. Run the dev server (http://localhost:3100)

   ```bash
   npm run dev
   ```

## Trying the API without a UI

Get a 1-hour access token for your user (saved to `.dev-token`, never printed):

```bash
npm run dev-token
```

Link a fake sandbox bank and import its data (only works with `PLAID_ENV=sandbox`):

```bash
curl -X POST -H "Authorization: Bearer $(cat .dev-token)" localhost:3100/api/dev/sandbox-link
```

Then read it back:

```bash
curl -H "Authorization: Bearer $(cat .dev-token)" localhost:3100/api/summary
```

## API

All routes except `health`, `auth/login`, `plaid/webhook`, and `cron/sync` require a
signed-in user (session cookie or `Authorization: Bearer <token>`).
Amounts follow Plaid: **positive = money out, negative = money in.**

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness: env configured, database reachable |
| POST | `/api/auth/login` | Sign in `{email, password}`; sets cookies, returns token |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/session` | Current user |
| POST | `/api/plaid/link-token` | Token to open Plaid Link; `{item_id}` for repair mode |
| POST | `/api/plaid/exchange` | Save a new connection `{public_token}`; syncs in background |
| GET | `/api/items` | Linked banks, their accounts, and connection health |
| DELETE | `/api/items/:id` | Disconnect a bank and delete its data |
| POST | `/api/sync` | Pull latest data now (`{item_id}` optional) |
| GET | `/api/summary?months=6` | Dashboard: net worth, this month, cashflow, recurring |
| GET | `/api/accounts` | Accounts, balances, credit utilization, totals |
| PATCH | `/api/accounts/:id` | `{is_hidden}` to leave an account out of totals |
| GET | `/api/transactions` | Filters: `start end account_id category q min_amount max_amount direction pending limit offset` |
| PATCH | `/api/transactions/:id` | `{notes, user_category_id}` |
| GET | `/api/recurring` | All recurring streams (`kind direction include_inactive include_ignored`) |
| PATCH | `/api/recurring/:id` | `{kind_override, is_ignored}` to fix a misclassification |
| GET | `/api/subscriptions` | Active subscriptions with monthly/yearly totals |
| GET | `/api/bills?days=30` | Bills and subscriptions due soon |
| GET | `/api/net-worth?range=3M` | Net worth now, plus daily cash and net-worth history (`1W 1M 3M 6M 1Y ALL`) |
| GET | `/api/spending/daily?days=84` | Spending and income per day (heatmap) |
| GET | `/api/spending/breakdown?month=YYYY-MM` | A month's categories vs last month, top merchants, running total |
| GET | `/api/spending/locations?days=90` | Spending by city and state, plus online |
| POST | `/api/plaid/webhook` | Plaid webhooks (signature-verified) |
| POST | `/api/plaid/update-webhooks` | Point existing connections at `PLAID_WEBHOOK_URL` |
| GET | `/api/cron/sync` | Sync everything; needs `Authorization: Bearer <CRON_SECRET>` |
| POST | `/api/dev/sandbox-link` | Sandbox only: link a fake bank without the UI |
| GET | `/api/dev/session` | Dev server only: one-time browser sign-in from `npm run dev-token` |

### How income and spending are counted

- Transfers between your accounts, loan disbursements, and credit card payments are ignored.
- Money into a credit card or loan is never income: payments are ignored, refunds reduce spending.
- Income is anything Plaid categorizes as income, plus deposits in a recurring income
  stream or that look like payroll (Plaid sometimes files a paycheck under the employer's
  business type).
- Subscriptions and bills come from Plaid's recurring detection, falling back to a local
  detector if that add-on is unavailable. Fix any mistakes with `PATCH /api/recurring/:id`.

## Keeping data fresh

- **Manual**: the **Sync** button on the dashboard or a bank's card (`POST /api/sync`).
- **Scheduled**: call `GET /api/cron/sync` with the `CRON_SECRET` bearer token (for example,
  from Vercel Cron once deployed).
- **Webhooks** (optional, needs a public HTTPS URL): set `PLAID_WEBHOOK_URL` to
  `https://<your-domain>/api/plaid/webhook`, restart, then call `POST /api/plaid/update-webhooks`
  once. Nothing needs configuring in the Plaid dashboard: the URL is sent per connection.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3100 |
| `npm run verify` | Check Supabase, Plaid, and encryption settings |
| `npm run dev-token` | Write a 1-hour API token to `.dev-token` |
| `npm test` | Unit tests |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Security notes

- `.env.local`, `.dev-token`, and `.dev-session` are gitignored. Never commit them.
- Plaid access tokens are encrypted (AES-256-GCM, bound to their connection) before being
  stored, and the table holding them is unreadable from the browser.
- Every table has row level security; the browser can only edit a few whitelisted columns.
- Webhooks are rejected unless Plaid's signature, freshness, and body hash all check out.
- Public sign-ups should be disabled in Supabase; this is a single-user app.
