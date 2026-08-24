/**
 * Universal Entity Resolver (Phase 7)
 *
 * 4-tier entity resolution shared by:
 *  - /api/retell/chat  (text chat)
 *  - /api/agent/tools  (Retell / Vapi voice agents)
 *  - /api/widgets/[id]/entities/search
 *
 * Matching order (stops at first successful tier):
 *  1. Exact title match (case-insensitive, diacritics-normalized)
 *  2. Partial / alias match (all query words appear in title OR title words appear in query)
 *  3. Fuzzy token match (Levenshtein distance ≤ 2 on individual tokens)
 *  4. Broad semantic — delegates to getRelevantWebsiteRecords (keyword scoring)
 *
 * Never invents entity data. All fields come from DB rows.
 */

import { WebsiteDataRecord } from '@/config/widgetsDb';

// ── Types ────────────────────────────────────────────────────────────────────

export type MatchConfidence = 'exact' | 'partial' | 'fuzzy' | 'semantic';

export interface ResolvedEntity {
  record: WebsiteDataRecord;
  confidence: MatchConfidence;
  /** Normalized title for display */
  title: string;
  /** DB entity ID */
  entityId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a string for comparison: lower-case, remove diacritics, collapse
 * punctuation and whitespace. Makes "Jeep Wrangler 4xe" match "jeep wrangler 4xe".
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')    // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split into meaningful tokens (3+ chars) */
function tokens(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((t) => t.length >= 2);
}

/**
 * Classic Levenshtein distance between two strings.
 * O(m*n) — only called on short tokens so this is fine.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const dp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    dp[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = i === 0
        ? j
        : Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0),
          );
    }
  }
  return dp[a.length][b.length];
}

/** Returns true if any query token fuzzy-matches any title token (distance ≤ maxDist) */
function hasFuzzyMatch(queryTokens: string[], titleTokens: string[]): boolean {
  for (const qt of queryTokens) {
    if (qt.length < 4) continue; // skip short tokens to prevent false positives (e.g. 'core' vs 'crew')
    const maxDist = qt.length <= 5 ? 1 : 2;
    for (const tt of titleTokens) {
      if (tt.length < 4) continue;
      if (Math.abs(qt.length - tt.length) > 1) continue;
      if (levenshtein(qt, tt) <= maxDist) return true;
    }
  }
  return false;
}

// ── Fetch all DB rows for a widget ───────────────────────────────────────────

async function fetchAllRows(widgetId: string): Promise<any[]> {
  if (!widgetId || typeof widgetId !== 'string' || widgetId.trim() === '') {
    console.warn('[entityResolver:SCOPE_ENFORCEMENT] fetchAllRows called with empty widgetId. Failing closed.');
    return [];
  }

  try {
    const { getWidget, getDbClient, isValidUuid } = await import('@/config/widgetsDb');
    const { client } = getDbClient();
    if (!client) return [];

    const widget = await getWidget(widgetId.trim());
    if (!widget) {
      console.warn(`[entityResolver:SCOPE_ENFORCEMENT] fetchAllRows: Widget not found for '${widgetId}'. Failing closed.`);
      return [];
    }

    const ids = new Set<string>();
    if (widget.id && isValidUuid(widget.id)) ids.add(widget.id);
    if (widget.websiteId && isValidUuid(widget.websiteId)) ids.add(widget.websiteId);
    if (widget.widgetId && isValidUuid(widget.widgetId)) ids.add(widget.widgetId);

    const filterIds = Array.from(ids).filter(
      (id) => id !== '00000000-0000-0000-0000-000000000000'
    );

    if (filterIds.length === 0) {
      console.warn(`[entityResolver:SCOPE_ENFORCEMENT] fetchAllRows: No valid UUIDs for widget '${widgetId}'. Failing closed.`);
      return [];
    }

    const { data: rows, error } = await client
      .from('website_data')
      .select('*')
      .in('widget_id', filterIds);

    if (error || !rows) return [];
    return rows;
  } catch (err) {
    console.error('[entityResolver] fetchAllRows error:', err);
    return [];
  }
}

/** Map a raw DB row to the minimal WebsiteDataRecord shape */
function rowToRecord(row: any): WebsiteDataRecord {
  const meta = (row.metadata || {}) as Record<string, any>;

  const collectedImages: string[] = [];
  if (Array.isArray(row.image_urls)) {
    row.image_urls.forEach((img: any) => {
      if (typeof img === 'string' && img.startsWith('http')) collectedImages.push(img);
    });
  }
  if (Array.isArray(meta.images)) {
    meta.images.forEach((img: any) => {
      if (typeof img === 'string' && img.startsWith('http')) collectedImages.push(img);
    });
  }
  if (typeof meta.image === 'string' && meta.image.startsWith('http')) collectedImages.push(meta.image);
  if (typeof meta.photoUrl === 'string' && meta.photoUrl.startsWith('http')) collectedImages.push(meta.photoUrl);
  if (typeof meta.thumbnail === 'string' && meta.thumbnail.startsWith('http')) collectedImages.push(meta.thumbnail);

  const images = Array.from(new Set(collectedImages));

  return {
    id: row.id,
    title: row.title || 'Untitled',
    description: row.short_description || row.content?.substring(0, 300) || '',
    shortDescription: row.short_description || row.content?.substring(0, 300) || '',
    images,
    imageUrls: images,
    price: meta.price !== undefined ? String(meta.price) : row.price !== undefined ? String(row.price) : undefined,
    currency: meta.currency || row.currency,
    availability: meta.availability,
    rating: meta.rating ?? meta.ratings,
    reviews: meta.reviews,
    category: meta.category || meta.tags,
    level: meta.level,
    attributes: meta.attributes,
    metadata: meta,
    sourceUrl: row.source_url,
    entityType: row.entity_type,
  };
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export interface QueryConstraints {
  maxPrice?: number;
  minPrice?: number;
  priceSort?: 'cheapest' | 'most_expensive';
  minRating?: number;
  ratingSort?: 'highest_rated';
  availabilityOnly?: boolean;
  isComparison?: boolean;
  comparisonQueries?: string[];
  hasExplicitConstraints?: boolean;
}

/** Helper to parse a float number out of price strings like "$49,995", "$90/mo", "CAD 150" */
export function parseNumericPrice(val: any): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/,/g, '');
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  return parseFloat(match[1]);
}

