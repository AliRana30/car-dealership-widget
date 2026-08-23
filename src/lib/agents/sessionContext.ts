/**
 * Server-Side Session Context Store (Phase 7)
 *
 * Maintains per-session state across chat turns:
 *  - pinnedEntity: the entity the user is currently discussing
 *  - lastResults:  the last catalog result set shown to the user
 *  - lastNavUrl:   the last suggested navigation URL
 *
 * Storage: in-memory Map (single-process / dev). For multi-instance production
 *          deployments swap the map operations for a Redis client call.
 *
 * TTL: 30 minutes since last activity (lazy eviction on access).
 */

import type { ResolvedEntity } from './entityResolver';
import type { WebsiteDataRecord } from '@/config/widgetsDb';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SessionContext {
  sessionId: string;
  widgetId: string;
  /** The entity the user is currently focused on */
  pinnedEntity: ResolvedEntity | null;
  /** Last full result set shown (used for ordinal resolution) */
  lastResults: WebsiteDataRecord[];
  /** Last navigation URL suggested (for "yes" confirmation handling) */
  lastNavUrl: string | null;
  /** Timestamp of last activity (for TTL) */
  updatedAt: number;
}

// ── Store ────────────────────────────────────────────────────────────────────

const TTL_MS = 30 * 60 * 1000; // 30 minutes

const store = new Map<string, SessionContext>();

// Lazy eviction: clean up expired sessions when the store grows
function maybeEvict(): void {
  if (store.size < 500) return;
  const cutoff = Date.now() - TTL_MS;
  for (const [key, ctx] of store.entries()) {
    if (ctx.updatedAt < cutoff) store.delete(key);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Retrieve session context, or create a fresh one if it doesn't exist / has expired.
 */
export function getSessionContext(sessionId: string, widgetId: string): SessionContext {
  maybeEvict();

  const existing = store.get(sessionId);
  const cutoff = Date.now() - TTL_MS;

  if (existing && existing.updatedAt >= cutoff) {
    return existing;
  }

  const fresh: SessionContext = {
    sessionId,
    widgetId,
    pinnedEntity: null,
    lastResults: [],
    lastNavUrl: null,
    updatedAt: Date.now(),
  };
  store.set(sessionId, fresh);
  return fresh;
}

/**
 * Update session context fields after a chat turn.
 * Only supplied fields are updated; others retain their previous values.
 */
export function updateSessionContext(
  sessionId: string,
  widgetId: string,
  updates: Partial<Omit<SessionContext, 'sessionId' | 'widgetId' | 'updatedAt'>>,
): SessionContext {
  const ctx = getSessionContext(sessionId, widgetId);
  const updated: SessionContext = {
    ...ctx,
    ...updates,
    sessionId,
    widgetId,
    updatedAt: Date.now(),
  };
  store.set(sessionId, updated);
  return updated;
}

/**
 * Pin a specific entity as the session focus.
 * Called whenever the user resolves to a specific item (exact/partial/fuzzy/semantic match).
 */
export function pinEntity(
  sessionId: string,
  widgetId: string,
  entity: ResolvedEntity,
): void {
  updateSessionContext(sessionId, widgetId, { pinnedEntity: entity });
}

/**
 * Update the last result set shown in this session.
 */
export function setLastResults(
  sessionId: string,
  widgetId: string,
  results: WebsiteDataRecord[],
): void {
  updateSessionContext(sessionId, widgetId, { lastResults: results });
}

/**
 * Clear the pinned entity (e.g. when user starts a new topic).
 */
export function clearPinnedEntity(sessionId: string, widgetId: string): void {
  updateSessionContext(sessionId, widgetId, { pinnedEntity: null });
}

/**
 * Get just the pinned entity for a session (null-safe).
 */
export function getPinnedEntity(sessionId: string): ResolvedEntity | null {
  const ctx = store.get(sessionId);
  if (!ctx) return null;
  if (ctx.updatedAt < Date.now() - TTL_MS) return null;
  return ctx.pinnedEntity;
}

/**
 * Expire a session explicitly (e.g. on widget close).
 */
export function expireSession(sessionId: string): void {
  store.delete(sessionId);
}

/**
 * For monitoring: return number of active sessions.
 */
export function activeSessionCount(): number {
  const cutoff = Date.now() - TTL_MS;
  let count = 0;
  for (const ctx of store.values()) {
    if (ctx.updatedAt >= cutoff) count++;
  }
  return count;
}
