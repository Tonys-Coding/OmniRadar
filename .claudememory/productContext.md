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
  - upcoming bills carousel
  - recent transactions
  - income versus spending
  - spending by category
  - monthly fixed costs
  - the interactive spending map
- **Transactions:** search and filter (money in/out, category, account, date range), grouped by day, with a detail sheet for adding notes.
- **Spending:** month view compared with the previous month, daily average and projection, categories with changes, top merchants, a 26-week heatmap, and the full map.
- **Spending map:**
  - hex-dot US map with States and Cities views
  - zoom with buttons, pinch, or Ctrl/⌘ + scroll; drag to pan
  - click any state to zoom in and list its cities; click outside it to return to 1×
  - dots in a selected state are shaded by how much was spent near each city
- **Subscriptions and Bills:** detected recurring charges, their monthly and yearly cost, "possibly cancelled" streams, a calendar of charges and paydays, and a menu to reclassify or hide a stream.
- **Settings:**
  - display name
  - privacy mode (blur amounts), show cents, week start, default chart range
  - monthly budget and alert thresholds (low balance, large purchase, bill reminders, budget pace)
  - sync all banks
  - change password, sign out everywhere
  - CSV export, delete all financial data
- **Notifications bell:** alerts driven by those settings, with unread tracking.
- **Phones:** the whole app works in a phone browser, with a bottom tab bar instead of the sidebar.
