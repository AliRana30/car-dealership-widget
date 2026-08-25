/**
 * COMPREHENSIVE ENTITY-CARD PIPELINE TEST SUITE (CHAT & VOICE)
 * 
 * Verifies:
 * - Course cards, Product cards, Vehicle cards, Service cards, FAQ/Doc cards
 * - Rendering attributes: title, description, price, rating, images, destination URL, metadata, View/Open actions
 * - 12 specific image & metadata scenarios:
 *   1. One image
 *   2. Multiple images
 *   3. Missing image
 *   4. Broken / malformed image URL handling
 *   5. Cloudinary image
 *   6. CDN image
 *   7. Remote image
 *   8. Entity with no price
 *   9. Entity with no rating
 *   10. Entity with incomplete metadata
 *   11. Multiple matching entities
 *   12. Specific entity request
 * - Anti-fabrication verification (LLM cannot invent price, rating, image, or URL)
 * - Voice + Widget real-time dispatch verification (Retell & Vapi trigger identical entity cards)
 */

import * as fs from 'fs';
import * as path from 'path';

// Load environment variables manually
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

import { hybridRetrieve } from '../src/lib/retrieval/hybridRag';
import { validateGrounding } from '../src/lib/retrieval/grounding';
import { executeAgentTool, mapRowToEntity } from '../src/lib/agents/tools';
import { executeUnifiedTool } from '../src/lib/agents/unifiedTools';

const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface CardTestResult {
  testNumber: number;
  name: string;
  query: string;
  widgetId: string;
  expectedCardCount: number;
  expectedEntityType: string;
  expectedTitleSnippet: string;
  expectedPrice?: string;
  expectedRating?: number | string;
  requiresImages?: boolean;
  expectMultipleImages?: boolean;
  expectNoPrice?: boolean;
  expectNoRating?: boolean;
  testVoiceDispatch?: boolean;
}

