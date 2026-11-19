import { describe, expect, test } from "bun:test";
import {
  SCHEMA_VERSION,
  createDocument,
  deleteDocument,
  isActiveDocument,
  isTombstone,
  listDocuments,
  readDocument,
  replaceDocument,
  toExpiredTombstone,
  toRevokedTombstone,
  type SharedCheckDocument,
  type StoredDocument,
} from "../shared/server/check-store";
import {
  isExpired,
  nextExpiry,
  SHARE_TTL_MS,
  TOMBSTONE_TTL_MS,
} from "../shared/server/expiry";
import {
  hashEditToken,
  isShareId,
  newEditToken,
  newShareId,
  verifyEditToken,
} from "../shared/server/tokens";
import {
  parseSharedCheck,
  SharedCheckValidationError,
} from "../shared/server/validate";
import { FeesMode, type SharedCheck } from "../shared/types/check";
import { computeTotals } from "../shared/utils/check-totals";
import { MemoryStore } from "./helpers/memory-store";

const baseCheck: SharedCheck = {
  guests: [{ id: "a" }, { id: "b", name: "Bea" }],
  items: [{ id: "i1", label: "Pizza", amount: 20, guestIds: ["a", "b"] }],
  fees: [{ id: "f1", label: "Tax", amount: 2 }],
  feesMode: FeesMode.Proportional,
  currencySymbol: "$",
};

function makeDoc(shareId = "aaaaaaaaaaaaaaaa"): SharedCheckDocument {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    shareId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    expiresAt: nextExpiry(now),
    editTokenHash: hashEditToken("token"),
    check: baseCheck,
    totals: computeTotals(baseCheck),
  };
}

describe("tokens", () => {
  test("share ids are 16 base64url chars", () => {
    const id = newShareId();
    expect(id).toHaveLength(16);
    expect(isShareId(id)).toBe(true);
    expect(isShareId("short")).toBe(false);
    expect(isShareId("aaaaaaaaaaaaaaa!")).toBe(false);
  });

  test("edit tokens round-trip through their hash", () => {
    const token = newEditToken();
    expect(token).toHaveLength(43);
    const hash = hashEditToken(token);

    expect(verifyEditToken(token, hash)).toBe(true);
    expect(verifyEditToken(newEditToken(), hash)).toBe(false);
    expect(verifyEditToken(token, "not-a-hash")).toBe(false);
  });
});

describe("expiry", () => {
  test("uses a sliding 7-day window", () => {
    const now = 1_700_000_000_000;
    expect(nextExpiry(now)).toBe(now + SHARE_TTL_MS);
    expect(isExpired({ expiresAt: now + 1 }, now)).toBe(false);
    expect(isExpired({ expiresAt: now }, now)).toBe(true);
    expect(TOMBSTONE_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("parseSharedCheck", () => {
  test("accepts a valid shared check and drops empty optionals", () => {
    const parsed = parseSharedCheck({
      ...baseCheck,
      name: "Joe's Pizza",
      venmoHandle: "joe",
      zelleHandle: "",
    });

    expect(parsed).toEqual({
      ...baseCheck,
      name: "Joe's Pizza",
      venmoHandle: "joe",
    });
  });

  test("strips payment handles when includePayment is false", () => {
    const parsed = parseSharedCheck(
      { ...baseCheck, venmoHandle: "joe", zelleHandle: "joe@example.com" },
      { includePayment: false }
    );

    expect(parsed.venmoHandle).toBeUndefined();
    expect(parsed.zelleHandle).toBeUndefined();
  });

  test("rejects owner-only metadata and unknown fields", () => {
    for (const extra of [
      { share: { shareId: "x" } },
      { editToken: "secret" },
      { totals: { a: 1 } },
      { currentStep: "items" },
    ]) {
      expect(() => parseSharedCheck({ ...baseCheck, ...extra })).toThrow(
        SharedCheckValidationError
      );
    }
  });

  test("rejects unknown guest references and duplicate assignments", () => {
    expect(() =>
      parseSharedCheck({
        ...baseCheck,
        items: [{ id: "i1", label: "Pizza", amount: 1, guestIds: ["nope"] }],
      })
    ).toThrow(SharedCheckValidationError);

    expect(() =>
      parseSharedCheck({
        ...baseCheck,
        items: [{ id: "i1", label: "Pizza", amount: 1, guestIds: ["a", "a"] }],
      })
    ).toThrow(SharedCheckValidationError);
  });

  test("rejects malformed amounts and modes", () => {
    expect(() =>
      parseSharedCheck({
        ...baseCheck,
        items: [
          { id: "i1", label: "Pizza", amount: Number.NaN, guestIds: ["a"] },
        ],
      })
    ).toThrow(SharedCheckValidationError);

    expect(() =>
      parseSharedCheck({ ...baseCheck, feesMode: "random" })
    ).toThrow(SharedCheckValidationError);

    expect(() =>
      parseSharedCheck({ ...baseCheck, currencySymbol: "" })
    ).toThrow(SharedCheckValidationError);
  });
});

describe("check-store", () => {
  test("creates, reads, and refuses to overwrite an existing id", async () => {
    const store = new MemoryStore();
    const doc = makeDoc();

    expect(await createDocument(store, doc)).toBe(true);
    expect(await createDocument(store, doc)).toBe(false);

    const entry = await readDocument(store, doc.shareId);
    expect(entry?.doc).toEqual(doc);
    expect(entry?.etag).toBeDefined();
    expect(entry && isActiveDocument(entry.doc)).toBe(true);
  });

  test("conditional replace rejects a stale etag", async () => {
    const store = new MemoryStore();
    const doc = makeDoc();
    await createDocument(store, doc);
    const first = await readDocument(store, doc.shareId);

    const next: StoredDocument = { ...doc, version: 2 };
    expect(await replaceDocument(store, next, first?.etag)).toBe(true);
    expect(await replaceDocument(store, next, first?.etag)).toBe(false);

    const reread = await readDocument(store, doc.shareId);
    expect(reread?.doc.version).toBe(2);
  });

  test("tombstones drop check data and the token hash", async () => {
    const store = new MemoryStore();
    const doc = makeDoc();
    await createDocument(store, doc);
    const entry = await readDocument(store, doc.shareId);

    const expired = toExpiredTombstone(doc);
    expect(await replaceDocument(store, expired, entry?.etag)).toBe(true);

    const tombstone = (await readDocument(store, doc.shareId))?.doc;
    expect(tombstone && isTombstone(tombstone)).toBe(true);
    expect(tombstone).not.toHaveProperty("check");
    expect(tombstone).not.toHaveProperty("editTokenHash");
    expect(tombstone).not.toHaveProperty("totals");

    const revoked = toRevokedTombstone(doc);
    expect(revoked.status).toBe("revoked");
  });

  test("lists documents by prefix and deletes them", async () => {
    const store = new MemoryStore();
    const a = makeDoc("aaaaaaaaaaaaaaaa");
    const b = makeDoc("bbbbbbbbbbbbbbbb");
    await createDocument(store, a);
    await createDocument(store, b);

    const listed: string[] = [];
    for await (const item of listDocuments(store)) listed.push(item.shareId);
    expect(listed.sort()).toEqual([a.shareId, b.shareId]);

    await deleteDocument(store, a.shareId);
    expect(await readDocument(store, a.shareId)).toBeNull();
    expect(await readDocument(store, b.shareId)).not.toBeNull();
  });
});