/** Helper to parse a float rating out of "4.5", 5, "4.8 / 5" */
export function parseNumericRating(val: any): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') return val;
  const str = String(val);
  const match = str.match(/([0-5](?:\.\d+)?)/);
  if (!match) return undefined;
  return parseFloat(match[1]);
}

/**
 * Extracts structured constraints from natural language query strings.
 * Domain-neutral: works for prices, ratings, availability, cheapest, most expensive, comparisons.
 */
export function extractQueryConstraints(query: string): QueryConstraints {
  const q = query.trim().toLowerCase();
  const constraints: QueryConstraints = { hasExplicitConstraints: false };

  // 1. Price sorting
  if (/\b(cheapest|lowest price|least expensive|budget|most affordable|lowest cost)\b/i.test(q)) {
    constraints.priceSort = 'cheapest';
    constraints.hasExplicitConstraints = true;
  } else if (/\b(most expensive|highest price|priciest|top tier|premium|highest cost)\b/i.test(q)) {
    constraints.priceSort = 'most_expensive';
    constraints.hasExplicitConstraints = true;
  }

  // 2. Rating sorting
  if (/\b(best rated|highest rated|top rated|best reviews|highest review|best review)\b/i.test(q)) {
    constraints.ratingSort = 'highest_rated';
    constraints.hasExplicitConstraints = true;
  }

  // 3. Max Price constraint (under $50, less than 50k, below 100, max 500)
  const maxPriceMatch = q.match(/\b(?:under|below|less than|max|cheaper than|\<=?)\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|thousand)?\b/i);
  if (maxPriceMatch) {
    let rawNum = parseFloat(maxPriceMatch[1].replace(/,/g, ''));
    if (maxPriceMatch[2]) rawNum *= 1000;
    constraints.maxPrice = rawNum;
    constraints.hasExplicitConstraints = true;
  }

  // 4. Min Price constraint (above $100, over 50k, more than 200, min 50)
  const minPriceMatch = q.match(/\b(?:above|over|more than|min|at least|>=?)\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|thousand)?\b/i);
  if (minPriceMatch) {
    let rawNum = parseFloat(minPriceMatch[1].replace(/,/g, ''));
    if (minPriceMatch[2]) rawNum *= 1000;
    constraints.minPrice = rawNum;
    constraints.hasExplicitConstraints = true;
  }

  // 5. Price Range (between $100 and $200, from 50k to 70k)
  const rangeMatch = q.match(/\b(?:between|from)\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|thousand)?\s*(?:and|to|-)\s*\$?(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|thousand)?\b/i);
  if (rangeMatch) {
    let minNum = parseFloat(rangeMatch[1].replace(/,/g, ''));
    if (rangeMatch[2]) minNum *= 1000;
    let maxNum = parseFloat(rangeMatch[3].replace(/,/g, ''));
    if (rangeMatch[4]) maxNum *= 1000;
    constraints.minPrice = minNum;
    constraints.maxPrice = maxNum;
    constraints.hasExplicitConstraints = true;
  }

  // 6. Rating threshold constraint (rated 4.5+, 4 stars or higher)
  const ratingMatch = q.match(/\b(?:rated|rating|stars)\s*(?:above|over|at least|>=?)?\s*([0-5](?:\.\d+)?)\b/i) || q.match(/\b([0-5](?:\.\d+)?)\s*(?:\+|stars?|rating)\b/i);
  if (ratingMatch) {
    constraints.minRating = parseFloat(ratingMatch[1]);
    constraints.hasExplicitConstraints = true;
  }

  // 7. Availability constraint (in stock, available, in-stock)
  if (/\b(in stock|available|currently available|in-stock|ready)\b/i.test(q)) {
    constraints.availabilityOnly = true;
    constraints.hasExplicitConstraints = true;
  }

  // 8. Comparison Intent
  if (/\b(compare|versus|vs\.?|difference between)\b/i.test(q)) {
    constraints.isComparison = true;
    constraints.hasExplicitConstraints = true;
    const parts = q.split(/\b(?:vs\.?|versus|and|compare)\b/i).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      constraints.comparisonQueries = parts;
    }
  }

  return constraints;
}

