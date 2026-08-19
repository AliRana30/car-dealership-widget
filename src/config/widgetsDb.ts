import { createClient } from '@supabase/supabase-js';
import { VoiceWidgetConfig } from './voiceWidget/types';
import {
  WidgetConfigurationRecord,
  toConfigurationRecord,
  fromConfigurationRecord,
} from './voiceWidget/default';
import { encrypt, decrypt } from '@/lib/encryption';
import { embedTexts, embedText } from '@/lib/embeddings';

export interface WidgetRecord {
  id: string; // UUID primary key in DB
  widgetId: string; // Unique slug identifier (e.g. 'front-desk')
  organizationId: string;
  userId?: string; // Owner user ID — enforces data isolation
  name: string;
  status: 'active' | 'inactive' | 'paused';
  provider: 'retell' | 'vapi';
  agentId?: string;
  assistantId?: string;
  credentialSecretId?: string;
  websiteId?: string;
  allowedDomains: string[];
  config: VoiceWidgetConfig;
  createdAt?: string;
  updatedAt?: string;

  // Decrypted API keys — only available server-side, never sent to client
  retellApiKey?: string;
  vapiApiKey?: string;
}

let supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn(
    '[Supabase] Warning: SUPABASE_URL is not defined in env. ' +
    'Please set this environment variable to connect to PostgreSQL.'
  );
}

// Self-healing: if a PostgreSQL connection string is mistakenly provided, parse it and extract the HTTP API URL
if (supabaseUrl.startsWith('postgresql://') || supabaseUrl.startsWith('postgres://')) {
  try {
    const urlParts = supabaseUrl.split('@');
    const hostAndPort = urlParts[urlParts.length - 1];
    const host = hostAndPort.split(':')[0]; // e.g. db.oygkvdituwljqpfdxwaf.supabase.co
    
    if (host.includes('.supabase.co')) {
      const projectRef = host.split('.')[1]; // e.g. oygkvdituwljqpfdxwaf
      supabaseUrl = `https://${projectRef}.supabase.co`;
    }
  } catch (e) {
    console.error('[Supabase] Failed to auto-convert postgresql url to HTTP API url:', e);
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey);

function fromDbRow(widgetRow: any, agentRow?: any, secretRow?: any): WidgetRecord {
  const provider = (agentRow?.provider || 'retell') as 'retell' | 'vapi';
  const externalAgentId = agentRow?.external_agent_id || '';

  // Decrypt API keys stored encrypted at rest
  const retellApiKey = secretRow?.retell_api_key ? (decrypt(secretRow.retell_api_key) || '') : '';
  const vapiApiKey = secretRow?.vapi_api_key ? (decrypt(secretRow.vapi_api_key) || '') : '';

  return {
    id: widgetRow.id,
    widgetId: widgetRow.widget_id,
    organizationId: widgetRow.organization_id || '00000000-0000-0000-0000-000000000000',
    userId: widgetRow.user_id || undefined,
    name: widgetRow.name,
    status: (widgetRow.status || 'active') as 'active' | 'inactive' | 'paused',
    provider,
    agentId: provider === 'retell' ? externalAgentId : '',
    assistantId: provider === 'vapi' ? externalAgentId : '',
    credentialSecretId: agentRow?.credential_secret_id || '',
    websiteId: widgetRow.website_id || '00000000-0000-0000-0000-000000000000',
    allowedDomains: widgetRow.allowed_domains || [],
    config: widgetRow.config,
    createdAt: widgetRow.created_at,
    updatedAt: widgetRow.updated_at,
    retellApiKey,
    vapiApiKey,
  };
}

/**
 * Get a widget by ID or slug. Optionally scoped to a specific user.
 * The userId parameter enforces server-side ownership isolation.
 */
export async function getWidget(idOrWidgetId: string, userId?: string): Promise<WidgetRecord | null> {
  const searchId = idOrWidgetId.toLowerCase();
  const normalizedSearchId = searchId === 'myfrontdesk' ? 'front-desk' : searchId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedSearchId);

  try {
    let query = supabase.from('widgets').select('*');
    if (isUuid) {
      query = query.eq('id', normalizedSearchId);
    } else {
      query = query.eq('widget_id', normalizedSearchId);
    }
    // Enforce user isolation when userId is provided
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: widgetRow, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    let agentRow: any = null;
    let secretRow: any = null;

    if (widgetRow.agent_id) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('*')
        .eq('id', widgetRow.agent_id)
        .single();
      agentRow = agentData;

      if (agentRow && agentRow.credential_secret_id) {
        const { data: secretData } = await supabase
          .from('widget_secrets')
          .select('*')
          .eq('id', agentRow.credential_secret_id)
          .single();
        secretRow = secretData;
      }
    }

    return fromDbRow(widgetRow, agentRow, secretRow);
  } catch (err) {
    console.error(`[widgetsDb] Error in getWidget for ${normalizedSearchId}:`, err);
    return null;
  }
}

