import { z } from "zod";
import { withAuth } from "@/lib/auth";
import { loadStreams } from "@/lib/finance/queries";
import { json, readQuery } from "@/lib/http";

const Query = z.object({
  kind: z.enum(["subscription", "bill", "income", "transfer", "other"]).optional(),
  direction: z.enum(["inflow", "outflow"]).optional(),
  include_inactive: z.stringbool().default(false),
  include_ignored: z.stringbool().default(false),
});

/** All detected recurring streams (subscriptions, bills, income, transfers). */
export const GET = withAuth(async (request, auth) => {
  const f = readQuery(request, Query);
  const streams = (await loadStreams(auth.supabase, { includeInactive: f.include_inactive, includeIgnored: f.include_ignored }))
    .filter((s) => (!f.kind || s.effective_kind === f.kind) && (!f.direction || s.direction === f.direction));
  return json({ streams });
});
