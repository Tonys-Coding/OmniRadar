import { z } from "zod";

// User preferences, stored in the Supabase auth user's metadata
// (user_metadata.settings) so no extra table or migration is needed. They are
// the user's own display choices, never used for access control.
//
// Shared by server (week start, alerts) and browser (privacy mode, cents).

export const RANGES = ["1W", "1M", "3M", "6M", "1Y", "ALL"] as const;
export type Range = (typeof RANGES)[number];

const money = z.number().nonnegative().max(10_000_000);

export const SettingsSchema = z.object({
  /** Blur balances and amounts (for screen sharing or public places). */
  privacy_mode: z.boolean().default(false),
  /** Show cents on amounts. */
  show_cents: z.boolean().default(true),
  week_start: z.enum(["monday", "sunday"]).default("monday"),
  /** Default range for the balance history chart. */
  default_range: z.enum(RANGES).default("3M"),
  /** Monthly spending target; null = no budget. */
  monthly_budget: money.nullable().default(null),
  alerts: z
    .object({
      low_balance: z.object({ enabled: z.boolean().default(true), threshold: money.default(100) }).prefault({}),
      large_transaction: z.object({ enabled: z.boolean().default(true), threshold: money.default(500) }).prefault({}),
      bill_reminders: z.object({ enabled: z.boolean().default(true), days_before: z.number().int().min(0).max(14).default(3) }).prefault({}),
      budget_pace: z.object({ enabled: z.boolean().default(true) }).prefault({}),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

/** Read settings from user metadata; anything missing or invalid falls back to defaults. */
export function parseSettings(raw: unknown): Settings {
  const result = SettingsSchema.safeParse(raw ?? {});
  if (result.success) return result.data;
  // Keep whatever top-level fields are still valid.
  const merged: Record<string, unknown> = {};
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      const field = SettingsSchema.shape[key as keyof Settings];
      if (field?.safeParse(value).success) merged[key] = value;
    }
  }
  return SettingsSchema.parse(merged);
}

export const DisplayNameSchema = z.string().trim().max(60);

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_sign_in_at: string | null;
};
