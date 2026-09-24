// Response shapes of OmniRadar's API routes (see app/api/**/route.ts).

import type { ItemStatus, StreamFrequency, StreamKind } from "@/lib/supabase/database.types";

export type NetWorth = { net_worth: number; assets: number; liabilities: number; by_type: Record<string, number> };
export type MonthCashflow = { month: string; income: number; spending: number; net: number; savings_rate: number | null };
export type CategoryTotal = { category: string; total: number; count: number };
export type DayTotal = { date: string; spending: number; income: number; count: number };

export type Summary = {
  as_of: string;
  balances: { cash: number; available: number };
  net_worth: NetWorth;
  budget: number | null;
  today: { date: string; spending: number; income: number; count: number; average_daily_spending: number };
  this_week: { start: string; income: number; spending: number; days: DayTotal[] };
  this_month: MonthCashflow & { spending_by_category: CategoryTotal[] };
  cashflow: MonthCashflow[];
  recurring: {
    subscriptions_monthly: number;
    bills_monthly: number;
    income_monthly: number;
    upcoming_30_days: { count: number; amount: number };
  };
  connections: {
    total: number;
    needing_attention: { id: string; institution_name: string | null; status: ItemStatus }[];
    oldest_sync: string | null;
  };
};

export type BalancePoint = { date: string; cash: number; assets: number; liabilities: number; net_worth: number };
export type NetWorthResponse = { range: string; current: NetWorth; series: BalancePoint[] };

export type Transaction = {
  id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string | null;
  logo_url: string | null;
  website: string | null;
  category_primary: string | null;
  category_detailed: string | null;
  payment_channel: string | null;
  pending: boolean;
  user_category_id: string | null;
  notes: string | null;
  accounts: { name: string; mask: string | null; type: string } | null;
};
export type TransactionsResponse = { transactions: Transaction[]; total: number; limit: number; offset: number; has_more: boolean };

export type Stream = {
  id: string;
  account_id: string | null;
  stream_key: string;
  source: "plaid" | "local";
  direction: "inflow" | "outflow";
  kind: StreamKind;
  kind_override: StreamKind | null;
  effective_kind: StreamKind;
  description: string;
  merchant_name: string | null;
  category_primary: string | null;
  category_detailed: string | null;
  frequency: StreamFrequency;
  first_date: string | null;
  last_date: string | null;
  predicted_next_date: string | null;
  average_amount: number | null;
  last_amount: number | null;
  is_active: boolean;
  is_ignored: boolean;
  monthly_amount: number;
  transaction_count: number;
  account: { name: string; mask: string | null } | null;
  logo_url: string | null;
  website: string | null;
};
export type SubscriptionsResponse = { subscriptions: Stream[]; totals: { count: number; monthly: number; yearly: number } };
export type Bill = Stream & { expected_amount: number; overdue: boolean };
export type BillsResponse = { window: { start: string; end: string; days: number }; bills: Bill[]; totals: { count: number; amount: number } };
export type RecurringResponse = { streams: Stream[] };

export type Account = {
  id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  current_balance: number | null;
  available_balance: number | null;
  credit_limit: number | null;
  iso_currency_code: string | null;
  balance_updated_at: string | null;
  is_hidden: boolean;
  is_liability: boolean;
  credit_utilization: number | null;
  institution: { id: string; institution_name: string | null; status: ItemStatus } | null;
};
export type AccountsResponse = { accounts: Account[]; totals: NetWorth };

export type Item = {
  id: string;
  institution_id: string | null;
  institution_name: string | null;
  status: ItemStatus;
  error_code: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  needs_relink: boolean;
  accounts: { id: string; name: string; mask: string | null; type: string; subtype: string | null }[];
};
export type ItemsResponse = { items: Item[] };

export type DailyResponse = { from: string; to: string; days: DayTotal[]; stats: { total: number; active_days: number; max: number } };

export type Merchant = { merchant: string; logo_url: string | null; total: number; count: number; category: string | null };
export type BreakdownResponse = {
  month: string;
  is_current_month: boolean;
  total: number;
  previous_total: number;
  change: number | null;
  categories: (CategoryTotal & { share: number; previous_total: number })[];
  merchants: Merchant[];
  running: { current: { day: number; total: number }[]; previous: { day: number; total: number }[] };
};

export type Place = { city: string; region: string | null; country: string | null; lat: number | null; lon: number | null; total: number; count: number };
export type LocationsResponse = {
  from: string;
  places: Place[];
  regions: { region: string; total: number; count: number }[];
  online: { total: number; count: number };
  unknown: { total: number; count: number };
};

export type SyncResult = {
  item_id: string;
  institution_name: string | null;
  status: ItemStatus;
  added: number;
  modified: number;
  removed: number;
  error?: { code: string; message: string };
};
