import { openDB, type IDBPDatabase } from "idb";
import { toRaw } from "vue";
import type { Draft, Check } from "~/types/check";

function clone<T>(value: T): T {
  return structuredClone(toRaw(value));
}

const DB_NAME = "fiftyfifty";
const DB_VERSION = 1;
const DRAFT_KEY = "current";

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("checks")) {
          db.createObjectStore("checks", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("drafts")) {
          db.createObjectStore("drafts");
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

export async function getDraft(): Promise<Draft | undefined> {
  const db = await getDb();
  return db.get("drafts", DRAFT_KEY) as Promise<Draft | undefined>;
}

export async function putDraft(draft: Draft): Promise<void> {
  const db = await getDb();
  await db.put("drafts", clone(draft), DRAFT_KEY);
}

export async function deleteDraft(): Promise<void> {
  const db = await getDb();
  await db.delete("drafts", DRAFT_KEY);
}
