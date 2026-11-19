import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SHARE_ID_BYTES = 12;
const EDIT_TOKEN_BYTES = 32;

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;

/** 12 random bytes → 16 base64url characters (~96 bits of read capability). */
export function newShareId(): string {
  return randomBytes(SHARE_ID_BYTES).toString("base64url");
}

/** 32 random bytes → 43 base64url characters (write capability). */
export function newEditToken(): string {
  return randomBytes(EDIT_TOKEN_BYTES).toString("base64url");
}

export function isShareId(value: unknown): value is string {
  return typeof value === "string" && SHARE_ID_PATTERN.test(value);
}

/**
 * Only the hash is stored server-side. The token itself is returned once, at
 * creation, and kept on the owner's device.
 */
export function hashEditToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyEditToken(token: string, hash: string): boolean {
  if (typeof token !== "string" || typeof hash !== "string") return false;

  const expected = Buffer.from(hash, "hex");
  if (expected.length !== 32) return false;

  const actual = Buffer.from(hashEditToken(token), "hex");
  return timingSafeEqual(expected, actual);
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}