const isUuid = (val?: string): boolean => {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};

/**
 * Save (create or update) a widget. The userId is required for new widgets.
 * On update, the userId is used to verify ownership before writing.
 */
export async function saveWidget(
  record: Omit<WidgetRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<WidgetRecord> {
  const widgetIdSlug = record.widgetId.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const normalizedSlug = widgetIdSlug === 'myfrontdesk' ? 'front-desk' : widgetIdSlug;

  // 1. Check for existing widget to merge or reuse ID
  const existing = await getWidget(normalizedSlug) || (record.id ? await getWidget(record.id) : null);
  if (existing && record.userId && existing.userId && existing.userId !== record.userId) {
    throw new Error('Unauthorized: Widget belongs to another user.');
  }

  let agentUuid: string | null = null;
  if (existing) {
    const { data: rawWidget } = await supabase
      .from('widgets')
      .select('agent_id')
      .eq('id', existing.id)
      .single();
    if (rawWidget) {
      agentUuid = rawWidget.agent_id;
    }
  }

  // 2. Resolve credentials API keys (preserve existing if masked or empty)
  const retellApiKey = (record.retellApiKey === undefined || record.retellApiKey === '••••••••' || record.retellApiKey === '') 
    ? (existing?.retellApiKey || '') 
    : record.retellApiKey;

  const vapiApiKey = (record.vapiApiKey === undefined || record.vapiApiKey === '••••••••' || record.vapiApiKey === '') 
    ? (existing?.vapiApiKey || '') 
    : record.vapiApiKey;

  let credentialSecretId = existing?.credentialSecretId || undefined;

  // 3. Insert or Update widget_secrets — store keys AES-256-GCM encrypted
  const encryptedRetellKey = retellApiKey ? encrypt(retellApiKey) : null;
  const encryptedVapiKey = vapiApiKey ? encrypt(vapiApiKey) : null;

  if (retellApiKey || vapiApiKey || credentialSecretId) {
    if (credentialSecretId) {
      const updatePayload: any = { encrypted: true };
      if (encryptedRetellKey) updatePayload.retell_api_key = encryptedRetellKey;
      if (encryptedVapiKey) updatePayload.vapi_api_key = encryptedVapiKey;
      if (record.userId) updatePayload.user_id = record.userId;
      const { error: secretErr } = await supabase
        .from('widget_secrets')
        .upsert({ id: credentialSecretId, ...updatePayload });
      if (secretErr) throw secretErr;
    } else {
      const { data: secretData, error: secretErr } = await supabase
        .from('widget_secrets')
        .insert({
          retell_api_key: encryptedRetellKey,
          vapi_api_key: encryptedVapiKey,
          user_id: record.userId || null,
          encrypted: true,
        })
        .select('*')
        .single();
      
      if (secretErr) throw secretErr;
      credentialSecretId = secretData.id;
    }
  }

  // 4. Insert or Update agents table
  const externalAgentId = record.agentId || record.assistantId || record.config?.provider?.agentId || existing?.agentId || '';
  const agentPayload = {
    provider: record.provider,
    external_agent_id: externalAgentId,
    name: record.name.trim() + ' Agent',
    credential_secret_id: credentialSecretId || null,
  };

  if (agentUuid) {
    const { error: agentErr } = await supabase
      .from('agents')
      .update(agentPayload)
      .eq('id', agentUuid);
    if (agentErr) throw agentErr;
  } else {
    const { data: agentData, error: agentErr } = await supabase
      .from('agents')
      .insert(agentPayload)
      .select('*')
      .single();
    if (agentErr) throw agentErr;
    agentUuid = agentData.id;
  }

  // 5. Construct widget payload
  const primaryId = record.id || existing?.id;
  const widgetRowPayload = {
    ...(primaryId ? { id: primaryId } : {}),
    widget_id: normalizedSlug,
    organization_id: isUuid(record.organizationId) 
      ? record.organizationId! 
      : (isUuid(existing?.organizationId) ? existing?.organizationId! : '00000000-0000-0000-0000-000000000000'),
    user_id: record.userId || existing?.userId || null,
    name: record.name.trim(),
    status: record.status || existing?.status || 'active',
    agent_id: agentUuid,
    website_id: isUuid(record.websiteId) 
      ? record.websiteId! 
      : (isUuid(existing?.websiteId) ? existing?.websiteId! : '00000000-0000-0000-0000-000000000000'),
    allowed_domains: record.allowedDomains || existing?.allowedDomains || [],
    config: record.config,
  };

  // 6. Upsert widget
  const { data: savedWidgetRow, error: widgetErr } = await supabase
    .from('widgets')
    .upsert(widgetRowPayload)
    .select('*')
    .single();

  if (widgetErr) throw widgetErr;

  // 7. Fetch the fully updated data to return it
  let savedAgentRow: any = null;
  let savedSecretRow: any = null;

  if (savedWidgetRow.agent_id) {
    const { data: agentData } = await supabase
      .from('agents')
      .select('*')
      .eq('id', savedWidgetRow.agent_id)
      .single();
    savedAgentRow = agentData;

    if (savedAgentRow && savedAgentRow.credential_secret_id) {
      const { data: secretData } = await supabase
        .from('widget_secrets')
        .select('*')
        .eq('id', savedAgentRow.credential_secret_id)
        .single();
      savedSecretRow = secretData;
    }
  }

  return fromDbRow(savedWidgetRow, savedAgentRow, savedSecretRow);
}

/**
 * Delete a widget. When userId is provided, verifies ownership before deletion.
 */
export async function deleteWidget(idOrWidgetId: string, userId?: string): Promise<boolean> {
  const existing = await getWidget(idOrWidgetId, userId);
  if (!existing) return false;

  try {
    // 1. Get raw widget to find agent_id
    const { data: rawWidget } = await supabase
      .from('widgets')
      .select('agent_id')
      .eq('id', existing.id)
      .single();

    const agentUuid = rawWidget?.agent_id;

    // 2. Delete widget (deletes widget_configurations via CASCADE)
    const { error: widgetErr } = await supabase
      .from('widgets')
      .delete()
      .eq('id', existing.id);

    if (widgetErr) throw widgetErr;

    // 3. Delete linked agent and secret
    if (agentUuid) {
      const { data: rawAgent } = await supabase
        .from('agents')
        .select('credential_secret_id')
        .eq('id', agentUuid)
        .single();

      await supabase
        .from('agents')
        .delete()
        .eq('id', agentUuid);

      if (rawAgent?.credential_secret_id) {
        await supabase
          .from('widget_secrets')
          .delete()
          .eq('id', rawAgent.credential_secret_id);
      }
    }

    return true;
  } catch (err) {
    console.error(`[widgetsDb] Error in deleteWidget for ${idOrWidgetId}:`, err);
    return false;
  }
}

/**
 * List all widgets. When userId is provided, only returns that user's widgets.
 */
export async function listWidgets(userId?: string): Promise<WidgetRecord[]> {
  try {
    let query = supabase
      .from('widgets')
      .select('*')
      .order('created_at', { ascending: false });

    // Enforce user isolation
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: widgets, error } = await query;

    if (error) throw error;
    if (!widgets || widgets.length === 0) return [];

    // Fetch all agents
    const agentIds = widgets.map(w => w.agent_id).filter((id): id is string => !!id);
    const agentsMap = new Map<string, any>();
    const secretsMap = new Map<string, any>();

    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from('agents')
        .select('*')
        .in('id', agentIds);
      
      if (agents) {
        agents.forEach(a => agentsMap.set(a.id, a));

        const secretIds = agents.map(a => a.credential_secret_id).filter((id): id is string => !!id);
        if (secretIds.length > 0) {
          const { data: secrets } = await supabase
            .from('widget_secrets')
            .select('*')
            .in('id', secretIds);
          
          if (secrets) {
            secrets.forEach(s => secretsMap.set(s.id, s));
          }
        }
      }
    }

    return widgets.map(w => {
      const agent = w.agent_id ? agentsMap.get(w.agent_id) : null;
      const secret = agent?.credential_secret_id ? secretsMap.get(agent.credential_secret_id) : null;
      return fromDbRow(w, agent, secret);
    });
  } catch (err) {
    console.error('[widgetsDb] Error in listWidgets:', err);
    return [];
  }
}



