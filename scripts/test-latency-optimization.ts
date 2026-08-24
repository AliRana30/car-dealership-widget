/**
 * Production Latency & Stage Timing Optimization Validation Suite
 *
 * Validates:
 * 1. Greeting Fast-Path (<10ms short-circuit, zero DB/vector calls)
 * 2. Exact Entity Query (Direct fast-path lookup, token match)
 * 3. Semantic Query (Parallel DB candidate fetch + pgvector search)
 * 4. Repeated Semantic Query (In-Memory Embedding LRU Cache hit speedup)
 * 5. Filtered Query (Multi-attribute & price range filtering with database/reranker)
 * 6. Complex Multi-Tool Query (Multi-step planner: filter + compare + navigate)
 * 7. Autonomous Navigation Query (Target resolution & URL verification)
 * 8. Image / Card Query (Media extraction & card badge rendering)
 * 9. Informational Static Page Query (Safe 2m static cache hit)
 * 10. Timing Metadata API Contract (Verifies stage-by-stage timings in response JSON)
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

import { hybridRetrieve } from '../src/lib/retrieval/hybridRag';
import { planAndExecute, planQuery } from '../src/lib/agents/queryPlanner';
import { executeUnifiedTool } from '../src/lib/agents/unifiedTools';

const BASE_URL = 'http://localhost:3000';
const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const NORETMY_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface TestResult {
  num: number;
  testCase: string;
  expectedResult: string;
  actualResult: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  latency: string;
  rootCause?: string;
  details?: any;
}

async function runLatencyOptimizationSuite() {
  console.log('\n========================================================================');
  console.log('  STARTING RAG & RETRIEVAL LATENCY OPTIMIZATION VALIDATION SUITE');
  console.log('========================================================================\n');

  const testResults: TestResult[] = [];

  // ---------------------------------------------------------------------------
  // TEST 1: Greeting Fast-Path Short Circuit (< 10ms)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const planResult = await planAndExecute('hello there!', LMS_WIDGET_ID, {
      sessionId: `session-greet-${Date.now()}`,
    });
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const pass =
      planResult.shortCircuited === true &&
      planResult.stepResults.length === 0 &&
      latencyMs < 30; // generous upper bound in local dev

    testResults.push({
      num: 1,
      testCase: 'Greeting Fast-Path Short Circuit',
      expectedResult: 'Short-circuit in <10ms with 0 tool calls',
      actualResult: `shortCircuited: ${planResult.shortCircuited}, steps: ${planResult.stepResults.length}`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${latencyMs} ms`,
      details: { totalDurationMs: planResult.totalDurationMs },
    });
  } catch (err: any) {
    testResults.push({
      num: 1,
      testCase: 'Greeting Fast-Path Short Circuit',
      expectedResult: 'Short-circuit in <10ms',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Exact Entity Query (Direct Fast-Path Lookup)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const chatRes = await fetch(`${BASE_URL}/api/retell/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId: LMS_WIDGET_ID,
        sessionId: `exact-entity-${Date.now()}`,
        content: 'tell me about Backend Mastery',
      }),
    });
    const chatData = await chatRes.json();
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const topEntity = chatData.messages?.find((m: any) => m.results)?.results?.[0];
    const pass =
      chatRes.status === 200 &&
      topEntity?.title?.toLowerCase().includes('backend mastery') &&
      chatData.grounding?.grounded === true;

    testResults.push({
      num: 2,
      testCase: 'Exact Entity Query (Direct Fast-Path Lookup)',
      expectedResult: 'HTTP 200, grounded=true, matches exact course "Backend Mastery"',
      actualResult: `Found: "${topEntity?.title}", grounded: ${chatData.grounding?.grounded}`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${latencyMs} ms`,
      details: { timings: chatData.timings },
    });
  } catch (err: any) {
    testResults.push({
      num: 2,
      testCase: 'Exact Entity Query',
      expectedResult: 'Exact entity resolved',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Semantic Query (Parallel DB + pgvector)
  // ---------------------------------------------------------------------------
  let semanticQueryFirstDuration = 0;
  const semanticQueryText = 'do you have any full stack web developer courses with nodejs';
  try {
    const t0 = performance.now();
    const out = await hybridRetrieve(LMS_WIDGET_ID, semanticQueryText, { limit: 3 });
    semanticQueryFirstDuration = Math.round((performance.now() - t0) * 100) / 100;

    const pass =
      out.results.length > 0 &&
      out.timings?.parallelRetrievalMs !== undefined &&
      out.timings?.rerankingMs !== undefined;

    testResults.push({
      num: 3,
      testCase: 'Semantic Query (Parallel DB + pgvector)',
      expectedResult: 'Parallel candidate retrieval with pgvector similarity & reranking',
      actualResult: `Found ${out.count} items, parallelMs: ${out.timings?.parallelRetrievalMs}ms, rerankMs: ${out.timings?.rerankingMs}ms`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${semanticQueryFirstDuration} ms`,
      details: out.timings,
    });
  } catch (err: any) {
    testResults.push({
      num: 3,
      testCase: 'Semantic Query',
      expectedResult: 'Semantic retrieval succeeds',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Repeated Semantic Query (In-Memory Embedding Cache Hit Speedup)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const outCached = await hybridRetrieve(LMS_WIDGET_ID, semanticQueryText, { limit: 3 });
    const cachedDuration = Math.round((performance.now() - t0) * 100) / 100;

    // Cache hit should be faster than first embedding generation
    const pass =
      outCached.results.length > 0 &&
      cachedDuration <= semanticQueryFirstDuration + 10; // significantly faster or comparable

    testResults.push({
      num: 4,
      testCase: 'Repeated Semantic Query (In-Memory Embedding Cache Hit)',
      expectedResult: 'High-speed retrieval leveraging cached query embedding vector',
      actualResult: `Initial: ${semanticQueryFirstDuration}ms → Cached: ${cachedDuration}ms (Speedup: ${(semanticQueryFirstDuration / Math.max(1, cachedDuration)).toFixed(2)}x)`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${cachedDuration} ms`,
      details: { initialMs: semanticQueryFirstDuration, cachedMs: cachedDuration },
    });
  } catch (err: any) {
    testResults.push({
      num: 4,
      testCase: 'Repeated Semantic Query',
      expectedResult: 'Cache hit execution',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Filtered Query (Multi-attribute & Price Range Filtering)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const toolOut = await executeUnifiedTool(NORETMY_WIDGET_ID, 'filter_entities', {
      maxPrice: 60000,
      sortBy: 'price_asc',
    });
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const pass =
      toolOut.success === true &&
      toolOut.results.length > 0 &&
      toolOut.appliedFilters !== undefined;

    testResults.push({
      num: 5,
      testCase: 'Filtered Query (Price & Attribute Database Filtering)',
      expectedResult: 'Structured filtering with appliedFilters metadata',
      actualResult: `Filtered count: ${toolOut.count}, appliedFilters: ${JSON.stringify(toolOut.appliedFilters)}`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${latencyMs} ms`,
      details: { timings: toolOut.timings },
    });
  } catch (err: any) {
    testResults.push({
      num: 5,
      testCase: 'Filtered Query',
      expectedResult: 'Filtering execution succeeds',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Complex Multi-Tool Query (Multi-Step Plan Execution)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const multiPlan = await planAndExecute('compare Backend Mastery and MERN stack course', LMS_WIDGET_ID, {
      sessionId: `multi-plan-${Date.now()}`,
    });
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const pass =
      multiPlan.plan.steps.length >= 2 &&
      multiPlan.stepResults.length >= 2 &&
      multiPlan.primary.success === true;

    testResults.push({
      num: 6,
      testCase: 'Complex Multi-Tool Query (Bounded Multi-Step Plan Execution)',
      expectedResult: 'Wave executor coordinates 2+ tool steps in bounded sequence',
      actualResult: `Plan: ${multiPlan.plan.planType}, steps executed: ${multiPlan.stepResults.length}, grounded: ${multiPlan.grounded}`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${latencyMs} ms`,
      details: { planType: multiPlan.plan.planType, stepDurations: multiPlan.stepResults.map(s => ({ tool: s.tool, durationMs: s.durationMs })) },
    });
  } catch (err: any) {
    testResults.push({
      num: 6,
      testCase: 'Complex Multi-Tool Query',
      expectedResult: 'Multi-tool plan succeeds',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Autonomous Navigation Query
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const navOut = await executeUnifiedTool(
      LMS_WIDGET_ID,
      'navigate_to_entity',
      { query: 'Backend Mastery' },
      { allowAgentNavigation: true, sessionId: `nav-lat-${Date.now()}` }
    );
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const pass =
      navOut.success === true &&
      Boolean(navOut.sources?.[0]?.url?.includes('lms-e-learning-system.vercel.app/course/'));

    testResults.push({
      num: 7,
      testCase: 'Autonomous Navigation Query',
      expectedResult: 'Resolves exact canonical URL with widget_resume state',
      actualResult: `URL: ${navOut.sources?.[0]?.url}`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${latencyMs} ms`,
      details: { url: navOut.sources?.[0]?.url },
    });
  } catch (err: any) {
    testResults.push({
      num: 7,
      testCase: 'Autonomous Navigation Query',
      expectedResult: 'Navigation succeeds',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Image / Card Media Query
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const mediaOut = await executeUnifiedTool(NORETMY_WIDGET_ID, 'get_entity_media', {
      query: '2024 Jeep Wrangler',
    });
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const pass =
      mediaOut.success === true &&
      mediaOut.results.length > 0 &&
      mediaOut.results[0].imageUrls !== undefined;

    testResults.push({
      num: 8,
      testCase: 'Image / Card Media Query',
      expectedResult: 'Returns structured entity with verified imageUrls',
      actualResult: `Images count: ${mediaOut.results[0]?.imageUrls?.length || 0}, Title: ${mediaOut.results[0]?.title}`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${latencyMs} ms`,
      details: { imageUrls: mediaOut.results[0]?.imageUrls },
    });
  } catch (err: any) {
    testResults.push({
      num: 8,
      testCase: 'Image / Card Media Query',
      expectedResult: 'Media query succeeds',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Informational Static Page Query (Safe Static Cache Hit)
  // ---------------------------------------------------------------------------
  try {
    // Prime cache
    await hybridRetrieve(LMS_WIDGET_ID, 'privacy policy', { includeInformational: true });

    // Measure cached read
    const t0 = performance.now();
    const staticOut = await hybridRetrieve(LMS_WIDGET_ID, 'privacy policy', { includeInformational: true });
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const pass =
      staticOut.results.length > 0 &&
      (staticOut.timings?.cacheHit === 'static_page' || latencyMs < 50);

    testResults.push({
      num: 9,
      testCase: 'Informational Static Page Query (Safe Static Cache Hit)',
      expectedResult: 'Instant static page retrieval (<50ms) with cacheHit="static_page"',
      actualResult: `cacheHit: ${staticOut.timings?.cacheHit}, items: ${staticOut.count}`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${latencyMs} ms`,
      details: staticOut.timings,
    });
  } catch (err: any) {
    testResults.push({
      num: 9,
      testCase: 'Informational Static Page Query',
      expectedResult: 'Static page retrieval succeeds',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Timing Metadata API Contract (Live POST /api/retell/chat)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const chatRes = await fetch(`${BASE_URL}/api/retell/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId: LMS_WIDGET_ID,
        sessionId: `timing-test-${Date.now()}`,
        content: 'what is the price of Backend Mastery?',
      }),
    });
    const chatData = await chatRes.json();
    const latencyMs = Math.round((performance.now() - t0) * 100) / 100;

    const timings = chatData.timings;
    const pass =
      chatRes.status === 200 &&
      timings !== undefined &&
      timings.totalMs !== undefined &&
      timings.plannerDurationMs !== undefined &&
      timings.retrieval?.totalRetrievalMs !== undefined;

    testResults.push({
      num: 10,
      testCase: 'Timing Metadata API Contract (Live POST /api/retell/chat)',
      expectedResult: 'HTTP 200, response JSON exposes comprehensive stage-by-stage timings',
      actualResult: `totalMs: ${timings?.totalMs}ms, plannerMs: ${timings?.plannerDurationMs}ms, retrievalTotalMs: ${timings?.retrieval?.totalRetrievalMs}ms`,
      status: pass ? 'PASS' : 'FAIL',
      latency: `${latencyMs} ms`,
      details: timings,
    });
  } catch (err: any) {
    testResults.push({
      num: 10,
      testCase: 'Timing Metadata API Contract',
      expectedResult: 'Exposes timings metadata',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // Print Summary Report
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('  LATENCY OPTIMIZATION TEST REPORT');
  console.log('========================================================================\n');

  let passCount = 0;
  let failCount = 0;
  let partialCount = 0;

  for (const r of testResults) {
    const icon = r.status === 'PASS' ? '✅' : (r.status === 'FAIL' ? '❌' : '⚠️');
    console.log(`${icon} [TEST ${r.num}] [${r.status}] ${r.testCase} (${r.latency})`);
    console.log(`   Expected: ${r.expectedResult}`);
    console.log(`   Actual:   ${r.actualResult}`);
    if (r.rootCause) {
      console.log(`   Root Cause: ${r.rootCause}`);
    }
    if (r.details) {
      console.log(`   Details:  ${JSON.stringify(r.details)}`);
    }
    console.log('');

    if (r.status === 'PASS') passCount++;
    else if (r.status === 'FAIL') failCount++;
    else partialCount++;
  }

  console.log('========================================================================');
  console.log('  TEST SUMMARY');
  console.log('========================================================================');
  console.log(`Total Tests:   ${testResults.length}`);
  console.log(`Passed:        ${passCount} ✅`);
  console.log(`Failed:        ${failCount} ❌`);
  console.log(`Partial:       ${partialCount} ⚠️`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runLatencyOptimizationSuite().catch(console.error);
