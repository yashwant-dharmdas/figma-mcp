// ============================================================
// TtlCache — Simple in-memory TTL cache for read-only Figma operations.
//
// Used by ToolFactory to avoid redundant round-trips to the Figma plugin
// for cacheable commands (e.g. get_document_info, get_styles).
//
// Each session has its own TtlCache instance so caches are fully isolated.
// ============================================================

const DEFAULT_TTL_MS = Number(process.env["CACHE_DEFAULT_TTL_MS"] ?? 5_000);

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class TtlCache {
  private store = new Map<string, CacheEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private defaultTtlMs = DEFAULT_TTL_MS) {
    // Periodic cleanup every 60 s to prevent unbounded memory growth
    this.cleanupInterval = setInterval(() => this.evictExpired(), 60_000);
  }

  /**
   * Build the cache key from command name and serialised params.
   * Using command name as a prefix prevents collisions between commands
   * that happen to have identical param JSON.
   */
  static key(command: string, params: unknown): string {
    return `${command}:${JSON.stringify(params)}`;
  }

  /** Returns the cached value, or undefined if missing / expired. */
  get(command: string, params: unknown): unknown | undefined {
    const key = TtlCache.key(command, params);
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Store a value with an optional TTL (falls back to instance default). */
  set(command: string, params: unknown, value: unknown, ttlMs?: number): void {
    const key = TtlCache.key(command, params);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /** Remove every expired entry in one pass. */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  /** Remove all entries (e.g. after a write operation that may invalidate reads). */
  clear(): void {
    this.store.clear();
  }

  /** Number of live entries (may include expired ones not yet evicted). */
  get size(): number {
    return this.store.size;
  }

  /** Stop the background cleanup timer — call when the session ends. */
  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}
