import type { SharedCheck } from "../types/check";

export const CHECKS_PREFIX = "checks/";
export const STORE_NAME = "fiftyfifty";
export const SCHEMA_VERSION = 1;

export interface SharedCheckDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  shareId: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  editTokenHash: string;
  check: SharedCheck;
  totals: Record<string, number>;
}

/** No check data, receipt data, edit-token hash, or other PII. */
export interface Tombstone {
  schemaVersion: typeof SCHEMA_VERSION;
  shareId: string;
  status: "expired" | "revoked";
  expiredAt: number;
  lastVersion: number;
}

export type StoredDocument = SharedCheckDocument | Tombstone;

export interface StoredEntry {
  doc: StoredDocument;
  etag?: string;
}

export interface BlobWriteResult {
  modified: boolean;
  etag?: string;
}

/**
 * The small subset of Netlify Blobs the API and cleanup job use. Tests inject
 * an in-memory implementation instead of calling Blobs.
 */
export interface BlobStore {
  getWithMetadata(
    key: string,
    options: { type: "json"; consistency: "strong" }
  ): Promise<{ data: unknown; etag?: string } | null>;
  setJSON(
    key: string,
    data: unknown,
    options?: { onlyIfNew?: boolean; onlyIfMatch?: string }
  ): Promise<BlobWriteResult>;
  delete(key: string): Promise<void>;
  list(options: {
    prefix: string;
    paginate: true;
  }): AsyncIterable<{ blobs: Array<{ key: string }> }>;
}

let cachedStore: BlobStore | null = null;

/** Blobs are only reachable inside the Netlify runtime (deploy or `netlify dev`). */
export async function defaultCheckStore(): Promise<BlobStore> {
  if (!cachedStore) {
    const { getStore } = await import("@netlify/blobs");
    cachedStore = getStore({
      name: STORE_NAME,
      consistency: "strong",
    }) as unknown as BlobStore;
  }
  return cachedStore;
}

export function checkKey(shareId: string): string {
  return `${CHECKS_PREFIX}${shareId}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTombstone(doc: StoredDocument): doc is Tombstone {
  return (
    isRecord(doc) && (doc.status === "expired" || doc.status === "revoked")
  );
}

export function isActiveDocument(
  doc: StoredDocument
): doc is SharedCheckDocument {
  return !isTombstone(doc);
}

function isStoredDocument(value: unknown): value is StoredDocument {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof value.shareId !== "string") return false;
  if (value.status === "expired" || value.status === "revoked") {
    return (
      typeof value.expiredAt === "number" &&
      typeof value.lastVersion === "number"
    );
  }
  return (
    isRecord(value.check) &&
    typeof value.version === "number" &&
    typeof value.updatedAt === "number" &&
    typeof value.expiresAt === "number" &&
    typeof value.createdAt === "number" &&
    typeof value.editTokenHash === "string" &&
    isRecord(value.totals)
  );
}

export async function readDocument(
  store: BlobStore,
  shareId: string
): Promise<StoredEntry | null> {
  const entry = await store.getWithMetadata(checkKey(shareId), {
    type: "json",
    consistency: "strong",
  });
  if (!entry) return null;
  if (!isStoredDocument(entry.data)) return null;
  return { doc: entry.data, etag: entry.etag };
}

/** Returns false when the ID already exists; the caller retries with a new ID. */
export async function createDocument(
  store: BlobStore,
  doc: SharedCheckDocument
): Promise<boolean> {
  const result = await store.setJSON(checkKey(doc.shareId), doc, {
    onlyIfNew: true,
  });
  return result.modified;
}

/** Returns false when the record changed since it was read (version conflict). */
export async function replaceDocument(
  store: BlobStore,
  doc: StoredDocument,
  etag: string | undefined
): Promise<boolean> {
  if (!etag) return false;
  const result = await store.setJSON(checkKey(doc.shareId), doc, {
    onlyIfMatch: etag,
  });
  return result.modified;
}

export async function deleteDocument(
  store: BlobStore,
  shareId: string
): Promise<void> {
  await store.delete(checkKey(shareId));
}

export interface ListedDocument {
  key: string;
  shareId: string;
  entry: StoredEntry;
}

/** Paginated list used by the daily cleanup job. */
export async function* listDocuments(
  store: BlobStore
): AsyncGenerator<ListedDocument> {
  for await (const page of store.list({
    prefix: CHECKS_PREFIX,
    paginate: true,
  })) {
    for (const blob of page.blobs) {
      const shareId = blob.key
        .slice(CHECKS_PREFIX.length)
        .replace(/\.json$/, "");
      const entry = await readDocument(store, shareId);
      if (entry) yield { key: blob.key, shareId, entry };
    }
  }
}

export function toExpiredTombstone(
  doc: SharedCheckDocument,
  now: number = Date.now()
): Tombstone {
  return {
    schemaVersion: SCHEMA_VERSION,
    shareId: doc.shareId,
    status: "expired",
    expiredAt: now,
    lastVersion: doc.version,
  };
}

export function toRevokedTombstone(
  doc: SharedCheckDocument,
  now: number = Date.now()
): Tombstone {
  return {
    schemaVersion: SCHEMA_VERSION,
    shareId: doc.shareId,
    status: "revoked",
    expiredAt: now,
    lastVersion: doc.version,
  };
}