export async function getWidgetConfiguration(idOrWidgetId: string, userId?: string): Promise<WidgetConfigurationRecord | null> {
  const widget = await getWidget(idOrWidgetId, userId);
  if (!widget) return null;

  try {
    const { data, error } = await supabase
      .from('widget_configurations')
      .select('*')
      .eq('widget_id', widget.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No custom configuration found in DB, return a default record converted from its current widget config
        return toConfigurationRecord(widget.config);
      }
      throw error;
    }

    return {
      branding: data.branding,
      theme: data.theme,
      typography: data.typography,
      launcher: data.launcher,
      panel: data.panel,
      call: data.call,
      chat: data.chat,
      behavior: data.behavior,
      responsive: data.responsive,
    };
  } catch (err) {
    console.error(`[widgetsDb] Error in getWidgetConfiguration for ${idOrWidgetId}:`, err);
    return null;
  }
}

export async function saveWidgetConfiguration(
  idOrWidgetId: string,
  configRecord: WidgetConfigurationRecord,
  userId?: string
): Promise<WidgetConfigurationRecord | null> {
  const widget = await getWidget(idOrWidgetId, userId);
  if (!widget) return null;

  try {
    const payload = {
      widget_id: widget.id,
      branding: configRecord.branding,
      theme: configRecord.theme,
      typography: configRecord.typography,
      launcher: configRecord.launcher,
      panel: configRecord.panel,
      call: configRecord.call,
      chat: configRecord.chat,
      behavior: configRecord.behavior,
      responsive: configRecord.responsive,
    };

    const { data, error } = await supabase
      .from('widget_configurations')
      .upsert(payload, { onConflict: 'widget_id' })
      .select('*')
      .single();

    if (error) throw error;

    // Synchronize back to the main widgets table's config column to keep systems aligned
    const updatedVoiceConfig = fromConfigurationRecord(configRecord);
    await supabase
      .from('widgets')
      .update({ config: updatedVoiceConfig })
      .eq('id', widget.id);

    return {
      branding: data.branding,
      theme: data.theme,
      typography: data.typography,
      launcher: data.launcher,
      panel: data.panel,
      call: data.call,
      chat: data.chat,
      behavior: data.behavior,
      responsive: data.responsive,
    };
  } catch (err) {
    console.error(`[widgetsDb] Error in saveWidgetConfiguration for ${idOrWidgetId}:`, err);
    return null;
  }
}

