import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import { env } from "@/lib/env";

let client: PlaidApi | undefined;

/** Plaid API client for the environment in PLAID_ENV. */
export function plaid(): PlaidApi {
  if (client) return client;
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } = env();
  client = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[PLAID_ENV],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
          "PLAID-SECRET": PLAID_SECRET,
          "Plaid-Version": "2020-09-14",
        },
        timeout: 30_000,
      },
    }),
  );
  return client;
}

export type PlaidErrorBody = {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
  request_id?: string;
};

/** Extract Plaid's error body from an axios error, if it is one. */
export function plaidError(error: unknown): PlaidErrorBody | undefined {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data && typeof data === "object" && "error_code" in data) return data as PlaidErrorBody;
  return undefined;
}

/** Item-level error codes that mean the user must re-link through Plaid Link. */
export const RELINK_ERROR_CODES = new Set([
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
  "ACCESS_NOT_GRANTED",
  "NO_ACCOUNTS",
]);
