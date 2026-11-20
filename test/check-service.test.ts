import { describe, expect, test } from "bun:test";
import {
  createSharedCheck,
  deleteSharedCheck,
  getSharedCheck,
  patchSharedCheck,
  type ApiErrorBody,
  type CreateSharedCheckResponse,
  type GetSharedCheckResponse,
  type PatchSharedCheckResponse,
} from "../shared/server/check-service";
import {
  isActiveDocument,
  isTombstone,
  readDocument,
  type SharedCheckDocument,
} from "../shared/server/check-store";
import { SHARE_TTL_MS, nextExpiry } from "../shared/server/expiry";
import { hashEditToken, verifyEditToken } from "../shared/server/tokens";
import { FeesMode, type SharedCheck } from "../shared/types/check";
import { computeTotals } from "../shared/utils/check-totals";
import { MemoryStore } from "./helpers/memory-store";

const NOW = 1_800_000_000_000;

const baseCheck: SharedCheck = {
  guests: [{ id: "a" }, { id: "b", name: "Bea" }],
  items: [{ id: "i1", label: "Pizza", amount: 20, guestIds: ["a", "b"] }],
  fees: [{ id: "f1", label: "Tax", amount: 2 }],
  feesMode: FeesMode.Proportional,
  currencySymbol: "$",
};

function errorCode(body: unknown): string | undefined {
  return (body as ApiErrorBody | undefined)?.error?.code;
}

async function create(
  store: MemoryStore,
  check: SharedCheck = baseCheck,
  now = NOW
): Promise<CreateSharedCheckResponse> {
  const result = await createSharedCheck(store, { check }, now);
  expect(result.status).toBe(201);
  return result.body as CreateSharedCheckResponse;
}

class ConflictStore extends MemoryStore {
  failConditionalWrites = false;

  override async setJSON(
    key: string,
    value: unknown,
    options?: { onlyIfNew?: boolean; onlyIfMatch?: string }
  ) {
    if (this.failConditionalWrites && options?.onlyIfMatch) {
      return { modified: false };
    }
    return super.setJSON(key, value, options);
  }
}

describe("createSharedCheck", () => {
  test("stores a hash, computes totals, and returns the token once", async () => {
    const store = new MemoryStore();
    const result = await createSharedCheck(store, { check: baseCheck }, NOW);
    expect(result.status).toBe(201);

    const body = result.body as CreateSharedCheckResponse;
    expect(body.version).toBe(1);
    expect(body.expiresAt).toBe(nextExpiry(NOW));

    const entry = await readDocument(store, body.shareId);
    expect(entry && isActiveDocument(entry.doc)).toBe(true);
    const doc = entry?.doc as SharedCheckDocument;

    expect(doc.check).toEqual(baseCheck);
    expect(doc.totals).toEqual(computeTotals(baseCheck));
    expect(doc.editTokenHash).toBe(hashEditToken(body.editToken));
    expect(verifyEditToken(body.editToken, doc.editTokenHash)).toBe(true);
    expect(JSON.stringify(doc)).not.toContain(body.editToken);
  });

  test("rejects unknown fields and malformed input", async () => {
    const store = new MemoryStore();

    const unknown = await createSharedCheck(
      store,
      { check: { ...baseCheck, editToken: "leak" } },
      NOW
    );
    expect(unknown.status).toBe(400);
    expect(errorCode(unknown.body)).toBe("invalid_check");

    const malformed = await createSharedCheck(store, [], NOW);
    expect(malformed.status).toBe(400);
    expect(errorCode(malformed.body)).toBe("invalid_body");
  });
});

describe("getSharedCheck", () => {
  test("returns the active check without the token hash", async () => {
    const store = new MemoryStore();
    const created = await create(store);

    const result = await getSharedCheck(store, created.shareId, NOW);
    expect(result.status).toBe(200);
    const body = result.body as GetSharedCheckResponse;
    expect(body.check).toEqual(baseCheck);
    expect(body.totals).toEqual(computeTotals(baseCheck));
    expect(body).not.toHaveProperty("editTokenHash");
  });

  test("returns 404 for invalid and unknown ids", async () => {
    const store = new MemoryStore();
    expect((await getSharedCheck(store, "short", NOW)).status).toBe(404);

    const unknown = await getSharedCheck(store, "aaaaaaaaaaaaaaaa", NOW);
    expect(unknown.status).toBe(404);
    expect(errorCode(unknown.body)).toBe("not_found");
  });

  test("expires on read and replaces the check with a tombstone", async () => {
    const store = new MemoryStore();
    // Created 7 days + 1ms ago, so it is expired at NOW.
    const created = await create(store, baseCheck, NOW - SHARE_TTL_MS - 1);

    const result = await getSharedCheck(store, created.shareId, NOW);
    expect(result.status).toBe(410);
    expect(errorCode(result.body)).toBe("expired");

    const doc = (await readDocument(store, created.shareId))?.doc;
    expect(doc && isTombstone(doc)).toBe(true);
    expect(doc).not.toHaveProperty("check");
    expect(doc).not.toHaveProperty("editTokenHash");
  });

  test("returns 410 with the revoked code for revoked links", async () => {
    const store = new MemoryStore();
    const created = await create(store);
    await deleteSharedCheck(store, created.shareId, {
      token: created.editToken,
      now: NOW,
    });

    const result = await getSharedCheck(store, created.shareId, NOW);
    expect(result.status).toBe(410);
    expect(errorCode(result.body)).toBe("revoked");
  });
});

