/**
 * Unified Agent Tool Layer
 *
 * Single execution path for Chat, Retell AI, and Vapi AI.
 *
 * All tools:
 * 1. Validate widget_id scope (fail closed on missing/invalid)
 * 2. Route through hybridRetrieve() + validateGrounding() — no bypass
 * 3. Return structured JSON: { success, results, sources, freshness, confidence, grounded, ... }
 *
 * New tools:
 *   search_knowledge   — hybrid semantic+keyword search (canonical name for search_entities)
 *   get_entity         — fetch single entity by ID or name (canonical name for get_entity_details)
 *   filter_entities    — structured filter by price range, type, sort order
 *   compare_entities   — side-by-side comparison of 2–4 entities
 *   get_entity_media   — images/media for a specific entity
 *   get_page           — retrieve crawled page record by URL or slug
 *   navigate_to_entity — trigger browser navigation (existing, unchanged)
 *
 * Backward compatibility aliases:
 *   search_entities    → search_knowledge
 *   get_entity_details → get_entity
 *   navigate           → navigate_to_entity
 *   search / search_entity / search_knowledge_base → search_knowledge
 *   get_details / details → get_entity
 */

import { hybridRetrieve, HybridRetrievalOptions, StageTimings } from '@/lib/retrieval/hybridRag';
import { validateGrounding, GroundingMetadata } from '@/lib/retrieval/grounding';
import { getWidget } from '@/config/widgetsDb';
import { broadcastToSession } from '@/lib/realtime/session';
import { calculateFreshness, appendResumeParam, getEntityDetails } from './tools';
import {
  getSessionContext,
  setLastResults,
  pinEntity,
  setActiveFilters,
  setLastNavigation,
  setLastIntent,
} from './sessionContext';
import { resolveNavigationTarget } from './navigationResolver';

// ── Structured Result Types ───────────────────────────────────────────────────

export interface StructuredEntity {
  id: string;
  title: string;
  entityType: string;
  entity_type?: string;
  type: string;
  description: string;
  shortDescription?: string;
  price?: string | number;
  msrp?: string | number;
  originalPrice?: string | number;
  original_price?: string | number;
  currency?: string;
  rating?: number | string;
  availability?: string;
  condition?: 'new' | 'used' | 'cpo' | 'certified';
  vin?: string;
  stockNumber?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  bodyStyle?: string;
  mileage?: number | string;
  drivetrain?: string;
  transmission?: string;
  engine?: string;
  fuel?: string;
  exteriorColor?: string;
  interiorColor?: string;
  features?: string[];
  vdpUrl?: string;
  imageUrls: string[];
  images: string[];
  image_urls?: string[];
  sourceUrl?: string;
  source_url?: string;
  canonicalUrl?: string;
  firstSeen: string;
  lastSeen: string;
  stillListed: boolean;
  freshness: 'fresh' | 'recent' | 'stale_or_unlisted' | 'unknown';
  freshnessStatus: 'fresh' | 'recent' | 'stale_or_unlisted' | 'unknown';
  lastSeenHuman: string;
  hedgeInstruction?: string;
  score?: number;
  matchType?: string;
  metadata?: Record<string, any>;
}

export interface EntitySource {
  id: string;
  title: string;
  url?: string;
  matchType?: string;
  score?: number;
}

export interface UnifiedToolResult {
  success: boolean;
  tool: string;
  widgetId: string;
  results: StructuredEntity[];
  sources: EntitySource[];
  count: number;
  freshness: 'fresh' | 'recent' | 'stale_or_unlisted' | 'unknown';
  confidence: 'high' | 'medium' | 'low' | 'unverified';
  grounded: boolean;
  hedged: boolean;
  hedgeInstruction?: string;
  fallbackText?: string;
  systemPrompt?: string;
  contextSummary?: string;
  groundingMetadata?: GroundingMetadata;
  comparison?: EntityComparison;
  error?: string;
  // Filter result extras
  appliedFilters?: Record<string, any>;
  sortedBy?: string;
  timings?: StageTimings;
}

export interface EntityComparison {
  entityIds: string[];
  attributes: Record<string, (string | number | null)[]>;
  summary: string;
}

export interface UnifiedToolContext {
  sessionId?: string;
  allowAgentNavigation?: boolean;
  businessName?: string;
}

// ── Canonical Tool Name Normalization ─────────────────────────────────────────

export function normalizeToolName(raw: string): string {
  const name = (raw || '').toLowerCase().trim();
  // search aliases → search_knowledge
  if (['search_entities', 'search_entity', 'search', 'search_knowledge_base', 'search_knowledge'].includes(name)) {
    return 'search_knowledge';
  }
  // get_entity aliases → get_entity
  if (['get_entity_details', 'get_entity', 'get_details', 'details'].includes(name)) {
    return 'get_entity';
  }
  // navigate aliases
  if (['navigate', 'navigate_to_page', 'open_page'].includes(name)) {
    return 'navigate_to_entity';
  }
  return name;
}

// ── Image Sanitization, Validation & Ranking ──────────────────────────────────

