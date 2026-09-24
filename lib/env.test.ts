import { describe, expect, it } from "vitest";
import { validateEnv } from "@/lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  PLAID_CLIENT_ID: "client-id",
  PLAID_SECRET: "plaid-secret",
  PLAID_ENV: "sandbox",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "a".repeat(64),
};

describe("validateEnv", () => {
  it("accepts a complete configuration", () => {
    const result = validateEnv(valid);
    expect(result.ok).toBe(true);
  });

  it("defaults PLAID_ENV to sandbox and treats blank optionals as unset", () => {
    const result = validateEnv({ ...valid, PLAID_ENV: undefined, PLAID_WEBHOOK_URL: "" });
    expect(result.ok && result.env.PLAID_ENV).toBe("sandbox");
    expect(result.ok && result.env.PLAID_WEBHOOK_URL).toBeUndefined();
  });

  it("lists every missing variable with a hint", () => {
    const result = validateEnv({ PLAID_ENV: "sandbox", PLAID_SECRET: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const names = result.problems.map((p) => p.split(" ")[0]);
    expect(names).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SECRET_KEY",
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "TOKEN_ENCRYPTION_KEY",
        "CRON_SECRET",
      ]),
    );
    expect(result.problems.find((p) => p.startsWith("PLAID_CLIENT_ID"))).toContain("Plaid dashboard");
  });

  it("rejects an encryption key that is not 32 bytes", () => {
    const result = validateEnv({ ...valid, TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown PLAID_ENV", () => {
    const result = validateEnv({ ...valid, PLAID_ENV: "development" });
    expect(result.ok).toBe(false);
  });
});
