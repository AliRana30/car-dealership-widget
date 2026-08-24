/**
 * In-Memory LRU & Single-Flight Cache Engine for Retrieval & Embeddings
 *
 * Provides:
 * 1. QueryEmbeddingCache: High-performance LRU cache for deterministic 1536-dim embeddings (TTL: 2h, max: 2,000 items)
 * 2. StaticPageCache: Short-lived cache for immutable informational pages (/policy, /about, /faq) (TTL: 2m)
 * 3. WidgetLookupCache: Short-lived cache for widget configurations (TTL: 60s)
 * 4. SingleFlight: In-flight promise deduplication to prevent duplicate database/embedding spikes
 *
 * STRICT SAFETY CONTRACT:
 * - Dynamic pricing, stock, catalog inventory, and active availability are NEVER cached indefinitely.
 * - Widget cache is automatically invalidated when widget configurations are updated.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class LRUCache<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private maxEntries: number;
  private defaultTtlMs: number;

  constructor(maxEntries = 1000, defaultTtlMs = 1000 * 60 * 60) {
    this.maxEntries = maxEntries;
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Refresh LRU order (delete & re-insert)
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      // Evict oldest entry (first item in Map iterator)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

// ── In-Flight Request Deduplicator (SingleFlight Pattern) ────────────────────

export class SingleFlight<T> {
  private inFlight = new Map<string, Promise<T>>();

  async do(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}

// ── Global Cache Singletons ──────────────────────────────────────────────────

/** Query Embedding Cache: key = normalized query string, value = float vector */
export const queryEmbeddingCache = new LRUCache<string, number[]>(2000, 2 * 60 * 60 * 1000);

/** Static Page Retrieval Cache: key = widgetId:slug/intent, value = HybridRetrievalOutput */
export const staticPageCache = new LRUCache<string, any>(500, 2 * 60 * 1000);

/** Widget Record Cache: key = idOrWidgetId, value = WidgetRecord */
export const widgetLookupCache = new LRUCache<string, any>(500, 60 * 1000);

/** SingleFlight instances */
export const embeddingSingleFlight = new SingleFlight<number[] | null>();
export const retrievalSingleFlight = new SingleFlight<any>();
export const widgetSingleFlight = new SingleFlight<any>();