/**
 * Sanitizes, validates, and ranks image URLs from crawled entity data.
 * - Never hallucinates or invents URLs.
 * - Filters out data URIs, SVG icons, tracking pixels, and empty values.
 * - Deduplicates URLs.
 * - Ranks full-resolution / high-quality images before thumbnails.
 */
export function sanitizeAndRankImages(rawImages: any): string[] {
  if (!rawImages) return [];
  const list: string[] = Array.isArray(rawImages)
    ? rawImages
    : typeof rawImages === 'string'
    ? [rawImages]
    : [];

  const validUrls: string[] = [];
  const seen = new Set<string>();

  const isInvalid = (url: string): boolean => {
    if (!url || typeof url !== 'string') return true;
    const trimmed = url.trim();
    if (trimmed.length < 5) return true;
    if (trimmed.startsWith('data:')) return true;
    // Filter tracking pixels
    if (/\b(?:pixel\.gif|1x1\.|spacer\.gif|beacon\.gif|blank\.gif|tracking)\b/i.test(trimmed)) return true;
    // Filter UI icons / svgs that are not entity photos
    if (/\.(?:svg)(?:\?.*)?$/i.test(trimmed) && /(?:icon|logo|arrow|star|badge|menu|close|social|facebook|twitter|instagram)/i.test(trimmed)) return true;
    return false;
  };

  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const url = raw.trim();
    if (isInvalid(url)) continue;
    let safeUrl = url;
    try {
      safeUrl = encodeURI(decodeURI(url));
    } catch {
      safeUrl = url.replace(/\s+/g, '%20');
    }
    if (!seen.has(safeUrl)) {
      seen.add(safeUrl);
      validUrls.push(safeUrl);
    }
  }

  // Rank: full resolution images preferred over small thumbnails
  validUrls.sort((a, b) => {
    const isThumbA = /\b(?:_thumb|_50x50|_100x100|size=small|w=50|w=100|preview)\b/i.test(a);
    const isThumbB = /\b(?:_thumb|_50x50|_100x100|size=small|w=50|w=100|preview)\b/i.test(b);
    if (isThumbA && !isThumbB) return 1;
    if (!isThumbA && isThumbB) return -1;
    return 0;
  });

  return validUrls;
}

// ── Entity Formatting Helper ──────────────────────────────────────────────────

export function formatResult(r: any): StructuredEntity {
  const freshInfo = calculateFreshness(
    r.lastSeen || r.last_seen,
    r.stillListed ?? r.still_listed,
    r.dataType || r.data_type || r.metadata?.dataType || r.metadata?.data_type,
    r.metadata?.source || r.metadata?.discoveryMethod
  );
  const rawImages = r.imageUrls || r.images || r.image_urls || r.metadata?.images || r.metadata?.imageUrls || r.metadata?.image || [];
  const imageUrls = sanitizeAndRankImages(rawImages);

  const entityType = r.entityType || r.entity_type || r.type || 'product';
  const description = r.shortDescription || r.description || r.short_description || r.metadata?.description || '';
  const sourceUrl = r.sourceUrl || r.source_url || r.canonicalUrl || r.metadata?.sourceUrl;
  const freshness = freshInfo.freshnessStatus;

  const rawPrice = r.price ?? r.metadata?.price;
  const price = typeof rawPrice === 'object' ? undefined : rawPrice;

  const rawOriginalPrice = r.originalPrice ?? r.original_price ?? r.metadata?.originalPrice ?? r.metadata?.original_price ?? r.metadata?.compareAtPrice ?? r.metadata?.msrp;
  const originalPrice = typeof rawOriginalPrice === 'object' ? undefined : rawOriginalPrice;

  const currency = r.currency ?? r.metadata?.currency ?? (typeof price === 'string' && price.startsWith('$') ? '$' : 'USD');
  const rating = r.rating ?? r.metadata?.rating ?? 0;
  const availability = r.availability ?? r.metadata?.availability ?? (r.stillListed === false ? 'out_of_stock' : 'in_stock');

  const metadata = {
    ...(r.metadata || {}),
    ...(r.attributes ? { attributes: r.attributes } : {}),
    freshnessStatus: freshness,
    lastSeenHuman: freshInfo.lastSeenHuman,
    isConnectorBacked: freshInfo.isConnectorBacked,
    dataSource: freshInfo.dataSource,
    ...(freshInfo.hedgeInstruction ? { hedgeInstruction: freshInfo.hedgeInstruction } : {}),
  };

  const item: StructuredEntity = {
    id: r.id || `entity_${Date.now()}`,
    title: r.title || 'Untitled',
    entityType,
    entity_type: entityType,
    type: entityType,
    description,
    shortDescription: description,
    imageUrls,
    images: imageUrls,
    image_urls: imageUrls,
    sourceUrl,
    source_url: sourceUrl,
    canonicalUrl: sourceUrl,
    firstSeen: r.firstSeen || r.first_seen || new Date().toISOString(),
    lastSeen: r.lastSeen || r.last_seen || new Date().toISOString(),
    stillListed: r.stillListed ?? r.still_listed ?? true,
    freshness,
    freshnessStatus: freshness,
    lastSeenHuman: freshInfo.lastSeenHuman,
    hedgeInstruction: freshInfo.hedgeInstruction,
    score: r.score,
    matchType: r.matchType,
    metadata,
  };

  const metaObj = r.metadata || {};
  if (r.condition || metaObj.condition) item.condition = r.condition || metaObj.condition;
  if (r.vin || metaObj.vin) item.vin = r.vin || metaObj.vin;
  if (r.stockNumber || metaObj.stockNumber || metaObj.stock_number || metaObj.sku) item.stockNumber = r.stockNumber || metaObj.stockNumber || metaObj.stock_number || metaObj.sku;
  if (r.year || metaObj.year) item.year = r.year || metaObj.year;
  if (r.make || metaObj.make) item.make = r.make || metaObj.make;
  if (r.model || metaObj.model) item.model = r.model || metaObj.model;
  if (r.trim || metaObj.trim) item.trim = r.trim || metaObj.trim;
  if (r.bodyStyle || metaObj.bodyStyle || metaObj.body_style) item.bodyStyle = r.bodyStyle || metaObj.bodyStyle || metaObj.body_style;
  if (r.mileage !== undefined || metaObj.mileage !== undefined) item.mileage = r.mileage ?? metaObj.mileage;
  if (r.drivetrain || metaObj.drivetrain) item.drivetrain = r.drivetrain || metaObj.drivetrain;
  if (r.transmission || metaObj.transmission) item.transmission = r.transmission || metaObj.transmission;
  if (r.engine || metaObj.engine) item.engine = r.engine || metaObj.engine;
  if (r.fuel || metaObj.fuel || metaObj.fuelType) item.fuel = r.fuel || metaObj.fuel || metaObj.fuelType;
  if (r.exteriorColor || metaObj.exteriorColor || metaObj.color) item.exteriorColor = r.exteriorColor || metaObj.exteriorColor || metaObj.color;
  if (r.interiorColor || metaObj.interiorColor) item.interiorColor = r.interiorColor || metaObj.interiorColor;
  if (r.features || metaObj.features) item.features = Array.isArray(r.features) ? r.features : (Array.isArray(metaObj.features) ? metaObj.features : undefined);
  if (r.vdpUrl || metaObj.vdpUrl || metaObj.vdp_url) item.vdpUrl = r.vdpUrl || metaObj.vdpUrl || metaObj.vdp_url || sourceUrl;
  if (r.msrp !== undefined || metaObj.msrp !== undefined) item.msrp = r.msrp ?? metaObj.msrp;

  if (price !== undefined) item.price = price;
  if (originalPrice !== undefined) {
    item.originalPrice = originalPrice;
    item.original_price = originalPrice;
  }
  if (currency !== undefined) item.currency = currency;
  if (rating !== undefined) item.rating = rating;
  if (availability !== undefined) item.availability = availability;

  return item;
}

