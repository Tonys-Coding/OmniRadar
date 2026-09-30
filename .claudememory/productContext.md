# Product Context

## Purpose
- OmniRadar is a private, single-user personal finance dashboard in the spirit of Rocket Money. It links the owner's bank accounts through Plaid and shows everything in one place: balances, transactions, subscriptions, bills, income versus spending, savings, and where the money is spent.
- **Banks in scope:** Bank of America and Capital One checking and savings. Investments, loans, and crypto may come later.

## User Workflows
There is one user type, the owner. Sign-ups are disabled and the account is created in Supabase.

- **Sign in** with email and password.
- **Connect a bank** on the Accounts page with Plaid Link. The bank's own login page handles OAuth. The first import pulls up to 2 years of history. Repair a broken connection with "Fix connection", or remove a bank and all its data.
- **Dashboard (`/`):**
  - today, this week, and this month spending, with an optional budget bar
  - current cash balance by account
  - cash and net-worth history, rebuilt from transactions
  - 12-week spending heatmap
  - "My Cards" carousel
  - upcoming bills carousel
  - recent transactions
  - income versus spending
  - spending by category
  - monthly fixed costs
  - the interactive spending map
- **Cards (`/cards`):** every checking, savings, and credit account as a card (bank color, network logo, last 4, balance and available or limit), with totals, a detail panel (balances, credit used, include-in-totals, pick the card network), and recent activity. Tap a card on the dashboard to open it here.
- **Transactions:** a dense, full-width list with every detail inline (no detail sheet):
  - each row shows merchant, bank description, category and subcategory, account, channel, location or website, status, authorized date, and an inline note editor
  - clicking a merchant, category, or account filters to it; search matches merchant, description, and notes (with highlighting); `/` focuses search
  - filters: money in/out, category, account, date range (presets, this or last month, custom dates), status, channel, and amount range; sort by newest, oldest, biggest charges, or biggest deposits
  - totals over every matching transaction (money in, out, net, largest charge), not just the loaded page
  - "Export CSV" downloads exactly the filtered view
- **Spending:** month view compared with the previous month, daily average and projection, categories with changes, top merchants, a 26-week heatmap, and the full map.
- **Spending map:**
  - hex-dot US map with States and Cities views
  - zoom with buttons, pinch, or Ctrl/⌘ + scroll; drag to pan
  - click any state to zoom in and list its cities; click outside it to return to 1×
  - dots in a selected state are shaded by how much was spent near each city
- **Subscriptions:**
  - tiles: monthly and yearly cost, due in the next 30 days, actually charged in the last 12 months
  - "Worth a look" insights: likely duplicate services (priced as the extra yearly cost), recent price increases or cuts, quarterly or yearly renewals within 30 days, and streams that stopped charging
  - a "Next 30 days" timeline of expected charges
  - detailed rows: category, account, total spent, charge count, subscribed since, next charge, yearly cost and share; sort and account filter; a link to every charge on Transactions; the merchant's website
  - a cancel planner (scissors on each row, kept in `?cut=`) showing monthly, yearly, and 5-year savings; it never cancels anything
  - cost by category, a 12-month subscription-spend bar chart, and the stopped and hidden lists
- **Bills:** upcoming bills and subscriptions, and a calendar of charges and paydays. Both pages have a menu to reclassify or hide a stream.
- **Settings:**
  - display name
  - privacy mode (blur amounts), show cents, week start, default chart range
  - monthly budget and alert thresholds (low balance, large purchase, bill reminders, budget pace)
  - sync all banks
  - change password, sign out everywhere
  - CSV export, delete all financial data
- **Notifications bell:** alerts driven by those settings, with unread tracking.
- **Phones:** the whole app works in a phone browser, with a bottom tab bar instead of the sidebar.
