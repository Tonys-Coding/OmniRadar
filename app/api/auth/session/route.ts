import { withAuth } from "@/lib/auth";
import { json } from "@/lib/http";

/** Who am I? Returns 401 when not signed in. */
export const GET = withAuth(async (_request, auth) => {
  return json({ user: { id: auth.userId, email: auth.email } });
});