// ── Core Unified Tool Dispatcher ──────────────────────────────────────────────

/**
 * Execute any domain-agnostic agent tool. All three platforms (Chat, Retell, Vapi)
 * must call this function — no separate retrieval implementations.
 */
export async function executeUnifiedTool(
  widgetId: string,
  toolNameRaw: string,
  args: Record<string, any>,
  context: UnifiedToolContext = {}
): Promise<UnifiedToolResult> {
  const toolName = normalizeToolName(toolNameRaw);

  // ── Scope Enforcement ────────────────────────────────────────────────────────
  if (!widgetId || !widgetId.trim() || widgetId === '00000000-0000-0000-0000-000000000000') {
    console.warn('[unifiedTools:SCOPE_ENFORCEMENT] Called with missing widget scope. Failing closed.');
    return scopeError(toolName, widgetId, 'widget_not_found', 'Widget scope missing or invalid.');
  }

  const widget = await getWidget(widgetId);
  if (!widget) {
    console.warn(`[unifiedTools:SCOPE_ENFORCEMENT] Widget not found for '${widgetId}'. Failing closed.`);
    return scopeError(toolName, widgetId, 'widget_not_found', `Widget '${widgetId}' not found.`);
  }

  const resolvedWidgetId = widget.id || widgetId;
  const businessName = context.businessName || widget.name || 'this business';

  // ── Route to Tool Handler ─────────────────────────────────────────────────────
  try {
    switch (toolName) {
      case 'search_knowledge':
        return await toolSearchKnowledge(resolvedWidgetId, args, context, businessName);
      case 'get_entity':
        return await toolGetEntity(resolvedWidgetId, args, context, businessName);
      case 'filter_entities':
        return await toolFilterEntities(resolvedWidgetId, args, context, businessName);
      case 'compare_entities':
        return await toolCompareEntities(resolvedWidgetId, args, context, businessName);
      case 'get_entity_media':
        return await toolGetEntityMedia(resolvedWidgetId, args, context, businessName);
      case 'get_page':
        return await toolGetPage(resolvedWidgetId, args, context, businessName);
      case 'navigate_to_entity':
        return await toolNavigateToEntity(resolvedWidgetId, args, context, businessName);
      default:
        return {
          success: false,
          tool: toolName,
          widgetId: resolvedWidgetId,
          results: [],
          sources: [],
          count: 0,
          freshness: 'unknown',
          confidence: 'unverified',
          grounded: false,
          hedged: false,
          error: `Unknown tool: '${toolNameRaw}'`,
        };
    }
  } catch (err: any) {
    console.error(`[unifiedTools] Error in tool '${toolName}':`, err);
    return {
      success: false,
      tool: toolName,
      widgetId: resolvedWidgetId,
      results: [],
      sources: [],
      count: 0,
      freshness: 'unknown',
      confidence: 'unverified',
      grounded: false,
      hedged: false,
      error: err.message || 'Tool execution failed',
    };
  }
}

