import { createClient } from '@supabase/supabase-js';
import { VoiceWidgetConfig } from './voiceWidget/types';

export interface WidgetRecord {
  id: string; // UUID primary key in DB
  widgetId: string; // Unique slug identifier (e.g. 'front-desk')
  organizationId: string;
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

  // Masked or real API keys (strictly kept in widget_secrets table)
  retellApiKey?: string;
  vapiApiKey?: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn(
    '[Supabase] Warning: NEXT_PUBLIC_SUPABASE_URL is not defined in env. ' +
    'Please set this environment variable to connect to PostgreSQL.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

function fromDbRow(widgetRow: any, secretRow?: any): WidgetRecord {
  return {
    id: widgetRow.id,
    widgetId: widgetRow.widget_id,
    organizationId: widgetRow.organization_id || 'default-org',
    name: widgetRow.name,
    status: (widgetRow.status || 'active') as 'active' | 'inactive' | 'paused',
    provider: widgetRow.provider as 'retell' | 'vapi',
    agentId: widgetRow.agent_id || '',
    assistantId: widgetRow.assistant_id || '',
    credentialSecretId: widgetRow.credential_secret_id || '',
    websiteId: widgetRow.website_id || '',
    allowedDomains: widgetRow.allowed_domains || [],
    config: widgetRow.config,
    createdAt: widgetRow.created_at,
    updatedAt: widgetRow.updated_at,
    retellApiKey: secretRow?.retell_api_key || '',
    vapiApiKey: secretRow?.vapi_api_key || '',
  };
}

export async function getWidget(idOrWidgetId: string): Promise<WidgetRecord | null> {
  const searchId = idOrWidgetId.toLowerCase();
  const normalizedSearchId = searchId === 'myfrontdesk' ? 'front-desk' : searchId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedSearchId);

  try {
    const query = supabase.from('widgets').select('*');
    if (isUuid) {
      query.eq('id', normalizedSearchId);
    } else {
      query.eq('widget_id', normalizedSearchId);
    }

    const { data: widgetRow, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    let secretRow: any = null;
    if (widgetRow.credential_secret_id) {
      const { data: secretData } = await supabase
        .from('widget_secrets')
        .select('*')
        .eq('id', widgetRow.credential_secret_id)
        .single();
      secretRow = secretData;
    }

    return fromDbRow(widgetRow, secretRow);
  } catch (err) {
    console.error(`[widgetsDb] Error in getWidget for ${normalizedSearchId}:`, err);
    return null;
  }
}

export async function saveWidget(
  record: Omit<WidgetRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<WidgetRecord> {
  const widgetIdSlug = record.widgetId.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const normalizedSlug = widgetIdSlug === 'myfrontdesk' ? 'front-desk' : widgetIdSlug;

  // 1. Check for existing widget to merge or reuse ID
  const existing = await getWidget(normalizedSlug) || (record.id ? await getWidget(record.id) : null);

  let credentialSecretId = existing?.credentialSecretId || undefined;

  // 2. Resolve credentials API keys (preserve existing if masked or empty)
  const retellApiKey = (record.retellApiKey === undefined || record.retellApiKey === '••••••••' || record.retellApiKey === '') 
    ? (existing?.retellApiKey || '') 
    : record.retellApiKey;

  const vapiApiKey = (record.vapiApiKey === undefined || record.vapiApiKey === '••••••••' || record.vapiApiKey === '') 
    ? (existing?.vapiApiKey || '') 
    : record.vapiApiKey;

  // 3. Insert or Update widget_secrets
  if (retellApiKey || vapiApiKey || credentialSecretId) {
    if (credentialSecretId) {
      const { error: secretErr } = await supabase
        .from('widget_secrets')
        .upsert({
          id: credentialSecretId,
          retell_api_key: retellApiKey,
          vapi_api_key: vapiApiKey,
        });
      if (secretErr) throw secretErr;
    } else {
      const { data: secretData, error: secretErr } = await supabase
        .from('widget_secrets')
        .insert({
          retell_api_key: retellApiKey,
          vapi_api_key: vapiApiKey,
        })
        .select('*')
        .single();
      
      if (secretErr) throw secretErr;
      credentialSecretId = secretData.id;
    }
  }

  // 4. Construct widget payload
  const primaryId = record.id || existing?.id;
  const widgetRowPayload = {
    ...(primaryId ? { id: primaryId } : {}),
    widget_id: normalizedSlug,
    organization_id: record.organizationId || existing?.organizationId || 'default-org',
    name: record.name.trim(),
    status: record.status || existing?.status || 'active',
    provider: record.provider,
    agent_id: record.agentId || record.config?.provider?.agentId || existing?.agentId || '',
    assistant_id: record.assistantId || record.config?.provider?.agentId || existing?.assistantId || '',
    credential_secret_id: credentialSecretId || null,
    website_id: record.websiteId || existing?.websiteId || '',
    allowed_domains: record.allowedDomains || existing?.allowedDomains || [],
    config: record.config,
  };

  // 5. Upsert widget
  const { data: savedWidgetRow, error: widgetErr } = await supabase
    .from('widgets')
    .upsert(widgetRowPayload)
    .select('*')
    .single();

  if (widgetErr) throw widgetErr;

  // 6. Return mapped record
  let savedSecretRow: any = null;
  if (credentialSecretId) {
    const { data } = await supabase
      .from('widget_secrets')
      .select('*')
      .eq('id', credentialSecretId)
      .single();
    savedSecretRow = data;
  }

  return fromDbRow(savedWidgetRow, savedSecretRow);
}

export async function deleteWidget(idOrWidgetId: string): Promise<boolean> {
  const existing = await getWidget(idOrWidgetId);
  if (!existing) return false;

  try {
    const { error: widgetErr } = await supabase
      .from('widgets')
      .delete()
      .eq('id', existing.id);

    if (widgetErr) throw widgetErr;

    if (existing.credentialSecretId) {
      await supabase
        .from('widget_secrets')
        .delete()
        .eq('id', existing.credentialSecretId);
    }

    return true;
  } catch (err) {
    console.error(`[widgetsDb] Error in deleteWidget for ${idOrWidgetId}:`, err);
    return false;
  }
}

export async function listWidgets(): Promise<WidgetRecord[]> {
  try {
    const { data: widgets, error } = await supabase
      .from('widgets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!widgets || widgets.length === 0) return [];

    const secretIds = widgets
      .map(w => w.credential_secret_id)
      .filter((id): id is string => !!id);

    const secretsMap = new Map<string, any>();
    if (secretIds.length > 0) {
      const { data: secrets } = await supabase
        .from('widget_secrets')
        .select('*')
        .in('id', secretIds);
      
      if (secrets) {
        secrets.forEach(s => secretsMap.set(s.id, s));
      }
    }

    return widgets.map(w => fromDbRow(w, secretsMap.get(w.credential_secret_id)));
  } catch (err) {
    console.error('[widgetsDb] Error in listWidgets:', err);
    return [];
  }
}