/**
 * Filter and sort candidate entities according to extracted user constraints.
 * Never returns an entity that violates an explicit user constraint.
 */
export function applyConstraints(
  entities: ResolvedEntity[],
  constraints: QueryConstraints,
): { filtered: ResolvedEntity[]; noMatchReason?: string } {
  if (entities.length === 0) return { filtered: [] };

  let pool = [...entities];

  // 1. Max price filter
  if (constraints.maxPrice !== undefined) {
    pool = pool.filter((item) => {
      const p = parseNumericPrice(item.record.price ?? item.record.metadata?.price);
      return p !== undefined && p <= constraints.maxPrice!;
    });
  }

  // 2. Min price filter
  if (constraints.minPrice !== undefined) {
    pool = pool.filter((item) => {
      const p = parseNumericPrice(item.record.price ?? item.record.metadata?.price);
      return p !== undefined && p >= constraints.minPrice!;
    });
  }

  // 3. Min rating filter
  if (constraints.minRating !== undefined) {
    pool = pool.filter((item) => {
      const r = parseNumericRating(item.record.rating ?? item.record.metadata?.rating);
      return r !== undefined && r >= constraints.minRating!;
    });
  }

  // 4. Availability filter
  if (constraints.availabilityOnly) {
    pool = pool.filter((item) => {
      const avail = String(item.record.availability ?? item.record.metadata?.availability ?? '').toLowerCase();
      const listed = (item.record as any).stillListed !== false;
      return listed && (avail.includes('stock') || avail.includes('available') || avail === '' || avail === 'true');
    });
  }

  // 5. Sorting
  if (constraints.priceSort === 'cheapest') {
    pool.sort((a, b) => {
      const pa = parseNumericPrice(a.record.price ?? a.record.metadata?.price) ?? Infinity;
      const pb = parseNumericPrice(b.record.price ?? b.record.metadata?.price) ?? Infinity;
      return pa - pb;
    });
  } else if (constraints.priceSort === 'most_expensive') {
    pool.sort((a, b) => {
      const pa = parseNumericPrice(a.record.price ?? a.record.metadata?.price) ?? -Infinity;
      const pb = parseNumericPrice(b.record.price ?? b.record.metadata?.price) ?? -Infinity;
      return pb - pa;
    });
  } else if (constraints.ratingSort === 'highest_rated') {
    pool.sort((a, b) => {
      const ra = parseNumericRating(a.record.rating ?? a.record.metadata?.rating) ?? -Infinity;
      const rb = parseNumericRating(b.record.rating ?? b.record.metadata?.rating) ?? -Infinity;
      return rb - ra;
    });
  }

  if (pool.length === 0 && entities.length > 0 && constraints.hasExplicitConstraints) {
    return {
      filtered: [],
      noMatchReason: 'No exact matches found matching your specific constraints (price/rating/availability).',
    };
  }

  return { filtered: pool };
}