// ── Helper: Scope Error ───────────────────────────────────────────────────────

function scopeError(tool: string, widgetId: string, error: string, message: string): UnifiedToolResult {
  return {
    success: false,
    tool,
    widgetId,
    results: [],
    sources: [],
    count: 0,
    freshness: 'unknown',
    confidence: 'unverified',
    grounded: false,
    hedged: false,
    error,
    fallbackText: message,
  };
}

// ── Helper: Run Hybrid Retrieval + Grounding ──────────────────────────────────

async function runHybridRetrieval(
  widgetId: string,
  query: string,
  businessName: string,
  options: HybridRetrievalOptions = {}
): Promise<UnifiedToolResult & { _rawValidation: ReturnType<typeof validateGrounding> }> {
  const hybridOutput = await hybridRetrieve(widgetId, query, options);
  const validation = validateGrounding(query, hybridOutput, businessName);

  const results = validation.structuredResults.map(formatResult);
  const sources: EntitySource[] = validation.structuredResults.map(r => ({
    id: r.id,
    title: r.title,
    url: r.sourceUrl,
    matchType: r.matchType,
    score: r.score,
  }));

  const gm = validation.groundingMetadata;

  return {
    success: true,
    tool: 'search_knowledge',
    widgetId,
    results,
    sources,
    count: results.length,
    freshness: gm.freshness,
    confidence: gm.confidence,
    grounded: gm.grounded,
    hedged: gm.hasHedge,
    hedgeInstruction: gm.hedgeInstruction,
    fallbackText: validation.fallbackText,
    systemPrompt: validation.systemPrompt,
    contextSummary: validation.contextSummary,
    groundingMetadata: gm,
    timings: hybridOutput.timings,
    _rawValidation: validation,
  } as any;
}

// ── Tool: search_knowledge ────────────────────────────────────────────────────

async function toolSearchKnowledge(
  widgetId: string,
  args: Record<string, any>,
  context: UnifiedToolContext,
  businessName: string
): Promise<UnifiedToolResult> {
  const query = String(args.query || args.search || args.q || args.keyword || args.input || '').trim();
  if (!query) {
    return scopeError('search_knowledge', widgetId, 'missing_query', 'Query is required for search_knowledge.');
  }
  const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 10) : 5;

  const retrieved = await runHybridRetrieval(widgetId, query, businessName, { limit });

  // Broadcast & persist to session context
  if (context.sessionId && retrieved.results.length > 0) {
    await setLastResults(context.sessionId, widgetId, retrieved.results).catch(() => {});
    await setLastIntent(context.sessionId, widgetId, 'search_knowledge').catch(() => {});
    broadcastToSession(context.sessionId, 'voice_results', { results: retrieved.results }).catch(() => {});
    broadcastToSession(context.sessionId, 'entity_cards', { results: retrieved.results }).catch(() => {});
  }

  return { ...retrieved, tool: 'search_knowledge' };
}

// ── Tool: get_entity ──────────────────────────────────────────────────────────

