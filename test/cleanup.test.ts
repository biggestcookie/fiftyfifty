import { describe, expect, test } from "bun:test";
import { runCleanup } from "../shared/server/cleanup";
import {
  SCHEMA_VERSION,
  checkKey,
  createDocument,
  isTombstone,
  readDocument,
  type SharedCheckDocument,
  type StoredDocument,
  type Tombstone,
} from "../shared/server/check-store";
import {
  nextExpiry,
  SHARE_TTL_MS,
  TOMBSTONE_TTL_MS,
} from "../shared/server/expiry";
import { hashEditToken } from "../shared/server/tokens";
import { FeesMode, type SharedCheck } from "../shared/types/check";
import { computeTotals } from "../shared/utils/check-totals";
import { MemoryStore } from "./helpers/memory-store";

const NOW = 1_800_000_000_000;

const baseCheck: SharedCheck = {
  guests: [{ id: "a" }, { id: "b" }],
  items: [{ id: "i1", label: "Pizza", amount: 20, guestIds: ["a", "b"] }],
  fees: [{ id: "f1", label: "Tax", amount: 2 }],
  feesMode: FeesMode.Proportional,
  currencySymbol: "$",
};

function makeDoc(
  shareId: string,
  overrides: Partial<SharedCheckDocument> = {}
): SharedCheckDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    shareId,
    version: 3,
    createdAt: NOW - SHARE_TTL_MS,
    updatedAt: NOW - SHARE_TTL_MS,
    expiresAt: nextExpiry(NOW),
    editTokenHash: hashEditToken("owner-token"),
    check: baseCheck,
    totals: computeTotals(baseCheck),
    ...overrides,
  };
}

function makeTombstone(
  shareId: string,
  expiredAt: number,
  status: Tombstone["status"] = "expired"
): Tombstone {
  return {
    schemaVersion: SCHEMA_VERSION,
    shareId,
    status,
    expiredAt,
    lastVersion: 2,
  };
}

async function seed(store: MemoryStore, doc: StoredDocument): Promise<void> {
  await store.setJSON(checkKey(doc.shareId), doc, { onlyIfNew: true });
}

describe("cleanup pass", () => {
  test("expires active docs and deletes old tombstones across pages", async () => {
    const store = new MemoryStore(2);

    const fresh = makeDoc("aaaaaaaaaaaaaaaa");
    const stale = makeDoc("bbbbbbbbbbbbbbbb", {
      expiresAt: NOW - 1,
      version: 4,
    });
    const oldExpired = makeTombstone(
      "cccccccccccccccc",
      NOW - TOMBSTONE_TTL_MS - 1
    );
    const oldRevoked = makeTombstone(
      "dddddddddddddddd",
      NOW - TOMBSTONE_TTL_MS - 1,
      "revoked"
    );
    const recentTombstone = makeTombstone(
      "eeeeeeeeeeeeeeee",
      NOW - TOMBSTONE_TTL_MS + 1000
    );

    await createDocument(store, fresh);
    await createDocument(store, stale);
    await seed(store, oldExpired);
    await seed(store, oldRevoked);
    await seed(store, recentTombstone);

    const result = await runCleanup(store, {
      now: NOW,
      maxDurationMs: 60_000,
    });

    expect(result).toEqual({
      scanned: 5,
      expired: 1,
      deleted: 2,
      deadlineReached: false,
    });

    // Untouched active check.
    const freshEntry = await readDocument(store, fresh.shareId);
    expect(freshEntry?.doc).toEqual(fresh);

    // Expired active check became a PII-free tombstone.
    const staleDoc = (await readDocument(store, stale.shareId))?.doc;
    expect(staleDoc && isTombstone(staleDoc)).toBe(true);
    expect(staleDoc).toMatchObject({
      status: "expired",
      lastVersion: 4,
      expiredAt: NOW,
    });
    expect(staleDoc).not.toHaveProperty("check");
    expect(staleDoc).not.toHaveProperty("editTokenHash");
    expect(staleDoc).not.toHaveProperty("totals");

    // Old tombstones are gone; a recent one is kept.
    expect(await readDocument(store, oldExpired.shareId)).toBeNull();
    expect(await readDocument(store, oldRevoked.shareId)).toBeNull();
    expect(await readDocument(store, recentTombstone.shareId)).not.toBeNull();
  });

  test("is idempotent and does not re-expire the tombstones it wrote", async () => {
    const store = new MemoryStore();
    const stale = makeDoc("bbbbbbbbbbbbbbbb", { expiresAt: NOW - 1 });
    await createDocument(store, stale);

    const first = await runCleanup(store, {
      now: NOW,
      maxDurationMs: 60_000,
    });
    const second = await runCleanup(store, {
      now: NOW,
      maxDurationMs: 60_000,
    });

    expect(first.expired).toBe(1);
    expect(first.deleted).toBe(0);
    expect(second.expired).toBe(0);
    expect(second.deleted).toBe(0);
    expect(second.scanned).toBe(1);
  });

  test("stops immediately when the time budget is exhausted", async () => {
    const store = new MemoryStore();
    await createDocument(
      store,
      makeDoc("bbbbbbbbbbbbbbbb", { expiresAt: NOW - 1 })
    );

    const result = await runCleanup(store, { now: NOW, maxDurationMs: 0 });

    expect(result).toEqual({
      scanned: 0,
      expired: 0,
      deleted: 0,
      deadlineReached: true,
    });
    expect(await readDocument(store, "bbbbbbbbbbbbbbbb")).not.toBeNull();
  });
});
