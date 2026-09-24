import { createHash } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyPlaidWebhook, type PlaidJwk } from "@/lib/webhook-verify";

const body = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "abc" });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

let privateKey: CryptoKey;
let publicJwk: PlaidJwk;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", expired_at: null };
});

const sign = (claims: Record<string, unknown>, opts: { kid?: string; iat?: number; key?: CryptoKey } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: opts.kid ?? "k1" })
    .setIssuedAt(opts.iat)
    .sign(opts.key ?? privateKey);

const getKey = async (kid: string) => {
  if (kid !== "k1") throw new Error("unknown kid");
  return publicJwk;
};

describe("verifyPlaidWebhook", () => {
  it("accepts a correctly signed, fresh webhook", async () => {
    expect(await verifyPlaidWebhook(body, await sign({ request_body_sha256: sha(body) }), getKey)).toBe(true);
  });

  it("rejects a missing header", async () => {
    expect(await verifyPlaidWebhook(body, null, getKey)).toBe(false);
  });

  it("rejects a body that was changed after signing", async () => {
    const token = await sign({ request_body_sha256: sha(body) });
    expect(await verifyPlaidWebhook(body.replace("abc", "xyz"), token, getKey)).toBe(false);
  });

  it("rejects a replayed (stale) webhook", async () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const token = await sign({ request_body_sha256: sha(body) }, { iat: tenMinutesAgo });
    expect(await verifyPlaidWebhook(body, token, getKey)).toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    const other = await generateKeyPair("ES256");
    const token = await sign({ request_body_sha256: sha(body) }, { key: other.privateKey });
    expect(await verifyPlaidWebhook(body, token, getKey)).toBe(false);
  });

  it("rejects an unknown key id and an expired key", async () => {
    expect(await verifyPlaidWebhook(body, await sign({ request_body_sha256: sha(body) }, { kid: "nope" }), getKey)).toBe(false);
    const expiredKey = async () => ({ ...publicJwk, expired_at: Math.floor(Date.now() / 1000) - 60 });
    expect(await verifyPlaidWebhook(body, await sign({ request_body_sha256: sha(body) }), expiredKey)).toBe(false);
  });
});
