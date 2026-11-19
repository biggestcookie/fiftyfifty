import { openDB, type IDBPDatabase } from "idb";
import type { Check } from "~/types/check";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Minimal, non-PII preview of a check shared with this device. It powers the
 * recipient's recent-checks list; the live server copy is always fetched when
 * the entry is opened. No guest names, guest IDs, payment handles, or full
 * check data are stored here.
 */
export interface SharedCheckPreview {
  shareId: string;
  createdAt: number;
  expiresAt: number;
  name?: string;
  guestCount: number;
  currencySymbol: string;
  total: number;
  itemLabels: string[];
}

const DB_NAME = "fiftyfifty";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("checks")) {
          db.createObjectStore("checks", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("sharedChecks")) {
          db.createObjectStore("sharedChecks", { keyPath: "shareId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function getAllChecks(): Promise<Check[]> {
  const db = await getDb();
  const raw = (await db.getAll("checks")) as Array<Partial<Check>>;
  // Post-fees-array migration: silently drop any pre-migration entries
  // (those with no `fees` array) from the returned set. They remain in
  // IDB but are not loaded; new writes use the current shape only.
  return raw.filter(
    (c): c is Check =>
      Array.isArray(c.fees) &&
      Array.isArray(c.items) &&
      typeof c.feesMode === "string"
  );
}

export async function getCheck(id: string): Promise<Check | undefined> {
  const db = await getDb();
  const raw = (await db.get("checks", id)) as Partial<Check> | undefined;
  if (!raw) return undefined;
  // See getAllChecks: pre-migration entries are treated as missing.
  if (
    !Array.isArray(raw.fees) ||
    !Array.isArray(raw.items) ||
    typeof raw.feesMode !== "string"
  ) {
    return undefined;
  }
  return raw as Check;
}

export async function putCheck(check: Check): Promise<void> {
  const db = await getDb();
  await db.put("checks", clone(check));
}

export async function deleteCheck(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("checks", id);
}

export async function getAllSharedCheckPreviews(): Promise<
  SharedCheckPreview[]
> {
  const db = await getDb();
  return (await db.getAll("sharedChecks")) as SharedCheckPreview[];
}

export async function putSharedCheckPreview(
  preview: SharedCheckPreview
): Promise<void> {
  const db = await getDb();
  await db.put("sharedChecks", clone(preview));
}

export async function deleteSharedCheckPreview(shareId: string): Promise<void> {
  const db = await getDb();
  await db.delete("sharedChecks", shareId);
}

/**
 * Reflect a server 410 in the local preview so recents can mark it expired.
 * The preview is intentionally kept: an expired link stays in the recipient's
 * recent-checks list until they remove it themselves.
 */
export async function markSharedCheckExpired(shareId: string): Promise<void> {
  const db = await getDb();
  const existing = (await db.get("sharedChecks", shareId)) as
    | SharedCheckPreview
    | undefined;
  if (!existing || existing.expiresAt === 0) return;
  await db.put("sharedChecks", { ...existing, expiresAt: 0 });
}
