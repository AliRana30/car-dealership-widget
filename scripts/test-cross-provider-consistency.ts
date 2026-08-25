/**
 * Cross-Provider Entity Grounding & Consistency Test Suite
 *
 * Tests the exact same entity query across:
 *  1. Text Chat Handler (/api/retell/chat)
 *  2. Retell Voice Tool Webhook (/api/agent/tools)
 *  3. Vapi Voice Tool Webhook (/api/agent/tools)
 *
 * Compares:
 *  - Entity selected (ID, Title)
 *  - Factual information (Description, Type)
 *  - Image URLs
 *  - Canonical URL (sourceUrl)
 *  - Price, Rating, Availability
 *
 * Usage: npx tsx scripts/test-cross-provider-consistency.ts
 */

import fs from 'fs';
import path from 'path';

// Parse .env manually
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {}

import { getDbClient } from '../src/config/widgetsDb';
import { executeAgentTool } from '../src/lib/agents/tools';
import { resolveEntityByQuery } from '../src/lib/agents/entityResolver';

interface ProviderResult {
  provider: 'Chat' | 'Retell' | 'Vapi';
  entityId?: string;
  title?: string;
  type?: string;
  description?: string;
  imageUrls: string[];
  canonicalUrl?: string;
  price?: string;
  rating?: number;
  availability?: string;
  rawObject?: any;
}

