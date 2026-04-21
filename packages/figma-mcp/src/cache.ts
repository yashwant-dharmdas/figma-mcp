// ============================================================
// TtlCache — Simple in-memory TTL cache for read-only Figma operations.
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
    this.cleanupInterval = setInterval(() => this.evictExpired(), 60_000);
  }

  static key(command: string, params: unknown): string {
    return `${command}:${JSON.stringify(params)}`;
  }

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

  set(command: string, params: unknown, value: unknown, ttlMs?: number): void {
    const key = TtlCache.key(command, params);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}