export async function getRelevantWebsiteData(websiteOrWidgetId: string, query: string): Promise<string> {
  try {
    const { data: widgets } = await supabase
      .from('widgets')
      .select('id, widget_id, website_id')
      .or(`id.eq.${websiteOrWidgetId},website_id.eq.${websiteOrWidgetId},widget_id.eq.${websiteOrWidgetId}`);

    const widgetIds = new Set<string>();
    if (websiteOrWidgetId) widgetIds.add(websiteOrWidgetId);
    if (widgets) {
      widgets.forEach(w => {
        if (w.id) widgetIds.add(w.id);
        if (w.widget_id) widgetIds.add(w.widget_id);
        if (w.website_id) widgetIds.add(w.website_id);
      });
    }
    const filterWidgetIds = Array.from(widgetIds);

    // Try pgvector similarity search first
    try {
      const queryEmbedding = await embedText(query);
      const { data: matchedRecords, error: matchError } = await supabase
        .rpc('match_website_data', {
          query_embedding: queryEmbedding,
          match_threshold: 0.1, // low threshold to capture slightly related elements
          match_count: 3,
          filter_widget_ids: filterWidgetIds
        });

      if (!matchError && matchedRecords && matchedRecords.length > 0) {
        return matchedRecords.map((r: any) => `Title: ${r.title}\nContent: ${r.content}`).join('\n\n');
      }
    } catch (err) {
      console.warn('[widgetsDb] Embedding-based search failed, falling back to keyword search:', err);
    }

    // Keyword search fallback
    const { data: records, error } = await supabase
      .from('website_data')
      .select('*')
      .in('widget_id', filterWidgetIds);

    if (error || !records || records.length === 0) {
      return '';
    }

    // Score records based on keyword matches with the query
    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    if (queryWords.length === 0) {
      // If no good keywords, return first 3 records as fallback
      return records.slice(0, 3).map(r => `Title: ${r.title}\nContent: ${r.content}`).join('\n\n');
    }

    const scored = records.map(record => {
      let score = 0;
      const titleLower = (record.title || '').toLowerCase();
      const contentLower = (record.content || '').toLowerCase();

      for (const word of queryWords) {
        if (titleLower.includes(word)) score += 10;
        if (contentLower.includes(word)) {
          const matches = contentLower.split(word).length - 1;
          score += matches * 2;
        }
      }
      return { record, score };
    });

    const sorted = scored.sort((a, b) => b.score - a.score);
    const matched = sorted.filter(s => s.score > 0).map(s => s.record);
    const finalRecords = matched.length > 0 ? matched : records.slice(0, 3);

    return finalRecords.slice(0, 3).map(r => `Title: ${r.title}\nContent: ${r.content}`).join('\n\n');
  } catch (err) {
    console.error(`[widgetsDb] Error in getRelevantWebsiteData:`, err);
    return '';
  }
}