/**
 * Resolve an entity by query using a 4-tier matching strategy + constraint filtering.
 *
 * @param widgetId  - Widget UUID or slug (resolved internally)
 * @param query     - Raw user query string
 * @param limit     - Max results to return for semantic tier (default 3)
 * @returns Array of ResolvedEntity in descending confidence order
 */
export async function resolveEntityByQuery(
  widgetId: string,
  query: string,
  limit = 6,
): Promise<ResolvedEntity[]> {
  if (!query?.trim() || !widgetId) return [];

  const normQuery = norm(query);
  const queryTokens = tokens(query);
  const constraints = extractQueryConstraints(query);

  // ── Comparison Intent Handler ───────────────────────────────────────────────
  if (constraints.isComparison && Array.isArray(constraints.comparisonQueries) && constraints.comparisonQueries.length >= 2) {
    const comparisonResults: ResolvedEntity[] = [];
    for (const qPart of constraints.comparisonQueries) {
      const matched = await resolveEntityByQuery(widgetId, qPart, 1);
      if (matched.length > 0) {
        comparisonResults.push(matched[0]);
      }
    }
    if (comparisonResults.length > 0) return dedupe(comparisonResults);
  }

  // ── Tier 4 fallback: semantic via widgetsDb ─────────────────────────────────
  const [allRows, semanticRecords] = await Promise.all([
    fetchAllRows(widgetId),
    (async () => {
      try {
        const { getRelevantWebsiteRecords } = await import('@/config/widgetsDb');
        return await getRelevantWebsiteRecords(widgetId, query, limit);
      } catch {
        return [];
      }
    })(),
  ]);

  if (allRows.length === 0 && semanticRecords.length === 0) return [];

  let candidates: ResolvedEntity[] = [];

  // ── Tier 1: Exact title match ────────────────────────────────────────────────
  for (const row of allRows) {
    if (!row.title) continue;
    if (norm(row.title) === normQuery) {
      candidates.push({ record: rowToRecord(row), confidence: 'exact', title: row.title, entityId: row.id });
    }
  }

  // Single entity focus guard: if exact match found, return ONLY that single item!
  if (candidates.length > 0) {
    const { filtered } = applyConstraints(candidates, constraints);
    return filtered.slice(0, 1); // Single exact match
  }

  // ── Tier 2: Partial / alias match ───────────────────────────────────────────
  for (const row of allRows) {
    if (!row.title) continue;
    const titleTokens = tokens(row.title);
    const metaCat = norm(String((row.metadata || {}).category || (row.metadata || {}).tags || ''));
    const metaCatTokens = tokens(metaCat);
    const normTitle = norm(row.title);

    if (normTitle.length > 0 && (normTitle === normQuery || (normTitle.length >= 4 && normQuery.includes(normTitle)))) {
      candidates.push({ record: rowToRecord(row), confidence: 'partial', title: row.title, entityId: row.id });
      continue;
    }

    const significant = queryTokens.filter((t) => t.length >= 3);
    if (significant.length > 0) {
      const hitAll = significant.every((qt) => titleTokens.includes(qt) || metaCatTokens.includes(qt));
      if (hitAll) {
        candidates.push({ record: rowToRecord(row), confidence: 'partial', title: row.title, entityId: row.id });
        continue;
      }
      const hits = significant.filter((qt) => titleTokens.includes(qt) || metaCatTokens.includes(qt)).length;
      if (hits >= Math.max(2, Math.ceil(significant.length * 0.7))) {
        candidates.push({ record: rowToRecord(row), confidence: 'partial', title: row.title, entityId: row.id });
      }
    }
  }

  if (candidates.length > 0) {
    const deduped = dedupe(candidates);
    const { filtered, noMatchReason } = applyConstraints(deduped, constraints);
    if (filtered.length > 0) return filtered.slice(0, limit);

    // Explicit constraint eliminated candidates: label alternatives clearly
    if (noMatchReason) {
      return deduped.slice(0, Math.min(3, limit)).map(item => ({
        ...item,
        confidence: 'semantic',
        record: {
          ...item.record,
          metadata: {
            ...(item.record.metadata || {}),
            constraintViolated: true,
            noMatchReason,
            isAlternative: true,
          },
        },
      }));
    }
  }

  // ── Tier 3: True pgvector Semantic Similarity ─────────────────────────────
  try {
    const { searchWebsiteDataVector } = await import('@/config/widgetsDb');
    const vectorRecords = await searchWebsiteDataVector(widgetId, query, limit, 0.25);
    if (vectorRecords.length > 0) {
      const vectorEntities: ResolvedEntity[] = vectorRecords.map((r) => ({
        record: r,
        confidence: 'semantic' as MatchConfidence,
        title: r.title || 'Untitled',
        entityId: r.id || '',
      }));
      const { filtered, noMatchReason } = applyConstraints(vectorEntities, constraints);
      if (filtered.length > 0) return filtered.slice(0, limit);

      if (noMatchReason) {
        return vectorEntities.slice(0, Math.min(3, limit)).map(item => ({
          ...item,
          confidence: 'semantic',
          record: {
            ...item.record,
            metadata: {
              ...(item.record.metadata || {}),
              constraintViolated: true,
              noMatchReason,
              isAlternative: true,
            },
          },
        }));
      }
    }
  } catch (err) {
    console.warn('[entityResolver] pgvector search exception, falling back:', err);
  }

  // ── Tier 4: Fallback Fuzzy / Keyword Retrieval ───────────────────────────────
  if (queryTokens.length > 0) {
    for (const row of allRows) {
      if (!row.title) continue;
      const titleTokens = tokens(row.title);
      if (hasFuzzyMatch(queryTokens, titleTokens)) {
        candidates.push({ record: rowToRecord(row), confidence: 'fuzzy', title: row.title, entityId: row.id });
      }
    }
    if (candidates.length > 0) {
      const deduped = dedupe(candidates);
      const { filtered } = applyConstraints(deduped, constraints);
      if (filtered.length > 0) return filtered.slice(0, limit);
    }
  }

  const semanticEntities: ResolvedEntity[] = semanticRecords.map((r) => ({
    record: r,
    confidence: 'semantic' as MatchConfidence,
    title: r.title || 'Untitled',
    entityId: r.id || '',
  }));

  const { filtered, noMatchReason } = applyConstraints(semanticEntities, constraints);
  if (filtered.length > 0) return filtered.slice(0, limit);

  // If constraints failed, return labeled alternatives
  if (noMatchReason && semanticEntities.length > 0) {
    return semanticEntities.slice(0, Math.min(3, limit)).map(item => ({
      ...item,
      confidence: 'semantic',
      record: {
        ...item.record,
        metadata: {
          ...(item.record.metadata || {}),
          constraintViolated: true,
          noMatchReason,
          isAlternative: true,
        },
      },
    }));
  }

  return [];
}