async function toolGetEntity(
  widgetId: string,
  args: Record<string, any>,
  context: UnifiedToolContext,
  businessName: string
): Promise<UnifiedToolResult> {
  const tEntityT0 = performance.now();
  let targetId = String(args.entityId || args.entity_id || args.id || args.query || '').trim();
  if (context.sessionId && (!targetId || targetId === 'it' || targetId === 'this' || targetId === 'that' || targetId === 'first one' || targetId.startsWith('the '))) {
    const session = await getSessionContext(context.sessionId, widgetId);
    if (session?.currentEntity) {
      targetId = session.currentEntity.title || session.currentEntity.id;
    } else if (session?.lastResults && session.lastResults.length > 0) {
      targetId = session.lastResults[0].title || session.lastResults[0].id;
    }
  }

  if (!targetId) {
    return scopeError('get_entity', widgetId, 'missing_entity_id', 'entityId is required for get_entity.');
  }

  // First try the existing UUID/title resolver (strict scope enforced inside)
  const entity = await getEntityDetails(widgetId, targetId);
  if (entity) {
    const formatted = formatResult(entity);
    const sources: EntitySource[] = [{ id: formatted.id, title: formatted.title, url: formatted.sourceUrl }];
    const gm: GroundingMetadata = {
      sourceEntityIds: [formatted.id],
      retrievalMethod: 'exact',
      freshness: formatted.freshnessStatus,
      confidence: 'high',
      grounded: true,
      hasHedge: !!formatted.hedgeInstruction,
      hedgeInstruction: formatted.hedgeInstruction,
    };

    if (context.sessionId) {
      await pinEntity(context.sessionId, widgetId, formatted).catch(() => {});
      await setLastIntent(context.sessionId, widgetId, 'get_entity').catch(() => {});
      broadcastToSession(context.sessionId, 'voice_results', { results: [formatted] }).catch(() => {});
      broadcastToSession(context.sessionId, 'entity_cards', { results: [formatted] }).catch(() => {});
    }

    const durationMs = Math.round((performance.now() - tEntityT0) * 100) / 100;
    return {
      success: true,
      tool: 'get_entity',
      widgetId,
      results: [formatted],
      sources,
      count: 1,
      freshness: formatted.freshnessStatus,
      confidence: 'high',
      grounded: true,
      hedged: !!formatted.hedgeInstruction,
      hedgeInstruction: formatted.hedgeInstruction,
      groundingMetadata: gm,
      timings: {
        queryUnderstandingMs: 0,
        widgetLookupMs: 0,
        dbFetchMs: durationMs,
        parallelRetrievalMs: durationMs,
        rerankingMs: 0,
        contextSummaryMs: 0,
        totalRetrievalMs: durationMs,
        cacheHit: 'none',
      },
    };
  }

  // Fall back to hybrid search for name-based lookups
  const retrieved = await runHybridRetrieval(widgetId, targetId, businessName, { limit: 1 });

  if (context.sessionId && retrieved.results.length > 0) {
    await pinEntity(context.sessionId, widgetId, retrieved.results[0]).catch(() => {});
    await setLastResults(context.sessionId, widgetId, retrieved.results).catch(() => {});
    await setLastIntent(context.sessionId, widgetId, 'get_entity').catch(() => {});
    broadcastToSession(context.sessionId, 'voice_results', { results: retrieved.results }).catch(() => {});
    broadcastToSession(context.sessionId, 'entity_cards', { results: retrieved.results }).catch(() => {});
  }

  return { ...retrieved, tool: 'get_entity' };
}

// ── Tool: filter_entities ─────────────────────────────────────────────────────

async function toolFilterEntities(
  widgetId: string,
  args: Record<string, any>,
  context: UnifiedToolContext,
  businessName: string
): Promise<UnifiedToolResult> {
  // Build a natural language query from structured filter args
  const parts: string[] = [];

  const entityType = args.type || args.entity_type || args.category || '';
  if (entityType) parts.push(entityType);

  const keyword = args.keyword || args.query || args.search || '';
  if (keyword) parts.push(keyword);

  const maxPrice = args.maxPrice ?? args.max_price ?? args.under ?? null;
  const minPrice = args.minPrice ?? args.min_price ?? args.over ?? null;
  if (maxPrice !== null) parts.push(`under ${maxPrice}`);
  if (minPrice !== null) parts.push(`over ${minPrice}`);

  const negative = args.exclude || args.not || args.negative || '';
  const sortBy = args.sort || args.sortBy || args.sort_by || '';
  const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 10) : 5;

  const builtQuery = parts.join(' ') || 'all items';
  const finalQuery = negative ? `${builtQuery} not ${negative}` : builtQuery;

  const hybridOptions: HybridRetrievalOptions = { limit };
  const retrieved = await runHybridRetrieval(widgetId, finalQuery, businessName, hybridOptions);

  // Post-filter by price range (client-side after retrieval)
  let filtered = retrieved.results;
  if (maxPrice !== null) {
    filtered = filtered.filter(r => {
      if (r.price === undefined) return true;
      const p = parseFloat(String(r.price).replace(/[^0-9.]/g, ''));
      return isNaN(p) || p <= maxPrice;
    });
  }
  if (minPrice !== null) {
    filtered = filtered.filter(r => {
      if (r.price === undefined) return true;
      const p = parseFloat(String(r.price).replace(/[^0-9.]/g, ''));
      return isNaN(p) || p >= minPrice;
    });
  }

  // Sort
  if (sortBy === 'price_asc' || sortBy === 'cheapest') {
    filtered.sort((a, b) => {
      const pa = parseFloat(String(a.price || '99999').replace(/[^0-9.]/g, ''));
      const pb = parseFloat(String(b.price || '99999').replace(/[^0-9.]/g, ''));
      return pa - pb;
    });
  } else if (sortBy === 'price_desc' || sortBy === 'expensive') {
    filtered.sort((a, b) => {
      const pa = parseFloat(String(a.price || '0').replace(/[^0-9.]/g, ''));
      const pb = parseFloat(String(b.price || '0').replace(/[^0-9.]/g, ''));
      return pb - pa;
    });
  } else if (sortBy === 'rating_desc' || sortBy === 'best_rated') {
    filtered.sort((a, b) => (parseFloat(String(b.rating || '0')) - parseFloat(String(a.rating || '0'))));
  }

  if (context.sessionId && filtered.length > 0) {
    await setLastResults(context.sessionId, widgetId, filtered).catch(() => {});
    await setActiveFilters(context.sessionId, widgetId, { maxPrice, minPrice, entityType, keyword, negative }).catch(() => {});
    await setLastIntent(context.sessionId, widgetId, 'filter_entities').catch(() => {});
    broadcastToSession(context.sessionId, 'voice_results', { results: filtered }).catch(() => {});
    broadcastToSession(context.sessionId, 'entity_cards', { results: filtered }).catch(() => {});
  }

  return {
    ...retrieved,
    tool: 'filter_entities',
    results: filtered,
    sources: filtered.map(r => ({ id: r.id, title: r.title, url: r.sourceUrl })),
    count: filtered.length,
    grounded: filtered.length > 0,
    appliedFilters: { maxPrice, minPrice, entityType, keyword, negative },
    sortedBy: sortBy || undefined,
  };
}

