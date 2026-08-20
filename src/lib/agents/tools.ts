import { createClient } from '@supabase/supabase-js';
import { embedText } from '@/lib/embeddings';
import { Entity } from '@/lib/crawler/types';
import { broadcastToSession } from '@/lib/realtime/session';

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

/**
 * Maps raw database row from website_data into the full standardized Entity shape.
 */
export function mapRowToEntity(row: any): Entity {
  const meta = (row.metadata || {}) as Record<string, any>;
  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls
    : meta.images && Array.isArray(meta.images)
    ? meta.images
    : meta.image
    ? [String(meta.image)]
    : [];

  return {
    id: row.id || '',
    widgetId: row.widget_id || '',
    title: row.title || 'Untitled',
    shortDescription: row.short_description || row.content?.substring(0, 300) || '',
    imageUrls,
    sourceUrl: row.source_url || undefined,
    entityType: row.entity_type || 'text',
    metadata: meta,
    dataType: (row.data_type as any) || 'crawl',
    categoryPath: Array.isArray(row.category_path) ? row.category_path : [],
    contentHash: row.content_hash || undefined,
    lastCheckedAt: row.last_checked_at || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

/**
 * Searches the knowledge base for a specific widget using pgvector similarity or keyword matching.
 */
export async function searchEntities(
  widgetId: string,
  query: string,
  limit: number = 3
): Promise<Entity[]> {
  if (!query || !query.trim() || !widgetId) return [];

  const supabase = getSupabase();
  const trimmedQuery = query.trim();

  // Resolve widget UUID if a slug was provided
  let targetWidgetId = widgetId;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(widgetId)) {
    const { data: w } = await supabase.from('widgets').select('id').eq('slug', widgetId).maybeSingle();
    if (w?.id) targetWidgetId = w.id;
  }

  // 1. Direct fetch rows scoped to widget_id
  const { data: rows } = await supabase
    .from('website_data')
    .select('*')
    .or(`widget_id.eq.${targetWidgetId},widget_id.eq.${widgetId}`)
    .limit(100);

  if (rows && rows.length > 0) {
    const queryLower = trimmedQuery.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

    const scored = rows.map(row => {
      let score = 0;
      const titleLower = (row.title || '').toLowerCase();
      const contentLower = (row.content || '').toLowerCase();
      const descLower = (row.short_description || '').toLowerCase();

      // Exact phrase match in title gets highest priority
      if (titleLower.includes(queryLower)) score += 50;
      if (contentLower.includes(queryLower)) score += 20;

      for (const word of queryWords) {
        if (titleLower === word) score += 30;
        else if (titleLower.includes(word)) score += 15;
        if (descLower.includes(word)) score += 10;
        if (contentLower.includes(word)) score += 4;
      }

      return { row, score };
    });

    const matches = scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.row);

    if (matches.length > 0) {
      return matches.map(mapRowToEntity);
    }
  }

  // 2. Vector search via Supabase pgvector RPC fallback if keyword search produced 0 matches
  try {
    const queryVector = await embedText(trimmedQuery);
    if (queryVector && queryVector.length === 1536) {
      const { data: rpcMatches, error: rpcError } = await supabase.rpc('match_website_data', {
        query_embedding: queryVector,
        match_count: limit,
        filter_widget_id: targetWidgetId,
      });

      if (!rpcError && Array.isArray(rpcMatches) && rpcMatches.length > 0) {
        return rpcMatches.map(mapRowToEntity);
      }
    }
  } catch {}

  // 3. Fallback to top rows if available
  return (rows || []).slice(0, limit).map(mapRowToEntity);
}

/**
 * Retrieves full details for a single entity by ID, strictly scoped to the widget.
 */
export async function getEntityDetails(
  widgetId: string,
  entityId: string
): Promise<Entity | null> {
  if (!entityId || !widgetId) return null;

  const supabase = getSupabase();
  const { data: row, error } = await supabase
    .from('website_data')
    .select('*')
    .eq('id', entityId)
    .eq('widget_id', widgetId)
    .maybeSingle();

  if (error || !row) return null;
  return mapRowToEntity(row);
}

// ── Callable Tool Definitions for Retell AI and Vapi AI ──────────────────────

export const AGENT_TOOL_DEFINITIONS = {
  search_entities: {
    name: 'search_entities',
    description: 'Search the website knowledge base, products, inventory, services, FAQs, and documentation in real time.',
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
    description: 'Retrieve complete real-time specifications, pricing, inventory availability, and attributes for a specific item by its entity ID.',
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
      return {
        success: true,
        data: {
          count: entities.length,
          query,
          results: entities.map(e => ({
            id: e.id,
            title: e.title,
            description: e.shortDescription,
            type: e.entityType,
            price: e.metadata?.price,
            availability: e.metadata?.availability,
            sourceUrl: e.sourceUrl,
            images: e.imageUrls,
            metadata: e.metadata,
          })),
        },
      };
    }

    if (toolName === 'get_entity_details') {
      const entityId = String(args.entityId || args.entity_id || args.id || '');
      const entity = await getEntityDetails(widgetId, entityId);
      if (!entity) {
        return { success: false, error: `Entity '${entityId}' not found for this widget.` };
      }
      return {
        success: true,
        data: {
          id: entity.id,
          title: entity.title,
          description: entity.shortDescription,
          type: entity.entityType,
          price: entity.metadata?.price,
          currency: entity.metadata?.currency || 'USD',
          availability: entity.metadata?.availability,
          images: entity.imageUrls,
          sourceUrl: entity.sourceUrl,
          categoryPath: entity.categoryPath,
          metadata: entity.metadata,
        },
      };
    }

    if (toolName === 'navigate_to_entity') {
      const entityId = String(args.entityId || args.entity_id || args.id || '');
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
