import type { AccountBase, Transaction } from "plaid";
import type { Database, Json } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type AccountInsert = Tables["accounts"]["Insert"];
export type TransactionInsert = Tables["transactions"]["Insert"];

/** Plaid account -> accounts row (never touches user-editable columns like is_hidden). */
export function mapAccount(account: AccountBase, userId: string, itemId: string, now: string): AccountInsert {
  return {
    user_id: userId,
    item_id: itemId,
    plaid_account_id: account.account_id,
    name: account.name,
    official_name: account.official_name ?? null,
    mask: account.mask ?? null,
    type: account.type,
    subtype: account.subtype ?? null,
    current_balance: account.balances.current ?? null,
    available_balance: account.balances.available ?? null,
    credit_limit: account.balances.limit ?? null,
    iso_currency_code: account.balances.iso_currency_code ?? account.balances.unofficial_currency_code ?? null,
    balance_updated_at: account.balances.last_updated_datetime ?? now,
  };
}

/** Plaid transaction -> transactions row (never touches notes / user_category_id). */
export function mapTransaction(t: Transaction, userId: string, accountId: string): TransactionInsert {
  const pfc = t.personal_finance_category;
  return {
    user_id: userId,
    account_id: accountId,
    plaid_transaction_id: t.transaction_id,
    amount: t.amount,
    iso_currency_code: t.iso_currency_code ?? t.unofficial_currency_code ?? null,
    date: t.date,
    authorized_date: t.authorized_date ?? null,
    name: t.name,
    merchant_name: t.merchant_name ?? null,
    merchant_entity_id: t.merchant_entity_id ?? null,
    logo_url: t.logo_url ?? null,
    website: t.website ?? null,
    category_primary: pfc?.primary ?? null,
    category_detailed: pfc?.detailed ?? null,
    category_confidence: pfc?.confidence_level ?? null,
    payment_channel: t.payment_channel ?? null,
    pending: t.pending,
    pending_transaction_id: t.pending_transaction_id ?? null,
    raw: t as unknown as Json,
  };
}