// ── Tool: compare_entities ────────────────────────────────────────────────────

async function toolCompareEntities(
  widgetId: string,
  args: Record<string, any>,
  context: UnifiedToolContext,
  businessName: string
): Promise<UnifiedToolResult> {
  // Accept an array of entity IDs or names
  const ids: string[] = Array.isArray(args.entityIds || args.ids)
    ? (args.entityIds || args.ids)
    : [args.entityId1 || args.id1 || args.first, args.entityId2 || args.id2 || args.second].filter(Boolean);

  if (ids.length < 2) {
    return scopeError('compare_entities', widgetId, 'missing_entities', 'At least 2 entity IDs or names are required for compare_entities.');
  }

  const entityList: StructuredEntity[] = [];
  for (const idOrName of ids.slice(0, 4)) {
    const entity = await getEntityDetails(widgetId, idOrName);
    if (entity) {
      entityList.push(formatResult(entity));
    } else {
      // Try hybrid search fallback
      const r = await runHybridRetrieval(widgetId, idOrName, businessName, { limit: 1 });
      if (r.results.length > 0) entityList.push(r.results[0]);
    }
  }

  if (entityList.length < 2) {
    return {
      success: false,
      tool: 'compare_entities',
      widgetId,
      results: entityList,
      sources: [],
      count: entityList.length,
      freshness: 'unknown',
      confidence: 'unverified',
      grounded: false,
      hedged: false,
      error: `Could only find ${entityList.length} of ${ids.length} requested entities for comparison.`,
    };
  }

  // Build comparison matrix
  const allKeys = new Set<string>(['price', 'rating', 'availability', 'type', 'freshnessStatus']);
  entityList.forEach(e => {
    if (e.price !== undefined) allKeys.add('price');
    if (e.rating !== undefined) allKeys.add('rating');
    if (e.availability !== undefined) allKeys.add('availability');
    if (e.metadata) {
      Object.keys(e.metadata).forEach(k => {
        if (!['images', 'imageUrls', 'confidence', 'similarity'].includes(k)) allKeys.add(k);
      });
    }
  });

  const attributes: Record<string, (string | number | null)[]> = {};
  for (const key of allKeys) {
    attributes[key] = entityList.map(e => {
      if (key === 'price') return e.price ?? null;
      if (key === 'rating') return e.rating ?? null;
      if (key === 'availability') return e.availability ?? null;
      if (key === 'type') return e.type;
      if (key === 'freshnessStatus') return e.freshnessStatus;
      return e.metadata?.[key] ?? null;
    });
  }

  const comparison: EntityComparison = {
    entityIds: entityList.map(e => e.id),
    attributes,
    summary: `Comparing ${entityList.map(e => e.title).join(' vs ')}. Key differences: price (${entityList.map(e => e.price || 'N/A').join(' vs ')}), rating (${entityList.map(e => e.rating ?? 'N/A').join(' vs ')}).`,
  };

  const gm: GroundingMetadata = {
    sourceEntityIds: entityList.map(e => e.id),
    retrievalMethod: 'exact',
    freshness: entityList[0]?.freshnessStatus || 'unknown',
    confidence: 'high',
    grounded: true,
    hasHedge: entityList.some(e => !!e.hedgeInstruction),
    hedgeInstruction: entityList.find(e => e.hedgeInstruction)?.hedgeInstruction,
  };

  if (context.sessionId) {
    broadcastToSession(context.sessionId, 'entity_cards', { results: entityList }).catch(() => {});
  }

  return {
    success: true,
    tool: 'compare_entities',
    widgetId,
    results: entityList,
    sources: entityList.map(e => ({ id: e.id, title: e.title, url: e.sourceUrl })),
    count: entityList.length,
    freshness: gm.freshness,
    confidence: gm.confidence,
    grounded: true,
    hedged: gm.hasHedge,
    hedgeInstruction: gm.hedgeInstruction,
    groundingMetadata: gm,
    comparison,
  };
}

// ── Tool: get_entity_media ────────────────────────────────────────────────────

