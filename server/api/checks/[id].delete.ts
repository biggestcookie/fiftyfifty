import {
  defaultCheckStore,
  isTombstone,
  readDocument,
  replaceDocument,
  toRevokedTombstone,
} from "~~/shared/server/check-store";
import {
  bearerToken,
  isShareId,
  verifyEditToken,
} from "~~/shared/server/tokens";

export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, "id") ?? "";
  if (!isShareId(shareId)) {
    return apiError(event, 404, "not_found", "Could not find this check.");
  }

  const store = await defaultCheckStore();
  const entry = await readDocument(store, shareId);
  if (!entry) {
    return apiError(event, 404, "not_found", "Could not find this check.");
  }

  const { doc } = entry;

  // Already revoked/expired: deleting again is a no-op success. The tombstone
  // carries no edit-token hash, so there is nothing left to authenticate.
  if (isTombstone(doc)) {
    setResponseStatus(event, 204);
    return null;
  }

  const token = bearerToken(getHeader(event, "authorization"));
  if (!token || !verifyEditToken(token, doc.editTokenHash)) {
    return apiError(
      event,
      403,
      "forbidden",
      "This device can no longer update the shared link."
    );
  }

  if (!(await replaceDocument(store, toRevokedTombstone(doc), entry.etag))) {
    // A concurrent write won the race. If it was another revoke, treat this
    // call as the idempotent success it is.
    const latest = await readDocument(store, shareId);
    if (!latest || !isTombstone(latest.doc)) {
      return apiError(
        event,
        409,
        "conflict",
        "The shared check changed. Try again."
      );
    }
  }

  setResponseStatus(event, 204);
  return null;
});
