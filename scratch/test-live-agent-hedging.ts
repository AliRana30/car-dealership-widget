import { createClient } from '@supabase/supabase-js';
import { executeAgentTool } from '../src/lib/agents/tools';
import { generateBaseSystemPrompt } from '../src/lib/agents/prompts';
import { saveWebsiteDataBatch, WebsiteDataRow } from '../src/config/widgetsDb';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runLiveHedgingTest() {
  console.log('================================================================');
  console.log('🗣️ Testing Live AI Agent Response Hedging on Stale/Unlisted Entities');
  console.log('================================================================\n');

  const { data: testWidget } = await supabase.from('widgets').select('id, name').limit(1).maybeSingle();
  const widgetId = testWidget?.id || '00000000-0000-0000-0000-000000000000';

  // 1. Insert a stale entity (> 3 days old)
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const testStaleRow: WebsiteDataRow = {
    widget_id: widgetId,
    source_url: 'https://test-dealership.com/inventory/vintage-mustang-1967',
    title: '1967 Ford Mustang Fastback GT',
    content: 'Classic 1967 Ford Mustang Fastback GT, Highland Green, 390 V8 Engine.',
    entity_type: 'product',
    metadata: {
      price: '$79,500',
      vin: '7R02S123456',
      first_seen: threeDaysAgo,
      last_seen: threeDaysAgo,
      still_listed: false,
    },
    data_type: 'crawl',
    first_seen: threeDaysAgo,
    last_seen: threeDaysAgo,
    still_listed: false,
  };

  console.log('📥 Seeding stale/unlisted test entity...');
  await saveWebsiteDataBatch([testStaleRow]);

  // Fetch the inserted record ID
  const { data: queriedRows } = await supabase
    .from('website_data')
    .select('id, title, metadata')
    .eq('widget_id', widgetId)
    .eq('source_url', 'https://test-dealership.com/inventory/vintage-mustang-1967')
    .limit(1);

  const staleRecord = queriedRows![0];
  console.log(`✅ Stale test entity seeded with ID: ${staleRecord.id}`);

  // 2. Query search_entities tool
  console.log('\n🔎 Executing search_entities for "Mustang"...');
  const searchToolResult = await executeAgentTool(widgetId, 'search_entities', { query: 'Mustang' });
  console.log('Search Tool Result:', JSON.stringify(searchToolResult, null, 2));

  // 3. Query get_entity_details tool
  console.log(`\n📋 Executing get_entity_details for ${staleRecord.id}...`);
  const detailsToolResult = await executeAgentTool(widgetId, 'get_entity_details', { entityId: staleRecord.id });
  console.log('Details Tool Result:', JSON.stringify(detailsToolResult, null, 2));

  const data = detailsToolResult.data;
  if (data.freshnessStatus === 'stale_or_unlisted') {
    console.log('\n✅ Freshness status is correctly identified as stale_or_unlisted');
    console.log(`✅ Instruction provided to agent: "${data.hedgeInstruction}"`);
    console.log(`✅ Last confirmed: ${data.lastSeenHuman}`);
  } else {
    throw new Error(`Expected stale_or_unlisted, got ${data.freshnessStatus}`);
  }

  // 4. Clean up test row
  await supabase.from('website_data').delete().eq('id', staleRecord.id);
  console.log('\n🧹 Cleaned up test record.');

  console.log('\n================================================================');
  console.log('🎉 Live Agent Hedging Verification Complete!');
  console.log('================================================================\n');
}

runLiveHedgingTest().catch(err => {
  console.error('Error in test:', err);
  process.exit(1);
});
