import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM sealing for retailer tokens and OAuth state. The key
 * (RETAILER_TOKEN_KEY, 32 random bytes, base64) lives only on the server;
 * the database stores ciphertext it can't use.
 */
function key(): Buffer | null {
  const raw = process.env.RETAILER_TOKEN_KEY ?? "";
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  return k.length === 32 ? k : null;
}

export const sealingConfigured = () => key() !== null;

/**
 * `context` is bound into the ciphertext (GCM associated data), e.g.
 * "token:<user>:kroger" or "oauth-state": a sealed value only opens in the
 * same context, so tokens can't be moved to another person's row or swapped
 * with OAuth state.
 */
export function seal(value: unknown, context: string): string {
  const k = key();
  if (!k) throw new Error("RETAILER_TOKEN_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

export function unseal<T>(sealed: string, context: string): T | null {
  const k = key();
  if (!k || !sealed.startsWith("v1.")) return null;
  try {
    const buf = Buffer.from(sealed.slice(3), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    decipher.setAAD(Buffer.from(context, "utf8"));
    return JSON.parse(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

/** PKCE pair: a random verifier and its S256 challenge. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
