import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM encryption for Plaid access tokens at rest.
//
// Ciphertext format: "v1.<iv>.<authTag>.<ciphertext>" (each part base64url).
// The optional `context` (we use the Plaid item id) is bound as additional
// authenticated data, so a ciphertext copied onto another row fails to decrypt.

const VERSION = "v1";
const IV_BYTES = 12;

function keyFromBase64(base64Key: string) {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes (base64-encoded)");
  return key;
}

export function encryptSecret(plaintext: string, base64Key: string, context = ""): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFromBase64(base64Key), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, base64Key: string, context = ""): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unrecognized ciphertext format");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFromBase64(base64Key), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
