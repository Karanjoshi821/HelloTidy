import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacSha256Hex(secret: string, payload: string | Buffer): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time string comparison; false on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

const ORDER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/** Random order number like HT-7K3P9Q (32^6 ≈ 1 billion combinations). */
export function generateOrderNumber(): string {
  const bytes = randomBytes(6);
  let out = "";
  for (const byte of bytes) out += ORDER_ALPHABET[byte % ORDER_ALPHABET.length];
  return `HT-${out}`;
}