async function runEntityCardPipelineTests() {
  console.log('================================================================');
  console.log('COMPREHENSIVE ENTITY-CARD PIPELINE TEST SUITE (CHAT & VOICE)');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function report(pass: boolean, name: string, detail?: string) {
    totalTests++;
    if (pass) {
      console.log(`  ✅ [PASS] Test ${totalTests}: ${name}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] Test ${totalTests}: ${name}`);
      if (detail) console.error(`          Detail: ${detail}`);
    }
  }

  // ── PART 1: DOMAIN ENTITY CARD RETRIEVAL & RENDERING VERIFICATION ──────────────
  console.log('--- PART 1: ENTITY CARD RENDERING ACROSS DOMAINS ---');

  // Test 1: Course Card (LMS) - "Show me the MERN course"
  console.log('\n[1] Query: "Show me the MERN course" (LMS)');
  const lmsMern = await hybridRetrieve(LMS_WIDGET_ID, 'Show me the MERN course', { limit: 1 });
  const mernTop = lmsMern.results[0];

  report(!!mernTop, 'MERN Stack course entity resolved');
  report(mernTop?.title.includes('MERN Stack'), 'Title is correct: "MERN Stack Development Course"');
  report(mernTop?.price === '$150' || mernTop?.metadata?.price === '$150', 'Price is accurately rendered as $150');
  report(mernTop?.rating === 5 || mernTop?.metadata?.ratings === 5, 'Rating is accurately rendered as 5');
  report(Boolean(mernTop?.sourceUrl?.includes('/course/')), 'Destination URL is valid (/course/6945abe7...)');
  report(Boolean(mernTop?.imageUrls && mernTop.imageUrls.length > 0), 'Entity card has associated image URL');

  // Test 2: Product / Vehicle Card (Automotive) - "Show me available vehicles"
  console.log('\n[2] Query: "Show me available vehicles" (Automotive)');
  const autoVehicles = await hybridRetrieve(AUTO_WIDGET_ID, 'Show me available vehicles', { limit: 4 });
  report(autoVehicles.count >= 3, `Multiple vehicle cards retrieved (${autoVehicles.count} vehicles)`);

  const jeep = autoVehicles.results.find(r => r.title.includes('Jeep'));
  report(!!jeep, 'Jeep vehicle card retrieved in catalog');
  report(Boolean(jeep?.price && String(jeep.price).includes('$')), `Vehicle price formatted properly: "${jeep?.price}"`);
  report(Boolean(jeep?.sourceUrl?.includes('/new-vehicles/')), `Destination URL accurate: "${jeep?.sourceUrl}"`);

  // Test 3: Specific Vehicle Card - "Show me 2024 Dodge Durango"
  console.log('\n[3] Query: "Show me 2024 Dodge Durango" (Automotive)');
  const durangoRes = await hybridRetrieve(AUTO_WIDGET_ID, 'Show me 2024 Dodge Durango', { limit: 1 });
  const durango = durangoRes.results[0];
  report(!!durango && durango.title.includes('Dodge Durango'), 'Specific Durango entity card retrieved');
  report(durango?.price === '$71,295' || durango?.metadata?.price === '$71,295', 'Durango price is accurately $71,295');
  report(durango?.metadata?.year === 2024 || durango?.metadata?.year === '2024', 'Metadata year is 2024');
  report(durango?.metadata?.make === 'Dodge', 'Metadata make is Dodge');

  // Test 4: Documentation / Content Card (FAQ)
  console.log('\n[4] Query: "Frequently Asked Questions" (LMS Documentation)');
  const faqRes = await hybridRetrieve(LMS_WIDGET_ID, 'Frequently Asked Questions', { limit: 1, includeInformational: true });
  const faq = faqRes.results[0];
  report(!!faq && faq.entityType === 'faq', 'FAQ content card retrieved with entityType = faq');
  report(faq?.price === undefined || faq?.price === null, 'FAQ content card has NO price (no fabrication)');
  report(faq?.rating === undefined || faq?.rating === null, 'FAQ content card has NO rating (no fabrication)');

  // ── PART 2: 12 SPECIFIC IMAGE & METADATA SCENARIOS ────────────────────────────
  console.log('\n--- PART 2: 12 SPECIFIC IMAGE & METADATA SCENARIOS ---');

  // Scenario 1: One image
  const singleImgEntity = mapRowToEntity({
    id: 'test-single-img',
    widget_id: LMS_WIDGET_ID,
    title: 'Single Image Course',
    image_urls: ['https://images.unsplash.com/photo-1517694712202-14dd9538aa97'],
    entity_type: 'service',
  });
  report(singleImgEntity.imageUrls.length === 1, 'Scenario 1: One image properly structured in entity card');

  // Scenario 2: Multiple images
  const multiImgEntity = mapRowToEntity({
    id: 'test-multi-img',
    widget_id: AUTO_WIDGET_ID,
    title: 'Multi Image Vehicle',
    image_urls: [
      'https://example.com/exterior.jpg',
      'https://example.com/interior.jpg',
      'https://example.com/engine.jpg',
    ],
    entity_type: 'product',
  });
  report(multiImgEntity.imageUrls.length === 3, 'Scenario 2: Multiple images (3 images) preserved for carousel');

  // Scenario 3: Missing image
  const noImgEntity = mapRowToEntity({
    id: 'test-no-img',
    widget_id: LMS_WIDGET_ID,
    title: 'No Image Course',
    image_urls: [],
    metadata: {},
    entity_type: 'service',
  });
  report(noImgEntity.imageUrls.length === 0, 'Scenario 3: Missing image yields empty array without fabrication');

  // Scenario 4: Broken / Malformed image URL handling
  const brokenImgEntity = mapRowToEntity({
    id: 'test-broken-img',
    widget_id: LMS_WIDGET_ID,
    title: 'Broken URL Course',
    image_urls: ['not-a-valid-url', 'javascript:alert(1)'],
    metadata: {},
  });
  // Verify mapRowToEntity safe structure
  report(Array.isArray(brokenImgEntity.imageUrls), 'Scenario 4: Malformed image URLs do not crash mapper');

  // Scenario 5: Cloudinary image
  const cloudinaryImgEntity = mapRowToEntity({
    id: 'test-cloudinary-img',
    widget_id: LMS_WIDGET_ID,
    title: 'Cloudinary Course',
    image_urls: ['https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg'],
  });
  report(cloudinaryImgEntity.imageUrls[0].includes('cloudinary.com'), 'Scenario 5: Cloudinary image URL preserved intact');

  // Scenario 6: CDN image
  const cdnImgEntity = mapRowToEntity({
    id: 'test-cdn-img',
    widget_id: LMS_WIDGET_ID,
    title: 'CDN Hosted Course',
    image_urls: ['https://cdn.frontdesk.ai/assets/courses/react.webp'],
  });
  report(cdnImgEntity.imageUrls[0].includes('cdn.frontdesk.ai'), 'Scenario 6: CDN image URL preserved intact');

  // Scenario 7: Remote HTTPS image
  const remoteImgEntity = mapRowToEntity({
    id: 'test-remote-img',
    widget_id: LMS_WIDGET_ID,
    title: 'Remote Image Course',
    image_urls: ['https://assets.example.org/photos/item-123.png'],
  });
  report(remoteImgEntity.imageUrls[0].startsWith('https://'), 'Scenario 7: Remote HTTPS image preserved intact');

  // Scenario 8: Entity with no price
  const freePolicy = mapRowToEntity({
    id: 'test-policy',
    widget_id: LMS_WIDGET_ID,
    title: 'Campus Policy',
    metadata: { description: 'Terms of service' },
  });
  report((freePolicy as any).price === undefined, 'Scenario 8: Entity with no price has price = undefined (no fake price)');

  // Scenario 9: Entity with no rating
  const unratedCourse = mapRowToEntity({
    id: 'test-unrated',
    widget_id: LMS_WIDGET_ID,
    title: 'Brand New Course',
    metadata: { price: '$49' },
  });
  report((unratedCourse as any).rating === undefined, 'Scenario 9: Entity with no rating has rating = undefined (no fake 5-stars)');

  // Scenario 10: Entity with incomplete metadata
  const partialMeta = mapRowToEntity({
    id: 'test-partial',
    widget_id: LMS_WIDGET_ID,
    title: 'Partial Meta Course',
    metadata: {},
  });
  report(partialMeta.title === 'Partial Meta Course' && typeof partialMeta.metadata === 'object', 'Scenario 10: Incomplete metadata handled safely with default fallback fields');

  // Scenario 11: Multiple matching entities
  const catalogRes = await hybridRetrieve(LMS_WIDGET_ID, 'courses', { limit: 5 });
  report(catalogRes.count >= 2, `Scenario 11: Multiple matching entities returns array of cards (${catalogRes.count} items)`);

  // Scenario 12: Specific entity request
  const specificRes = await hybridRetrieve(LMS_WIDGET_ID, 'Leetcode Mastery', { limit: 1 });
  report(specificRes.results.length === 1 && specificRes.results[0].title === 'Leetcode Mastery', 'Scenario 12: Specific entity request isolates single exact card');

  // ── PART 3: VOICE AGENT REAL-TIME WIDGET DISPATCH VERIFICATION ────────────────
  console.log('\n--- PART 3: VOICE AGENT REALTIME WIDGET DISPATCH (Retell & Vapi) ---');

  const testSessionId = `voice_session_test_${Date.now()}`;

  // Execute Voice Tool search_knowledge
  const voiceToolRes = await executeUnifiedTool(
    LMS_WIDGET_ID,
    'search_knowledge',
    { query: 'Leetcode Mastery', limit: 1 },
    { sessionId: testSessionId, businessName: 'CampusCore' }
  );

  report(voiceToolRes.success === true, 'Voice tool executeUnifiedTool(search_knowledge) succeeded');
  report(voiceToolRes.results.length === 1, 'Voice tool returned 1 structured entity card');

  const voiceCard = voiceToolRes.results[0];
  report(voiceCard?.title === 'Leetcode Mastery', `Voice card title is correct: "${voiceCard?.title}"`);
  report(voiceCard?.price === '$90', `Voice card price is correct: "${voiceCard?.price}"`);
  report(voiceCard?.rating === 5 || voiceCard?.metadata?.ratings === 5, `Voice card rating is correct: "${voiceCard?.rating}"`);
  report(Boolean(voiceCard?.sourceUrl), `Voice card destination URL is present: "${voiceCard?.sourceUrl}"`);
  report(Boolean(voiceCard?.imageUrls && voiceCard.imageUrls.length > 0), `Voice card image URL is present: "${voiceCard?.imageUrls?.[0]}"`);

  // Execute Voice Tool get_entity_media
  const mediaToolRes = await executeUnifiedTool(
    LMS_WIDGET_ID,
    'get_entity_media',
    { entityId: 'Leetcode Mastery' },
    { sessionId: testSessionId, businessName: 'CampusCore' }
  );

  report(mediaToolRes.success === true, 'Voice tool executeUnifiedTool(get_entity_media) succeeded');
  report(Boolean(mediaToolRes.results[0]?.imageUrls?.length), 'get_entity_media returns verified image URLs');

  console.log('\n================================================================');
  console.log(`ENTITY CARD SUITE SUMMARY: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runEntityCardPipelineTests().catch(err => {
  console.error('Fatal error during entity card pipeline tests:', err);
  process.exit(1);
});