async function toolGetEntityMedia(
  widgetId: string,
  args: Record<string, any>,
  context: UnifiedToolContext,
  businessName: string
): Promise<UnifiedToolResult> {
  let targetId = String(args.entityId || args.entity_id || args.id || args.query || '').trim();
  if (context.sessionId && (!targetId || targetId === 'it' || targetId === 'this' || targetId === 'that' || targetId === 'first one' || targetId.startsWith('the '))) {
    const session = await getSessionContext(context.sessionId, widgetId);
    if (session?.currentEntity) {
      targetId = session.currentEntity.title || session.currentEntity.id;
    } else if (session?.lastResults && session.lastResults.length > 0) {
      targetId = session.lastResults[0].title || session.lastResults[0].id;
    }
  }

  if (!targetId) {
    return scopeError('get_entity_media', widgetId, 'missing_entity_id', 'entityId is required for get_entity_media.');
  }

  const entity = await getEntityDetails(widgetId, targetId);
  if (!entity) {
    const r = await runHybridRetrieval(widgetId, targetId, businessName, { limit: 1 });
    const top = r.results[0];
    if (!top) {
      return { ...r, tool: 'get_entity_media', count: 0 };
    }
    const formatted = formatResult(top);
    if (context.sessionId) {
      await pinEntity(context.sessionId, widgetId, formatted).catch(() => {});
      broadcastToSession(context.sessionId, 'entity_cards', { results: [formatted] }).catch(() => {});
      broadcastToSession(context.sessionId, 'voice_results', { results: [formatted] }).catch(() => {});
    }
    return {
      ...r,
      tool: 'get_entity_media',
      results: [formatted],
      count: formatted.imageUrls.length,
    };
  }

  const formatted = formatResult(entity);
  if (context.sessionId) {
    await pinEntity(context.sessionId, widgetId, formatted).catch(() => {});
    broadcastToSession(context.sessionId, 'entity_cards', { results: [formatted] }).catch(() => {});
    broadcastToSession(context.sessionId, 'voice_results', { results: [formatted] }).catch(() => {});
  }

  return {
    success: true,
    tool: 'get_entity_media',
    widgetId,
    results: [formatted],
    sources: [{ id: formatted.id, title: formatted.title, url: formatted.sourceUrl }],
    count: formatted.imageUrls.length,
    freshness: formatted.freshnessStatus,
    confidence: 'high',
    grounded: true,
    hedged: !!formatted.hedgeInstruction,
    hedgeInstruction: formatted.hedgeInstruction,
  };
}

// ── Tool: get_page ────────────────────────────────────────────────────────────

async function toolGetPage(
  widgetId: string,
  args: Record<string, any>,
  context: UnifiedToolContext,
  businessName: string
): Promise<UnifiedToolResult> {
  const urlOrSlug = String(args.url || args.slug || args.page || args.query || '').trim();
  if (!urlOrSlug) {
    return scopeError('get_page', widgetId, 'missing_url', 'url or slug is required for get_page.');
  }

  // Retrieve the crawled entity whose source_url matches or search by the slug/term
  const retrieved = await runHybridRetrieval(widgetId, urlOrSlug, businessName, { limit: 1, includeInformational: true });

  return { ...retrieved, tool: 'get_page' };
}

// ── Tool: navigate_to_entity ──────────────────────────────────────────────────

async function toolNavigateToEntity(
  widgetId: string,
  args: Record<string, any>,
  context: UnifiedToolContext,
  businessName: string
): Promise<UnifiedToolResult> {
  const entityId = String(args.target || args.entityId || args.entity_id || args.id || args.url || args.page || args.query || args.slug || '').trim();
  if (!entityId) {
    return scopeError('navigate_to_entity', widgetId, 'missing_entity_id', 'target or entityId is required for navigate_to_entity.');
  }

  if (context.allowAgentNavigation === false) {
    return {
      success: false,
      tool: 'navigate_to_entity',
      widgetId,
      results: [],
      sources: [],
      count: 0,
      freshness: 'unknown',
      confidence: 'unverified',
      grounded: false,
      hedged: false,
      error: 'Agent navigation is disabled in this widget configuration.',
      fallbackText: 'Autonomous page navigation is currently disabled for this assistant.',
    };
  }

  const navResult = await resolveNavigationTarget(widgetId, entityId, {
    sessionId: context.sessionId,
    allowAgentNavigation: context.allowAgentNavigation,
  });

  if (!navResult.canNavigate || !navResult.targetUrl) {
    const errorMsg = navResult.clarificationMessage || navResult.failureReason || `Could not resolve a verified navigation target for "${entityId}".`;
    return {
      success: false,
      tool: 'navigate_to_entity',
      widgetId,
      results: [],
      sources: [],
      count: 0,
      freshness: 'unknown',
      confidence: 'unverified',
      grounded: false,
      hedged: false,
      error: errorMsg,
      fallbackText: errorMsg,
    };
  }

  const sessionId = context.sessionId || '';
  const finalUrl = navResult.targetUrl;
  const pageTitle = navResult.resolvedEntity?.title || navResult.resolvedPageTitle || navResult.pageTitle || entityId;

  if (sessionId) {
    await setLastNavigation(sessionId, widgetId, finalUrl).catch(() => {});
    await setLastIntent(sessionId, widgetId, 'navigate_to_entity').catch(() => {});
    await broadcastToSession(sessionId, 'navigate', {
      url: finalUrl,
      entityId: navResult.resolvedEntity?.id,
      title: pageTitle,
      source: navResult.source || 'discovered_page',
    });
  }

  const results = navResult.resolvedEntity ? [navResult.resolvedEntity] : [];
  const sources = [{
    id: navResult.resolvedEntity?.id || 'nav-target',
    title: pageTitle,
    url: finalUrl,
  }];

  return {
    success: true,
    tool: 'navigate_to_entity',
    widgetId,
    results,
    sources,
    count: 1,
    freshness: navResult.resolvedEntity?.freshnessStatus || 'fresh',
    confidence: navResult.confidence === 'exact' ? 'high' : 'medium',
    grounded: true,
    hedged: !!navResult.resolvedEntity?.hedgeInstruction,
    hedgeInstruction: navResult.resolvedEntity?.hedgeInstruction,
  };
}

