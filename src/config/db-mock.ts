import fs from 'fs';
import path from 'path';
import { VoiceWidgetConfig } from './voiceWidget/types';
import { defaultVoiceWidgetConfig, deepMerge } from './voiceWidget/default';
import { clientRegistry } from './voiceWidget/registry';

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

const DB_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'db-mock.json');

// Helper to ensure database JSON file exists with seed data
function initDb(): Record<string, WidgetRecord> {
  try {
    if (!fs.existsSync(DB_FILE_PATH)) {
      // Seed with registry items so existing configurations continue to work
      const seedData: Record<string, WidgetRecord> = {};
      
      Object.entries(clientRegistry).forEach(([key, config]) => {
        const merged = deepMerge(defaultVoiceWidgetConfig, config as any);
        const clientProvider = (config as any).provider?.provider ?? 'retell';
        const clientAgentId = (config as any).provider?.agentId ?? '';

        seedData[key] = {
          id: key,
          name: key === 'default' ? 'Default Widget' : `${key.charAt(0).toUpperCase()}${key.slice(1)} Config`,
          provider: clientProvider,
          retellApiKey: process.env.RETELL_API_KEY || 'key_c8518fbaaa990618439d277ab026',
          retellAgentId: clientAgentId || process.env.RETELL_AGENT_ID || 'agent_3150b4da2eaf98174c827f061d',
          config: merged,
          createdAt: new Date().toISOString(),
        };
      });

      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(seedData, null, 2), 'utf-8');
      return seedData;
    }

    const fileContent = fs.readFileSync(DB_FILE_PATH, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error('[db-mock] Initialization failed, returning empty store', error);
    return {};
  }
}

export function getWidget(id: string): WidgetRecord | null {
  const db = initDb();
  const normalizedId = id.toLowerCase();
  let record = db[normalizedId];
  if (!record && normalizedId === 'myfrontdesk') {
    record = db['front-desk'];
  }
  return record || null;
}

export function saveWidget(record: Omit<WidgetRecord, 'createdAt'>): WidgetRecord {
  const db = initDb();
  const normalizedId = record.id.toLowerCase();
  
  const existing = db[normalizedId];

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

  const newRecord: WidgetRecord = {
    ...record,
    id: normalizedId,
    retellApiKey,
    retellAgentId,
    vapiApiKey,
    vapiAssistantId,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
  };

  db[normalizedId] = newRecord;
  fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2), 'utf-8');
  return newRecord;
}

export function deleteWidget(id: string): boolean {
  const db = initDb();
  const normalizedId = id.toLowerCase();
  if (db[normalizedId]) {
    delete db[normalizedId];
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2), 'utf-8');
    return true;
  }
  return false;
}

export function listWidgets(): WidgetRecord[] {
  const db = initDb();
  return Object.values(db).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