describe("patchSharedCheck", () => {
  test("authenticates, increments the version, and slides expiry", async () => {
    const store = new MemoryStore();
    const created = await create(store);

    const updated: SharedCheck = {
      ...baseCheck,
      items: [
        { id: "i1", label: "Pizza", amount: 24, guestIds: ["a", "b"] },
        { id: "i2", label: "Coffee", amount: 4, guestIds: ["a"] },
      ],
    };

    const result = await patchSharedCheck(store, created.shareId, {
      token: created.editToken,
      body: { version: 1, check: updated },
      now: NOW + 1_000,
    });
    expect(result.status).toBe(200);

    const body = result.body as PatchSharedCheckResponse;
    expect(body.version).toBe(2);
    expect(body.expiresAt).toBe(nextExpiry(NOW + 1_000));

    const get = await getSharedCheck(store, created.shareId, NOW + 1_000);
    const stored = get.body as GetSharedCheckResponse;
    expect(stored.check).toEqual(updated);
    expect(stored.totals).toEqual(computeTotals(updated));
  });

  test("rejects missing, wrong-token, and stale-version updates", async () => {
    const store = new MemoryStore();
    const created = await create(store);

    expect(
      (
        await patchSharedCheck(store, "aaaaaaaaaaaaaaaa", {
          token: created.editToken,
          body: { version: 1, check: baseCheck },
          now: NOW,
        })
      ).status
    ).toBe(404);

    expect(
      (
        await patchSharedCheck(store, created.shareId, {
          token: "wrong",
          body: { version: 1, check: baseCheck },
          now: NOW,
        })
      ).status
    ).toBe(403);

    const stale = await patchSharedCheck(store, created.shareId, {
      token: created.editToken,
      body: { version: 0, check: baseCheck },
      now: NOW,
    });
    expect(stale.status).toBe(409);
    expect(errorCode(stale.body)).toBe("conflict");
  });

  test("returns 410 for expired and revoked links", async () => {
    const store = new MemoryStore();
    const created = await create(store);
    await deleteSharedCheck(store, created.shareId, {
      token: created.editToken,
      now: NOW,
    });
    const revoked = await patchSharedCheck(store, created.shareId, {
      token: created.editToken,
      body: { version: 1, check: baseCheck },
      now: NOW,
    });
    expect(revoked.status).toBe(410);

    const expiredStore = new MemoryStore();
    const expired = await create(
      expiredStore,
      baseCheck,
      NOW - SHARE_TTL_MS - 1
    );
    const result = await patchSharedCheck(expiredStore, expired.shareId, {
      token: expired.editToken,
      body: { version: 1, check: baseCheck },
      now: NOW,
    });
    expect(result.status).toBe(410);
    expect(errorCode(result.body)).toBe("expired");
  });

  test("returns 409 when the conditional write loses a race", async () => {
    const store = new ConflictStore();
    const created = await create(store);
    store.failConditionalWrites = true;

    const result = await patchSharedCheck(store, created.shareId, {
      token: created.editToken,
      body: { version: 1, check: baseCheck },
      now: NOW,
    });
    expect(result.status).toBe(409);
  });
});

describe("deleteSharedCheck", () => {
  test("revokes with the owner token and is idempotent", async () => {
    const store = new MemoryStore();
    const created = await create(store);

    const first = await deleteSharedCheck(store, created.shareId, {
      token: created.editToken,
      now: NOW,
    });
    expect(first.status).toBe(204);
    expect(first.body).toBeNull();

    const doc = (await readDocument(store, created.shareId))?.doc;
    expect(doc && isTombstone(doc)).toBe(true);
    expect(doc).not.toHaveProperty("editTokenHash");

    const second = await deleteSharedCheck(store, created.shareId, {
      token: null,
      now: NOW,
    });
    expect(second.status).toBe(204);
  });

  test("rejects unknown ids and wrong tokens", async () => {
    const store = new MemoryStore();
    const created = await create(store);

    expect(
      (
        await deleteSharedCheck(store, "aaaaaaaaaaaaaaaa", {
          token: created.editToken,
          now: NOW,
        })
      ).status
    ).toBe(404);

    expect(
      (
        await deleteSharedCheck(store, created.shareId, {
          token: "wrong",
          now: NOW,
        })
      ).status
    ).toBe(403);
  });

  test("returns 409 when the revoke loses a race", async () => {
    const store = new ConflictStore();
    const created = await create(store);
    store.failConditionalWrites = true;

    const result = await deleteSharedCheck(store, created.shareId, {
      token: created.editToken,
      now: NOW,
    });
    expect(result.status).toBe(409);
  });
});
