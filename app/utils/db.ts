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
  return db.getAll("checks") as Promise<Check[]>;
}

export async function getCheck(id: string): Promise<Check | undefined> {
  const db = await getDb();
  return db.get("checks", id) as Promise<Check | undefined>;
}

export async function putCheck(check: Check): Promise<void> {
  const db = await getDb();
  await db.put("checks", clone(check));
}

export async function deleteCheck(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("checks", id);
}