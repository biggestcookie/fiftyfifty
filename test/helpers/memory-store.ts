import type {
  BlobStore,
  BlobWriteResult,
} from "../../shared/server/check-store";

/**
 * In-memory stand-in for Netlify Blobs. Mirrors the subset of behaviour the
 * API and cleanup job rely on: strong reads, ETags, conditional writes,
 * deletes, and paginated prefix listing.
 */
export class MemoryStore implements BlobStore {
  private entries = new Map<string, { value: unknown; etag: string }>();
  private counter = 0;

  constructor(private readonly pageSize: number = 100) {}

  async getWithMetadata(
    key: string
  ): Promise<{ data: unknown; etag?: string } | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    return { data: structuredClone(entry.value), etag: entry.etag };
  }

  async setJSON(
    key: string,
    value: unknown,
    options?: { onlyIfNew?: boolean; onlyIfMatch?: string }
  ): Promise<BlobWriteResult> {
    const existing = this.entries.get(key);
    if (options?.onlyIfNew && existing) return { modified: false };
    if (
      options?.onlyIfMatch &&
      (!existing || existing.etag !== options.onlyIfMatch)
    ) {
      return { modified: false };
    }
    const etag = `etag-${++this.counter}`;
    this.entries.set(key, { value: structuredClone(value), etag });
    return { modified: true, etag };
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async *list(options: {
    prefix: string;
    paginate: true;
  }): AsyncIterable<{ blobs: Array<{ key: string }> }> {
    const keys = [...this.entries.keys()]
      .filter((key) => key.startsWith(options.prefix))
      .sort();

    for (let i = 0; i < keys.length; i += this.pageSize) {
      yield {
        blobs: keys.slice(i, i + this.pageSize).map((key) => ({ key })),
      };
    }
  }
}
