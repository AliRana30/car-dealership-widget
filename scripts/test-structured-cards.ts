/**
 * Comprehensive Validation Test Suite for Structured Entity & Card Generation
 * Across Chat, Retell AI, and Vapi AI
 */

import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

import { createClient } from '@supabase/supabase-js';
import { executeUnifiedTool, sanitizeAndRankImages, type StructuredEntity } from '@/lib/agents/unifiedTools';
import { pinEntity, getSessionContext, clearSessionContext } from '@/lib/agents/sessionContext';
import { planAndExecute } from '@/lib/agents/queryPlanner';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const NORETMY_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface TestCaseResult {
  num: number;
  testCase: string;
  expectedResult: string;
  actualResult: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  details?: any;
  rootCause?: string;
}

const testResults: TestCaseResult[] = [];

async function runValidationSuite() {
  console.log('========================================================================');
  console.log('  STARTING STRUCTURED ENTITY & VERIFIED CARD VALIDATION SUITE');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Specific Entity Card (LMS Course: MERN Stack)
  // ---------------------------------------------------------------------------
  try {
    const result = await executeUnifiedTool(LMS_WIDGET_ID, 'get_entity', { entityId: 'MERN Stack' });
    const top = result.results[0];

    const pass =
      result.success &&
      result.count === 1 &&
      top &&
      top.title.toLowerCase().includes('mern stack') &&
      Boolean(top.price) &&
      Boolean(top.entityType) &&
      Array.isArray(top.imageUrls);

    testResults.push({
      num: 1,
      testCase: 'Specific Entity Card (Course: MERN Stack)',
      expectedResult: 'Returns strictly 1 authoritative entity card with title, price, course type, and images',
      actualResult: `Count: ${result.count}, Title: "${top?.title}", Price: ${top?.price}, Type: ${top?.entityType}, Images: ${top?.imageUrls?.length}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { top },
    });
  } catch (err: any) {
    testResults.push({
      num: 1,
      testCase: 'Specific Entity Card (Course)',
      expectedResult: 'Single authoritative entity card',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Specific Entity Card (Automotive: 2024 Jeep Wrangler)
  // ---------------------------------------------------------------------------
  try {
    const result = await executeUnifiedTool(NORETMY_WIDGET_ID, 'get_entity', { entityId: '2024 Jeep Wrangler' });
    const top = result.results[0];

    const pass =
      result.success &&
      result.count === 1 &&
      top &&
      top.title.toLowerCase().includes('wrangler') &&
      Boolean(top.entityType) &&
      top.metadata &&
      Boolean(top.sourceUrl);

    testResults.push({
      num: 2,
      testCase: 'Specific Entity Card (Vehicle: 2024 Jeep Wrangler)',
      expectedResult: 'Returns strictly 1 vehicle entity card with VIN/specs metadata and sourceUrl',
      actualResult: `Count: ${result.count}, Title: "${top?.title}", Type: ${top?.entityType}, SourceUrl: "${top?.sourceUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { top },
    });
  } catch (err: any) {
    testResults.push({
      num: 2,
      testCase: 'Specific Entity Card (Vehicle)',
      expectedResult: 'Single authoritative vehicle card',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Broad Query Multi-Card Generation ("show me courses")
  // ---------------------------------------------------------------------------
  try {
    const result = await executeUnifiedTool(LMS_WIDGET_ID, 'search_knowledge', { query: 'courses', limit: 5 });

    const pass =
      result.success &&
      result.results.length >= 2 &&
      result.results.every(r => Boolean(r.id) && Boolean(r.title));

    testResults.push({
      num: 3,
      testCase: 'Broad Catalog Cards ("show me courses")',
      expectedResult: 'Returns appropriate multi-item candidate list (count >= 2) with distinct course cards',
      actualResult: `Returned ${result.results.length} cards: ${result.results.map(r => `"${r.title}"`).join(', ')}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { count: result.results.length, titles: result.results.map(r => r.title) },
    });
  } catch (err: any) {
    testResults.push({
      num: 3,
      testCase: 'Broad Catalog Cards',
      expectedResult: 'Multi-item card list',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Follow-up Image Request ("show me pictures of it")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `test-media-${Date.now()}`;
    // Turn 1: Pin MERN Stack into session
    await pinEntity(sessionId, LMS_WIDGET_ID, {
      id: 'course-mern-1',
      title: 'MERN Stack Development Course',
      price: '$150',
      imageUrls: ['https://lms-e-learning-system.vercel.app/images/mern.jpg', 'https://lms-e-learning-system.vercel.app/images/mern-thumb.jpg'],
    });

    // Turn 2: Media query
    const plannerOutput = await planAndExecute(
      'show me pictures of it',
      LMS_WIDGET_ID,
      { sessionId }
    );

    const mediaStep = plannerOutput.stepResults.find(s => s.tool === 'get_entity_media');
    const mediaResult = mediaStep?.result;
    const pass =
      plannerOutput.plan.planType === 'media_request' &&
      mediaResult?.success &&
      mediaResult.results[0]?.title?.includes('MERN') &&
      mediaResult.results[0]?.imageUrls?.length > 0;

    testResults.push({
      num: 4,
      testCase: 'Follow-up Image Request ("show me pictures of it")',
      expectedResult: 'Resolves session entity and returns verified image gallery for pinned entity',
      actualResult: `Plan: ${plannerOutput.plan.planType}, Entity: "${mediaResult?.results[0]?.title}", Images: ${JSON.stringify(mediaResult?.results[0]?.imageUrls)}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { plan: plannerOutput.plan, mediaResult },
    });

    await clearSessionContext(sessionId, LMS_WIDGET_ID);
  } catch (err: any) {
    testResults.push({
      num: 4,
      testCase: 'Follow-up Image Request',
      expectedResult: 'Returns images for pinned entity',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: No Hallucinated Images & Missing Image Safe Fallback
  // ---------------------------------------------------------------------------
  try {
    const rawNoImageRecord = {
      id: 'no-img-1',
      title: 'Frequently Asked Questions — CampusCore',
      entity_type: 'faq',
      description: 'Frequently asked questions and support policies.',
    };

    const sanitized = sanitizeAndRankImages((rawNoImageRecord as any).imageUrls);
    const pass = Array.isArray(sanitized) && sanitized.length === 0;

    testResults.push({
      num: 5,
      testCase: 'No Hallucinated Images on Missing Assets',
      expectedResult: 'Returns empty array [] with zero invented external URLs when entity has no images',
      actualResult: `Sanitized images: ${JSON.stringify(sanitized)} (length: ${sanitized.length})`,
      status: pass ? 'PASS' : 'FAIL',
      details: { sanitized },
    });
  } catch (err: any) {
    testResults.push({
      num: 5,
      testCase: 'No Hallucinated Images',
      expectedResult: 'Empty array for missing images',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Invalid Image, Tracking Pixel & SVG Icon Filtering
  // ---------------------------------------------------------------------------
  try {
    const dirtyImages = [
      'https://example.com/pixel.gif',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'https://example.com/icons/facebook_icon.svg',
      'https://example.com/spacer.gif',
      'https://example.com/verified-product-photo.jpg',
      '   ',
      'https://example.com/verified-product-photo.jpg', // Duplicate
    ];

    const clean = sanitizeAndRankImages(dirtyImages);
    const pass = clean.length === 1 && clean[0] === 'https://example.com/verified-product-photo.jpg';

    testResults.push({
      num: 6,
      testCase: 'Invalid Image & Tracking Pixel Filtering',
      expectedResult: 'Strips tracking pixels, SVGs, data URIs, and duplicate URLs',
      actualResult: `Input: ${dirtyImages.length} items -> Clean Output: ${JSON.stringify(clean)}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { clean },
    });
  } catch (err: any) {
    testResults.push({
      num: 6,
      testCase: 'Invalid Image Filtering',
      expectedResult: 'Clean sanitized image list',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Multiple Images & Quality Prioritization (Full-res > Thumbnail)
  // ---------------------------------------------------------------------------
  try {
    const mixedImages = [
      'https://example.com/car_thumb.jpg?size=small',
      'https://example.com/car_full_hd.jpg',
      'https://example.com/car_interior.jpg',
      'https://example.com/car_preview.jpg?w=50',
    ];

    const ranked = sanitizeAndRankImages(mixedImages);
    // Full resolution images should appear before thumbnail URLs
    const pass =
      ranked.length === 4 &&
      !ranked[0].includes('thumb') &&
      !ranked[0].includes('w=50') &&
      ranked[0] === 'https://example.com/car_full_hd.jpg';

    testResults.push({
      num: 7,
      testCase: 'Multiple Images & Quality Prioritization',
      expectedResult: 'Full-resolution image ranked ahead of thumbnails (_thumb, w=50)',
      actualResult: `Top ranked: "${ranked[0]}", 2nd: "${ranked[1]}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { ranked },
    });
  } catch (err: any) {
    testResults.push({
      num: 7,
      testCase: 'Multiple Images Prioritization',
      expectedResult: 'High-res image prioritized',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Universal 13-Attribute Preservation Contract
  // ---------------------------------------------------------------------------
  try {
    const result = await executeUnifiedTool(LMS_WIDGET_ID, 'get_entity', { entityId: 'Backend Mastery' });
    const e = result.results[0];

    const requiredFields = [
      'id', 'title', 'entityType', 'description', 'price',
      'currency', 'availability', 'imageUrls', 'sourceUrl',
      'metadata', 'freshness', 'firstSeen', 'lastSeen'
    ];

    const missing = requiredFields.filter(f => (e as any)[f] === undefined);
    const pass = missing.length === 0;

    testResults.push({
      num: 8,
      testCase: 'Universal 13-Attribute Preservation Contract',
      expectedResult: 'Entity preserves all standard attributes (id, title, entityType, description, price, currency, availability, imageUrls, sourceUrl, metadata, freshness)',
      actualResult: missing.length === 0 ? 'All 13 attributes present and verified' : `Missing fields: ${missing.join(', ')}`,
      status: pass ? 'PASS' : 'FAIL',
      details: {
        id: e.id,
        title: e.title,
        entityType: e.entityType,
        price: e.price,
        originalPrice: e.originalPrice,
        currency: e.currency,
        availability: e.availability,
        freshness: e.freshness,
        imageCount: e.imageUrls.length,
      },
    });
  } catch (err: any) {
    testResults.push({
      num: 8,
      testCase: '13-Attribute Contract',
      expectedResult: 'All attributes preserved',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Live POST /api/retell/chat Structured Output & Card Separation
  // ---------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/retell/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId: LMS_WIDGET_ID,
        sessionId: `test-chat-card-${Date.now()}`,
        content: 'Tell me about MERN Stack',
      }),
    });

    const data = await res.json();
    const agentMsg = data.messages?.find((m: any) => m.role === 'agent');
    const pass =
      res.status === 200 &&
      Boolean(agentMsg?.content) &&
      Array.isArray(agentMsg?.results) &&
      agentMsg.results.length === 1 &&
      agentMsg.results[0].title.toLowerCase().includes('mern stack');

    testResults.push({
      num: 9,
      testCase: 'Live POST /api/retell/chat Structured Card Delivery',
      expectedResult: 'HTTP 200, returns natural language prose in content + strictly 1 structured entity card in results',
      actualResult: `Status: ${res.status}, Results count: ${agentMsg?.results?.length}, Card Title: "${agentMsg?.results?.[0]?.title}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { proseLength: agentMsg?.content?.length, results: agentMsg?.results },
    });
  } catch (err: any) {
    testResults.push({
      num: 9,
      testCase: 'Live Chat Structured Output',
      expectedResult: 'HTTP 200 with structured results',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Live POST /api/agent/tools Voice Webhook Parity
  // ---------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'search_knowledge',
        args: { query: 'Backend Mastery', limit: 1 },
      }),
    });

    const data = await res.json();
    const top = data.results?.[0];
    const pass =
      res.status === 200 &&
      data.success &&
      top &&
      top.title.includes('Backend Mastery') &&
      Array.isArray(top.imageUrls) &&
      Boolean(top.entityType);

    testResults.push({
      num: 10,
      testCase: 'Live POST /api/agent/tools Voice Webhook Parity',
      expectedResult: 'HTTP 200, returns structured entity matching chat schema with verified media',
      actualResult: `Status: ${res.status}, Success: ${data.success}, Entity: "${top?.title}", Price: ${top?.price}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { data },
    });
  } catch (err: any) {
    testResults.push({
      num: 10,
      testCase: 'Live Voice Webhook Parity',
      expectedResult: 'HTTP 200 structured voice tool response',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // PRINT TEST REPORT SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('  TEST REPORT RESULTS');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  for (const r of testResults) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'PARTIAL' ? '⚠️' : '❌';
    console.log(`${icon} [TEST ${r.num}] [${r.status}] ${r.testCase}`);
    console.log(`   Expected: ${r.expectedResult}`);
    console.log(`   Actual:   ${r.actualResult}`);
    if (r.details) {
      console.log(`   Details:  ${JSON.stringify(r.details)}`);
    }
    if (r.rootCause) {
      console.log(`   Cause:    ${r.rootCause}`);
    }
    console.log('');

    if (r.status === 'PASS') passed++;
    else failed++;
  }

  console.log('========================================================================');
  console.log('  TEST SUMMARY');
  console.log('========================================================================');
  console.log(`Total Tests:   ${testResults.length}`);
  console.log(`Passed:        ${passed} ✅`);
  console.log(`Failed:        ${failed} ❌`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runValidationSuite().catch((err) => {
  console.error('Fatal error running validation suite:', err);
  process.exit(1);
});