// ── Structured result objects for frontend rendering ──────────────────────────

export interface WebsiteDataRecord {
  title?: string;
  description?: string;
  images?: string[];
  price?: string | number;
  currency?: string;
  availability?: string;
  rating?: number | string;
  reviews?: number | string;
  attributes?: Record<string, string | number | boolean>;
  sourceUrl?: string;
  entityType?: string;
}

/**
 * Returns scored, structured website data records for frontend card rendering.
 * Only records scoring above 0 are returned (max 3).
 * Falls back to top-3 records when query has no useful keywords.
 */
export async function getRelevantWebsiteRecords(
  websiteOrWidgetId: string,
  query: string,
  limit = 3
): Promise<WebsiteDataRecord[]> {
  try {
    const { data: widgets } = await supabase
      .from('widgets')
      .select('id, widget_id, website_id')
      .or(`id.eq.${websiteOrWidgetId},website_id.eq.${websiteOrWidgetId},widget_id.eq.${websiteOrWidgetId}`);

    const widgetIds = new Set<string>();
    if (websiteOrWidgetId) widgetIds.add(websiteOrWidgetId);
    if (widgets) {
      widgets.forEach(w => {
        if (w.id) widgetIds.add(w.id);
        if (w.widget_id) widgetIds.add(w.widget_id);
        if (w.website_id) widgetIds.add(w.website_id);
      });
    }
    const filterWidgetIds = Array.from(widgetIds);

    // Try pgvector similarity search first
    try {
      const queryEmbedding = await embedText(query);
      const { data: matchedRecords, error: matchError } = await supabase
        .rpc('match_website_data', {
          query_embedding: queryEmbedding,
          match_threshold: 0.1,
          match_count: limit,
          filter_widget_ids: filterWidgetIds
        });

      if (!matchError && matchedRecords && matchedRecords.length > 0) {
        return matchedRecords.map((r: any) => {
          const meta = (r.metadata || {}) as Record<string, any>;
          const result: WebsiteDataRecord = { entityType: r.entity_type };
          if (r.title) result.title = r.title;
          
          if (r.short_description) {
            result.description = r.short_description;
          } else if (r.content) {
            result.description = r.content.substring(0, 300).trimEnd() + (r.content.length > 300 ? '…' : '');
          }
          
          // images: prefer image_urls column, fallback to metadata
          if (Array.isArray(r.image_urls) && r.image_urls.length > 0) {
            result.images = r.image_urls;
          } else if (meta.images && Array.isArray(meta.images)) {
            result.images = meta.images.filter(Boolean);
          } else if (meta.image) {
            result.images = [String(meta.image)];
          }

          if (meta.price !== undefined) result.price = meta.price;
          if (meta.currency) result.currency = String(meta.currency);
          if (meta.availability) result.availability = String(meta.availability);
          if (meta.rating !== undefined) result.rating = meta.rating;
          if (meta.reviews !== undefined) result.reviews = meta.reviews;
          if (meta.attributes && typeof meta.attributes === 'object') result.attributes = meta.attributes;
          if (r.source_url) result.sourceUrl = r.source_url;
          return result;
        });
      }
    } catch (err) {
      console.warn('[widgetsDb] Embedding-based search failed, falling back to keyword search:', err);
    }

    // Keyword search fallback
    const { data: records, error } = await supabase
      .from('website_data')
      .select('*')
      .in('widget_id', filterWidgetIds);

    if (error || !records || records.length === 0) return [];

    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);

    let finalRecords = records;
    if (queryWords.length > 0) {
      const scored = records.map(record => {
        let score = 0;
        const titleLower = (record.title || '').toLowerCase();
        const contentLower = (record.content || '').toLowerCase();
        for (const word of queryWords) {
          if (titleLower.includes(word)) score += 10;
          const hits = contentLower.split(word).length - 1;
          score += hits * 2;
        }
        return { record, score };
      });
      const matched = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.record);
      finalRecords = matched.length > 0 ? matched : records;
    }

    return finalRecords.slice(0, limit).map(r => {
      const meta = (r.metadata || {}) as Record<string, any>;
      const result: WebsiteDataRecord = { entityType: r.entity_type };
      if (r.title) result.title = r.title;
      
      // description: prefer short_description column, fallback to content/meta description
      if (r.short_description) {
        result.description = r.short_description;
      } else if (r.entity_type === 'text' && r.content) {
        result.description = r.content.substring(0, 300).trimEnd() + (r.content.length > 300 ? '…' : '');
      } else if (meta.description) {
        result.description = String(meta.description);
      } else if (r.content) {
        result.description = r.content.substring(0, 300).trimEnd() + (r.content.length > 300 ? '…' : '');
      }

      // images: prefer image_urls column, fallback to metadata
      if (Array.isArray(r.image_urls) && r.image_urls.length > 0) {
        result.images = r.image_urls;
      } else if (meta.images && Array.isArray(meta.images)) {
        result.images = meta.images.filter(Boolean);
      } else if (meta.image) {
        result.images = [String(meta.image)];
      }

      if (meta.price !== undefined) result.price = meta.price;
      if (meta.currency) result.currency = String(meta.currency);
      if (meta.availability) result.availability = String(meta.availability);
      if (meta.rating !== undefined) result.rating = meta.rating;
      if (meta.reviews !== undefined) result.reviews = meta.reviews;
      if (meta.attributes && typeof meta.attributes === 'object') result.attributes = meta.attributes;
      if (r.source_url) result.sourceUrl = r.source_url;
      return result;
    });
  } catch (err) {
    console.error(`[widgetsDb] Error in getRelevantWebsiteRecords:`, err);
    return [];
  }
}