/**
 * Resolve a single "best" entity for a given query.
 * Returns null when nothing is found so callers can say "not found" honestly.
 */
export async function resolveTopEntity(
  widgetId: string,
  query: string,
): Promise<ResolvedEntity | null> {
  const results = await resolveEntityByQuery(widgetId, query, 1);
  return results[0] ?? null;
}

// ── Deduplicate by entityId ──────────────────────────────────────────────────

function dedupe(list: ResolvedEntity[]): ResolvedEntity[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    if (seen.has(r.entityId)) return false;
    seen.add(r.entityId);
    return true;
  });
}

// ── Anaphora / pronoun resolution ────────────────────────────────────────────

/** Pronoun / anaphoric patterns that refer to the most recently discussed entity */
const ANAPHORIC_RE =
  /\b(it|its|it's|that|that's|this|this one|the item|the one|the vehicle|the car|the product|the course|the service|the offering|the listing|the property)\b/i;

/** Ordinal words → 0-based index */
const ORDINAL_MAP: Record<string, number> = {
  first: 0, '1st': 0,
  second: 1, '2nd': 1,
  third: 2, '3rd': 2,
  fourth: 3, '4th': 3,
  fifth: 4, '5th': 4,
  last: -1, // resolved dynamically
};

export interface AnaphoricResolution {
  /** The entity to focus on for this turn */
  resolvedEntity: ResolvedEntity | null;
  /** Whether a pronoun/ordinal was detected (false = regular query, skip resolution) */
  wasAnaphoric: boolean;
  /** The natural-language label extracted (e.g. "the Jeep Wrangler") */
  label?: string;
}

