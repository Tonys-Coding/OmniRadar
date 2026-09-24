import { createHash, timingSafeEqual } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";

// Plaid signs every webhook with a JWT in the `Plaid-Verification` header:
//   1. ES256 signature by a Plaid key (looked up by `kid`)
//   2. `iat` no older than 5 minutes (replay protection)
//   3. `request_body_sha256` equals the SHA-256 of the exact raw body
// https://plaid.com/docs/api/webhooks/webhook-verification/

export type PlaidJwk = JWK & { expired_at?: number | null };

export async function verifyPlaidWebhook(
  rawBody: string,
  token: string | null,
  getKey: (kid: string) => Promise<PlaidJwk>,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token) return false;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "ES256" || !header.kid) return false;

    const jwk = await getKey(header.kid);
    if (jwk.expired_at && jwk.expired_at * 1000 < now.getTime()) return false;
    const key = await importJWK({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }, "ES256");

    const { payload } = await jwtVerify(token, key, {
      algorithms: ["ES256"],
      maxTokenAge: "5 min",
      currentDate: now,
    });

    const claimed = payload.request_body_sha256;
    if (typeof claimed !== "string") return false;
    const actual = createHash("sha256").update(rawBody, "utf8").digest("hex");
    return claimed.length === actual.length && timingSafeEqual(Buffer.from(claimed), Buffer.from(actual));
  } catch {
    return false;
  }
}
