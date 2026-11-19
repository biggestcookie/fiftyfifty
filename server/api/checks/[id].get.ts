import {
  defaultCheckStore,
  isTombstone,
  readDocument,
  replaceDocument,
  toExpiredTombstone,
} from "~~/shared/server/check-store";
import { isExpired } from "~~/shared/server/expiry";
import { isShareId } from "~~/shared/server/tokens";

export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, "id") ?? "";
  if (!isShareId(shareId)) {
    return apiError(
      event,
      404,
      "not_found",
      "Could not find this check. Ask your host to share it again."
    );
  }

  const store = await defaultCheckStore();
  const entry = await readDocument(store, shareId);
  if (!entry) {
    return apiError(
      event,
      404,
      "not_found",
      "Could not find this check. Ask your host to share it again."
    );
  }

  const { doc } = entry;

  if (isTombstone(doc)) {
    return apiError(
      event,
      410,
      doc.status,
      doc.status === "revoked"
        ? "This shared link was revoked."
        : "This shared check expired. Ask your host to share it again."
    );
  }

  if (isExpired(doc)) {
    // Delete-on-read: replace the check with a PII-free tombstone. If the
    // write races or fails, still deny access.
    try {
      await replaceDocument(store, toExpiredTombstone(doc), entry.etag);
    } catch {
      // Best effort; expiry is derived from the document either way.
    }
    return apiError(
      event,
      410,
      "expired",
      "This shared check expired. Ask your host to share it again."
    );
  }

  // Deliberately never returns `editTokenHash`.
  return {
    shareId: doc.shareId,
    version: doc.version,
    updatedAt: doc.updatedAt,
    expiresAt: doc.expiresAt,
    check: doc.check,
    totals: doc.totals,
  };
});
