import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { VoiceWidgetConfig } from './voiceWidget/types';
import {
  WidgetConfigurationRecord,
  toConfigurationRecord,
  fromConfigurationRecord,
  defaultVoiceWidgetConfig,
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

let _cachedDbClient: SupabaseClient | null = null;

export function getDbClient(): { client: SupabaseClient; url: string; key: string } {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) {
    try {
      const urlParts = url.split('@');
      const hostAndPort = urlParts[urlParts.length - 1];
      const host = hostAndPort.split(':')[0];
      if (host.includes('.supabase.co')) {
        const projectRef = host.split('.')[1];
        url = `https://${projectRef}.supabase.co`;
      }
    } catch {}
  }

  if (!_cachedDbClient && url && key) {
    _cachedDbClient = createClient(url, key);
  }

  return {
    client: _cachedDbClient || (url && key ? createClient(url, key) : (null as any)),
    url,
    key,
  };
}

// Lazy getter proxy for backwards compatibility without crashing at module evaluation time
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const { client } = getDbClient();
    if (!client) {
      console.warn('[widgetsDb] Supabase client accessed without valid credentials in environment.');
      return () => ({ data: null, error: new Error('Supabase client not initialized') });
    }
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

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
  if (!idOrWidgetId || typeof idOrWidgetId !== 'string' || idOrWidgetId.trim() === '') {
    console.warn('[widgetsDb:SCOPE_ENFORCEMENT] getWidget called with empty or invalid identifier. Failing closed.');
    return null;
  }

  const searchId = idOrWidgetId.trim().toLowerCase();
  const normalizedSearchId = searchId === 'myfrontdesk' ? 'front-desk' : searchId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedSearchId);

  try {
    let query = supabase.from('widgets').select('*');
    if (isUuid) {
      query = query.or(`id.eq.${normalizedSearchId},website_id.eq.${normalizedSearchId}`);
    } else if (normalizedSearchId === 'default' || normalizedSearchId === 'front-desk') {
      query = query.or('widget_id.eq.front-desk,widget_id.eq.default').order('updated_at', { ascending: false });
    } else {
      query = query.eq('widget_id', normalizedSearchId);
    }
    // Enforce user isolation when userId is provided
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: widgetRows, error } = await query.limit(1);

    if (error || !widgetRows || widgetRows.length === 0) {
      console.warn(`[widgetsDb:SCOPE_ENFORCEMENT] Widget not found for '${idOrWidgetId}'. Failing closed.`);
      return null;
    }

    const widgetRow = widgetRows[0];

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
  if (
    existing &&
    record.userId &&
    existing.userId &&
    existing.userId !== record.userId &&
    record.userId !== '00000000-0000-0000-0000-000000000000' &&
    existing.userId !== '00000000-0000-0000-0000-000000000000'
  ) {
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
    try {
      const updatedVoiceConfig = fromConfigurationRecord(configRecord);
      await supabase
        .from('widgets')
        .update({ config: updatedVoiceConfig })
        .eq('id', widget.id);
    } catch (syncErr) {
      console.warn(`[widgetsDb] Warning: Failed to sync config column for ${idOrWidgetId}:`, syncErr);
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
    console.error(`[widgetsDb] Error in saveWidgetConfiguration for ${idOrWidgetId}:`, err);
    return null;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

function parsePriceValue(price: any): number | null {
  if (typeof price === 'number') return isNaN(price) ? null : price;
  if (!price) return null;
  const str = String(price).replace(/,/g, '');
  const m = str.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

interface ParsedQueryConstraints {
  maxPrice?: number;
  minPrice?: number;
  sortByPrice?: 'asc' | 'desc';
  sortByRating?: boolean;
  isAboutQuery: boolean;
  isPolicyQuery: boolean;
  isFaqQuery: boolean;
  isContactQuery: boolean;
  isCatalogQuery: boolean;
  specificKeywords: string[];
}

function parseQueryConstraints(query: string): ParsedQueryConstraints {
  const lower = query.trim().toLowerCase();
  
  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  let sortByPrice: 'asc' | 'desc' | undefined;
  
  const underMatch = lower.match(/(?:under|below|less than|cheaper than|max(?:imum)?|<=?)\s*\$?(\d+(?:\.\d+)?)/i);
  if (underMatch) maxPrice = parseFloat(underMatch[1]);

  const overMatch = lower.match(/(?:above|over|more than|greater than|min(?:imum)?|>=?)\s*\$?(\d+(?:\.\d+)?)/i);
  if (overMatch) minPrice = parseFloat(overMatch[1]);

  const betweenMatch = lower.match(/between\s*\$?(\d+(?:\.\d+)?)\s*(?:and|-|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (betweenMatch) {
    minPrice = parseFloat(betweenMatch[1]);
    maxPrice = parseFloat(betweenMatch[2]);
  }

  if (/(?:cheapest|lowest price|least expensive|budget friendly|affordable)/i.test(lower)) {
    sortByPrice = 'asc';
  } else if (/(?:most expensive|premium|highest price|luxury)/i.test(lower)) {
    sortByPrice = 'desc';
  }

  const sortByRating = /(?:best rated|top rated|highest rated|top reviews|5 star|best |top |most popular)/i.test(lower);

  const isAboutQuery = /(?:about (?:us|the company|your team|you)|who (?:are you|made you|built you)|company mission|our story|company story|team members|founder)/i.test(lower);
  const isPolicyQuery = /(?:policy|policies|terms|privacy|gdpr|refund|cookie|compliance|legal|disclaimer|security|data protection)/i.test(lower);
  const isFaqQuery = /(?:faq|frequently asked|questions|help center)/i.test(lower);
  const isContactQuery = /(?:contact (?:us|team)|reach out|email address|phone number|office location|support team)/i.test(lower);
  const isCatalogQuery = !isAboutQuery && !isPolicyQuery && !isFaqQuery && !isContactQuery && /(?:course|courses|product|products|service|services|offering|offerings|class|classes|learn|bootcamp|catalog|pricing|price|cost|tier|buy|book|enroll|show|items?|what do you|inventory|listing|stock|menu|vehicle|vehicles|properties|plans|cars?|trucks?|suvs?|automotive|automobiles?)/i.test(lower);

  const stopWords = new Set([
    'show', 'me', 'the', 'a', 'an', 'what', 'is', 'your', 'tell', 'about',
    'can', 'you', 'give', 'details', 'for', 'of', 'in', 'at', 'with', 'do',
    'have', 'offer', 'available', 'there', 'any', 'how', 'much', 'are', 'i',
    'want', 'to', 'know', 'see', 'find', 'looking', 'get', 'more', 'info',
    'course', 'courses', 'product', 'products', 'service', 'services', 'offering',
    'offerings', 'program', 'programs', 'item', 'items', 'class', 'classes',
    'vehicle', 'vehicles', 'car', 'cars', 'truck', 'trucks', 'suv', 'suvs',
    'auto', 'automobile', 'automotive', 'inventory', 'catalog',
    'family', 'offroad', 'suitable', 'conditions', 'winter', 'driving', 'need', 'something',
    'under', 'below', 'less', 'than', 'cheaper', 'max', 'maximum', 'above',
    'over', 'more', 'greater', 'min', 'minimum', 'between', 'and', 'or',
    'budget', 'affordable', 'least', 'most', 'expensive', 'cheapest', 'best',
    'top', 'rated', 'popular', 'price', 'pricing', 'cost', 'costs', 'fee', 'fees',
    'tuition', 'dollar', 'dollars', 'bucks'
  ]);
  const words = lower.split(/[^a-z0-9_-]+/).filter(w => w.length > 2 && !/^\d+$/.test(w) && !stopWords.has(w));

  return {
    maxPrice,
    minPrice,
    sortByPrice,
    sortByRating,
    isAboutQuery,
    isPolicyQuery,
    isFaqQuery,
    isContactQuery,
    isCatalogQuery,
    specificKeywords: words,
  };
}

/**
 * Returns the most relevant crawled text chunks for an agent context prompt.
 * Uses query constraints (price, rating, intent) and hierarchical entity matching.
 */
export async function getRelevantWebsiteData(
  websiteOrWidgetId: string,
  query: string
): Promise<string> {
  if (!websiteOrWidgetId || typeof websiteOrWidgetId !== 'string' || websiteOrWidgetId.trim() === '') {
    console.warn('[widgetsDb:SCOPE_ENFORCEMENT] getRelevantWebsiteData called with empty websiteOrWidgetId. Failing closed.');
    return '';
  }

  try {
    const targetScope = websiteOrWidgetId.trim().toLowerCase();
    const isTargetUuid = isValidUuid(targetScope) && targetScope !== '00000000-0000-0000-0000-000000000000';
    let widgets: any[] | null = null;
    if (isTargetUuid) {
      const res = await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .or(`id.eq.${targetScope},website_id.eq.${targetScope},widget_id.eq.${targetScope}`);
      widgets = res.data;
    } else {
      const res = await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .eq('widget_id', targetScope);
      widgets = res.data;
    }

    const widgetIds = new Set<string>();
    if (isTargetUuid) widgetIds.add(targetScope);
    if (widgets && widgets.length > 0) {
      widgets.forEach(w => {
        if (isValidUuid(w.id)) widgetIds.add(w.id);
        if (isValidUuid(w.website_id)) widgetIds.add(w.website_id);
        if (isValidUuid(w.widget_id)) widgetIds.add(w.widget_id);
      });
    }
    const filterWidgetIds = Array.from(widgetIds).filter(id => isValidUuid(id) && id !== '00000000-0000-0000-0000-000000000000');

    if (filterWidgetIds.length === 0) {
      console.warn(`[widgetsDb:SCOPE_ENFORCEMENT] getRelevantWebsiteData: No valid widget found for scope '${websiteOrWidgetId}'. Failing closed.`);
      return '';
    }

    const trimmedQuery = query.trim().toLowerCase();
    const isGreetingOrConfirm = /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|start|help|yes|yeah|sure|yep|ok|okay|open it|go|please|do it|open that)$/i.test(trimmedQuery) || trimmedQuery.length < 3;
    if (isGreetingOrConfirm) {
      return '';
    }

    const constraints = parseQueryConstraints(query);

    const { data: records, error } = await supabase
      .from('website_data')
      .select('*')
      .in('widget_id', filterWidgetIds);

    if (error || !records || records.length === 0) {
      return '';
    }

    const scored = records.map(record => {
      let score = 0;
      const titleLower = (record.title || '').toLowerCase();
      const contentLower = (record.content || '').toLowerCase();
      const meta = (record.metadata || {}) as Record<string, any>;
      const itemPrice = parsePriceValue(meta.price || meta.cost || meta.estimatedPrice || record.price);
      const rating = typeof meta.ratings === 'number' ? meta.ratings : typeof meta.rating === 'number' ? meta.rating : 0;
      const hasPricingOrMedia = Boolean(itemPrice) || Boolean(record.image_urls?.length);
      // Expanded catalog entity check — vertical-agnostic (covers dealerships, real-estate, etc.)
      const isCatalogEntity = [
        'service', 'product', 'course', 'pricing', 'vehicle', 'property', 'plan',
        'car', 'truck', 'suv', 'listing', 'make', 'model', 'inventory', 'item',
      ].includes((record.entity_type || '').toLowerCase()) || hasPricingOrMedia;
      const isPolicyEntity = ['text'].includes(record.entity_type) || /policy|terms|privacy|cookie|compliance|legal|security/.test(titleLower);
      const isAboutEntity = /about|mission|story|empowering|founder|developer|team/.test(titleLower);
      const isFaqEntity = ['faq'].includes(record.entity_type) || /faq|frequently asked|questions/.test(titleLower);

      // Specific intent routing
      if (constraints.isAboutQuery && isAboutEntity) score += 120;
      if (constraints.isPolicyQuery && isPolicyEntity) score += 120;
      if (constraints.isFaqQuery && isFaqEntity) score += 120;

      // Penalize mismatched intents
      if (constraints.isAboutQuery && (isCatalogEntity || isPolicyEntity)) score -= 80;
      if (constraints.isPolicyQuery && isCatalogEntity) score -= 80;

      // Budget filtering
      if (constraints.maxPrice !== undefined) {
        if (itemPrice !== null && itemPrice <= constraints.maxPrice) score += 80;
        else if (itemPrice !== null && itemPrice > constraints.maxPrice) score -= 300;
      }
      if (constraints.minPrice !== undefined) {
        if (itemPrice !== null && itemPrice >= constraints.minPrice) score += 80;
        else if (itemPrice !== null && itemPrice < constraints.minPrice) score -= 300;
      }

      // Rating boost
      if (constraints.sortByRating && rating >= 4) {
        score += rating * 10;
      }

      // Exact title match (highest priority)
      let exactTitleMatch = false;
      if (titleLower && (trimmedQuery.includes(titleLower) || titleLower.includes(trimmedQuery))) {
        score += 200;
        exactTitleMatch = true;
      }

      // Specific keyword matching — title/category hits score highest, content hits score lower
      let titleHits = 0;
      let contentHits = 0;
      const metaCategory = String(meta.category || meta.tags || meta.level || '').toLowerCase();

      if (constraints.specificKeywords.length > 0) {
        for (const word of constraints.specificKeywords) {
          if (titleLower.includes(word) || metaCategory.includes(word)) {
            score += 80;
            titleHits++;
          } else if (contentLower.includes(word)) {
            score += 15;
            contentHits++;
          }
        }
      }

      // Relaxed filter: when specific keywords are provided but no title/category hit is found,
      // only hard-eliminate clearly irrelevant pages (policy/about/faq). Catalog entities that
      // matched content keywords still pass with a reduced score so broad/synonym queries
      // (e.g. "show me your cars" when titles say "2024 Jeep Wrangler") still surface results.
      if (constraints.specificKeywords.length > 0 && !exactTitleMatch && titleHits === 0) {
        if (isPolicyEntity || isAboutEntity || isFaqEntity) {
          // Clearly irrelevant — hard eliminate
          return { record, score: -100, itemPrice, rating, exactTitleMatch: false, titleHits: 0, contentHits };
        }
        if (contentHits === 0 && !isCatalogEntity) {
          // Not a catalog item and no keyword hit anywhere — eliminate
          return { record, score: -100, itemPrice, rating, exactTitleMatch: false, titleHits: 0, contentHits: 0 };
        }
        // Catalog entity with at least a content hit → keep with modest base score
        if (contentHits > 0) {
          score = Math.max(score, 5);
        } else if (isCatalogEntity) {
          // Catalog entity, no keyword match at all — give it a low base score so broad catalog
          // queries ("what do you have?") still return *something* rather than empty
          score = Math.max(score, 1);
        }
      }

      if (constraints.isCatalogQuery && hasPricingOrMedia) score += 30;

      return { record, score, itemPrice, rating, exactTitleMatch, titleHits, contentHits };
    });

    // When specific keywords were given but NOTHING matched title/category, fall back to any
    // content-level matches before giving up. Only return empty when there's truly no signal.
    if (constraints.specificKeywords.length > 0) {
      const anyTitleMatch = scored.some(s => s.titleHits > 0 || s.exactTitleMatch);
      const anyContentMatch = scored.some(s => (s as any).contentHits > 0);
      if (!anyTitleMatch && !anyContentMatch && !constraints.isAboutQuery && !constraints.isPolicyQuery && !constraints.isFaqQuery) {
        // Absolute zero signal — return empty so LLM can honestly say "not found"
        return '';
      }
    }

    const validMatches = scored.filter(s => s.score > 0);
    if (validMatches.length === 0) return '';

    // If there is an exact title match, prioritize exact match
    const exactMatches = validMatches.filter(s => s.exactTitleMatch);
    const candidateList = exactMatches.length > 0 ? exactMatches : validMatches;

    // Apply sorting
    if (constraints.sortByPrice === 'asc') {
      candidateList.sort((a, b) => (a.itemPrice ?? 999999) - (b.itemPrice ?? 999999));
    } else if (constraints.sortByPrice === 'desc') {
      candidateList.sort((a, b) => (b.itemPrice ?? 0) - (a.itemPrice ?? 0));
    } else if (constraints.sortByRating) {
      candidateList.sort((a, b) => b.rating - a.rating);
    } else {
      candidateList.sort((a, b) => b.score - a.score);
    }

    const topMatches = candidateList.slice(0, 4);
    return topMatches.map(s => {
      const r = s.record;
      const meta = (r.metadata || {}) as Record<string, any>;
      const price = meta.price || r.price ? ` [Price: ${meta.price || r.price}]` : '';
      const url = r.source_url ? ` [SourceURL: ${r.source_url}]` : '';
      const desc = r.short_description ? `Description: ${r.short_description}\n` : '';
      return `Title: ${r.title}${price}${url}\n${desc}Content: ${r.content}`;
    }).join('\n\n');
  } catch (err) {
    console.error(`[widgetsDb] Error in getRelevantWebsiteData:`, err);
    return '';
  }
}

// ── Structured result objects for frontend rendering ──────────────────────────

export interface WebsiteDataRecord {
  id?: string;
  title?: string;
  description?: string;
  shortDescription?: string;
  content?: string;
  images?: string[];
  imageUrls?: string[];
  price?: string | number;
  currency?: string;
  availability?: string;
  rating?: number | string;
  reviews?: number | string;
  attributes?: Record<string, string | number | boolean>;
  sourceUrl?: string;
  entityType?: string;
  category?: string;
  level?: string;
  similarity?: number;
  firstSeen?: string;
  lastSeen?: string;
  freshnessStatus?: string;
  metadata?: any;
}

/**
 * Executes a PostgreSQL / pgvector cosine similarity search scoped strictly to the requested widget.
 * 
 * 1. Generates query embedding via embedQuery (never dummy vectors).
 * 2. If embedding generation fails (or no API key), returns [] cleanly so callers can fall back.
 * 3. Executes the Supabase RPC match_website_data with in-database widget_id filtering.
 * 4. Maps results to WebsiteDataRecord with similarity scores, metadata, image_urls, and freshness.
 *
 * @param websiteOrWidgetId - Widget UUID, slug, or website UUID
 * @param query - Raw search query string
 * @param limit - Maximum top-K results to return (default 5)
 * @param threshold - Minimum cosine similarity threshold (default 0.25)
 * @returns Array of WebsiteDataRecord sorted by descending similarity
 */
export async function searchWebsiteDataVector(
  websiteOrWidgetId: string,
  query: string,
  limit = 5,
  threshold = 0.25
): Promise<WebsiteDataRecord[]> {
  if (!websiteOrWidgetId || typeof websiteOrWidgetId !== 'string' || !websiteOrWidgetId.trim()) {
    console.warn('[widgetsDb:SCOPE_ENFORCEMENT] searchWebsiteDataVector called with empty widgetId. Failing closed.');
    return [];
  }
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  const cleanScope = websiteOrWidgetId.trim().toLowerCase();
  const cleanQuery = query.trim();

  // 1. Resolve widget UUIDs for strict in-database filtering
  const isTargetUuid = isValidUuid(cleanScope) && cleanScope !== '00000000-0000-0000-0000-000000000000';
  let widgets: any[] | null = null;
  if (isTargetUuid) {
    const res = await supabase
      .from('widgets')
      .select('id, widget_id, website_id')
      .or(`id.eq.${cleanScope},website_id.eq.${cleanScope},widget_id.eq.${cleanScope}`);
    widgets = res.data;
  } else {
    const res = await supabase
      .from('widgets')
      .select('id, widget_id, website_id')
      .eq('widget_id', cleanScope);
    widgets = res.data;
  }

  const widgetIds = new Set<string>();
  if (isTargetUuid) widgetIds.add(cleanScope);
  if (widgets && widgets.length > 0) {
    widgets.forEach(w => {
      if (isValidUuid(w.id)) widgetIds.add(w.id);
      if (isValidUuid(w.website_id)) widgetIds.add(w.website_id);
      if (isValidUuid(w.widget_id)) widgetIds.add(w.widget_id);
    });
  }

  const filterWidgetIds = Array.from(widgetIds).filter(
    id => isValidUuid(id) && id !== '00000000-0000-0000-0000-000000000000'
  );

  if (filterWidgetIds.length === 0) {
    console.warn(`[widgetsDb:SCOPE_ENFORCEMENT] searchWebsiteDataVector: No valid widget found for scope '${websiteOrWidgetId}'. Failing closed.`);
    return [];
  }

  // 2. Generate real query embedding (fails gracefully if no provider keys or API fails)
  const { embedQuery } = await import('@/lib/embeddings');
  const queryEmbedding = await embedQuery(cleanQuery);
  if (!queryEmbedding) {
    return [];
  }

  try {
    const { data: matches, error } = await supabase.rpc('match_website_data', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
      filter_widget_ids: filterWidgetIds,
    });

    if (error) {
      console.error('[widgetsDb:searchWebsiteDataVector] RPC error:', error);
      return [];
    }

    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return [];
    }

    return matches.map((row: any) => {
      const meta = (row.metadata || {}) as Record<string, any>;
      const collectedImages: string[] = [];
      if (Array.isArray(row.image_urls)) {
        collectedImages.push(...row.image_urls.filter((u: any) => typeof u === 'string' && u.startsWith('http')));
      }
      if (Array.isArray(meta.images)) {
        collectedImages.push(...meta.images.filter((u: any) => typeof u === 'string' && u.startsWith('http')));
      }

      const priceVal = meta.price ?? meta.cost ?? meta.estimatedPrice ?? row.price;
      const ratingVal = typeof meta.ratings === 'number' ? meta.ratings : (typeof meta.rating === 'number' ? meta.rating : undefined);
      const reviewsVal = typeof meta.reviews === 'number' ? meta.reviews : (typeof meta.review_count === 'number' ? meta.review_count : undefined);

      return {
        id: row.id,
        title: row.title || 'Untitled',
        description: row.short_description || row.content || '',
        shortDescription: row.short_description || '',
        content: row.content || '',
        images: collectedImages,
        imageUrls: collectedImages,
        price: priceVal,
        currency: meta.currency,
        availability: meta.availability,
        rating: ratingVal,
        reviews: reviewsVal,
        attributes: meta.attributes || meta.specs,
        sourceUrl: row.source_url,
        entityType: row.entity_type || 'product',
        category: meta.category,
        level: meta.level,
        metadata: {
          ...meta,
          similarity: row.similarity,
          firstSeen: row.first_seen || row.created_at,
          lastSeen: row.last_seen || row.updated_at,
          stillListed: row.still_listed !== false,
          freshnessStatus: (meta as any).freshnessStatus || 'fresh',
        },
        similarity: row.similarity,
        firstSeen: row.first_seen || row.created_at,
        lastSeen: row.last_seen || row.updated_at,
        freshnessStatus: (meta as any).freshnessStatus || 'fresh',
      } as WebsiteDataRecord;
    });
  } catch (err) {
    console.error('[widgetsDb:searchWebsiteDataVector] Exception:', err);
    return [];
  }
}

/**
 * Returns scored, structured website data records for frontend card rendering.
 * First executes real pgvector cosine similarity search. If vector search is unavailable
 * or returns no matches, seamlessly falls back to keyword retrieval.
 */
export async function getRelevantWebsiteRecords(
  websiteOrWidgetId: string,
  query: string,
  limit = 3
): Promise<WebsiteDataRecord[]> {
  if (!websiteOrWidgetId || typeof websiteOrWidgetId !== 'string' || websiteOrWidgetId.trim() === '') {
    console.warn('[widgetsDb:SCOPE_ENFORCEMENT] getRelevantWebsiteRecords called with empty websiteOrWidgetId. Failing closed.');
    return [];
  }

  try {
    const trimmedQuery = query.trim().toLowerCase();
    const isGreetingOrConfirm = /^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|start|help|yes|yeah|sure|yep|ok|okay|open it|go|please|do it|open that)$/i.test(trimmedQuery) || trimmedQuery.length < 3;
    if (isGreetingOrConfirm) {
      return [];
    }

    const constraints = parseQueryConstraints(query);
    // If user asked purely about About, Policy, FAQ, or Contact info, return 0 catalog cards!
    if (constraints.isAboutQuery || constraints.isPolicyQuery || constraints.isFaqQuery || constraints.isContactQuery) {
      return [];
    }

    // 1. Try real pgvector search first
    const vectorMatches = await searchWebsiteDataVector(websiteOrWidgetId, query, limit, 0.25);
    if (vectorMatches.length > 0) {
      return vectorMatches.slice(0, limit);
    }

    const targetScope = websiteOrWidgetId.trim().toLowerCase();
    const isTargetUuid = isValidUuid(targetScope) && targetScope !== '00000000-0000-0000-0000-000000000000';
    let widgets: any[] | null = null;
    if (isTargetUuid) {
      const res = await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .or(`id.eq.${targetScope},website_id.eq.${targetScope},widget_id.eq.${targetScope}`);
      widgets = res.data;
    } else {
      const res = await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .eq('widget_id', targetScope);
      widgets = res.data;
    }

    const widgetIds = new Set<string>();
    if (isTargetUuid) widgetIds.add(targetScope);
    if (widgets && widgets.length > 0) {
      widgets.forEach(w => {
        if (isValidUuid(w.id)) widgetIds.add(w.id);
        if (isValidUuid(w.website_id)) widgetIds.add(w.website_id);
        if (isValidUuid(w.widget_id)) widgetIds.add(w.widget_id);
      });
    }
    const filterWidgetIds = Array.from(widgetIds).filter(id => isValidUuid(id) && id !== '00000000-0000-0000-0000-000000000000');

    if (filterWidgetIds.length === 0) {
      console.warn(`[widgetsDb:SCOPE_ENFORCEMENT] getRelevantWebsiteRecords: No valid widget found for scope '${websiteOrWidgetId}'. Failing closed.`);
      return [];
    }

    const { data: records, error } = await supabase
      .from('website_data')
      .select('*')
      .in('widget_id', filterWidgetIds);

    if (error || !records || records.length === 0) return [];

    const scored = records.map(record => {
      let score = 0;
      const titleLower = (record.title || '').toLowerCase();
      const contentLower = (record.content || '').toLowerCase();
      const meta = (record.metadata || {}) as Record<string, any>;
      const itemPrice = parsePriceValue(meta.price || meta.cost || meta.estimatedPrice || record.price);
      const rating = typeof meta.ratings === 'number' ? meta.ratings : typeof meta.rating === 'number' ? meta.rating : 0;
      const hasPricingOrMedia = Boolean(itemPrice) || Boolean(record.image_urls?.length) || Boolean(meta.images?.length);
      // Expanded catalog entity check — vertical-agnostic (dealerships, real-estate, etc.)
      const isCatalogEntity = [
        'service', 'product', 'course', 'pricing', 'vehicle', 'property', 'plan',
        'car', 'truck', 'suv', 'listing', 'make', 'model', 'inventory', 'item',
      ].includes((record.entity_type || '').toLowerCase()) || hasPricingOrMedia;
      const isPolicyEntity = ['text'].includes(record.entity_type) || /policy|terms|privacy|cookie|compliance|legal/.test(titleLower);

      if (!isCatalogEntity || isPolicyEntity) return { record, score: -100, itemPrice, rating, exactTitleMatch: false, titleHits: 0, contentHits: 0 };

      // Budget filtering
      if (constraints.maxPrice !== undefined) {
        if (itemPrice !== null && itemPrice <= constraints.maxPrice) score += 80;
        else if (itemPrice !== null && itemPrice > constraints.maxPrice) score -= 300;
      }
      if (constraints.minPrice !== undefined) {
        if (itemPrice !== null && itemPrice >= constraints.minPrice) score += 80;
        else if (itemPrice !== null && itemPrice < constraints.minPrice) score -= 300;
      }

      // Rating boost
      if (constraints.sortByRating && rating >= 4) {
        score += rating * 10;
      }

      // Exact title / entity match
      let exactTitleMatch = false;
      const normTitleStr = (titleLower || '').replace(/[^a-z0-9]/g, '');
      const normQueryStr = (trimmedQuery || '').replace(/[^a-z0-9]/g, '');
      if (normTitleStr.length > 0 && normTitleStr === normQueryStr) {
        score += 300;
        exactTitleMatch = true;
      } else if (titleLower && (trimmedQuery.includes(titleLower) || titleLower.includes(trimmedQuery))) {
        score += 120;
      }

      // Specific keyword match in title, category, tags
      let titleHits = 0;
      let contentHits = 0;
      const metaStrings = Object.values(meta)
        .filter(v => typeof v === 'string' || typeof v === 'number')
        .join(' ')
        .toLowerCase();

      if (constraints.specificKeywords.length > 0) {
        for (const word of constraints.specificKeywords) {
          const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const wordBoundaryRegex = new RegExp(`\\b${escapedWord}\\b`, 'i');
          if (wordBoundaryRegex.test(titleLower) || wordBoundaryRegex.test(metaStrings)) {
            score += 80;
            titleHits++;
          } else if (wordBoundaryRegex.test(contentLower)) {
            score += 25;
            contentHits++;
          }
        }
      }

      if (constraints.specificKeywords.length > 0 && !exactTitleMatch && titleHits === 0) {
        if (contentHits === 0) {
          // Zero keyword signal for specific search: penalize so it won't be returned
          score -= 100;
        } else {
          // Content hit present — keep with modest score
          score += 10;
        }
      }

      const isDirectoryPage = record.source_url && /\/(courses|products|services|catalog|inventory|shop|all)\/?$/i.test(record.source_url) && !itemPrice;
      if (isDirectoryPage) {
        score -= 60;
      }

      if (itemPrice !== null && itemPrice > 0) {
        score += 50;
      }

      if (hasPricingOrMedia) score += 30;

      return { record, score, itemPrice, rating, exactTitleMatch, titleHits, contentHits };
    });

    // If specific topic keywords were asked and NOTHING in the catalog matched title, category,
    // OR content, return [] so the agent correctly says "not found" rather than hallucinating.
    // We keep results when content-level hits exist (broad/synonym queries like "show me cars").
    // Filter out broad generic catalog words so "all offerings" is treated as broad catalog search
    const BROAD_CATALOG_WORDS = new Set([
      'offering', 'offerings', 'program', 'programs', 'course', 'courses', 'product', 'products',
      'service', 'services', 'inventory', 'catalog', 'all', 'item', 'items', 'list', 'show',
      'vehicle', 'vehicles', 'car', 'cars', 'truck', 'trucks', 'suv', 'suvs', 'auto', 'automobile', 'automotive'
    ]);
    const trueSpecificKeywords = constraints.specificKeywords.filter(w => !BROAD_CATALOG_WORDS.has(w));

    if (trueSpecificKeywords.length > 0) {
      const anyTitleMatch = scored.some(s => s.exactTitleMatch || s.titleHits > 0);
      const anyContentMatch = scored.some(s => (s as any).contentHits > 0);
      if (!anyTitleMatch && !anyContentMatch) {
        return [];
      }
    }

    const validMatches = scored.filter(s => s.score > 0);
    if (validMatches.length === 0) return [];

    // If an exact title match was found for a single specific item, return ONLY that specific item
    const exactMatches = validMatches.filter(s => s.exactTitleMatch);
    const candidateList = exactMatches.length > 0 ? exactMatches : validMatches;

    // Apply sorting
    if (constraints.sortByPrice === 'asc') {
      candidateList.sort((a, b) => (a.itemPrice ?? 999999) - (b.itemPrice ?? 999999));
    } else if (constraints.sortByPrice === 'desc') {
      candidateList.sort((a, b) => (b.itemPrice ?? 0) - (a.itemPrice ?? 0));
    } else if (constraints.sortByRating) {
      candidateList.sort((a, b) => b.rating - a.rating);
    } else {
      candidateList.sort((a, b) => b.score - a.score);
    }

    // Deduplicate by title
    const seenTitles = new Set<string>();
    const uniqueCandidates = candidateList.filter(s => {
      const t = (s.record.title || '').trim().toLowerCase();
      if (!t || seenTitles.has(t)) return false;
      seenTitles.add(t);
      return true;
    });

    const maxItems = exactMatches.length > 0 ? 1 : limit;
    const selected = uniqueCandidates.slice(0, maxItems);

    return selected.map(s => {
      const r = s.record;
      const meta = (r.metadata || {}) as Record<string, any>;
      const result: WebsiteDataRecord = {
        id: r.id,
        entityType: r.entity_type,
        title: r.title || 'Untitled',
      };
      
      if (r.short_description) {
        result.description = r.short_description;
        result.shortDescription = r.short_description;
      } else if (r.content) {
        const cleanContent = r.content.substring(0, 300).trimEnd();
        result.description = cleanContent + (r.content.length > 300 ? '…' : '');
        result.shortDescription = result.description;
      }
      
      // Extract real images only from crawled/connector metadata
      const collectedImages: string[] = [];
      if (Array.isArray(r.image_urls)) {
        r.image_urls.forEach((img: any) => { if (typeof img === 'string' && img.startsWith('http')) collectedImages.push(img); });
      }
      if (Array.isArray(meta.images)) {
        meta.images.forEach((img: any) => { if (typeof img === 'string' && img.startsWith('http')) collectedImages.push(img); });
      }
      if (typeof meta.image === 'string' && meta.image.startsWith('http')) {
        collectedImages.push(meta.image);
      }
      if (typeof meta.photoUrl === 'string' && meta.photoUrl.startsWith('http')) {
        collectedImages.push(meta.photoUrl);
      }
      if (typeof meta.thumbnail === 'string' && meta.thumbnail.startsWith('http')) {
        collectedImages.push(meta.thumbnail);
      }

      const realImages = Array.from(new Set(collectedImages));
      result.images = realImages;
      result.imageUrls = realImages;

      if (meta.price !== undefined && typeof meta.price !== 'object') result.price = String(meta.price).replace(/^\$+/, '$');
      else if (r.price !== undefined) result.price = String(r.price).replace(/^\$+/, '$');

      if (meta.currency) result.currency = String(meta.currency);
      else if (r.currency) result.currency = String(r.currency);

      if (meta.availability && typeof meta.availability !== 'object') result.availability = String(meta.availability);
      if (meta.rating !== undefined && typeof meta.rating !== 'object') result.rating = meta.rating;
      if (meta.ratings !== undefined && typeof meta.ratings !== 'object') result.rating = meta.ratings;
      if (meta.reviews !== undefined) {
        result.reviews = Array.isArray(meta.reviews) ? meta.reviews.length : typeof meta.reviews === 'number' ? meta.reviews : parseInt(String(meta.reviews), 10) || undefined;
      }
      if (meta.category || meta.tags) result.category = String(meta.category || meta.tags).trim();
      if (meta.level) result.level = String(meta.level).trim();
      if (meta.attributes && typeof meta.attributes === 'object') result.attributes = meta.attributes;
      result.metadata = meta;
      if (r.source_url) result.sourceUrl = r.source_url;
      return result;
    });
  } catch (err) {
    console.error(`[widgetsDb] Error in getRelevantWebsiteRecords:`, err);
    return [];
  }
}

// Fast in-memory cache for website context summaries to accelerate WebRTC call setup
const contextSummaryCache = new Map<string, { summary: string; expiresAt: number }>();

export async function getWebsiteContextSummary(websiteId: string): Promise<string> {
  const cacheKey = (websiteId || '').trim().toLowerCase();
  const now = Date.now();
  const cached = contextSummaryCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.summary;
  }

  try {
    const isTargetUuid = isValidUuid(websiteId);
    const widgetIds = new Set<string>();
    if (isTargetUuid) widgetIds.add(websiteId);

    if (isTargetUuid) {
      const { data: widgets } = await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .or(`id.eq.${websiteId},website_id.eq.${websiteId},widget_id.eq.${websiteId}`);
      if (widgets) {
        widgets.forEach(w => {
          if (isValidUuid(w.id)) widgetIds.add(w.id);
          if (isValidUuid(w.website_id)) widgetIds.add(w.website_id);
          if (isValidUuid(w.widget_id)) widgetIds.add(w.widget_id);
        });
      }
    } else if (websiteId) {
      const { data: widgets } = await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .eq('widget_id', websiteId);
      if (widgets) {
        widgets.forEach(w => {
          if (isValidUuid(w.id)) widgetIds.add(w.id);
          if (isValidUuid(w.website_id)) widgetIds.add(w.website_id);
          if (isValidUuid(w.widget_id)) widgetIds.add(w.widget_id);
        });
      }
    }

    const filterWidgetIds = Array.from(widgetIds).filter(id => isValidUuid(id) && id !== '00000000-0000-0000-0000-000000000000');
    if (filterWidgetIds.length === 0) {
      console.warn(`[widgetsDb:SCOPE_ENFORCEMENT] getWebsiteContextSummary: No valid widget found for scope '${websiteId}'. Failing closed.`);
      contextSummaryCache.set(cacheKey, { summary: '', expiresAt: now + 300_000 });
      return '';
    }

    // Select lightweight text fields + source_url
    const { data: records, error } = await supabase
      .from('website_data')
      .select('title, entity_type, metadata, short_description, content, source_url')
      .in('widget_id', filterWidgetIds)
      .limit(45);

    if (error || !records || records.length === 0) {
      contextSummaryCache.set(cacheKey, { summary: '', expiresAt: now + 300_000 });
      return '';
    }

    const catalogItems = records.filter(r => ['service', 'product', 'course', 'pricing', 'vehicle', 'property', 'plan'].includes(r.entity_type) || Boolean(r.metadata?.price));
    const infoPages = records.filter(r => !catalogItems.includes(r));

    const parts: string[] = [
      'VOICE AGENT OPERATING INSTRUCTIONS:',
      '- You are the official AI receptionist and voice assistant for this website.',
      '- You have complete, authoritative knowledge of all items, offerings, and routes listed below.',
      '- When a user asks for the "best", "top-selling", "highest rated", or "most popular" item, confidently recommend the top items from your catalog based on their rating, reviews, or featured status. Never say "I don\'t have sales rankings" or "I am an AI without real-time data".',
      '- When asked to navigate to or open any page (e.g. "navigate to about page", "open courses"), say: "Opening the [Page Name] page on your screen now!". NEVER read out raw URL links (such as "https://...") aloud over voice telephony.',
      '',
      'Website Catalog & Offerings:'
    ];

    if (catalogItems.length > 0) {
      catalogItems.slice(0, 15).forEach(c => {
        const meta = (c.metadata || {}) as Record<string, any>;
        const price = meta.price ? ` (${meta.price})` : '';
        const level = meta.level ? ` [Level: ${meta.level}]` : '';
        const rating = meta.rating || meta.ratings ? ` [Rating: ${meta.rating || meta.ratings}★]` : '';
        const reviews = meta.reviews ? (Array.isArray(meta.reviews) ? ` [${meta.reviews.length} reviews]` : ` [${meta.reviews} reviews]`) : '';
        const bestSeller = meta.purchased && meta.purchased > 0 ? ` [Top Best Seller - ${meta.purchased} ordered]` : (rating.includes('5') ? ' [Top Rated / Best Seller]' : '');
        const desc = c.short_description || meta.description || (c.content ? c.content.substring(0, 100).replace(/\s+/g, ' ') : '');
        const url = c.source_url ? ` [URL: ${c.source_url}]` : '';
        parts.push(`• ${c.title}${price}${level}${rating}${reviews}${bestSeller}${url}: ${desc}`);
      });
    }

    if (infoPages.length > 0) {
      parts.push('\nAvailable Website Pages & Routes:');
      infoPages.slice(0, 8).forEach(g => {
        const desc = g.short_description || (g.content ? g.content.substring(0, 120).replace(/\s+/g, ' ').trim() : '');
        const url = g.source_url ? ` [URL: ${g.source_url}]` : '';
        parts.push(`• ${g.title}${url}: ${desc}`);
      });
    }

    const summary = parts.join('\n');
    contextSummaryCache.set(cacheKey, { summary, expiresAt: now + 300_000 }); // 5 min TTL
    return summary;
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
  first_seen?: string;
  last_seen?: string;
  still_listed?: boolean;
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

  const nowIso = new Date().toISOString();

  // 3. Enrich rows with embeddings & freshness timestamps (both top-level and JSONB metadata)
  const enrichedRows = rows.map((row, idx) => {
    const rowFirstSeen = row.first_seen || (row.metadata as any)?.first_seen || (row.metadata as any)?.firstSeen || nowIso;
    const rowLastSeen = row.last_seen || (row.metadata as any)?.last_seen || (row.metadata as any)?.lastSeen || nowIso;
    const rowStillListed = row.still_listed !== undefined && row.still_listed !== null
      ? Boolean(row.still_listed)
      : (row.metadata as any)?.still_listed !== undefined && (row.metadata as any)?.still_listed !== null
      ? Boolean((row.metadata as any)?.still_listed)
      : true;

    const mergedMetadata = {
      ...(row.metadata || {}),
      first_seen: rowFirstSeen,
      last_seen: rowLastSeen,
      still_listed: rowStillListed,
    };

    return {
      widget_id: row.widget_id,
      source_url: row.source_url || null,
      title: row.title || 'Untitled',
      content: row.content || '',
      entity_type: row.entity_type || 'text',
      metadata: mergedMetadata,
      short_description: row.short_description || row.content?.substring(0, 300) || '',
      image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
      data_type: row.data_type || 'crawl',
      category_path: Array.isArray(row.category_path) ? row.category_path : [],
      content_hash: row.content_hash || null,
      last_checked_at: row.last_checked_at || nowIso,
      first_seen: rowFirstSeen,
      last_seen: rowLastSeen,
      still_listed: rowStillListed,
      embedding: row.embedding && row.embedding.length > 0 ? row.embedding : (embeddingMap.get(idx) || null),
      ...(row.id ? { id: row.id } : {})
    };
  });

  // 4. Perform batch insert or upsert in chunks of 50
  const { client: dbClient, url: activeUrl } = getDbClient();
  if (!activeUrl) {
    console.warn('[widgetsDb] No active Supabase URL configured; skipping PostgreSQL write.');
    return;
  }

  const DB_CHUNK_SIZE = 50;
  for (let i = 0; i < enrichedRows.length; i += DB_CHUNK_SIZE) {
    const chunk = enrichedRows.slice(i, i + DB_CHUNK_SIZE);
    const rowsWithId = chunk.filter(row => row.id);
    const rowsWithoutId = chunk.filter(row => !row.id);

    if (rowsWithId.length > 0) {
      let { error: upsertError } = await dbClient.from('website_data').upsert(rowsWithId);
      // Fallback if remote schema cache is missing newer columns
      if (upsertError && (upsertError.code === 'PGRST204' || upsertError.message?.includes('column') || upsertError.message?.includes('schema cache'))) {
        console.warn('[widgetsDb] Retrying upsert without newer columns:', upsertError.message);
        const fallbackRows = rowsWithId.map(r => {
          const { first_seen, last_seen, still_listed, ...rest } = r;
          return rest;
        });
        const retry = await dbClient.from('website_data').upsert(fallbackRows);
        upsertError = retry.error;
      }
      if (upsertError) {
        console.error('[widgetsDb] Error upserting website data rows with id:', upsertError);
        throw new Error(`[widgetsDb] Upsert failed: ${upsertError.message}`);
      }
    }

    if (rowsWithoutId.length > 0) {
      let { error: insertError } = await dbClient.from('website_data').insert(rowsWithoutId);
      // Fallback if remote schema cache is missing newer columns
      if (insertError && (insertError.code === 'PGRST204' || insertError.message?.includes('column') || insertError.message?.includes('schema cache'))) {
        console.warn('[widgetsDb] Retrying insert without newer columns:', insertError.message);
        const fallbackRows = rowsWithoutId.map(r => {
          const { first_seen, last_seen, still_listed, ...rest } = r;
          return rest;
        });
        const retry = await dbClient.from('website_data').insert(fallbackRows);
        insertError = retry.error;
      }
      if (insertError) {
        console.error('[widgetsDb] Error inserting new website data rows:', insertError);
        throw new Error(`[widgetsDb] Insert failed: ${insertError.message}`);
      }
    }
  }
}

/**
 * Inserts or updates a single website data record.
 */
export async function saveWebsiteData(row: WebsiteDataRow): Promise<void> {
  await saveWebsiteDataBatch([row]);
}



