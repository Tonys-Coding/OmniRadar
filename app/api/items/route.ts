import { withAuth } from "@/lib/auth";
import { json } from "@/lib/http";

/** Linked banks with their accounts and connection health. */
export const GET = withAuth(async (_request, auth) => {
  const { data, error } = await auth.supabase
    .from("plaid_items")
    .select(
      "id, institution_id, institution_name, status, error_code, consent_expires_at, last_synced_at, created_at, accounts(id, name, mask, type, subtype)",
    )
    .order("created_at");
  if (error) throw error;

  return json({
    items: data.map((item) => ({ ...item, needs_relink: item.status !== "good" && item.status !== "error" })),
  });
});
