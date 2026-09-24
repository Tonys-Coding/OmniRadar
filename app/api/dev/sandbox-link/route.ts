import { Products } from "plaid";
import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { env } from "@/lib/env";
import { HttpError, json, readJson } from "@/lib/http";
import { plaid } from "@/lib/plaid";
import { exchangePublicToken } from "@/lib/plaid-link";
import { syncItem } from "@/lib/sync/sync-item";

export const maxDuration = 60;

const Body = z.object({
  /** Plaid sandbox institution. Default: First Platypus Bank. */
  institution_id: z.string().default("ins_109508"),
  /**
   * Sandbox test user. "user_transactions_dynamic" has realistic, recurring
   * transactions (paychecks, subscriptions) and is best for testing.
   */
  username: z.string().default("user_transactions_dynamic"),
});

/**
 * SANDBOX ONLY: link a fake bank without the Plaid Link UI, then run the first
 * sync and return what was imported. Disabled when PLAID_ENV=production.
 */
export const POST = withAuth(async (request, auth) => {
  if (env().PLAID_ENV !== "sandbox") throw new HttpError(404, "Not found");
  const { institution_id, username } = await readJson(request, Body);

  const { data } = await plaid().sandboxPublicTokenCreate({
    institution_id,
    initial_products: [Products.Transactions],
    options: {
      override_username: username,
      override_password: "pass_good",
      transactions: { days_requested: 730 },
      ...(env().PLAID_WEBHOOK_URL && { webhook: env().PLAID_WEBHOOK_URL }),
    },
  });

  const item = await exchangePublicToken(auth.userId, data.public_token, true);
  const sync = await syncItem(item.id, "link", { waitForData: true });
  return json({ item: { id: item.id, institution_name: item.institution_name }, sync }, { status: 201 });
});
