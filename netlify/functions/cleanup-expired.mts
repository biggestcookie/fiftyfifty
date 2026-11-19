import { getStore } from "@netlify/blobs";
import { runCleanup } from "../../shared/server/cleanup";
import { STORE_NAME, type BlobStore } from "../../shared/server/check-store";

/** Netlify scheduled function: daily at 03:00 UTC. */
export const config = { schedule: "0 3 * * *" };

export default async function cleanupExpired(): Promise<Response> {
  const store = getStore({
    name: STORE_NAME,
    consistency: "strong",
  }) as unknown as BlobStore;

  const result = await runCleanup(store);

  // Counts only: never log share IDs, check content, or payment handles.
  console.info(
    `cleanup-expired scanned=${result.scanned} expired=${result.expired} deleted=${result.deleted} deadline_reached=${result.deadlineReached}`
  );

  return new Response(null, { status: 204 });
}
