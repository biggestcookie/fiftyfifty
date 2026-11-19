/** Shared links live for 7 days after creation or the last successful edit. */
export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Tombstones keep returning 410 for 30 days before the cleanup job deletes them. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isExpired(
  doc: { expiresAt: number },
  now: number = Date.now()
): boolean {
  return doc.expiresAt <= now;
}

/** Sliding expiry: every create or successful patch starts a fresh 7 days. */
export function nextExpiry(now: number = Date.now()): number {
  return now + SHARE_TTL_MS;
}
