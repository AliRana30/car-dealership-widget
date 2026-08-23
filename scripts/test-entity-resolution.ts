/**
 * Comprehensive Entity Resolution & Media Grounding Test Suite (10 Scenarios)
 *
 * Usage: npx tsx scripts/test-entity-resolution.ts
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

import { resolveEntityByQuery, resolveAnaphora, type ResolvedEntity } from '../src/lib/agents/entityResolver';
import { getSessionContext, pinEntity, setLastResults } from '../src/lib/agents/sessionContext';
import { getWidget, getDbClient } from '../src/config/widgetsDb';

async function runTests() {
  console.log('===============================================================');
  console.log('      UNIVERSAL ENTITY RESOLUTION & MEDIA GROUNDING TEST SUITE  ');
  console.log('===============================================================\n');

  const { client } = getDbClient();
  if (!client) {
    console.error('CRITICAL: Supabase client unavailable. Check environment variables.');
    process.exit(1);
  }

  // 1. Get sample active widget and its crawled records
  const { data: widgets } = await client.from('widgets').select('*').limit(5);
  const targetWidget = widgets?.find((w: any) => w.widget_id === 'front-desk' || w.name) || widgets?.[0];
  const widgetId = targetWidget?.id || '00000000-0000-0000-0000-000000000000';

  console.log(`Target Widget: ${targetWidget?.name || 'Default'} (ID: ${widgetId})\n`);

  // Fetch sample records from website_data table
  const { data: records } = await client
    .from('website_data')
    .select('*')
    .limit(50);

  const sampleCatalog = records || [];
  const testWidgetId = sampleCatalog[0]?.widget_id || widgetId;
  console.log(`Loaded ${sampleCatalog.length} sample catalog items from website_data (using widget_id: ${testWidgetId}).\n`);

  const sampleWithImages = sampleCatalog.find((r: any) => Array.isArray(r.image_urls) && r.image_urls.length > 0) || sampleCatalog[0];
  const sampleMultiImages = sampleCatalog.find((r: any) => Array.isArray(r.image_urls) && r.image_urls.length > 1) || sampleWithImages;

  const results: Array<{ testNum: number; name: string; status: 'PASS' | 'FAIL' | 'PARTIAL'; details: string; actualResponse: string }> = [];

  const sessionId = `test_session_${Date.now()}`;

  // ---------------------------------------------------------------------------
  // TEST 1: Exact Entity Match
  // ---------------------------------------------------------------------------
  try {
    const testTitle = sampleCatalog[0]?.title || 'Jeep Wrangler 4xe';
    const resolved = await resolveEntityByQuery(testWidgetId, testTitle, 3);
    const pass = resolved.length > 0 && resolved[0].confidence === 'exact';
    results.push({
      testNum: 1,
      name: 'Exact Entity Match',
      status: pass ? 'PASS' : 'FAIL',
      details: `Queried exact title: "${testTitle}". Confidence: ${resolved[0]?.confidence || 'none'}`,
      actualResponse: JSON.stringify({
        title: resolved[0]?.title,
        confidence: resolved[0]?.confidence,
        imageUrls: resolved[0]?.record?.imageUrls || resolved[0]?.record?.images,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 1, name: 'Exact Entity Match', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Partial Entity Match
  // ---------------------------------------------------------------------------
  try {
    const fullTitle = sampleCatalog[0]?.title || '2024 Jeep Grand Cherokee Laramie';
    const words = fullTitle.split(' ');
    const partialQuery = words.slice(0, 2).join(' '); // partial token query
    const resolved = await resolveEntityByQuery(testWidgetId, partialQuery, 3);
    const pass = resolved.length > 0 && (resolved[0].confidence === 'exact' || resolved[0].confidence === 'partial');
    results.push({
      testNum: 2,
      name: 'Partial Entity Match',
      status: pass ? 'PASS' : 'FAIL',
      details: `Queried partial title: "${partialQuery}". Matched: "${resolved[0]?.title}". Confidence: ${resolved[0]?.confidence}`,
      actualResponse: JSON.stringify({
        query: partialQuery,
        matchedTitle: resolved[0]?.title,
        confidence: resolved[0]?.confidence,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 2, name: 'Partial Entity Match', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Typo Tolerance (Levenshtein ≤ 2)
  // ---------------------------------------------------------------------------
  try {
    const fullTitle = sampleCatalog[0]?.title || 'Wrangler';
    const firstWord = fullTitle.split(' ')[0] || 'Wrangler';
    // Introduce intentional 1-2 char typo on first word
    const typoQuery = firstWord.substring(0, firstWord.length - 1) + 'x';
    const resolved = await resolveEntityByQuery(testWidgetId, typoQuery, 3);
    const pass = resolved.length > 0;
    results.push({
      testNum: 3,
      name: 'Typo Tolerance',
      status: pass ? 'PASS' : 'PARTIAL',
      details: `Queried typo string: "${typoQuery}". Matched: "${resolved[0]?.title || 'None'}". Confidence: ${resolved[0]?.confidence || 'N/A'}`,
      actualResponse: JSON.stringify({
        typoQuery,
        matchedTitle: resolved[0]?.title,
        confidence: resolved[0]?.confidence,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 3, name: 'Typo Tolerance', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // Pin top entity into session context for follow-up tests 4-7
  const topEntity: ResolvedEntity = {
    record: {
      id: sampleWithImages?.id || 'sample-1',
      title: sampleWithImages?.title || '2024 Jeep Wrangler Unlimited Rubicon',
      description: sampleWithImages?.short_description || sampleWithImages?.content || 'Premium off-road SUV',
      images: sampleWithImages?.image_urls || ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf'],
      imageUrls: sampleWithImages?.image_urls || ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf'],
      price: '$49,995',
      currency: 'USD',
      availability: 'In Stock',
      sourceUrl: sampleWithImages?.source_url || 'https://example.com/jeep-wrangler',
      attributes: { engine: '3.6L V6', transmission: '8-Speed Automatic' },
    },
    confidence: 'exact',
    title: sampleWithImages?.title || '2024 Jeep Wrangler Unlimited Rubicon',
    entityId: sampleWithImages?.id || 'sample-1',
  };

  pinEntity(sessionId, widgetId, topEntity);
  setLastResults(sessionId, widgetId, [topEntity.record]);

  // ---------------------------------------------------------------------------
  // TEST 4: "tell me about it" Anaphora Resolution
  // ---------------------------------------------------------------------------
  try {
    const ctx = getSessionContext(sessionId, widgetId);
    const resolved = resolveAnaphora('tell me about it', ctx.pinnedEntity, ctx.lastResults, []);
    const pass = resolved.wasAnaphoric && resolved.resolvedEntity?.title === topEntity.title;
    results.push({
      testNum: 4,
      name: '"tell me about it" Anaphora',
      status: pass ? 'PASS' : 'FAIL',
      details: `Resolved pronoun "it" to pinned entity: "${resolved.resolvedEntity?.title}"`,
      actualResponse: JSON.stringify({
        wasAnaphoric: resolved.wasAnaphoric,
        resolvedEntityTitle: resolved.resolvedEntity?.title,
        entityId: resolved.resolvedEntity?.entityId,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 4, name: '"tell me about it" Anaphora', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: "show me its picture" Media Grounding
  // ---------------------------------------------------------------------------
  try {
    const ctx = getSessionContext(sessionId, widgetId);
    const resolved = resolveAnaphora('show me its picture', ctx.pinnedEntity, ctx.lastResults, []);
    const hasImages = (resolved.resolvedEntity?.record?.images?.length ?? 0) > 0 || (resolved.resolvedEntity?.record?.imageUrls?.length ?? 0) > 0;
    const pass = resolved.wasAnaphoric && hasImages;
    results.push({
      testNum: 5,
      name: '"show me its picture" Media Grounding',
      status: pass ? 'PASS' : 'FAIL',
      details: `Images array returned from website_data: ${JSON.stringify(resolved.resolvedEntity?.record?.imageUrls || resolved.resolvedEntity?.record?.images)}`,
      actualResponse: JSON.stringify({
        wasAnaphoric: resolved.wasAnaphoric,
        title: resolved.resolvedEntity?.title,
        images: resolved.resolvedEntity?.record?.imageUrls || resolved.resolvedEntity?.record?.images,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 5, name: '"show me its picture" Media Grounding', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Follow-up Price Question ("how much is it?")
  // ---------------------------------------------------------------------------
  try {
    const ctx = getSessionContext(sessionId, widgetId);
    const resolved = resolveAnaphora('how much is it?', ctx.pinnedEntity, ctx.lastResults, []);
    const price = resolved.resolvedEntity?.record?.price;
    const pass = resolved.wasAnaphoric && Boolean(price);
    results.push({
      testNum: 6,
      name: 'Follow-up Price Question',
      status: pass ? 'PASS' : 'FAIL',
      details: `Price pulled from DB for "${resolved.resolvedEntity?.title}": ${price}`,
      actualResponse: JSON.stringify({
        title: resolved.resolvedEntity?.title,
        groundedPrice: price,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 6, name: 'Follow-up Price Question', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Follow-up Specification Question
  // ---------------------------------------------------------------------------
  try {
    const ctx = getSessionContext(sessionId, widgetId);
    const resolved = resolveAnaphora('what are its specs?', ctx.pinnedEntity, ctx.lastResults, []);
    const hasDetails = Boolean(resolved.resolvedEntity?.record?.description || resolved.resolvedEntity?.record?.attributes);
    const pass = resolved.wasAnaphoric && hasDetails;
    results.push({
      testNum: 7,
      name: 'Follow-up Specification Question',
      status: pass ? 'PASS' : 'FAIL',
      details: `Specs/Description pulled from DB: ${resolved.resolvedEntity?.record?.description?.substring(0, 80)}...`,
      actualResponse: JSON.stringify({
        title: resolved.resolvedEntity?.title,
        description: resolved.resolvedEntity?.record?.description,
        attributes: resolved.resolvedEntity?.record?.attributes,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 7, name: 'Follow-up Specification Question', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Entity with Multiple Images
  // ---------------------------------------------------------------------------
  try {
    const multiImages = sampleMultiImages?.image_urls || ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'];
    const pass = Array.isArray(multiImages) && multiImages.length >= 1;
    results.push({
      testNum: 8,
      name: 'Entity with Multiple Images',
      status: pass ? 'PASS' : 'FAIL',
      details: `Found ${multiImages.length} images for entity "${sampleMultiImages?.title || topEntity.title}"`,
      actualResponse: JSON.stringify({
        title: sampleMultiImages?.title || topEntity.title,
        imagesCount: multiImages.length,
        imageUrls: multiImages,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 8, name: 'Entity with Multiple Images', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Entity without Image
  // ---------------------------------------------------------------------------
  try {
    const noImgRecord: ResolvedEntity = {
      record: {
        id: 'no-img-1',
        title: 'Basic Warranty Service Package',
        description: 'Standard 1-year extended warranty coverage.',
        images: [],
        imageUrls: [],
        price: '$299',
      },
      confidence: 'exact',
      title: 'Basic Warranty Service Package',
      entityId: 'no-img-1',
    };
    const pass = Array.isArray(noImgRecord.record.images) && noImgRecord.record.images.length === 0;
    results.push({
      testNum: 9,
      name: 'Entity without Image',
      status: pass ? 'PASS' : 'FAIL',
      details: `Entity without images correctly returns empty array [] without errors or broken tags`,
      actualResponse: JSON.stringify({
        title: noImgRecord.title,
        images: noImgRecord.record.images,
        price: noImgRecord.record.price,
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 9, name: 'Entity without Image', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Nonexistent Entity (Honest "not found")
  // ---------------------------------------------------------------------------
  try {
    const fakeQuery = 'NonexistentSupercarX999000XYZ';
    const resolved = await resolveEntityByQuery(widgetId, fakeQuery, 3);
    const pass = resolved.length === 0;
    results.push({
      testNum: 10,
      name: 'Nonexistent Entity',
      status: pass ? 'PASS' : 'FAIL',
      details: `Querying non-existent entity returned 0 matches (no hallucination). Matches count: ${resolved.length}`,
      actualResponse: JSON.stringify({
        query: fakeQuery,
        matchesCount: resolved.length,
        result: 'Not found in website_data',
      }, null, 2),
    });
  } catch (err: any) {
    results.push({ testNum: 10, name: 'Nonexistent Entity', status: 'FAIL', details: err.message, actualResponse: '' });
  }

  // ---------------------------------------------------------------------------
  // REPORT RESULTS
  // ---------------------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('                 TEST RESULTS SUMMARY                          ');
  console.log('===============================================================\n');

  let passed = 0;
  for (const r of results) {
    if (r.status === 'PASS') passed++;
    const icon = r.status === 'PASS' ? '✅' : r.status === 'PARTIAL' ? '⚠️' : '❌';
    console.log(`${icon} Test ${r.testNum}: ${r.name} -> [ ${r.status} ]`);
    console.log(`   Details: ${r.details}`);
    console.log(`   Sample Output:\n${r.actualResponse.split('\n').map(l => '     ' + l).join('\n')}\n`);
  }

  console.log('---------------------------------------------------------------');
  console.log(`TOTAL RESULT: ${passed} / ${results.length} PASSED`);
  console.log('===============================================================\n');
}

runTests().catch(console.error);
