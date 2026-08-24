/**
 * Shared Durable Session Context Service
 *
 * Multi-tier conversation state persistence for Chat, Retell AI, and Vapi AI:
 *  - L1 Fast In-Memory Cache: Sub-millisecond synchronous read/write for live turns
 *  - L2 Durable Store: Persisted to Supabase PostgreSQL table `session_contexts`
 *
 * Maintains:
 *  - currentEntity / pinnedEntity: entity the user is currently focused on
 *  - lastEntities / lastResults: catalog candidates for ordinal & relative resolution
 *  - activeFilters: applied filters (price, categories, sort)
 *  - lastNavigationTarget: last suggested/navigated URL or slug
 *  - lastIntent: last user query intent (catalog, direct, compare, media, nav)
 *  - turnCount: number of conversational turns in this session
 *  - timestamps: created_at, updated_at
 *
 * Scoped strictly by (session_id, widget_id) composite key.
 */

import { supabase } from '@/config/widgetsDb';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DurableEntityRecord {
  id: string;
  title: string;
  type?: string;
  description?: string;
  price?: string | number;
  currency?: string;
  rating?: number;
  availability?: string;
  sourceUrl?: string;
  canonicalUrl?: string;
  imageUrls?: string[];
  images?: string[];
  metadata?: Record<string, any>;
  freshnessStatus?: string;
  score?: number;
  matchType?: string;
}

export interface DurableSessionContext {
  sessionId: string;
  widgetId: string;
  /** Current entity focused on */
  currentEntity: DurableEntityRecord | null;
  /** Pinned entity alias for backwards compatibility */
  pinnedEntity: any | null;
  /** Last candidate results shown for ordinal resolution */
  lastEntities: DurableEntityRecord[];
  /** Last results alias for backwards compatibility */
  lastResults: any[];
  /** Active structured filters */
  activeFilters: Record<string, any>;
  /** Last navigation URL or target slug */
  lastNavigationTarget: string | null;
  /** Last navigation URL alias for backwards compatibility */
  lastNavUrl: string | null;
  /** Last classified intent */
  lastIntent: string | null;
  /** Number of turns executed */
  turnCount: number;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string | number;
}

/** Backward compatibility alias */
export type SessionContext = DurableSessionContext;

// ── L1 In-Memory Cache ───────────────────────────────────────────────────────

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map<string, DurableSessionContext>();

function getCacheKey(widgetId: string, sessionId: string): string {
  const normWid = (widgetId || 'default').trim().toLowerCase();
  const normSid = (sessionId || 'default').trim();
  return `${normWid}:${normSid}`;
}

function maybeEvict(): void {
  if (cache.size < 500) return;
  const cutoff = Date.now() - TTL_MS;
  for (const [key, ctx] of cache.entries()) {
    const ts = typeof ctx.updatedAt === 'number' ? ctx.updatedAt : new Date(ctx.updatedAt).getTime();
    if (ts < cutoff) cache.delete(key);
  }
}

// ── Normalizers ──────────────────────────────────────────────────────────────

function normalizeEntity(raw: any): DurableEntityRecord | null {
  if (!raw) return null;
  const rec = raw.record || raw;
  const imageUrls = Array.isArray(rec.imageUrls) && rec.imageUrls.length > 0
    ? rec.imageUrls
    : Array.isArray(rec.images) && rec.images.length > 0
    ? rec.images
    : Array.isArray(rec.image_urls) && rec.image_urls.length > 0
    ? rec.image_urls
    : [];

  return {
    id: String(rec.id || rec.entityId || rec._id || ''),
    title: String(rec.title || raw.title || 'Untitled'),
    type: rec.type || rec.entityType || rec.entity_type || 'product',
    description: rec.description || rec.shortDescription || rec.short_description || '',
    price: rec.price ?? rec.metadata?.price,
    currency: rec.currency ?? rec.metadata?.currency,
    rating: rec.rating ?? rec.metadata?.rating,
    availability: rec.availability ?? rec.metadata?.availability,
    sourceUrl: rec.sourceUrl || rec.source_url || rec.canonicalUrl,
    canonicalUrl: rec.canonicalUrl || rec.sourceUrl || rec.source_url,
    imageUrls,
    images: imageUrls,
    metadata: rec.metadata || {},
    freshnessStatus: rec.freshnessStatus || rec.freshness_status,
    score: rec.score,
    matchType: rec.matchType || rec.match_type,
  };
}