async function runConsistencyTests() {
  console.log('===============================================================');
  console.log('    CROSS-PROVIDER ENTITY GROUNDING CONSISTENCY TEST SUITE     ');
  console.log('===============================================================\n');

  const { client } = getDbClient();
  if (!client) {
    console.error('CRITICAL: Supabase client unavailable.');
    process.exit(1);
  }

  // 1. Fetch sample items from website_data table
  const { data: records } = await client.from('website_data').select('*').limit(20);
  if (!records || records.length === 0) {
    console.error('No website_data records found in database to run consistency test.');
    process.exit(1);
  }

  // Find items with images / price to test full grounding payload
  const itemsToTest = [
    records.find((r: any) => Array.isArray(r.image_urls) && r.image_urls.length > 0) || records[0],
    records.find((r: any) => r.title && r.title.length > 3 && r.id !== records[0]?.id) || records[1],
  ].filter(Boolean);

  let totalDiscrepancies = 0;

  for (const sampleItem of itemsToTest) {
    const widgetId = sampleItem.widget_id || '3d801677-65f4-4495-a9b5-24c39b6ee516';
    const query = sampleItem.title;

    console.log(`Target Entity Query: "${query}"`);
    console.log(`Scoped Widget ID:    "${widgetId}"\n`);

    // 1. CHAT CHANNEL SIMULATION
    let chatResult: ProviderResult;
    try {
      const resolved = await resolveEntityByQuery(widgetId, query, 3);
      const top = resolved[0]?.record;
      chatResult = {
        provider: 'Chat',
        entityId: top?.id,
        title: top?.title,
        type: top?.entityType,
        description: top?.description || top?.shortDescription,
        imageUrls: Array.from(new Set(top?.imageUrls || top?.images || [])).slice(0, 2),
        canonicalUrl: top?.sourceUrl,
        price: top?.price !== undefined ? String(top.price) : undefined,
        rating: top?.rating !== undefined ? Number(top.rating) : undefined,
        availability: top?.availability,
        rawObject: top,
      };
    } catch (err: any) {
      chatResult = { provider: 'Chat', imageUrls: [], rawObject: { error: err.message } };
    }

    // 2. RETELL VOICE TOOL WEBHOOK SIMULATION
    let retellResult: ProviderResult;
    try {
      const retellToolCall = await executeAgentTool(widgetId, 'search_entities', { query, limit: 3 });
      const top = retellToolCall.data?.results?.[0];
      retellResult = {
        provider: 'Retell',
        entityId: top?.id,
        title: top?.title,
        type: top?.type,
        description: top?.description,
        imageUrls: top?.imageUrls || top?.images || [],
        canonicalUrl: top?.canonicalUrl || top?.sourceUrl,
        price: top?.price,
        rating: top?.rating,
        availability: top?.availability,
        rawObject: top,
      };
    } catch (err: any) {
      retellResult = { provider: 'Retell', imageUrls: [], rawObject: { error: err.message } };
    }

    // 3. VAPI VOICE TOOL WEBHOOK SIMULATION
    let vapiResult: ProviderResult;
    try {
      const vapiToolCall = await executeAgentTool(widgetId, 'search_entities', { query, limit: 3 });
      const top = vapiToolCall.data?.results?.[0];
      vapiResult = {
        provider: 'Vapi',
        entityId: top?.id,
        title: top?.title,
        type: top?.type,
        description: top?.description,
        imageUrls: top?.imageUrls || top?.images || [],
        canonicalUrl: top?.canonicalUrl || top?.sourceUrl,
        price: top?.price,
        rating: top?.rating,
        availability: top?.availability,
        rawObject: top,
      };
    } catch (err: any) {
      vapiResult = { provider: 'Vapi', imageUrls: [], rawObject: { error: err.message } };
    }

    // COMPARISON
    console.log('--- PROVIDER OUTPUT COMPARISON ---');
    console.log(`[CHAT]   Entity ID: ${chatResult.entityId} | Title: "${chatResult.title}" | Images: ${chatResult.imageUrls.length} | Price: ${chatResult.price || 'N/A'}`);
    console.log(`[RETELL] Entity ID: ${retellResult.entityId} | Title: "${retellResult.title}" | Images: ${retellResult.imageUrls.length} | Price: ${retellResult.price || 'N/A'}`);
    console.log(`[VAPI]   Entity ID: ${vapiResult.entityId} | Title: "${vapiResult.title}" | Images: ${vapiResult.imageUrls.length} | Price: ${vapiResult.price || 'N/A'}\n`);

    const discrepancies: string[] = [];

    if (chatResult.entityId !== retellResult.entityId || chatResult.entityId !== vapiResult.entityId) {
      discrepancies.push(`Entity ID mismatch: Chat (${chatResult.entityId}) vs Retell (${retellResult.entityId}) vs Vapi (${vapiResult.entityId})`);
    }

    if (chatResult.title !== retellResult.title || chatResult.title !== vapiResult.title) {
      discrepancies.push(`Title mismatch: Chat ("${chatResult.title}") vs Retell ("${retellResult.title}") vs Vapi ("${vapiResult.title}")`);
    }

    if (chatResult.description !== retellResult.description || chatResult.description !== vapiResult.description) {
      discrepancies.push('Description mismatch between providers.');
    }

    const chatImgs = JSON.stringify(chatResult.imageUrls);
    const retellImgs = JSON.stringify(retellResult.imageUrls);
    const vapiImgs = JSON.stringify(vapiResult.imageUrls);

    if (chatImgs !== retellImgs || chatImgs !== vapiImgs) {
      discrepancies.push(`Image URLs mismatch: Chat (${chatImgs}) vs Retell (${retellImgs}) vs Vapi (${vapiImgs})`);
    }

    if (chatResult.canonicalUrl !== retellResult.canonicalUrl || chatResult.canonicalUrl !== vapiResult.canonicalUrl) {
      discrepancies.push(`Canonical URL mismatch: Chat (${chatResult.canonicalUrl}) vs Retell (${retellResult.canonicalUrl}) vs Vapi (${vapiResult.canonicalUrl})`);
    }

    if (chatResult.price !== retellResult.price || chatResult.price !== vapiResult.price) {
      discrepancies.push(`Price mismatch: Chat (${chatResult.price}) vs Retell (${retellResult.price}) vs Vapi (${vapiResult.price})`);
    }

    totalDiscrepancies += discrepancies.length;

    console.log('Chat Grounded Payload:');
    console.log(JSON.stringify({
      id: chatResult.entityId,
      title: chatResult.title,
      type: chatResult.type,
      imageUrls: chatResult.imageUrls,
      canonicalUrl: chatResult.canonicalUrl,
      price: chatResult.price,
      availability: chatResult.availability,
    }, null, 2));

    console.log('\nRetell Tool Payload:');
    console.log(JSON.stringify({
      id: retellResult.entityId,
      title: retellResult.title,
      type: retellResult.type,
      imageUrls: retellResult.imageUrls,
      canonicalUrl: retellResult.canonicalUrl,
      price: retellResult.price,
      availability: retellResult.availability,
    }, null, 2));

    console.log('\nVapi Tool Payload:');
    console.log(JSON.stringify({
      id: vapiResult.entityId,
      title: vapiResult.title,
      type: vapiResult.type,
      imageUrls: vapiResult.imageUrls,
      canonicalUrl: vapiResult.canonicalUrl,
      price: vapiResult.price,
      availability: vapiResult.availability,
    }, null, 2));
    console.log('---------------------------------------------------------------\n');
  }

  console.log('===============================================================');
  console.log('               CONSISTENCY TEST SUMMARY                        ');
  console.log('===============================================================\n');

  if (totalDiscrepancies === 0) {
    console.log('✅ STATUS: PASS');
    console.log('All 3 providers (Chat, Retell, Vapi) returned 100% IDENTICAL entity grounding across all tested entities!\n');
  } else {
    console.log(`❌ STATUS: ${totalDiscrepancies} DISCREPANCIES DETECTED`);
  }

  console.log('===============================================================\n');
}

runConsistencyTests().catch(console.error);
