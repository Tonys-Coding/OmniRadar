import { z } from "zod";
import { profileOf, withAuth } from "@/lib/auth";
import { json, readJson } from "@/lib/http";
import { DisplayNameSchema, SettingsSchema } from "@/lib/settings";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Profile + preferences for the signed-in user. */
export const GET = withAuth(async (_request, auth) => {
  return json({ profile: profileOf(auth.user), settings: auth.settings });
});

const Body = z
  .object({
    display_name: DisplayNameSchema.optional(),
    /** Any subset of settings; merged into the saved ones, then validated. */
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((b) => b.display_name !== undefined || b.settings !== undefined, "Nothing to update");

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function deepMerge(base: Obj, patch: Obj): Obj {
  const out: Obj = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isObj(value) && isObj(base[key]) ? deepMerge(base[key], value) : value;
  }
  return out;
}

/** Update display name and/or some settings (stored in user metadata). */
export const PATCH = withAuth(async (request, auth) => {
  const body = await readJson(request, Body);
  const settings = body.settings ? SettingsSchema.parse(deepMerge(auth.settings, body.settings)) : undefined;
  const metadata = {
    ...(auth.user.user_metadata ?? {}),
    ...(body.display_name !== undefined && { display_name: body.display_name }),
    ...(settings && { settings }),
  };
  // Server-side update: works for cookie and bearer-token sessions alike.
  const { data, error } = await supabaseAdmin().auth.admin.updateUserById(auth.userId, { user_metadata: metadata });
  if (error) throw error;
  return json({ profile: profileOf(data.user), settings: SettingsSchema.parse(metadata.settings ?? {}) });
});
