import { createClient } from '@supabase/supabase-js';
import { VoiceWidgetConfig } from './voiceWidget/types';

export interface WidgetRecord {
  id: string;
  name: string;
  provider: 'retell' | 'vapi';
  retellApiKey?: string;
  retellAgentId?: string;
  vapiApiKey?: string;
  vapiAssistantId?: string;
  config: VoiceWidgetConfig;
  createdAt: string;
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

function toDbRow(record: Omit<WidgetRecord, 'createdAt'> & { createdAt?: string }) {
  return {
    id: record.id.toLowerCase(),
    name: record.name,
    provider: record.provider,
    retell_api_key: record.retellApiKey,
    retell_agent_id: record.retellAgentId,
    vapi_api_key: record.vapiApiKey,
    vapi_assistant_id: record.vapiAssistantId,
    config: record.config,
    created_at: record.createdAt || new Date().toISOString(),
  };
}

function fromDbRow(row: any): WidgetRecord {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as 'retell' | 'vapi',
    retellApiKey: row.retell_api_key || '',
    retellAgentId: row.retell_agent_id || '',
    vapiApiKey: row.vapi_api_key || '',
    vapiAssistantId: row.vapi_assistant_id || '',
    config: row.config,
    createdAt: row.created_at,
  };
}

export async function getWidget(id: string): Promise<WidgetRecord | null> {
  const normalizedId = id.toLowerCase();
  let searchId = normalizedId;
  if (normalizedId === 'myfrontdesk') {
    searchId = 'front-desk';
  }

  try {
    const { data, error } = await supabase
      .from('widgets')
      .select('*')
      .eq('id', searchId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Single row not found
        return null;
      }
      throw error;
    }

    return fromDbRow(data);
  } catch (err) {
    console.error(`[widgetsDb] Error in getWidget for ID ${searchId}:`, err);
    return null;
  }
}

export async function saveWidget(record: Omit<WidgetRecord, 'createdAt'>): Promise<WidgetRecord> {
  const normalizedId = record.id.toLowerCase();
  const existing = await getWidget(normalizedId);

  const retellApiKey = (record.retellApiKey === undefined || record.retellApiKey === '••••••••' || record.retellApiKey === '') 
    ? (existing?.retellApiKey || '') 
    : record.retellApiKey;
    
  const retellAgentId = (record.retellAgentId === undefined || record.retellAgentId === '••••••••' || record.retellAgentId === '') 
    ? (existing?.retellAgentId || '') 
    : record.retellAgentId;

  const vapiApiKey = (record.vapiApiKey === undefined || record.vapiApiKey === '••••••••' || record.vapiApiKey === '') 
    ? (existing?.vapiApiKey || '') 
    : record.vapiApiKey;

  const vapiAssistantId = (record.vapiAssistantId === undefined || record.vapiAssistantId === '••••••••' || record.vapiAssistantId === '') 
    ? (existing?.vapiAssistantId || '') 
    : record.vapiAssistantId;

  const newRecord = {
    ...record,
    id: normalizedId,
    retellApiKey,
    retellAgentId,
    vapiApiKey,
    vapiAssistantId,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from('widgets')
      .upsert(toDbRow(newRecord))
      .select('*')
      .single();

    if (error) throw error;
    return fromDbRow(data);
  } catch (err) {
    console.error(`[widgetsDb] Error in saveWidget for ID ${normalizedId}:`, err);
    throw err;
  }
}

export async function deleteWidget(id: string): Promise<boolean> {
  const normalizedId = id.toLowerCase();
  try {
    const { error, count } = await supabase
      .from('widgets')
      .delete({ count: 'exact' })
      .eq('id', normalizedId);

    if (error) throw error;
    return count !== null && count > 0;
  } catch (err) {
    console.error(`[widgetsDb] Error in deleteWidget for ID ${normalizedId}:`, err);
    return false;
  }
}

export async function listWidgets(): Promise<WidgetRecord[]> {
  try {
    const { data, error } = await supabase
      .from('widgets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(fromDbRow);
  } catch (err) {
    console.error('[widgetsDb] Error in listWidgets:', err);
    return [];
  }
}
