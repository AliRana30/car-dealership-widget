import { createClient } from '@supabase/supabase-js';
import { VoiceWidgetConfig } from './voiceWidget/types';
import {
  WidgetConfigurationRecord,
  toConfigurationRecord,
  fromConfigurationRecord,
} from './voiceWidget/default';

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

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn(
    '[Supabase] Warning: NEXT_PUBLIC_SUPABASE_URL is not defined in env. ' +
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

  return {
    id: widgetRow.id,
    widgetId: widgetRow.widget_id,
    organizationId: widgetRow.organization_id || '00000000-0000-0000-0000-000000000000',
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

export async function saveWidget(
  record: Omit<WidgetRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<WidgetRecord> {
  const widgetIdSlug = record.widgetId.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  const normalizedSlug = widgetIdSlug === 'myfrontdesk' ? 'front-desk' : widgetIdSlug;

  // 1. Check for existing widget to merge or reuse ID
  const existing = await getWidget(normalizedSlug) || (record.id ? await getWidget(record.id) : null);

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
    organization_id: record.organizationId || existing?.organizationId || '00000000-0000-0000-0000-000000000000',
    name: record.name.trim(),
    status: record.status || existing?.status || 'active',
    agent_id: agentUuid,
    website_id: record.websiteId || existing?.websiteId || '00000000-0000-0000-0000-000000000000',
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

export async function deleteWidget(idOrWidgetId: string): Promise<boolean> {
  const existing = await getWidget(idOrWidgetId);
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

export async function listWidgets(): Promise<WidgetRecord[]> {
  try {
    const { data: widgets, error } = await supabase
      .from('widgets')
      .select('*')
      .order('created_at', { ascending: false });

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



export async function getWidgetConfiguration(idOrWidgetId: string): Promise<WidgetConfigurationRecord | null> {
  const widget = await getWidget(idOrWidgetId);
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
  configRecord: WidgetConfigurationRecord
): Promise<WidgetConfigurationRecord | null> {
  const widget = await getWidget(idOrWidgetId);
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

