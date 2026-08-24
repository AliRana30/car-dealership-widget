import { createClient } from '@supabase/supabase-js';
import { embedText } from '@/lib/embeddings';
import { Entity } from '@/lib/crawler/types';
import { broadcastToSession } from '@/lib/realtime/session';
import { resolveEntityByQuery, resolveTopEntity } from './entityResolver';
import { hybridRetrieve } from '@/lib/retrieval/hybridRag';
import { executeUnifiedTool, normalizeToolName, sanitizeAndRankImages, type UnifiedToolContext } from './unifiedTools';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error('[agents/tools] Missing Supabase credentials in environment.');
  }
  return createClient(url, key);
}

/**
 * Appends the widget_resume session token query parameter to a target URL
 */
export function appendResumeParam(rawUrl: string, sessionId?: string): string {
  if (!sessionId) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.set('widget_resume', sessionId);
    return parsed.toString();
  } catch {
    const separator = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${separator}widget_resume=${encodeURIComponent(sessionId)}`;
  }
}

export interface FreshnessInfo {
  freshnessStatus: 'fresh' | 'recent' | 'stale_or_unlisted';
  hoursSinceLastSeen: number;
  lastSeenHuman: string;
  hedgeInstruction?: string;
  isConnectorBacked?: boolean;
  dataSource?: 'connector' | 'crawl' | 'manual' | 'unknown';
}

/**
 * Evaluates entity catalog freshness based on last_seen timestamp, still_listed flag,
 * and data source (live API/feed connector vs web crawler).
 *
 * - Live Connector Feeds:
 *   - Under 24 hours: "fresh" (authoritative live inventory)
 *   - 24 to 72 hours: "recent" (light hedge)
 *   - Beyond 72 hours or unlisted: "stale_or_unlisted" (must not guarantee availability)
 *
 * - Web Crawler Scans:
 *   - Under 6 hours old: "fresh" (normal confident statements)
 *   - Between 6 and 24 hours: "recent" (light hedge)
 *   - Beyond 24 hours or unlisted: "stale_or_unlisted" (must not guarantee availability)
 */
export function calculateFreshness(
  lastSeen?: string,
  stillListed?: boolean,
  dataType?: string,
  source?: string
): FreshnessInfo {
  const isConnector =
    dataType === 'api' ||
    dataType === 'feed' ||
    dataType === 'direct' ||
    source === 'connector' ||
    source === 'api' ||
    source === 'feed';

  const dataSource: FreshnessInfo['dataSource'] = isConnector
    ? 'connector'
    : dataType === 'crawl'
    ? 'crawl'
    : 'unknown';

  // 1. Unlisted / Removed items are always stale_or_unlisted
  if (stillListed === false) {
    return {
      freshnessStatus: 'stale_or_unlisted',
      hoursSinceLastSeen: 999,
      lastSeenHuman: 'Missing / unlisted from catalog',
      hedgeInstruction:
        'HEDGING REQUIRED: Item is currently unlisted from the website/catalog. Do NOT state availability as guaranteed fact; advise customer to confirm availability with staff.',
      isConnectorBacked: isConnector,
      dataSource,
    };
  }

  const timestamp = lastSeen ? new Date(lastSeen).getTime() : Date.now();
  const diffMs = Math.max(0, Date.now() - timestamp);
  const hours = diffMs / (1000 * 60 * 60);

  // 2. Connector-backed live inventory (Authoritative System of Record)
  if (isConnector) {
    if (hours <= 24) {
      return {
        freshnessStatus: 'fresh',
        hoursSinceLastSeen: Math.round(hours * 10) / 10,
        lastSeenHuman: hours < 1 ? 'Just now (Live Connector)' : `${Math.round(hours)}h ago (Live Connector)`,
        isConnectorBacked: true,
        dataSource: 'connector',
      };
    }

    if (hours <= 72) {
      return {
        freshnessStatus: 'recent',
        hoursSinceLastSeen: Math.round(hours * 10) / 10,
        lastSeenHuman: `${Math.round(hours)}h ago (Live Connector)`,
        hedgeInstruction: 'LIGHT HEDGING: Information was synced via inventory connector within the past 3 days.',
        isConnectorBacked: true,
        dataSource: 'connector',
      };
    }

    const days = Math.round(hours / 24);
    return {
      freshnessStatus: 'stale_or_unlisted',
      hoursSinceLastSeen: Math.round(hours * 10) / 10,
      lastSeenHuman: `${days}d ago (Connector)`,
      hedgeInstruction:
        'HEDGING REQUIRED: Connector sync is stale (>3 days). Do NOT guarantee current availability or pricing; direct customer to confirm with staff.',
      isConnectorBacked: true,
      dataSource: 'connector',
    };
  }

  // 3. Web crawler data
  if (hours < 6) {
    return {
      freshnessStatus: 'fresh',
      hoursSinceLastSeen: Math.round(hours * 10) / 10,
      lastSeenHuman: hours < 1 ? 'Just now' : `${Math.round(hours)}h ago`,
      isConnectorBacked: false,
      dataSource: 'crawl',
    };
  }

  if (hours <= 24) {
    return {
      freshnessStatus: 'recent',
      hoursSinceLastSeen: Math.round(hours * 10) / 10,
      lastSeenHuman: `${Math.round(hours)}h ago`,
      hedgeInstruction: 'LIGHT HEDGING: Information was updated within the past 24 hours. Use phrasing like "As of our recent website check...".',
      isConnectorBacked: false,
      dataSource: 'crawl',
    };
  }

  const days = Math.round(hours / 24);
  return {
    freshnessStatus: 'stale_or_unlisted',
    hoursSinceLastSeen: Math.round(hours * 10) / 10,
    lastSeenHuman: `${days}d ago`,
    hedgeInstruction:
      'HEDGING REQUIRED: Data is stale (>24h since crawl). You MUST NOT guarantee current availability or pricing. Explicitly advise visitor to confirm with staff.',
    isConnectorBacked: false,
    dataSource: 'crawl',
  };
}

/**
 * Maps raw database row from website_data into the full standardized Entity shape.
 */
export function mapRowToEntity(row: any): Entity {
  const meta = (row.metadata || {}) as Record<string, any>;
  const imageUrls = Array.isArray(row.image_urls) && row.image_urls.length > 0
    ? row.image_urls
    : meta.images && Array.isArray(meta.images) && meta.images.length > 0
    ? meta.images
    : meta.image
    ? [String(meta.image)]
    : [];

  const firstSeen = row.first_seen || meta.first_seen || meta.firstSeen || row.created_at || new Date().toISOString();
  const lastSeen = row.last_seen || meta.last_seen || meta.lastSeen || row.updated_at || row.last_checked_at || row.created_at || new Date().toISOString();
  const stillListed = row.still_listed !== undefined && row.still_listed !== null
    ? Boolean(row.still_listed)
    : meta.still_listed !== undefined && meta.still_listed !== null
    ? Boolean(meta.still_listed)
    : meta.stillListed !== undefined && meta.stillListed !== null
    ? Boolean(meta.stillListed)
    : true;
  const freshness = calculateFreshness(
    lastSeen,
    stillListed,
    row.data_type || row.dataType || meta.dataType || meta.data_type,
    meta.source || meta.discoveryMethod
  );

  return {
    id: row.id || '',
    widgetId: row.widget_id || '',
    title: row.title || 'Untitled',
    shortDescription: row.short_description || row.content?.substring(0, 300) || '',
    imageUrls,
    images: imageUrls,
    price: meta.price || row.price,
    currency: meta.currency || row.currency || 'USD',
    rating: meta.rating || meta.ratings || row.rating,
    reviews: meta.reviews || row.reviews,
    availability: meta.availability || row.availability,
    sourceUrl: row.source_url || undefined,
    entityType: row.entity_type || 'text',
    metadata: {
      ...meta,
      firstSeen,
      lastSeen,
      stillListed,
      freshnessStatus: freshness.freshnessStatus,
      lastSeenHuman: freshness.lastSeenHuman,
      ...(freshness.hedgeInstruction ? { hedgeInstruction: freshness.hedgeInstruction } : {}),
    },
    firstSeen,
    lastSeen,
    stillListed,
    freshnessStatus: freshness.freshnessStatus,
    dataType: (row.data_type as any) || 'crawl',
    categoryPath: Array.isArray(row.category_path) ? row.category_path : [],
    contentHash: row.content_hash || undefined,
    lastCheckedAt: row.last_checked_at || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  } as any;
}

/**
 * Searches the knowledge base using the unified Hybrid RAG pipeline.
 * Now routes through hybridRetrieve (same pipeline as Chat) instead of
 * the entityResolver-only path, ensuring identical ranking across all platforms.
 *
 * @deprecated Prefer executeUnifiedTool('search_knowledge', ...) for new code.
 */
export async function searchEntities(
  widgetId: string,
  query: string,
  limit: number = 3
): Promise<Entity[]> {
  if (!query || !query.trim() || !widgetId || !widgetId.trim()) {
    console.warn('[tools:SCOPE_ENFORCEMENT] searchEntities called with missing widgetId or query. Failing closed.');
    return [];
  }

  try {
    const hybridOutput = await hybridRetrieve(widgetId.trim(), query, { limit });
    const results = hybridOutput.results || [];

    return results.map((r, idx) => {
      const images: string[] = Array.isArray(r.imageUrls) && r.imageUrls.length > 0
        ? r.imageUrls
        : Array.isArray(r.images) ? r.images : [];
      const freshInfo = calculateFreshness(r.lastSeen, r.stillListed);

      return {
        id: r.id || `${widgetId}-item-${idx}`,
        widgetId,
        title: r.title || 'Untitled',
        shortDescription: r.shortDescription || r.description || '',
        imageUrls: images,
        images,
        price: r.price ?? r.metadata?.price,
        currency: r.currency ?? r.metadata?.currency,
        rating: r.rating ?? r.metadata?.rating,
        reviews: r.reviews ?? r.metadata?.reviews,
        availability: r.availability ?? r.metadata?.availability,
        sourceUrl: r.sourceUrl,
        entityType: r.entityType || 'product',
        metadata: {
          ...r.metadata,
          freshnessStatus: freshInfo.freshnessStatus,
          lastSeenHuman: freshInfo.lastSeenHuman,
          ...(freshInfo.hedgeInstruction ? { hedgeInstruction: freshInfo.hedgeInstruction } : {}),
          similarity: (r as any).similarity ?? r.metadata?.similarity,
        },
        similarity: (r as any).similarity ?? r.metadata?.similarity,
        firstSeen: r.firstSeen || new Date().toISOString(),
        lastSeen: r.lastSeen || new Date().toISOString(),
        stillListed: r.stillListed ?? true,
        freshnessStatus: freshInfo.freshnessStatus,
        dataType: 'crawl',
        categoryPath: (r as any).categoryPath || [],
        createdAt: r.firstSeen || new Date().toISOString(),
        updatedAt: r.lastSeen || new Date().toISOString(),
      } as any;
    });
  } catch (err) {
    console.error('[searchEntities] Error in hybridRetrieve:', err);
    return [];
  }
}

/**
 * Retrieves full details for a single entity by ID or title alias, strictly scoped to the widget.
 */
export async function getEntityDetails(
  widgetId: string,
  entityId: string
): Promise<Entity | null> {
  if (!entityId || typeof entityId !== 'string' || !entityId.trim() || !widgetId || typeof widgetId !== 'string' || !widgetId.trim()) {
    console.warn('[tools:SCOPE_ENFORCEMENT] getEntityDetails called with missing widgetId or entityId. Failing closed.');
    return null;
  }

  const { getWidget, isValidUuid } = await import('@/config/widgetsDb');
  const widget = await getWidget(widgetId.trim());
  if (!widget) {
    console.warn(`[tools:SCOPE_ENFORCEMENT] getEntityDetails: Widget not found for '${widgetId}'. Failing closed.`);
    return null;
  }

  const allowedIds = new Set<string>();
  if (widget.id && isValidUuid(widget.id)) allowedIds.add(widget.id);
  if (widget.websiteId && isValidUuid(widget.websiteId)) allowedIds.add(widget.websiteId);
  if (widget.widgetId && isValidUuid(widget.widgetId)) allowedIds.add(widget.widgetId);

  const filterIds = Array.from(allowedIds).filter(
    (id) => id !== '00000000-0000-0000-0000-000000000000'
  );

  if (filterIds.length === 0) {
    console.warn(`[tools:SCOPE_ENFORCEMENT] getEntityDetails: No valid UUIDs for widget '${widgetId}'. Failing closed.`);
    return null;
  }

  const supabase = getSupabase();
  const cleanKey = entityId.trim();

  // 1. Try exact UUID match strictly scoped to widget
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanKey)) {
    const { data: row } = await supabase
      .from('website_data')
      .select('*')
      .eq('id', cleanKey)
      .in('widget_id', filterIds)
      .maybeSingle();

    if (row) return mapRowToEntity(row);

    // If row exists in website_data but belongs to another widget, fail closed!
    const { data: foreignCheck } = await supabase
      .from('website_data')
      .select('id, widget_id')
      .eq('id', cleanKey)
      .maybeSingle();

    if (foreignCheck) {
      console.warn(`[tools:SCOPE_ENFORCEMENT] Cross-tenant access blocked: entity '${cleanKey}' belongs to '${foreignCheck.widget_id}', not '${widgetId}'.`);
      return null;
    }
  }

  // 2. Try 4-tier universal entity resolver (exact/partial/fuzzy/semantic)
  const resolved = await resolveTopEntity(widgetId, cleanKey);
  if (resolved?.record) {
    const r = resolved.record;
    const images = sanitizeAndRankImages(r.imageUrls || r.images || (r as any).image_urls || r.metadata?.images || r.metadata?.imageUrls || r.metadata?.image);
    const originalPrice = (r as any).originalPrice ?? (r as any).original_price ?? r.metadata?.originalPrice ?? r.metadata?.original_price ?? r.metadata?.compareAtPrice ?? r.metadata?.msrp;
    return {
      id: r.id || resolved.entityId,
      widgetId,
      title: r.title || resolved.title,
      shortDescription: r.description || r.shortDescription || '',
      imageUrls: images,
      images,
      price: r.price ?? (r.metadata?.price as string | undefined),
      originalPrice,
      original_price: originalPrice,
      currency: r.currency ?? (r.metadata?.currency as string | undefined),
      rating: r.rating ?? (r.metadata?.rating as number | undefined),
      reviews: r.reviews ?? (r.metadata?.reviews as number | undefined),
      availability: r.availability ?? (r.metadata?.availability as string | undefined),
      sourceUrl: r.sourceUrl,
      entityType: r.entityType || 'product',
      metadata: {
        price: r.price ?? (r.metadata?.price as string | undefined),
        originalPrice,
        currency: r.currency ?? (r.metadata?.currency as string | undefined),
        rating: r.rating ?? (r.metadata?.rating as number | undefined),
        reviews: r.reviews ?? (r.metadata?.reviews as number | undefined),
        images,
        attributes: r.attributes,
        confidence: resolved.confidence,
      },
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      stillListed: true,
      freshnessStatus: 'fresh',
      dataType: 'crawl',
      categoryPath: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;
  }

  return null;
}

// ── Callable Tool Definitions for Retell AI and Vapi AI ──────────────────────

export const AGENT_TOOL_DEFINITIONS = {
  search_entities: {
    name: 'search_entities',
    description: 'Search the website knowledge base for items, vehicles, offerings, products, services, or FAQs. Returns matching entities with structured metadata, pricing, images, and catalog freshness tracking (firstSeen, lastSeen, stillListed, freshnessStatus).',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The specific search term, product name, service, or customer inquiry question.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of items to return (default: 3, max: 10).',
        },
      },
      required: ['query'],
    },
  },
  get_entity_details: {
    name: 'get_entity_details',
    description: 'Retrieve complete real-time specifications, pricing, availability, and catalog freshness verification (firstSeen, lastSeen, stillListed, freshnessStatus, hedgeInstruction) for a specific entity ID before quoting specifics.',
    parameters: {
      type: 'object',
      properties: {
        entityId: {
          type: 'string',
          description: 'The UUID of the entity or product to inspect.',
        },
      },
      required: ['entityId'],
    },
  },
  navigate_to_entity: {
    name: 'navigate_to_entity',
    description: 'Navigate the visitor\'s browser directly to the full web page or listing for a specific entity. Only call this when the visitor explicitly asks to see/open the full page, or when the inline card details are insufficient.',
    parameters: {
      type: 'object',
      properties: {
        entityId: {
          type: 'string',
          description: 'The UUID of the entity whose page should be opened in the visitor\'s browser.',
        },
      },
      required: ['entityId'],
    },
  },
};

/**
 * Retell AI Tool Format (Conditionally registers navigate_to_entity based on allowAgentNavigation)
 */
export function getRetellToolsConfig(
  webhookBaseUrl: string,
  options?: { allowAgentNavigation?: boolean }
) {
  const tools = [
    {
      name: 'search_entities',
      description: AGENT_TOOL_DEFINITIONS.search_entities.description,
      url: `${webhookBaseUrl}/api/agent/tools`,
      parameters: AGENT_TOOL_DEFINITIONS.search_entities.parameters,
    },
    {
      name: 'get_entity_details',
      description: AGENT_TOOL_DEFINITIONS.get_entity_details.description,
      url: `${webhookBaseUrl}/api/agent/tools`,
      parameters: AGENT_TOOL_DEFINITIONS.get_entity_details.parameters,
    },
  ];

  if (options?.allowAgentNavigation) {
    tools.push({
      name: 'navigate_to_entity',
      description: AGENT_TOOL_DEFINITIONS.navigate_to_entity.description,
      url: `${webhookBaseUrl}/api/agent/tools`,
      parameters: AGENT_TOOL_DEFINITIONS.navigate_to_entity.parameters,
    });
  }

  return tools;
}

/**
 * Vapi AI Tool / Function Format (Conditionally registers navigate_to_entity based on allowAgentNavigation)
 */
export function getVapiToolsConfig(options?: { allowAgentNavigation?: boolean }) {
  const tools: any[] = [
    {
      type: 'function',
      function: {
        name: 'search_entities',
        description: AGENT_TOOL_DEFINITIONS.search_entities.description,
        parameters: AGENT_TOOL_DEFINITIONS.search_entities.parameters,
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_entity_details',
        description: AGENT_TOOL_DEFINITIONS.get_entity_details.description,
        parameters: AGENT_TOOL_DEFINITIONS.get_entity_details.parameters,
      },
    },
  ];

  if (options?.allowAgentNavigation) {
    tools.push({
      type: 'function',
      function: {
        name: 'navigate_to_entity',
        description: AGENT_TOOL_DEFINITIONS.navigate_to_entity.description,
        parameters: AGENT_TOOL_DEFINITIONS.navigate_to_entity.parameters,
      },
    });
  }

  return tools;
}

export interface ToolExecutionContext {
  sessionId?: string;
  allowAgentNavigation?: boolean;
  businessName?: string;
}

/**
 * Central tool execution dispatcher.
 * Delegates to executeUnifiedTool so that Chat, Retell, and Vapi
 * all share the same retrieval pipeline, grounding rules, and freshness logic.
 *
 * Backward compatibility: search_entities, get_entity_details, navigate_to_entity
 * are all preserved via normalizeToolName in unifiedTools.ts.
 */
export async function executeAgentTool(
  widgetId: string,
  toolName: string,
  args: Record<string, any>,
  context?: ToolExecutionContext
): Promise<{ success: boolean; data?: any; error?: string }> {
  const ctx: UnifiedToolContext = {
    sessionId: context?.sessionId,
    allowAgentNavigation: context?.allowAgentNavigation,
    businessName: context?.businessName,
  };

  const result = await executeUnifiedTool(widgetId, toolName, args, ctx);

  // Flatten to legacy { success, data, error } shape for backward compat
  if (!result.success) {
    return { success: false, error: result.error || 'Tool execution failed' };
  }

  // For navigate_to_entity return the navigation URL as the data payload
  if (normalizeToolName(toolName) === 'navigate_to_entity') {
    const r = result.results[0];
    return {
      success: true,
      data: {
        message: r ? `Navigated to ${r.title}.` : 'Navigation dispatched.',
        url: result.sources[0]?.url,
        entityId: r?.id,
        title: r?.title,
      },
    };
  }

  // For single-entity tools return the entity with freshness and hedging metadata
  if (['get_entity', 'get_entity_details'].includes(normalizeToolName(toolName))) {
    const entity = result.results[0] || null;
    return {
      success: true,
      data: {
        ...(entity || {}),
        entity,
        freshness: result.freshness,
        confidence: result.confidence,
        grounded: result.grounded,
        hedged: result.hedged,
        hedgeInstruction: result.hedgeInstruction,
        groundingMetadata: result.groundingMetadata,
        timings: result.timings,
      },
    };
  }

  // For search/filter/compare return the full structured payload
  return {
    success: true,
    data: {
      count: result.count,
      results: result.results,
      entities: result.results,
      freshness: result.freshness,
      confidence: result.confidence,
      grounded: result.grounded,
      hedged: result.hedged,
      hedgeInstruction: result.hedgeInstruction,
      comparison: result.comparison,
      appliedFilters: result.appliedFilters,
      sortedBy: result.sortedBy,
      timings: result.timings,
    },
  };
}
