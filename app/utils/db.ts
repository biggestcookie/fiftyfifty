import { openDB, type IDBPDatabase } from "idb";
import type { Check } from "~/types/check";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const DB_NAME = "fiftyfifty";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("checks")) {
          db.createObjectStore("checks", { keyPath: "id" });
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