/**
 * Try to resolve anaphoric references (it, this, that, first one, etc.) against:
 *  1. The pinned entity in server session context
 *  2. The last results array in session context
 *  3. The history messages passed from the client
 */
export function resolveAnaphora(
  query: string,
  pinnedEntity: ResolvedEntity | null,
  lastResults: WebsiteDataRecord[],
  history: Array<{ role: string; content: string; results?: WebsiteDataRecord[] }>,
): AnaphoricResolution {
  const lower = query.trim().toLowerCase();

  // ── Check ordinal references ─────────────────────────────────────────────
  const ordinalMatch = lower.match(
    /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)\b/i,
  );
  if (ordinalMatch) {
    const word = ordinalMatch[1].toLowerCase();
    let idx = ORDINAL_MAP[word] ?? 0;
    // Gather result pool: session lastResults first, then most recent history results
    const resultPool = lastResults.length > 0
      ? lastResults
      : getLastHistoryResults(history);

    if (resultPool.length > 0) {
      if (idx === -1) idx = resultPool.length - 1;
      const item = resultPool[Math.min(idx, resultPool.length - 1)];
      if (item) {
        return {
          resolvedEntity: {
            record: item,
            confidence: 'exact',
            title: item.title || 'Untitled',
            entityId: item.id || '',
          },
          wasAnaphoric: true,
          label: item.title,
        };
      }
    }
  }

  // ── Check pronoun references ─────────────────────────────────────────────
  if (ANAPHORIC_RE.test(lower)) {
    // 1. Use server-pinned entity if available
    if (pinnedEntity) {
      return { resolvedEntity: pinnedEntity, wasAnaphoric: true, label: pinnedEntity.title };
    }
    // 2. Fall back to last result from session
    const resultPool = lastResults.length > 0 ? lastResults : getLastHistoryResults(history);
    if (resultPool.length > 0) {
      const item = resultPool[0];
      return {
        resolvedEntity: {
          record: item,
          confidence: 'semantic',
          title: item.title || 'Untitled',
          entityId: item.id || '',
        },
        wasAnaphoric: true,
        label: item.title,
      };
    }
    // Nothing to resolve against — flag it but resolve nothing
    return { resolvedEntity: null, wasAnaphoric: true };
  }

  return { resolvedEntity: null, wasAnaphoric: false };
}

function getLastHistoryResults(
  history: Array<{ role: string; content: string; results?: WebsiteDataRecord[] }>,
): WebsiteDataRecord[] {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'agent' && Array.isArray(msg.results) && msg.results.length > 0) {
      return msg.results;
    }
  }
  return [];
}
