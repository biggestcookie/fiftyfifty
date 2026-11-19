import type { SharedCheck } from "~~/shared/types/check";
import { computeTotals } from "~~/shared/utils/check-totals";
import {
  defaultCheckStore,
  isTombstone,
  readDocument,
  replaceDocument,
  toExpiredTombstone,
  type SharedCheckDocument,
} from "~~/shared/server/check-store";
import { isExpired, nextExpiry } from "~~/shared/server/expiry";
import {
  bearerToken,
  isShareId,
  verifyEditToken,
} from "~~/shared/server/tokens";
import {
  parseSharedCheck,
  SharedCheckValidationError,
} from "~~/shared/server/validate";

export default defineEventHandler(async (event) => {
  const shareId = getRouterParam(event, "id") ?? "";
  if (!isShareId(shareId)) {
    return apiError(event, 404, "not_found", "Could not find this check.");
  }

  const body = await readJsonObject(event);
  if (!body) {
    return apiError(
      event,
      400,
      "invalid_body",
      "Request body must be a JSON object."
    );
  }

  const store = await defaultCheckStore();
  const entry = await readDocument(store, shareId);
  if (!entry) {
    return apiError(event, 404, "not_found", "Could not find this check.");
  }

  const { doc } = entry;

  if (isTombstone(doc)) {
    return apiError(
      event,
      410,
      doc.status,
      doc.status === "revoked"
        ? "This shared link was revoked."
        : "This shared check expired. Share it again to get a new link."
    );
  }

  if (isExpired(doc)) {
    try {
      await replaceDocument(store, toExpiredTombstone(doc), entry.etag);
    } catch {
      // Best effort; the link is denied below regardless.
    }
    return apiError(
      event,
      410,
      "expired",
      "This shared check expired. Share it again to get a new link."
    );
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

  if (body.version !== doc.version) {
    return apiError(
      event,
      409,
      "conflict",
      "The shared check changed. Refresh and try again."
    );
  }

  let check: SharedCheck;
  try {
    check = parseSharedCheck(body.check, {
      includePayment: body.includePayment !== false,
    });
  } catch (error) {
    const message =
      error instanceof SharedCheckValidationError
        ? error.message
        : "Invalid check.";
    return apiError(event, 400, "invalid_check", message);
  }

  const now = Date.now();
  const next: SharedCheckDocument = {
    ...doc,
    check,
    totals: computeTotals(check),
    version: doc.version + 1,
    updatedAt: now,
    expiresAt: nextExpiry(now),
  };

  if (!(await replaceDocument(store, next, entry.etag))) {
    return apiError(
      event,
      409,
      "conflict",
      "The shared check changed. Refresh and try again."
    );
  }

  return {
    version: next.version,
    updatedAt: next.updatedAt,
    expiresAt: next.expiresAt,
  };
});
