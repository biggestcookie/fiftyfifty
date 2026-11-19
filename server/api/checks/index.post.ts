import type { SharedCheck } from "~~/shared/types/check";
import { computeTotals } from "~~/shared/utils/check-totals";
import {
  createDocument,
  defaultCheckStore,
  SCHEMA_VERSION,
  type SharedCheckDocument,
} from "~~/shared/server/check-store";
import { nextExpiry } from "~~/shared/server/expiry";
import {
  hashEditToken,
  newEditToken,
  newShareId,
} from "~~/shared/server/tokens";
import {
  parseSharedCheck,
  SharedCheckValidationError,
} from "~~/shared/server/validate";

const MAX_CREATE_ATTEMPTS = 3;

export default defineEventHandler(async (event) => {
  const body = await readJsonObject(event);
  if (!body) {
    return apiError(
      event,
      400,
      "invalid_body",
      "Request body must be a JSON object."
    );
  }

  const includePayment = body.includePayment !== false;

  let check: SharedCheck;
  try {
    check = parseSharedCheck(body.check, { includePayment });
  } catch (error) {
    const message =
      error instanceof SharedCheckValidationError
        ? error.message
        : "Invalid check.";
    return apiError(event, 400, "invalid_check", message);
  }

  // Totals are always server-side; any client-supplied totals are ignored.
  const totals = computeTotals(check);
  const now = Date.now();
  const store = await defaultCheckStore();

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const shareId = newShareId();
    const editToken = newEditToken();
    const doc: SharedCheckDocument = {
      schemaVersion: SCHEMA_VERSION,
      shareId,
      version: 1,
      createdAt: now,
      updatedAt: now,
      expiresAt: nextExpiry(now),
      editTokenHash: hashEditToken(editToken),
      check,
      totals,
    };

    if (await createDocument(store, doc)) {
      setResponseStatus(event, 201);
      return {
        shareId,
        editToken,
        expiresAt: doc.expiresAt,
        version: doc.version,
      };
    }
  }

  return apiError(
    event,
    500,
    "create_failed",
    "Could not create a shared link."
  );
});
