import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const key = randomBytes(32).toString("base64");
const token = "access-sandbox-not-a-real-token";

describe("token encryption", () => {
  it("round-trips a secret", () => {
    const sealed = encryptSecret(token, key, "item-1");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain(token);
    expect(decryptSecret(sealed, key, "item-1")).toBe(token);
  });

  it("uses a fresh IV every time", () => {
    expect(encryptSecret(token, key)).not.toBe(encryptSecret(token, key));
  });

  it("fails with the wrong key", () => {
    const sealed = encryptSecret(token, key);
    expect(() => decryptSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
  });

  it("fails when moved to a different item (context mismatch)", () => {
    const sealed = encryptSecret(token, key, "item-1");
    expect(() => decryptSecret(sealed, key, "item-2")).toThrow();
  });

  it("fails when tampered with", () => {
    const sealed = encryptSecret(token, key);
    const parts = sealed.split(".");
    const ct = Buffer.from(parts[3]!, "base64url");
    ct[0] = ct[0]! ^ 0xff;
    parts[3] = ct.toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => encryptSecret(token, randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
