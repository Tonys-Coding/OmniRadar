// Types mirroring supabase/migrations. Hand-written to match the SQL; once your
// project is linked you can regenerate them with:
//   npx supabase gen types typescript --linked > lib/supabase/database.types.ts
// (the generated file is a drop-in replacement for this one).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

/** Row shape plus Insert (required keys + optional rest) and Update (all optional). */
type Table<Row, RequiredOnInsert extends keyof Row, Rels extends Relationship[] = []> = {
  Row: Row;
  Insert: Pick<Row, RequiredOnInsert> & Partial<Omit<Row, RequiredOnInsert>>;
  Update: Partial<Row>;
  Relationships: Rels;
};

export type ItemStatus = "good" | "login_required" | "pending_expiration" | "revoked" | "error";
export type StreamKind = "subscription" | "bill" | "income" | "transfer" | "other";
export type StreamDirection = "inflow" | "outflow";
export type StreamFrequency =
  | "WEEKLY"
  | "BIWEEKLY"
  | "SEMI_MONTHLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "ANNUALLY"
  | "UNKNOWN";

export type PlaidItemRow = {
  id: string;
  user_id: string;
  plaid_item_id: string;
  institution_id: string | null;
  institution_name: string | null;
  status: ItemStatus;
  error_code: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaidItemSecretRow = {
  item_id: string;
  access_token_ciphertext: string;
  transactions_cursor: string | null;
  updated_at: string;
};

export type AccountRow = {
  id: string;
  user_id: string;
  item_id: string;
  plaid_account_id: string;
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
  created_at: string;
  updated_at: string;
};

export type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionRow = {
  id: string;
  user_id: string;
  account_id: string;
  plaid_transaction_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  authorized_date: string | null;
  name: string;
  merchant_name: string | null;
  merchant_entity_id: string | null;
  logo_url: string | null;
  website: string | null;
  category_primary: string | null;
  category_detailed: string | null;
  category_confidence: string | null;
  payment_channel: string | null;
  pending: boolean;
  pending_transaction_id: string | null;
  user_category_id: string | null;
  notes: string | null;
  raw: Json | null;
  created_at: string;
  updated_at: string;
};

export type RecurringStreamRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  stream_key: string;
  source: "plaid" | "local";
  direction: StreamDirection;
  kind: StreamKind;
  kind_override: StreamKind | null;
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
  transaction_ids: string[];
  created_at: string;
  updated_at: string;
};

export type BalanceSnapshotRow = {
  id: number;
  user_id: string;
  account_id: string;
  snapshot_date: string;
  current_balance: number | null;
  available_balance: number | null;
  created_at: string;
};

export type SyncRunRow = {
  id: number;
  user_id: string;
  item_id: string;
  trigger: "link" | "manual" | "webhook" | "cron";
  started_at: string;
  finished_at: string | null;
  added: number;
  modified: number;
  removed: number;
  error: string | null;
};

export type Database = {
  public: {
    Tables: {
      plaid_items: Table<PlaidItemRow, "user_id" | "plaid_item_id">;
      plaid_item_secrets: Table<
        PlaidItemSecretRow,
        "item_id" | "access_token_ciphertext",
        [
          {
            foreignKeyName: "plaid_item_secrets_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: true;
            referencedRelation: "plaid_items";
            referencedColumns: ["id"];
          },
        ]
      >;
      accounts: Table<
        AccountRow,
        "user_id" | "item_id" | "plaid_account_id" | "name" | "type",
        [
          {
            foreignKeyName: "accounts_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "plaid_items";
            referencedColumns: ["id"];
          },
        ]
      >;
      categories: Table<CategoryRow, "user_id" | "name">;
      transactions: Table<
        TransactionRow,
        "user_id" | "account_id" | "plaid_transaction_id" | "amount" | "date" | "name",
        [
          {
            foreignKeyName: "transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ]
      >;
      recurring_streams: Table<
        RecurringStreamRow,
        "user_id" | "stream_key" | "source" | "direction" | "kind" | "description" | "frequency",
        [
          {
            foreignKeyName: "recurring_streams_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ]
      >;
      balance_snapshots: Table<BalanceSnapshotRow, "user_id" | "account_id" | "snapshot_date">;
      sync_runs: Table<SyncRunRow, "user_id" | "item_id" | "trigger">;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