export async function getWebsiteContextSummary(websiteId: string): Promise<string> {
  try {
    const { data: widgets } = await supabase
      .from('widgets')
      .select('id')
      .eq('website_id', websiteId);

    const widgetIds = widgets?.map(w => w.id) || [];
    if (widgetIds.length === 0) {
      widgetIds.push('00000000-0000-0000-0000-000000000000');
    }

    const { data: records, error } = await supabase
      .from('website_data')
      .select('*')
      .in('widget_id', widgetIds);

    if (error || !records || records.length === 0) {
      return '';
    }

    return records.map(r => {
      const meta = r.metadata || {};
      const details = [];
      if (meta.price !== undefined) details.push(`Price: ${meta.price} ${meta.currency || 'USD'}`);
      if (meta.rating !== undefined) details.push(`Rating: ${meta.rating}/5 stars (${meta.reviews || 0} reviews)`);
      if (meta.availability) details.push(`Availability: ${meta.availability}`);
      const detailsStr = details.length > 0 ? ` [${details.join(' | ')}]` : '';
      return `[Category: ${r.entity_type || 'General'}] ${r.title}${detailsStr}:\n${r.content}`;
    }).join('\n\n');
  } catch (err) {
    console.error(`[widgetsDb] Error in getWebsiteContextSummary:`, err);
    return '';
  }
}

