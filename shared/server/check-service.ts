import type { SharedCheck } from "../types/check";
import { computeTotals } from "../utils/check-totals";
import {
  createDocument,
  isTombstone,
  readDocument,
  replaceDocument,
  toExpiredTombstone,
  toRevokedTombstone,
  SCHEMA_VERSION,
  type BlobStore,
  type SharedCheckDocument,
} from "./check-store";
import { isExpired, nextExpiry } from "./expiry";
import {
  hashEditToken,
  isShareId,
  newEditToken,
  newShareId,
  verifyEditToken,
} from "./tokens";
import { parseSharedCheck, SharedCheckValidationError } from "./validate";

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface ServiceResult<T = unknown> {
  status: number;
  body: T;
}

export interface CreateSharedCheckResponse {
  shareId: string;
  editToken: string;
  expiresAt: number;
  version: number;
}

export interface GetSharedCheckResponse {
  shareId: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  check: SharedCheck;
  totals: Record<string, number>;
}

export interface PatchSharedCheckResponse {
  version: number;
  updatedAt: number;
  expiresAt: number;
}

const MAX_CREATE_ATTEMPTS = 3;

function error(
  status: number,
  code: string,
  message: string
): ServiceResult<ApiErrorBody> {
  return { status, body: { error: { code, message } } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createSharedCheck(
  store: BlobStore,
  input: unknown,
  now: number = Date.now()
): Promise<ServiceResult<CreateSharedCheckResponse | ApiErrorBody>> {
  if (!isRecord(input)) {
    return error(400, "invalid_body", "Request body must be a JSON object.");
  }

  const includePayment = input.includePayment !== false;

  let check: SharedCheck;
  try {
    check = parseSharedCheck(input.check, { includePayment });
  } catch (validationError) {
    const message =
      validationError instanceof SharedCheckValidationError
        ? validationError.message
        : "Invalid check.";
    return error(400, "invalid_check", message);
  }

  // Totals are always server-side; any client-supplied totals are ignored.
  const totals = computeTotals(check);

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
      return {
        status: 201,
        body: {
          shareId,
          editToken,
          expiresAt: doc.expiresAt,
          version: doc.version,
        },
      };
    }
  }

  return error(500, "create_failed", "Could not create a shared link.");
}

export async function getSharedCheck(
  store: BlobStore,
  shareId: string,
  now: number = Date.now()
): Promise<ServiceResult<GetSharedCheckResponse | ApiErrorBody>> {
  if (!isShareId(shareId)) {
    return error(
      404,
      "not_found",
      "Could not find this check. Ask your host to share it again."
    );
  }

  const entry = await readDocument(store, shareId);
  if (!entry) {
    return error(
      404,
      "not_found",
      "Could not find this check. Ask your host to share it again."
    );
  }

  const { doc } = entry;

  if (isTombstone(doc)) {
    return error(
      410,
      doc.status,
      doc.status === "revoked"
        ? "This shared link was revoked."
        : "This shared check expired. Ask your host to share it again."
    );
  }

  if (isExpired(doc, now)) {
    // Delete-on-read: replace the check with a PII-free tombstone. If the
    // write races or fails, still deny access.
    try {
      await replaceDocument(store, toExpiredTombstone(doc, now), entry.etag);
    } catch {
      // Best effort; expiry is derived from the document either way.
    }
    return error(
      410,
      "expired",
      "This shared check expired. Ask your host to share it again."
    );
  }

  // Deliberately never returns `editTokenHash`.
  return {
    status: 200,
    body: {
      shareId: doc.shareId,
      version: doc.version,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      expiresAt: doc.expiresAt,
      check: doc.check,
      totals: doc.totals,
    },
  };
}

export async function patchSharedCheck(
  store: BlobStore,
  shareId: string,
  input: {
    token: string | null;
    body: Record<string, unknown>;
    now?: number;
  }
): Promise<ServiceResult<PatchSharedCheckResponse | ApiErrorBody>> {
  const now = input.now ?? Date.now();

  if (!isShareId(shareId)) {
    return error(404, "not_found", "Could not find this check.");
  }

  const entry = await readDocument(store, shareId);
  if (!entry) {
    return error(404, "not_found", "Could not find this check.");
  }

  const { doc } = entry;

  if (isTombstone(doc)) {
    return error(
      410,
      doc.status,
      doc.status === "revoked"
        ? "This shared link was revoked."
        : "This shared check expired. Share it again to get a new link."
    );
  }

  if (isExpired(doc, now)) {
    try {
      await replaceDocument(store, toExpiredTombstone(doc, now), entry.etag);
    } catch {
      // Best effort; the link is denied below regardless.
    }
    return error(
      410,
      "expired",
      "This shared check expired. Share it again to get a new link."
    );
  }

  if (!input.token || !verifyEditToken(input.token, doc.editTokenHash)) {
    return error(
      403,
      "forbidden",
      "This device can no longer update the shared link."
    );
  }

  if (input.body.version !== doc.version) {
    return error(
      409,
      "conflict",
      "The shared check changed. Refresh and try again."
    );
  }

  let check: SharedCheck;
  try {
    check = parseSharedCheck(input.body.check, {
      includePayment: input.body.includePayment !== false,
    });
  } catch (validationError) {
    const message =
      validationError instanceof SharedCheckValidationError
        ? validationError.message
        : "Invalid check.";
    return error(400, "invalid_check", message);
  }

  const next: SharedCheckDocument = {
    ...doc,
    check,
    totals: computeTotals(check),
    version: doc.version + 1,
    updatedAt: now,
    expiresAt: nextExpiry(now),
  };

  if (!(await replaceDocument(store, next, entry.etag))) {
    return error(
      409,
      "conflict",
      "The shared check changed. Refresh and try again."
    );
  }

  return {
    status: 200,
    body: {
      version: next.version,
      updatedAt: next.updatedAt,
      expiresAt: next.expiresAt,
    },
  };
}

export async function deleteSharedCheck(
  store: BlobStore,
  shareId: string,
  input: { token: string | null; now?: number }
): Promise<ServiceResult<null | ApiErrorBody>> {
  const now = input.now ?? Date.now();

  if (!isShareId(shareId)) {
    return error(404, "not_found", "Could not find this check.");
  }

  const entry = await readDocument(store, shareId);
  if (!entry) {
    return error(404, "not_found", "Could not find this check.");
  }

  const { doc } = entry;

  // Already revoked/expired: deleting again is a no-op success. The tombstone
  // carries no edit-token hash, so there is nothing left to authenticate.
  if (isTombstone(doc)) {
    return { status: 204, body: null };
  }

  if (!input.token || !verifyEditToken(input.token, doc.editTokenHash)) {
    return error(
      403,
      "forbidden",
      "This device can no longer update the shared link."
    );
  }

  if (
    !(await replaceDocument(store, toRevokedTombstone(doc, now), entry.etag))
  ) {
    // A concurrent write won the race. If it was another revoke, treat this
    // call as the idempotent success it is.
    const latest = await readDocument(store, shareId);
    if (!latest || !isTombstone(latest.doc)) {
      return error(409, "conflict", "The shared check changed. Try again.");
    }
  }

  return { status: 204, body: null };
}
