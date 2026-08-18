/**
 * Agent Tool Definitions & Search Implementation (Phase 6.1)
 *
 * Provides real-time knowledge lookup and entity retrieval for live Retell AI
 * and Vapi AI voice calls. All queries are strictly scoped by widget_id.
 */

import { createClient } from '@supabase/supabase-js';
import { embedText } from '@/lib/embeddings';
import { Entity } from '@/lib/crawler/types';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
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
  if (!query || !query.trim()) return [];

  const supabase = getSupabase();
  const trimmedQuery = query.trim();

  // 1. Generate 1536-dim vector embedding for the search query
  let queryVector: number[] | null = null;
  try {
    queryVector = await embedText(trimmedQuery);
  } catch (embedErr) {
    console.warn('[agent-tools] Embedding generation failed, falling back to text search:', embedErr);
  }

  // 2. Vector search via Supabase pgvector RPC if available
  if (queryVector && queryVector.length === 1536) {
    try {
      const { data: rpcMatches, error: rpcError } = await supabase.rpc('match_website_data', {
        query_embedding: queryVector,
        match_count: limit,
        filter_widget_id: widgetId,
      });

      if (!rpcError && Array.isArray(rpcMatches) && rpcMatches.length > 0) {
        return rpcMatches.map(mapRowToEntity);
      }
    } catch {
      // Fall through to direct query if RPC is not defined
    }
  }

  // 3. Fallback: Query website_data directly scoped to widget_id
  const { data: rows, error } = await supabase
    .from('website_data')
    .select('*')
    .eq('widget_id', widgetId)
    .limit(50);

  if (error || !rows || rows.length === 0) {
    return [];
  }

  // Score rows by title and content keyword relevance
  const queryWords = trimmedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const scored = rows.map(row => {
    let score = 0;
    const titleLower = (row.title || '').toLowerCase();
    const contentLower = (row.content || '').toLowerCase();
    const descLower = (row.short_description || '').toLowerCase();

    for (const word of queryWords) {
      if (titleLower.includes(word)) score += 15;
      if (descLower.includes(word)) score += 8;
      if (contentLower.includes(word)) score += 3;
    }
    return { row, score };
  });

  const matches = scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.row);

  const finalRows = matches.length > 0 ? matches : rows.slice(0, limit);
  return finalRows.map(mapRowToEntity);
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
};

/**
 * Retell AI Tool Format
 */
export function getRetellToolsConfig(webhookBaseUrl: string) {
  return [
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
}

/**
 * Vapi AI Tool / Function Format
 */
export function getVapiToolsConfig() {
  return [
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
}

/**
 * Central tool execution dispatcher.
 */
export async function executeAgentTool(
  widgetId: string,
  toolName: string,
  args: Record<string, any>
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    if (toolName === 'search_entities') {
      const query = String(args.query || '');
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
      const entityId = String(args.entityId || '');
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

    return { success: false, error: `Unknown tool name: '${toolName}'` };
  } catch (err: any) {
    console.error(`[agent-tools] Execution error for tool '${toolName}':`, err);
    return { success: false, error: err.message || 'Tool execution failed' };
  }
}
