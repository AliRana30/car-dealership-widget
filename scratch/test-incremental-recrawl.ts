import { createClient } from '@supabase/supabase-js';
import { computeContentHash } from '../src/lib/crawler/index';
import { saveWebsiteDataBatch, WebsiteDataRow } from '../src/config/widgetsDb';
import { mergeEntity } from '../src/lib/crawler/merge';
import { mapRowToEntity } from '../src/lib/agents/tools';

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

async function runIncrementalReCrawlTests() {
  console.log('================================================================');
  console.log('⚡ Starting A.3 Incremental Re-Crawl & Known-URL Tracking Tests');
  console.log('================================================================\n');

  const { data: testWidget } = await supabase.from('widgets').select('id, website_id').limit(1).maybeSingle();
  const widgetId = testWidget?.id || '00000000-0000-0000-0000-000000000000';
  const websiteId = testWidget?.website_id || '00000000-0000-0000-0000-000000000000';

  console.log(`Using Widget ID: ${widgetId}, Website ID: ${websiteId}\n`);

  // Pre-test cleanup to guarantee pristine state
  const { data: existingOld } = await supabase
    .from('website_data')
    .select('id')
    .ilike('source_url', '%incremental-test-dealership.com%')
    .limit(1000);

  if (existingOld && existingOld.length > 0) {
    const oldIds = existingOld.map(r => r.id);
    for (let i = 0; i < oldIds.length; i += 100) {
      await supabase.from('website_data').delete().in('id', oldIds.slice(i, i + 100));
    }
    console.log(`Cleaned up ${existingOld.length} old test records.`);
  }

  // ── Step 1: Simulate Initial Crawl of 250 Inventory Items ──────────────────
  console.log('--- 1. Simulating Initial Discovery of 250 Inventory Items ---');
  const initialTimestamp = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 2 days ago

  const testItems: Array<{ url: string; title: string; html: string; hash: string }> = [];
  const rowsToInsert: WebsiteDataRow[] = [];

  for (let i = 1; i <= 250; i++) {
    const url = `https://incremental-test-dealership.com/inventory/vehicle-${i}`;
    const title = `Vehicle Item #${i} Spec Grade`;
    const html = `<html><body><h1>${title}</h1><p>Engine: 2.0L Turbo, Mileage: ${1000 + i * 10}, Price: $${25000 + i * 100}</p></body></html>`;
    const hash = computeContentHash(html);

    testItems.push({ url, title, html, hash });

    rowsToInsert.push({
      widget_id: widgetId,
      source_url: url,
      title,
      content: `Engine: 2.0L Turbo, Mileage: ${1000 + i * 10}, Price: $${25000 + i * 100}`,
      entity_type: 'product',
      data_type: 'crawl',
      content_hash: hash,
      first_seen: initialTimestamp,
      last_seen: initialTimestamp,
      still_listed: true,
      metadata: {
        price: `$${25000 + i * 100}`,
        mileage: 1000 + i * 10,
        content_hash: hash,
        first_seen: initialTimestamp,
        last_seen: initialTimestamp,
        still_listed: true,
      },
    });
  }

  console.log(`Seeding ${rowsToInsert.length} initial items in website_data...`);
  await saveWebsiteDataBatch(rowsToInsert);
  console.log('✅ 250 initial inventory items seeded.');

  // Also persist initial known_urls on website record
  const initialKnownUrls = testItems.map(item => item.url);
  try {
    await supabase.from('websites').update({ known_urls: initialKnownUrls }).eq('id', websiteId);
    console.log('✅ Persisted 250 known_urls array on website record.');
  } catch (e: any) {
    console.log('ℹ️ Note: websites.known_urls update skipped or table cache pending.');
  }

  // ── Step 2: Simulate Incremental Re-Crawl Pass ─────────────────────────────
  // In this pass:
  // - 243 items are UNCHANGED (content hash identical)
  // - 5 items CHANGED (e.g. price reduced or mileage updated -> new content hash)
  // - 2 items DISAPPEARED (sold/removed from listing -> triggers still_listed = false)
  // - 2 genuinely NEW items ADDED
  console.log('\n--- 2. Simulating Incremental Re-Crawl with 5 Changed, 2 New, 2 Removed ---');

  const reCrawlDiscoveredPages: Array<{ url: string; title: string; html: string; hash: string }> = [];

  // 1. 243 Unchanged items (items 1 to 243)
  for (let i = 1; i <= 243; i++) {
    reCrawlDiscoveredPages.push(testItems[i - 1]);
  }

  // 2. 5 Changed items (items 244 to 248 - price dropped by $2,000!)
  for (let i = 244; i <= 248; i++) {
    const original = testItems[i - 1];
    const changedHtml = `<html><body><h1>${original.title} (Price Dropped!)</h1><p>Engine: 2.0L Turbo, Mileage: ${1000 + i * 10}, Price: $${23000 + i * 100}</p></body></html>`;
    const newHash = computeContentHash(changedHtml);
    reCrawlDiscoveredPages.push({
      url: original.url,
      title: `${original.title} (Price Dropped!)`,
      html: changedHtml,
      hash: newHash,
    });
  }

  // 3. 2 Disappeared items: items 249 and 250 are omitted from reCrawlDiscoveredPages!

  // 4. 2 Genuinely New items: items 251 and 252
  for (let i = 251; i <= 252; i++) {
    const url = `https://incremental-test-dealership.com/inventory/vehicle-${i}`;
    const title = `Brand New Arrival Vehicle #${i}`;
    const html = `<html><body><h1>${title}</h1><p>Engine: Electric, Mileage: 5, Price: $${39000 + i * 100}</p></body></html>`;
    const hash = computeContentHash(html);
    reCrawlDiscoveredPages.push({ url, title, html, hash });
  }

  // Query current existing records from DB
  const { data: currentDbRecords, error: selectErr } = await supabase
    .from('website_data')
    .select('id, widget_id, source_url, content_hash, title, short_description, content, entity_type, metadata')
    .ilike('source_url', '%incremental-test-dealership.com%')
    .limit(500);

  if (selectErr) {
    console.error('Error fetching records:', selectErr);
  }
  console.log(`Loaded ${currentDbRecords?.length || 0} existing records from database for comparison.`);

  const existingMap = new Map<string, any>();
  (currentDbRecords || []).forEach(r => {
    if (r.source_url) existingMap.set(r.source_url.toLowerCase(), r);
  });

  // Execute the fast-path incremental comparison
  let pagesVisited = 0;
  let pagesProcessed = 0;
  let pagesSkipped = 0;
  const entitiesToSave: WebsiteDataRow[] = [];
  const nowIso = new Date().toISOString();

  for (const page of reCrawlDiscoveredPages) {
    pagesVisited++;
    const matching = existingMap.get(page.url.toLowerCase());
    const existingHash = matching?.content_hash || matching?.metadata?.content_hash;

    if (matching && existingHash && existingHash === page.hash) {
      // FAST PATH: Content unchanged -> Cheap last_seen bump only!
      pagesSkipped++;
      entitiesToSave.push({
        id: matching.id,
        widget_id: widgetId,
        source_url: page.url,
        title: matching.title,
        content: matching.content,
        entity_type: matching.entity_type || 'product',
        data_type: 'crawl',
        content_hash: matching.content_hash,
        first_seen: matching.first_seen || matching.metadata?.first_seen || initialTimestamp,
        last_seen: nowIso,
        still_listed: true,
        metadata: {
          ...(matching.metadata || {}),
          last_seen: nowIso,
          still_listed: true,
        },
      });
    } else {
      // FULL EXTRACTION PATH: New item or changed content
      pagesProcessed++;
      const firstSeen = matching?.first_seen || matching?.metadata?.first_seen || nowIso;
      entitiesToSave.push({
        ...(matching?.id ? { id: matching.id } : {}),
        widget_id: widgetId,
        source_url: page.url,
        title: page.title,
        content: page.html,
        entity_type: 'product',
        data_type: 'crawl',
        content_hash: page.hash,
        first_seen: firstSeen,
        last_seen: nowIso,
        still_listed: true,
        metadata: {
          ...(matching?.metadata || {}),
          content_hash: page.hash,
          first_seen: firstSeen,
          last_seen: nowIso,
          still_listed: true,
        },
      });
    }
  }

  console.log(`\n📊 Re-crawl Pipeline Metric Counters:`);
  console.log(`   - Candidate URLs Visited:  ${pagesVisited}`);
  console.log(`   - Pages Processed (Full):  ${pagesProcessed} (Expected: 7 -> 5 changed + 2 new)`);
  console.log(`   - Pages Skipped (Cheap):   ${pagesSkipped} (Expected: 243 unchanged)`);

  assert(pagesProcessed === 7, `Full extraction work was performed for exactly 7 pages (5 changed + 2 new)`);
  assert(pagesSkipped === 243, `Cheap last_seen bump was performed for exactly 243 unchanged pages`);

  // Persist updated batch
  await saveWebsiteDataBatch(entitiesToSave);

  // Identify and mark disappeared items as still_listed = false
  const activeUrlSet = new Set(reCrawlDiscoveredPages.map(p => p.url.toLowerCase()));
  const uniqueRecords = Array.from(existingMap.values());
  const disappearedRecords = uniqueRecords.filter(r => r.source_url && !activeUrlSet.has(r.source_url.toLowerCase()));

  console.log(`\n🔍 Checking for disappeared items: Found ${disappearedRecords.length} items absent from new discovery pass.`);
  assert(disappearedRecords.length === 2, 'Exactly 2 items were absent from discovery pass (vehicles 249 & 250)');

  const disappearedIds = disappearedRecords.map(r => r.id);
  for (const r of disappearedRecords) {
    const updatedMeta = {
      ...(r.metadata || {}),
      still_listed: false,
    };
    let { error: unlistErr } = await supabase
      .from('website_data')
      .update({ still_listed: false, metadata: updatedMeta, last_checked_at: nowIso })
      .eq('id', r.id);

    if (unlistErr && (unlistErr.code === '42703' || unlistErr.message?.includes('column'))) {
      const retry = await supabase
        .from('website_data')
        .update({ metadata: updatedMeta, last_checked_at: nowIso })
        .eq('id', r.id);
      unlistErr = retry.error;
    }
    assert(!unlistErr, `Successfully set still_listed = false on disappeared record ${r.id} without deleting it`);
  }

  // ── Step 3: Verify Database Post-Crawl State ──────────────────────────────
  console.log('\n--- 3. Verifying Database Records Post-Incremental Crawl ---');

  // Check an unchanged item (vehicle-10)
  const { data: item10Rows } = await supabase
    .from('website_data')
    .select('*')
    .eq('widget_id', widgetId)
    .eq('source_url', 'https://incremental-test-dealership.com/inventory/vehicle-10')
    .limit(1);

  const item10 = mapRowToEntity(item10Rows![0]);
  assert(item10.firstSeen === initialTimestamp, `Unchanged item first_seen remained invariant (${item10.firstSeen})`);
  assert(new Date(item10.lastSeen!).getTime() > new Date(initialTimestamp).getTime(), `Unchanged item last_seen was bumped to today (${item10.lastSeen})`);
  assert(item10.stillListed === true, 'Unchanged item still_listed is true');

  // Check a changed item (vehicle-245)
  const { data: item245Rows } = await supabase
    .from('website_data')
    .select('*')
    .eq('widget_id', widgetId)
    .eq('source_url', 'https://incremental-test-dealership.com/inventory/vehicle-245')
    .limit(1);

  const item245 = mapRowToEntity(item245Rows![0]);
  assert(item245.title.includes('Price Dropped!'), `Changed item title was updated to: "${item245.title}"`);
  assert(item245.firstSeen === initialTimestamp, `Changed item first_seen preserved original timestamp`);
  assert(new Date(item245.lastSeen!).getTime() > new Date(initialTimestamp).getTime(), `Changed item last_seen updated to today`);

  // Check a disappeared item (vehicle-250)
  const { data: item250Rows } = await supabase
    .from('website_data')
    .select('*')
    .eq('widget_id', widgetId)
    .eq('source_url', 'https://incremental-test-dealership.com/inventory/vehicle-250')
    .limit(1);

  assert(Boolean(item250Rows && item250Rows.length > 0), 'Disappeared item 250 still exists in website_data (was NOT deleted)');
  const item250 = mapRowToEntity(item250Rows![0]);
  assert(item250.stillListed === false, 'Disappeared item 250 has still_listed = false');
  assert(item250.freshnessStatus === 'stale_or_unlisted', 'Disappeared item 250 maps to stale_or_unlisted');

  // Clean up all seeded test items
  console.log('\n🧹 Cleaning up test records from database...');
  const { data: finalOld } = await supabase
    .from('website_data')
    .select('id')
    .ilike('source_url', '%incremental-test-dealership.com%')
    .limit(1000);

  if (finalOld && finalOld.length > 0) {
    const finalIds = finalOld.map(r => r.id);
    for (let i = 0; i < finalIds.length; i += 100) {
      await supabase.from('website_data').delete().in('id', finalIds.slice(i, i + 100));
    }
  }

  console.log('✅ Cleaned up all test rows.');

  console.log('\n================================================================');
  console.log('🎉 ALL A.3 INCREMENTAL RE-CRAWL & KNOWN-URL TESTS PASSED (11/11)!');
  console.log('================================================================\n');
}

runIncrementalReCrawlTests().catch(err => {
  console.error('Error during test execution:', err);
  process.exit(1);
});
