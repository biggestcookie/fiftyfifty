import {
  deleteDocument,
  isTombstone,
  listDocuments,
  replaceDocument,
  toExpiredTombstone,
  type BlobStore,
} from "./check-store";
import { isExpired, TOMBSTONE_TTL_MS } from "./expiry";

/**
 * Scheduled functions have a 30-second platform limit. Stop starting new work
 * well before it; the next daily run picks up from the beginning again.
 */
export const DEFAULT_MAX_DURATION_MS = 20_000;

export interface CleanupOptions {
  now?: number;
  maxDurationMs?: number;
}

export interface CleanupResult {
  scanned: number;
  expired: number;
  deleted: number;
  deadlineReached: boolean;
}

/**
 * One cleanup pass over the `checks/` prefix:
 * - active documents past `expiresAt` become `expired` tombstones;
 * - tombstones older than `TOMBSTONE_TTL_MS` are deleted.
 *
 * Idempotent and safe to run concurrently: writes are conditional on the ETag
 * read with the document. Returns counts only; never logs IDs or content.
 */
export async function runCleanup(
  store: BlobStore,
  options: CleanupOptions = {}
): Promise<CleanupResult> {
  const now = options.now ?? Date.now();
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const startedAt = Date.now();

  let scanned = 0;
  let expired = 0;
  let deleted = 0;
  let deadlineReached = false;

  for await (const { entry } of listDocuments(store)) {
    if (Date.now() - startedAt >= maxDurationMs) {
      deadlineReached = true;
      break;
    }

    scanned++;

    const { doc } = entry;

    if (isTombstone(doc)) {
      if (now - doc.expiredAt >= TOMBSTONE_TTL_MS) {
        await deleteDocument(store, doc.shareId);
        deleted++;
      }
      continue;
    }

    if (isExpired(doc, now)) {
      if (
        await replaceDocument(store, toExpiredTombstone(doc, now), entry.etag)
      ) {
        expired++;
      }
    }
  }

  return { scanned, expired, deleted, deadlineReached };
}
