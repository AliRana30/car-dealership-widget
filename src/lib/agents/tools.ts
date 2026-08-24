import { createClient } from '@supabase/supabase-js';
import { embedText } from '@/lib/embeddings';
import { Entity } from '@/lib/crawler/types';
import { broadcastToSession } from '@/lib/realtime/session';
import { resolveEntityByQuery, resolveTopEntity } from './entityResolver';

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
}

/**
 * Evaluates entity catalog freshness based on last_seen timestamp and still_listed flag.
 * - Under 6 hours old: "fresh" (normal confident statements)
 * - Between 6 and 24 hours: "recent" (light hedge)
 * - Beyond 24 hours or still_listed === false: "stale_or_unlisted" (must not guarantee availability, direct to staff)
 */
export function calculateFreshness(lastSeen?: string, stillListed?: boolean): FreshnessInfo {
  if (stillListed === false) {
    return {
      freshnessStatus: 'stale_or_unlisted',
      hoursSinceLastSeen: 999,
      lastSeenHuman: 'Missing from latest site scan',
      hedgeInstruction: 'Do NOT state availability as fact. Item was absent from latest site check; advise visitor to confirm availability with staff.',
    };
  }

  const timestamp = lastSeen ? new Date(lastSeen).getTime() : Date.now();
  const diffMs = Math.max(0, Date.now() - timestamp);
  const hours = diffMs / (1000 * 60 * 60);

  if (hours < 6) {
    return {
      freshnessStatus: 'fresh',
      hoursSinceLastSeen: Math.round(hours * 10) / 10,
      lastSeenHuman: hours < 1 ? 'Just now' : `${Math.round(hours)}h ago`,
    };
  }

  if (hours <= 24) {
    return {
      freshnessStatus: 'recent',
      hoursSinceLastSeen: Math.round(hours * 10) / 10,
      lastSeenHuman: `${Math.round(hours)}h ago`,
      hedgeInstruction: 'Hedge lightly (e.g. "As of our last check...").',
    };
  }

  const days = Math.round(hours / 24);
  return {
    freshnessStatus: 'stale_or_unlisted',
    hoursSinceLastSeen: Math.round(hours * 10) / 10,
    lastSeenHuman: `${days}d ago`,
    hedgeInstruction: 'Do NOT guarantee current availability. Direct visitor to confirm with staff.',
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
  const freshness = calculateFreshness(lastSeen, stillListed);

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
 * Searches the knowledge base for a specific widget using 4-tier universal entity resolution:
 * 1. Exact title match
 * 2. Partial/alias match
 * 3. Fuzzy token match (Levenshtein ≤ 2)
 * 4. Broad semantic match
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
    const resolvedEntities = await resolveEntityByQuery(widgetId.trim(), query, limit);
    if (resolvedEntities && resolvedEntities.length > 0) {
      return resolvedEntities.slice(0, limit).map((re, idx) => {
        const r = re.record;
        const images = Array.isArray(r.imageUrls) && r.imageUrls.length > 0
          ? r.imageUrls
          : Array.isArray(r.images) ? r.images : [];

        return {
          id: r.id || re.entityId || `${widgetId}-item-${idx}`,
          widgetId,
          title: r.title || re.title || 'Untitled',
          shortDescription: r.description || r.shortDescription || '',
          imageUrls: images,
          images,
          price: r.price ?? (r.metadata?.price as string | undefined),
          currency: r.currency ?? (r.metadata?.currency as string | undefined),
          rating: r.rating ?? (r.metadata?.rating as number | undefined),
          reviews: r.reviews ?? (r.metadata?.reviews as number | undefined),
          availability: r.availability ?? (r.metadata?.availability as string | undefined),
          sourceUrl: r.sourceUrl,
          entityType: r.entityType || 'product',
          metadata: {
            price: r.price ?? (r.metadata?.price as string | undefined),
            currency: r.currency ?? (r.metadata?.currency as string | undefined),
            rating: r.rating ?? (r.metadata?.rating as number | undefined),
            reviews: r.reviews ?? (r.metadata?.reviews as number | undefined),
            images,
            attributes: r.attributes,
            confidence: re.confidence,
            similarity: r.similarity ?? r.metadata?.similarity,
            freshnessStatus: r.freshnessStatus ?? r.metadata?.freshnessStatus ?? 'fresh',
          },
          similarity: r.similarity ?? r.metadata?.similarity,
          firstSeen: r.firstSeen ?? r.metadata?.firstSeen ?? new Date().toISOString(),
          lastSeen: r.lastSeen ?? r.metadata?.lastSeen ?? new Date().toISOString(),
          stillListed: r.metadata?.stillListed !== false,
          freshnessStatus: r.freshnessStatus ?? r.metadata?.freshnessStatus ?? 'fresh',
          dataType: 'crawl',
          categoryPath: [],
          createdAt: r.firstSeen ?? r.metadata?.firstSeen ?? new Date().toISOString(),
          updatedAt: r.lastSeen ?? r.metadata?.lastSeen ?? new Date().toISOString(),
        } as any;
      });
    }
  } catch (err) {
    console.error('[searchEntities] Error:', err);
  }

  return [];
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
    const images = Array.isArray(r.imageUrls) && r.imageUrls.length > 0 ? r.imageUrls : (r.images || []);
    return {
      id: r.id || resolved.entityId,
      widgetId,
      title: r.title || resolved.title,
      shortDescription: r.description || r.shortDescription || '',
      imageUrls: images,
      images,
      price: r.price ?? (r.metadata?.price as string | undefined),
      currency: r.currency ?? (r.metadata?.currency as string | undefined),
      rating: r.rating ?? (r.metadata?.rating as number | undefined),
      reviews: r.reviews ?? (r.metadata?.reviews as number | undefined),
      availability: r.availability ?? (r.metadata?.availability as string | undefined),
      sourceUrl: r.sourceUrl,
      entityType: r.entityType || 'product',
      metadata: {
        price: r.price ?? (r.metadata?.price as string | undefined),
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
}

/**
 * Central tool execution dispatcher.
 */
export async function executeAgentTool(
  widgetId: string,
  toolName: string,
  args: Record<string, any>,
  context?: ToolExecutionContext
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (toolName === 'search_entities') {
      const query = String(args.query || args.search || args.q || args.keyword || args.input || '');
      const limit = typeof args.limit === 'number' ? Math.min(Math.max(1, args.limit), 10) : 3;
      const entities = await searchEntities(widgetId, query, limit);

      const formattedResults = entities.map(e => {
        const anyE = e as any;
        const freshInfo = calculateFreshness(e.lastSeen, e.stillListed);
        const item: Record<string, any> = {
          id: e.id,
          title: e.title,
          type: e.entityType,
          description: e.shortDescription,
          imageUrls: e.imageUrls || anyE.images || [],
          images: e.imageUrls || anyE.images || [],
          canonicalUrl: e.sourceUrl,
          sourceUrl: e.sourceUrl,
          firstSeen: e.firstSeen,
          lastSeen: e.lastSeen,
          stillListed: e.stillListed,
          freshnessStatus: e.freshnessStatus || freshInfo.freshnessStatus,
          lastSeenHuman: (e.metadata as any)?.lastSeenHuman || freshInfo.lastSeenHuman,
          hedgeInstruction: (e.metadata as any)?.hedgeInstruction || freshInfo.hedgeInstruction,
          similarity: anyE.similarity ?? e.metadata?.similarity,
          metadata: e.metadata,
        };
        const price = anyE.price ?? anyE.metadata?.price;
        const currency = anyE.currency ?? anyE.metadata?.currency;
        const rating = anyE.rating ?? anyE.metadata?.rating;
        const availability = anyE.availability ?? anyE.metadata?.availability;
        if (price !== undefined) item.price = price;
        if (currency !== undefined) item.currency = currency;
        if (rating !== undefined) item.rating = rating;
        if (availability !== undefined) item.availability = availability;
        if (item.similarity !== undefined) item.similarity = Number(Number(item.similarity).toFixed(4));
        return item;
      });

      // Broadcast cards to widget during voice call if session context exists
      if (context?.sessionId && formattedResults.length > 0) {
        broadcastToSession(context.sessionId, 'voice_results', { results: formattedResults }).catch(() => {});
        broadcastToSession(context.sessionId, 'entity_cards', { results: formattedResults }).catch(() => {});
      }

      return {
        success: true,
        data: {
          count: entities.length,
          query,
          results: formattedResults,
          entities: formattedResults,
        },
      };
    }

    if (toolName === 'get_entity_details') {
      const entityId = String(args.entityId || args.entity_id || args.id || '');
      const entity = await getEntityDetails(widgetId, entityId);
      if (!entity) {
        return { success: false, error: `Entity '${entityId}' not found for this widget.` };
      }

      const anyEntity = entity as any;
      const formattedEntity: Record<string, any> = {
        id: entity.id,
        title: entity.title,
        type: entity.entityType,
        description: entity.shortDescription,
        imageUrls: entity.imageUrls || anyEntity.images || [],
        images: entity.imageUrls || anyEntity.images || [],
        canonicalUrl: entity.sourceUrl,
        sourceUrl: entity.sourceUrl,
        categoryPath: entity.categoryPath,
        firstSeen: entity.firstSeen,
        lastSeen: entity.lastSeen,
        stillListed: entity.stillListed,
        freshnessStatus: entity.freshnessStatus,
        lastSeenHuman: (entity.metadata as any)?.lastSeenHuman,
        hedgeInstruction: (entity.metadata as any)?.hedgeInstruction,
        metadata: entity.metadata,
      };
      const price = anyEntity.price ?? anyEntity.metadata?.price;
      const currency = anyEntity.currency ?? anyEntity.metadata?.currency;
      const rating = anyEntity.rating ?? anyEntity.metadata?.rating;
      const availability = anyEntity.availability ?? anyEntity.metadata?.availability;
      if (price !== undefined) formattedEntity.price = price;
      if (currency !== undefined) formattedEntity.currency = currency;
      if (rating !== undefined) formattedEntity.rating = rating;
      if (availability !== undefined) formattedEntity.availability = availability;

      if (context?.sessionId) {
        broadcastToSession(context.sessionId, 'voice_results', { results: [formattedEntity] }).catch(() => {});
        broadcastToSession(context.sessionId, 'entity_cards', { results: [formattedEntity] }).catch(() => {});
      }

      return {
        success: true,
        data: formattedEntity,
      };
    }

    if (toolName === 'navigate_to_entity') {
      const entityId = String(args.entityId || args.entity_id || args.id || args.target || args.url || args.page || args.query || '').trim();
      if (!entityId) {
        return { success: false, error: 'Missing required argument: entityId' };
      }

      if (context?.allowAgentNavigation === false) {
        return {
          success: false,
          error: 'Agent navigation is disabled in this widget\'s configuration. Please describe the item using inline card information instead.',
        };
      }

      const entity = await getEntityDetails(widgetId, entityId);
      if (!entity) {
        return { success: false, error: `Entity '${entityId}' not found for this widget.` };
      }

      if (!entity.sourceUrl || !entity.sourceUrl.trim()) {
        return {
          success: false,
          error: 'Entity does not have a valid web page URL. Please describe the item to the visitor using the inline card information instead of navigating.',
        };
      }

      const sessionId = context?.sessionId || args.sessionId || '';
      const finalUrl = appendResumeParam(entity.sourceUrl, sessionId);

      if (sessionId) {
        await broadcastToSession(sessionId, 'navigate', {
          url: finalUrl,
          entityId: entity.id,
          title: entity.title,
        });
      }

      return {
        success: true,
        data: {
          message: `Navigated to ${entity.title}.`,
          url: finalUrl,
          entityId: entity.id,
          title: entity.title,
        },
      };
    }

    return { success: false, error: `Unknown tool name: '${toolName}'` };
  } catch (err: any) {
    console.error(`[agent-tools] Execution error for tool '${toolName}':`, err);
    return { success: false, error: err.message || 'Tool execution failed' };
  }
}