function createDefaultContext(sessionId: string, widgetId: string): DurableSessionContext {
  const now = new Date().toISOString();
  return {
    sessionId,
    widgetId,
    currentEntity: null,
    pinnedEntity: null,
    lastEntities: [],
    lastResults: [],
    activeFilters: {},
    lastNavigationTarget: null,
    lastNavUrl: null,
    lastIntent: null,
    turnCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function fromDbRow(row: any, sessionId: string, widgetId: string): DurableSessionContext {
  const currentEntity = row.current_entity ? normalizeEntity(row.current_entity) : null;
  const lastEntities = Array.isArray(row.last_entities)
    ? row.last_entities.map(normalizeEntity).filter(Boolean) as DurableEntityRecord[]
    : [];

  return {
    sessionId: row.session_id || sessionId,
    widgetId: row.widget_id || widgetId,
    currentEntity,
    pinnedEntity: currentEntity ? { record: currentEntity, title: currentEntity.title, entityId: currentEntity.id, confidence: 'exact' } : null,
    lastEntities,
    lastResults: lastEntities,
    activeFilters: row.active_filters || {},
    lastNavigationTarget: row.last_navigation_target || null,
    lastNavUrl: row.last_navigation_target || null,
    lastIntent: row.last_intent || null,
    turnCount: Number(row.turn_count || 0),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

// ── Public Async API ──────────────────────────────────────────────────────────

/**
 * Retrieve durable session context.
 * Reads from L1 memory cache if warm, otherwise fetches from Supabase DB `session_contexts`.
 */
export async function getSessionContext(
  sessionId: string,
  widgetId: string
): Promise<DurableSessionContext> {
  const normSid = (sessionId || '').trim() || 'default_session';
  const normWid = (widgetId || '').trim() || 'default';
  const key = getCacheKey(normWid, normSid);

  maybeEvict();

  // 1. Check L1 Memory Cache
  const cached = cache.get(key);
  const cutoff = Date.now() - TTL_MS;
  if (cached) {
    const ts = typeof cached.updatedAt === 'number' ? cached.updatedAt : new Date(cached.updatedAt).getTime();
    if (ts >= cutoff) {
      return cached;
    }
  }

  // 2. Fetch from Supabase DB
  try {
    const { data: row, error } = await supabase
      .from('session_contexts')
      .select('*')
      .eq('session_id', normSid)
      .eq('widget_id', normWid)
      .maybeSingle();

    if (row && !error) {
      const restored = fromDbRow(row, normSid, normWid);
      cache.set(key, restored);
      return restored;
    }
  } catch (err) {
    console.warn('[sessionContext] Supabase DB read fallback to memory:', err);
  }

  // 3. Fall back to fresh default
  const fresh = createDefaultContext(normSid, normWid);
  cache.set(key, fresh);
  return fresh;
}

/** Synchronous accessor (reads warm L1 cache or returns fresh instance) */
export function getSessionContextSync(sessionId: string, widgetId: string): DurableSessionContext {
  const normSid = (sessionId || '').trim() || 'default_session';
  const normWid = (widgetId || '').trim() || 'default';
  const key = getCacheKey(normWid, normSid);

  const cached = cache.get(key);
  if (cached) return cached;

  const fresh = createDefaultContext(normSid, normWid);
  cache.set(key, fresh);
  return fresh;
}

/**
 * Update durable session context fields.
 * Updates L1 cache immediately and writes through to Supabase DB.
 */
export async function updateSessionContext(
  sessionId: string,
  widgetId: string,
  updates: Partial<DurableSessionContext>
): Promise<DurableSessionContext> {
  const normSid = (sessionId || '').trim() || 'default_session';
  const normWid = (widgetId || '').trim() || 'default';
  const key = getCacheKey(normWid, normSid);

  const existing = await getSessionContext(normSid, normWid);

  const currentEntity = updates.currentEntity !== undefined
    ? normalizeEntity(updates.currentEntity)
    : (updates.pinnedEntity ? normalizeEntity(updates.pinnedEntity) : existing.currentEntity);

  const lastEntities = updates.lastEntities !== undefined
    ? updates.lastEntities.map(normalizeEntity).filter(Boolean) as DurableEntityRecord[]
    : (updates.lastResults ? updates.lastResults.map(normalizeEntity).filter(Boolean) as DurableEntityRecord[] : existing.lastEntities);

  const navTarget = updates.lastNavigationTarget !== undefined
    ? updates.lastNavigationTarget
    : (updates.lastNavUrl !== undefined ? updates.lastNavUrl : existing.lastNavigationTarget);

  const nowIso = new Date().toISOString();
  const updated: DurableSessionContext = {
    ...existing,
    ...updates,
    sessionId: normSid,
    widgetId: normWid,
    currentEntity,
    pinnedEntity: currentEntity ? { record: currentEntity, title: currentEntity.title, entityId: currentEntity.id, confidence: 'exact' } : null,
    lastEntities,
    lastResults: lastEntities,
    lastNavigationTarget: navTarget,
    lastNavUrl: navTarget,
    activeFilters: updates.activeFilters ?? existing.activeFilters,
    lastIntent: updates.lastIntent ?? existing.lastIntent,
    turnCount: (updates.turnCount ?? existing.turnCount) + 1,
    updatedAt: nowIso,
  };

  // Update L1 Cache
  cache.set(key, updated);

  // Write through to Supabase DB asynchronously
  (async () => {
    try {
      const { error } = await supabase
        .from('session_contexts')
        .upsert({
          session_id: normSid,
          widget_id: normWid,
          current_entity: currentEntity,
          last_entities: lastEntities,
          active_filters: updated.activeFilters,
          last_navigation_target: navTarget,
          last_intent: updated.lastIntent,
          turn_count: updated.turnCount,
          updated_at: nowIso,
        }, { onConflict: 'session_id,widget_id' });
      if (error) console.warn('[sessionContext] DB upsert notice:', error.message);
    } catch (err: any) {
      console.warn('[sessionContext] DB upsert failed:', err?.message);
    }
  })();

  return updated;
}

/** Pin a specific entity as the primary session focus */
export async function pinEntity(
  sessionId: string,
  widgetId: string,
  entity: any
): Promise<DurableSessionContext> {
  return updateSessionContext(sessionId, widgetId, { currentEntity: entity, pinnedEntity: entity });
}

/** Set the last retrieved candidate results */
export async function setLastResults(
  sessionId: string,
  widgetId: string,
  results: any[]
): Promise<DurableSessionContext> {
  return updateSessionContext(sessionId, widgetId, { lastEntities: results, lastResults: results });
}

/** Set active structured filter constraints */
export async function setActiveFilters(
  sessionId: string,
  widgetId: string,
  filters: Record<string, any>
): Promise<DurableSessionContext> {
  return updateSessionContext(sessionId, widgetId, { activeFilters: filters });
}

/** Set the last navigation target */
export async function setLastNavigation(
  sessionId: string,
  widgetId: string,
  target: string
): Promise<DurableSessionContext> {
  return updateSessionContext(sessionId, widgetId, { lastNavigationTarget: target, lastNavUrl: target });
}

/** Set the last query intent */
export async function setLastIntent(
  sessionId: string,
  widgetId: string,
  intent: string
): Promise<DurableSessionContext> {
  return updateSessionContext(sessionId, widgetId, { lastIntent: intent });
}

/** Clear the current focused entity */
export async function clearPinnedEntity(
  sessionId: string,
  widgetId: string
): Promise<DurableSessionContext> {
  return updateSessionContext(sessionId, widgetId, { currentEntity: null, pinnedEntity: null });
}

/** Clear all session context */
export async function clearSessionContext(
  sessionId: string,
  widgetId: string
): Promise<void> {
  const normSid = (sessionId || '').trim();
  const normWid = (widgetId || '').trim();
  const key = getCacheKey(normWid, normSid);

  cache.delete(key);

  try {
    await supabase
      .from('session_contexts')
      .delete()
      .eq('session_id', normSid)
      .eq('widget_id', normWid);
  } catch {}
}

/** Null-safe helper to get current pinned entity */
export async function getPinnedEntity(
  sessionId: string,
  widgetId = 'default'
): Promise<DurableEntityRecord | null> {
  const ctx = await getSessionContext(sessionId, widgetId);
  return ctx.currentEntity;
}

/** Expire session explicitly */
export async function expireSession(
  sessionId: string,
  widgetId = 'default'
): Promise<void> {
  await clearSessionContext(sessionId, widgetId);
}

/** Active cache session count */
export function activeSessionCount(): number {
  return cache.size;
}
