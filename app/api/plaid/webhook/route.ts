import { after } from "next/server";
import { json } from "@/lib/http";
import { verifyPlaidWebhook } from "@/lib/webhook-verify";
import { fetchPlaidWebhookKey, handlePlaidWebhook, type PlaidWebhook } from "@/lib/webhooks";

export const maxDuration = 60;

/**
 * Plaid webhook receiver. Set PLAID_WEBHOOK_URL to this route's public HTTPS
 * address (https://<your-domain>/api/plaid/webhook).
 *
 * Every request must carry a valid Plaid-Verification signature. Plaid expects
 * a 200 within 10 seconds, so the actual work runs after responding.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const verified = await verifyPlaidWebhook(raw, request.headers.get("plaid-verification"), fetchPlaidWebhookKey);
  if (!verified) return json({ error: "Invalid signature" }, { status: 401 });

  let event: PlaidWebhook;
  try {
    event = JSON.parse(raw) as PlaidWebhook;
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  after(async () => {
    try {
      await handlePlaidWebhook(event);
    } catch (error) {
      console.error(`[webhook] ${event.webhook_type}.${event.webhook_code} failed`, error);
    }
  });
  return json({ received: true });
}
