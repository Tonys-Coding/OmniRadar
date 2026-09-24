import "server-only";
import { z } from "zod";

// Every value is read from process.env (.env.local in development).
// Missing or malformed values produce one error that lists all problems,
// each with a hint for where to find the value.

const required = (hint: string) =>
  z.string({ error: `is missing (${hint})` }).min(1, `is empty (${hint})`);

const optionalUrl = z.url({ error: "must be a full https:// URL" }).optional();

const base64Key32 = z
  .string({ error: "is missing (generate with: openssl rand -base64 32)" })
  .refine(
    (value) =>
      /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, "base64").length === 32,
    "must be 32 bytes, base64-encoded (generate with: openssl rand -base64 32)",
  );

export const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "is missing or not a URL (Supabase -> Project Settings -> API Keys -> Project URL)",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: required(
    "Supabase -> Project Settings -> API Keys -> Publishable key",
  ),
  SUPABASE_SECRET_KEY: required("Supabase -> Project Settings -> API Keys -> Secret key"),
  PLAID_CLIENT_ID: required("Plaid dashboard -> Developers -> Keys -> client_id"),
  PLAID_SECRET: required("Plaid dashboard -> Developers -> Keys -> secret for PLAID_ENV"),
  PLAID_ENV: z
    .enum(["sandbox", "production"], { error: 'must be "sandbox" or "production"' })
    .default("sandbox"),
  PLAID_WEBHOOK_URL: optionalUrl,
  PLAID_REDIRECT_URI: optionalUrl,
  TOKEN_ENCRYPTION_KEY: base64Key32,
  CRON_SECRET: z
    .string({ error: "is missing (generate with: openssl rand -hex 32)" })
    .min(32, "must be at least 32 characters (generate with: openssl rand -hex 32)"),
});

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      `OmniRadar is missing or has invalid environment variables:\n` +
        problems.map((p) => `  - ${p}`).join("\n") +
        `\nFill them in .env.local (see .env.example), then run: npm run verify`,
    );
    this.name = "EnvError";
  }
}

type EnvSource = Record<string, string | undefined>;

/** Validate without throwing. Blank values (`KEY=`) count as missing. */
export function validateEnv(source: EnvSource = process.env) {
  const cleaned = Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value?.trim() || undefined]),
  );
  const result = envSchema.safeParse(cleaned);
  if (result.success) return { ok: true as const, env: result.data };
  const problems = result.error.issues.map((issue) => `${String(issue.path[0])} ${issue.message}`);
  return { ok: false as const, problems };
}

let cached: Env | undefined;

/** Validated environment. Throws EnvError listing every problem. */
export function env(): Env {
  if (cached) return cached;
  const result = validateEnv();
  if (!result.ok) throw new EnvError(result.problems);
  cached = result.env;
  return cached;
}
