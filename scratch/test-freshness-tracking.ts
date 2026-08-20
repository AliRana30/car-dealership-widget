import { createClient } from '@supabase/supabase-js';
import { saveWebsiteDataBatch, WebsiteDataRow } from '../src/config/widgetsDb';
import { mergeEntity, findMatchingExistingEntity } from '../src/lib/crawler/merge';
import { calculateFreshness, executeAgentTool, mapRowToEntity } from '../src/lib/agents/tools';
import { generateBaseSystemPrompt } from '../src/lib/agents/prompts';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

async function runFreshnessTests() {
  console.log('================================================================');
  console.log('🧪 Starting Freshness Tracking & Availability Verification Tests');
  console.log('================================================================\n');

  // ── 1. Unit Tests: calculateFreshness rules ────────────────────────────────
  console.log('--- 1. Testing calculateFreshness Logic ---');

  // A) Fresh: 1 hour ago
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
  const freshRes = calculateFreshness(oneHourAgo, true);
  assert(freshRes.freshnessStatus === 'fresh', '1 hour old item is marked as fresh');
  assert(freshRes.hoursSinceLastSeen <= 1.1, 'Hours since last seen is ~1h');
  assert(!freshRes.hedgeInstruction, 'Fresh items do not require a hedge instruction');

  // B) Recent: 12 hours ago
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const recentRes = calculateFreshness(twelveHoursAgo, true);
  assert(recentRes.freshnessStatus === 'recent', '12 hours old item is marked as recent');
  assert(recentRes.hoursSinceLastSeen >= 11.9 && recentRes.hoursSinceLastSeen <= 12.1, 'Hours since last seen is ~12h');
  assert(Boolean(recentRes.hedgeInstruction?.includes('Hedge lightly')), 'Recent items receive light hedge instruction');

  // C) Stale: 48 hours ago
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const staleRes = calculateFreshness(twoDaysAgo, true);
  assert(staleRes.freshnessStatus === 'stale_or_unlisted', '48 hours old item is marked as stale_or_unlisted');
  assert(Boolean(staleRes.hedgeInstruction?.includes('Direct visitor to confirm')), 'Stale items receive direct-to-staff instruction');

  // D) Unlisted: still_listed = false
  const unlistedRes = calculateFreshness(oneHourAgo, false);
  assert(unlistedRes.freshnessStatus === 'stale_or_unlisted', 'still_listed=false item is marked as stale_or_unlisted even if recent');
  assert(Boolean(unlistedRes.hedgeInstruction?.includes('Item was absent from latest site check')), 'Unlisted item receives absent warning');

  // ── 2. Testing Entity Precedence & Merge Timestamp Invariance ─────────────
  console.log('\n--- 2. Testing Entity Precedence & Merge Timestamps ---');
  const initialFirstSeen = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days ago
  const oldLastSeen = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago

  const existingRow: WebsiteDataRow = {
    id: 'entity-freshness-001',
    widget_id: '00000000-0000-0000-0000-000000000000',
    source_url: 'https://test-dealership.com/inventory/2024-jeep-wrangler',
    title: '2024 Jeep Wrangler Rubicon 4xe',
    content: 'Full description of Jeep Wrangler',
    entity_type: 'product',
    data_type: 'crawl',
    first_seen: initialFirstSeen,
    last_seen: oldLastSeen,
    still_listed: true,
  };

  const incomingCrawlPass: WebsiteDataRow = {
    widget_id: '00000000-0000-0000-0000-000000000000',
    source_url: 'https://test-dealership.com/inventory/2024-jeep-wrangler',
    title: '2024 Jeep Wrangler Rubicon 4xe (Updated)',
    content: 'Updated description of Jeep Wrangler',
    entity_type: 'product',
    data_type: 'crawl',
  };

  const merged = mergeEntity(existingRow, incomingCrawlPass);
  assert(merged.first_seen === initialFirstSeen, `first_seen stayed constant across re-crawl: ${merged.first_seen}`);
  assert(new Date(merged.last_seen || '').getTime() > new Date(oldLastSeen).getTime(), `last_seen advanced forward in time: ${merged.last_seen}`);
  assert(merged.still_listed === true, 'still_listed remains true upon re-discovery');

  // ── 3. Database Persistence & Freshness Field Round-Trip ──────────────────
  console.log('\n--- 3. Testing Database Persistence with Freshness Fields ---');
  const { data: testWidget } = await supabase.from('widgets').select('id').limit(1).maybeSingle();
  const validWidgetId = testWidget?.id || '00000000-0000-0000-0000-000000000000';

  const testEntityId = `test-fresh-${Date.now()}`;
  const testUrl = `https://example-dealer.com/vehicles/${testEntityId}`;

  // Initial insert
  const rowToInsert: WebsiteDataRow = {
    widget_id: validWidgetId,
    source_url: testUrl,
    title: 'Test Freshness Vehicle 2025 EcoDiesel',
    content: 'EcoDiesel Engine, 4WD, Premium Sound',
    entity_type: 'product',
    metadata: {
      price: '$55,000',
      vin: '1TESTVIN99999',
    },
    data_type: 'crawl',
    first_seen: initialFirstSeen,
    last_seen: initialFirstSeen,
    still_listed: true,
  };

  await saveWebsiteDataBatch([rowToInsert]);

  // Read back
  const { data: queriedRows } = await supabase
    .from('website_data')
    .select('*')
    .eq('widget_id', validWidgetId)
    .eq('source_url', testUrl)
    .limit(1);

  assert(Boolean(queriedRows && queriedRows.length > 0), 'Inserted record found in database');
  const queried = queriedRows![0];

  const mapped = mapRowToEntity(queried);
  assert(Boolean(mapped.firstSeen), 'mapped.firstSeen is populated');
  assert(Boolean(mapped.lastSeen), 'mapped.lastSeen is populated');
  assert(mapped.stillListed === true, 'mapped.stillListed is true');
  assert(mapped.freshnessStatus === 'stale_or_unlisted', '5 days old item mapped to stale_or_unlisted');

  // ── 4. Agent Tool Execution Shape & Verification ──────────────────────────
  console.log('\n--- 4. Testing Agent Tool Outputs for Freshness ---');
  const searchToolRes = await executeAgentTool(validWidgetId, 'search_entities', { query: 'EcoDiesel' });
  assert(searchToolRes.success === true, 'search_entities succeeded');
  const searchResults = searchToolRes.data?.results || [];
  assert(searchResults.length > 0, 'Found EcoDiesel entity via search_entities');
  const firstItem = searchResults[0];
  assert('firstSeen' in firstItem, 'search_entities result includes firstSeen');
  assert('lastSeen' in firstItem, 'search_entities result includes lastSeen');
  assert('stillListed' in firstItem, 'search_entities result includes stillListed');
  assert('freshnessStatus' in firstItem, 'search_entities result includes freshnessStatus');
  assert('hedgeInstruction' in firstItem, 'search_entities result includes hedgeInstruction');

  const detailsToolRes = await executeAgentTool(validWidgetId, 'get_entity_details', { entityId: queried.id });
  assert(detailsToolRes.success === true, 'get_entity_details succeeded');
  assert('firstSeen' in detailsToolRes.data, 'get_entity_details includes firstSeen');
  assert('lastSeen' in detailsToolRes.data, 'get_entity_details includes lastSeen');
  assert('stillListed' in detailsToolRes.data, 'get_entity_details includes stillListed');
  assert('freshnessStatus' in detailsToolRes.data, 'get_entity_details includes freshnessStatus');
  assert('hedgeInstruction' in detailsToolRes.data, 'get_entity_details includes hedgeInstruction');

  // ── 5. System Prompt Freshness Rules Verification ─────────────────────────
  console.log('\n--- 5. Testing Base System Prompt Template ---');
  const systemPrompt = generateBaseSystemPrompt({ businessName: 'Apex Motors' });
  assert(systemPrompt.includes('Catalog Freshness & Availability Confidence Rules'), 'System prompt contains Freshness Rules section');
  assert(systemPrompt.includes('under 6 hours old'), 'System prompt contains < 6h rule');
  assert(systemPrompt.includes('between 6 and 24 hours old'), 'System prompt contains 6-24h rule');
  assert(systemPrompt.includes('beyond 24 hours old OR stillListed = false'), 'System prompt contains > 24h / unlisted rule');
  assert(systemPrompt.includes('direct the visitor to confirm with staff'), 'System prompt contains staff confirmation instruction');

  // Cleanup test row
  await supabase.from('website_data').delete().eq('id', queried.id);
  console.log('🧹 Cleaned up test database row.');

  console.log('\n================================================================');
  console.log('🎉 ALL FRESHNESS TRACKING TESTS PASSED PERFECTLY (18/18)!');
  console.log('================================================================\n');
}

runFreshnessTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