// ── Unified Tool Definitions (for Retell, Vapi, and Chat function-calling) ────

export const UNIFIED_TOOL_DEFINITIONS = {
  search_knowledge: {
    name: 'search_knowledge',
    description: 'Search the website knowledge base for items, vehicles, courses, products, services, or FAQs. Returns matching entities with structured metadata, pricing, images, and freshness tracking.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term, product name, service, or customer inquiry.' },
        limit: { type: 'number', description: 'Max results (default: 5, max: 10).' },
      },
      required: ['query'],
    },
  },
  get_entity: {
    name: 'get_entity',
    description: 'Retrieve full specifications, pricing, availability, freshness, and hedging flags for a specific entity by ID or name.',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'UUID or name of the entity to retrieve.' },
      },
      required: ['entityId'],
    },
  },
  filter_entities: {
    name: 'filter_entities',
    description: 'Filter and sort the catalog by type, price range, attributes, or keyword. Returns structured JSON results.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional keyword to narrow category.' },
        type: { type: 'string', description: 'Entity type filter (e.g. vehicle, course, product).' },
        maxPrice: { type: 'number', description: 'Maximum price constraint.' },
        minPrice: { type: 'number', description: 'Minimum price constraint.' },
        exclude: { type: 'string', description: 'Exclude items containing this term (e.g. "electric").' },
        sort: { type: 'string', description: 'Sort order: price_asc | price_desc | rating_desc.' },
        limit: { type: 'number', description: 'Max results (default: 5).' },
      },
      required: [],
    },
  },
  compare_entities: {
    name: 'compare_entities',
    description: 'Compare 2–4 entities side by side. Returns structured attribute comparison matrix.',
    parameters: {
      type: 'object',
      properties: {
        entityIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of entity IDs or names to compare.',
        },
        entityId1: { type: 'string', description: 'First entity ID or name (alternative to entityIds array).' },
        entityId2: { type: 'string', description: 'Second entity ID or name.' },
      },
      required: [],
    },
  },
  get_entity_media: {
    name: 'get_entity_media',
    description: 'Retrieve images and media for a specific entity.',
    parameters: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'UUID or name of the entity.' },
      },
      required: ['entityId'],
    },
  },
  get_page: {
    name: 'get_page',
    description: 'Retrieve crawled page content by URL or slug.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL or slug of the page to retrieve.' },
      },
      required: ['url'],
    },
  },
  navigate_to_entity: {
    name: 'navigate_to_entity',
    description: 'Navigate the visitor browser to a verified web page, section, or specific offering/entity on the connected website.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Page name, section, slug, URL, or entity name/ID to navigate to.' },
        entityId: { type: 'string', description: 'Optional entity ID or title.' },
        url: { type: 'string', description: 'Optional specific page URL or slug.' },
      },
    },
  },
};

// ── Config Builders for Retell and Vapi ───────────────────────────────────────

export function getUnifiedRetellToolsConfig(
  webhookBaseUrl: string,
  options?: { allowAgentNavigation?: boolean }
) {
  const baseTools = [
    'search_knowledge', 'get_entity', 'filter_entities',
    'compare_entities', 'get_entity_media', 'get_page',
  ] as const;

  const tools: any[] = baseTools.map(name => ({
    name,
    description: UNIFIED_TOOL_DEFINITIONS[name].description,
    url: `${webhookBaseUrl}/api/agent/tools`,
    parameters: UNIFIED_TOOL_DEFINITIONS[name].parameters,
  }));

  if (options?.allowAgentNavigation) {
    tools.push({
      name: 'navigate_to_entity',
      description: UNIFIED_TOOL_DEFINITIONS.navigate_to_entity.description,
      url: `${webhookBaseUrl}/api/agent/tools`,
      parameters: UNIFIED_TOOL_DEFINITIONS.navigate_to_entity.parameters,
    });
  }

  return tools;
}

export function getUnifiedVapiToolsConfig(options?: { allowAgentNavigation?: boolean }) {
  const baseTools = [
    'search_knowledge', 'get_entity', 'filter_entities',
    'compare_entities', 'get_entity_media', 'get_page',
  ] as const;

  const tools: any[] = baseTools.map(name => ({
    type: 'function',
    function: {
      name,
      description: UNIFIED_TOOL_DEFINITIONS[name].description,
      parameters: UNIFIED_TOOL_DEFINITIONS[name].parameters,
    },
  }));

  if (options?.allowAgentNavigation) {
    tools.push({
      type: 'function',
      function: {
        name: 'navigate_to_entity',
        description: UNIFIED_TOOL_DEFINITIONS.navigate_to_entity.description,
        parameters: UNIFIED_TOOL_DEFINITIONS.navigate_to_entity.parameters,
      },
    });
  }

  return tools;
}