export interface WebsiteDataRow {
  id?: string;
  widget_id: string;
  source_url?: string;
  title: string;
  content: string;
  entity_type: string;
  metadata?: Record<string, any>;
  short_description?: string;
  image_urls?: string[];
  data_type?: string;
  category_path?: string[];
  content_hash?: string;
  last_checked_at?: string;
  embedding?: number[];
}

/**
 * Batch inserts or updates website data records, automatically computing
 * vector embeddings from (title + short_description) to leverage semantic search.
 * Naturally batches embedding API calls and database operations.
 */
export async function saveWebsiteDataBatch(rows: WebsiteDataRow[]): Promise<void> {
  if (rows.length === 0) return;

  // 1. Determine which rows need embeddings computed
  const needsEmbeddingIndices: number[] = [];
  const textsToEmbed: string[] = [];

  rows.forEach((row, idx) => {
    if (!row.embedding || !Array.isArray(row.embedding) || row.embedding.length === 0) {
      needsEmbeddingIndices.push(idx);
      const title = row.title || '';
      const desc = row.short_description || row.content?.substring(0, 300) || '';
      textsToEmbed.push(`${title} ${desc}`.trim() || 'Untitled');
    }
  });

  // 2. Generate embeddings for rows that need them (in a batched call)
  let computedEmbeddings: number[][] = [];
  if (textsToEmbed.length > 0) {
    try {
      computedEmbeddings = await embedTexts(textsToEmbed);
    } catch (err) {
      console.error('[widgetsDb] Error generating embeddings for batch:', err);
      throw err;
    }
  }

  const embeddingMap = new Map<number, number[]>();
  needsEmbeddingIndices.forEach((rowIndex, i) => {
    if (computedEmbeddings[i]) {
      embeddingMap.set(rowIndex, computedEmbeddings[i]);
    }
  });

  // 3. Enrich rows with embeddings
  const enrichedRows = rows.map((row, idx) => ({
    widget_id: row.widget_id,
    source_url: row.source_url || null,
    title: row.title || 'Untitled',
    content: row.content || '',
    entity_type: row.entity_type || 'text',
    metadata: row.metadata || {},
    short_description: row.short_description || row.content?.substring(0, 300) || '',
    image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
    data_type: row.data_type || 'crawl',
    category_path: Array.isArray(row.category_path) ? row.category_path : [],
    content_hash: row.content_hash || null,
    embedding: row.embedding && row.embedding.length > 0 ? row.embedding : (embeddingMap.get(idx) || null),
    ...(row.id ? { id: row.id } : {})
  }));

  // 4. Perform batch insert or upsert in chunks of 50
  if (supabaseUrl.includes('placeholder-project-url')) {
    console.warn('[widgetsDb] Placeholder Supabase URL detected; skipping actual PostgreSQL write in test/mock environment.');
    return;
  }

  const DB_CHUNK_SIZE = 50;
  for (let i = 0; i < enrichedRows.length; i += DB_CHUNK_SIZE) {
    const chunk = enrichedRows.slice(i, i + DB_CHUNK_SIZE);
    const hasIds = chunk.some(row => row.id);
    const { error } = hasIds
      ? await supabase.from('website_data').upsert(chunk)
      : await supabase.from('website_data').insert(chunk);

    if (error) {
      console.error('[widgetsDb] Error inserting/upserting website data batch chunk:', error);
      throw new Error(`[widgetsDb] Save failed: ${error.message}`);
    }
  }
}

/**
 * Inserts or updates a single website data record.
 */
export async function saveWebsiteData(row: WebsiteDataRow): Promise<void> {
  await saveWebsiteDataBatch([row]);
}



