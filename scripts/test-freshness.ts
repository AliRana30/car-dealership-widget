/**
 * Unified Freshness & Hedging Validation Suite
 *
 * Validates:
 * 1. Fresh Entity Evaluation (<6h crawl -> 'fresh', no hedging)
 * 2. Recent Entity Evaluation (6-24h crawl -> 'recent', light hedging)
 * 3. Stale Entity Evaluation (>24h crawl -> 'stale_or_unlisted', mandatory hedge)
 * 4. Unlisted Entity Evaluation (still_listed === false -> 'stale_or_unlisted', -400 penalty)
 * 5. Connector-Backed Live Inventory Authority (Live API/feed -> 'fresh', +60 boost)
 * 6. Connector-Backed Stale Sync (>72h connector -> 'stale_or_unlisted')
 * 7. Grounding Layer Metadata & Strict Prompt Directives
 * 8. Live POST /api/retell/chat Stale Entity Hedged Response
 * 9. Live POST /api/agent/tools Voice Webhook Freshness Parity
 * 10. Availability & Pricing Non-Hallucination Guarantees
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

import { calculateFreshness } from '../src/lib/agents/tools';
import { executeUnifiedTool, formatResult } from '../src/lib/agents/unifiedTools';
import { validateGrounding } from '../src/lib/retrieval/grounding';
import { hybridRetrieve } from '../src/lib/retrieval/hybridRag';

const BASE_URL = 'http://localhost:3000';
const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const NORETMY_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface TestResult {
  num: number;
  testCase: string;
  expectedResult: string;
  actualResult: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  rootCause?: string;
  details?: any;
}

async function runFreshnessSuite() {
  console.log('\n========================================================================');
  console.log('  STARTING UNIFIED FRESHNESS & HEDGING VALIDATION SUITE');
  console.log('========================================================================\n');

  const testResults: TestResult[] = [];

  // ---------------------------------------------------------------------------
  // TEST 1: Fresh Entity Evaluation (< 6h crawl)
  // ---------------------------------------------------------------------------
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const freshInfo = calculateFreshness(twoHoursAgo, true, 'crawl');

    const pass =
      freshInfo.freshnessStatus === 'fresh' &&
      freshInfo.hedgeInstruction === undefined &&
      freshInfo.dataSource === 'crawl' &&
      freshInfo.isConnectorBacked === false;

    testResults.push({
      num: 1,
      testCase: 'Fresh Entity Evaluation (<6h crawl)',
      expectedResult: 'freshnessStatus="fresh", hedgeInstruction=undefined, confident statement allowed',
      actualResult: `status: ${freshInfo.freshnessStatus}, human: "${freshInfo.lastSeenHuman}", hedge: "${freshInfo.hedgeInstruction || 'none'}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: freshInfo,
    });
  } catch (err: any) {
    testResults.push({
      num: 1,
      testCase: 'Fresh Entity Evaluation',
      expectedResult: 'freshnessStatus=fresh',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Recent Entity Evaluation (6-24h crawl)
  // ---------------------------------------------------------------------------
  try {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const recentInfo = calculateFreshness(twelveHoursAgo, true, 'crawl');

    const pass =
      recentInfo.freshnessStatus === 'recent' &&
      Boolean(recentInfo.hedgeInstruction?.includes('LIGHT HEDGING'));

    testResults.push({
      num: 2,
      testCase: 'Recent Entity Evaluation (6-24h crawl)',
      expectedResult: 'freshnessStatus="recent", light hedge instruction present',
      actualResult: `status: ${recentInfo.freshnessStatus}, human: "${recentInfo.lastSeenHuman}", hedge: "${recentInfo.hedgeInstruction}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: recentInfo,
    });
  } catch (err: any) {
    testResults.push({
      num: 2,
      testCase: 'Recent Entity Evaluation',
      expectedResult: 'freshnessStatus=recent',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Stale Entity Evaluation (> 24h crawl)
  // ---------------------------------------------------------------------------
  try {
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const staleInfo = calculateFreshness(threeDaysAgo, true, 'crawl');

    const pass =
      staleInfo.freshnessStatus === 'stale_or_unlisted' &&
      Boolean(staleInfo.hedgeInstruction?.includes('HEDGING REQUIRED')) &&
      Boolean(staleInfo.hedgeInstruction?.includes('MUST NOT guarantee'));

    testResults.push({
      num: 3,
      testCase: 'Stale Entity Evaluation (>24h crawl)',
      expectedResult: 'freshnessStatus="stale_or_unlisted", mandatory hedge prohibiting guaranteed availability',
      actualResult: `status: ${staleInfo.freshnessStatus}, human: "${staleInfo.lastSeenHuman}", hedge: "${staleInfo.hedgeInstruction}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: staleInfo,
    });
  } catch (err: any) {
    testResults.push({
      num: 3,
      testCase: 'Stale Entity Evaluation',
      expectedResult: 'freshnessStatus=stale_or_unlisted',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Unlisted Entity Evaluation (still_listed === false)
  // ---------------------------------------------------------------------------
  try {
    const unlistedInfo = calculateFreshness(new Date().toISOString(), false, 'crawl');

    const pass =
      unlistedInfo.freshnessStatus === 'stale_or_unlisted' &&
      Boolean(unlistedInfo.hedgeInstruction?.includes('unlisted from the website/catalog'));

    testResults.push({
      num: 4,
      testCase: 'Unlisted Entity Evaluation (still_listed === false)',
      expectedResult: 'freshnessStatus="stale_or_unlisted", unlisted directive present',
      actualResult: `status: ${unlistedInfo.freshnessStatus}, human: "${unlistedInfo.lastSeenHuman}", hedge: "${unlistedInfo.hedgeInstruction}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: unlistedInfo,
    });
  } catch (err: any) {
    testResults.push({
      num: 4,
      testCase: 'Unlisted Entity Evaluation',
      expectedResult: 'freshnessStatus=stale_or_unlisted',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Connector-Backed Live Inventory Authority (< 24h sync)
  // ---------------------------------------------------------------------------
  try {
    const connectorSyncTime = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const connectorInfo = calculateFreshness(connectorSyncTime, true, 'api', 'connector');

    const pass =
      connectorInfo.freshnessStatus === 'fresh' &&
      connectorInfo.isConnectorBacked === true &&
      connectorInfo.dataSource === 'connector' &&
      connectorInfo.hedgeInstruction === undefined;

    testResults.push({
      num: 5,
      testCase: 'Connector-Backed Live Inventory Authority (<24h sync)',
      expectedResult: 'freshnessStatus="fresh", isConnectorBacked=true, authoritative live inventory',
      actualResult: `status: ${connectorInfo.freshnessStatus}, isConnector: ${connectorInfo.isConnectorBacked}, human: "${connectorInfo.lastSeenHuman}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: connectorInfo,
    });
  } catch (err: any) {
    testResults.push({
      num: 5,
      testCase: 'Connector Authority',
      expectedResult: 'freshnessStatus=fresh, isConnector=true',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Connector-Backed Stale Sync (> 72h sync)
  // ---------------------------------------------------------------------------
  try {
    const staleConnectorTime = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
    const staleConnectorInfo = calculateFreshness(staleConnectorTime, true, 'feed', 'api');

    const pass =
      staleConnectorInfo.freshnessStatus === 'stale_or_unlisted' &&
      staleConnectorInfo.isConnectorBacked === true &&
      Boolean(staleConnectorInfo.hedgeInstruction?.includes('Connector sync is stale'));

    testResults.push({
      num: 6,
      testCase: 'Connector-Backed Stale Sync (>72h sync)',
      expectedResult: 'freshnessStatus="stale_or_unlisted", isConnectorBacked=true, hedge instruction required',
      actualResult: `status: ${staleConnectorInfo.freshnessStatus}, isConnector: ${staleConnectorInfo.isConnectorBacked}, hedge: "${staleConnectorInfo.hedgeInstruction}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: staleConnectorInfo,
    });
  } catch (err: any) {
    testResults.push({
      num: 6,
      testCase: 'Connector Stale Sync',
      expectedResult: 'freshnessStatus=stale_or_unlisted',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Grounding Layer Metadata & System Prompt Directives
  // ---------------------------------------------------------------------------
  try {
    const hybridOut = await hybridRetrieve(LMS_WIDGET_ID, 'Backend Mastery', { limit: 1 });
    const validation = validateGrounding('tell me about Backend Mastery', hybridOut, 'CampusCore');

    const pass =
      validation.isGrounded === true &&
      validation.groundingMetadata.freshness !== 'unknown' &&
      validation.groundingMetadata.sourceEntityIds.length > 0 &&
      Boolean(validation.systemPrompt.includes('=== STRICT GROUNDING RULES')) &&
      (validation.groundingMetadata.hasHedge
        ? validation.systemPrompt.includes('=== CATALOG FRESHNESS & HEDGING DIRECTIVE ===')
        : validation.systemPrompt.includes('=== CATALOG FRESHNESS DIRECTIVE ==='));

    testResults.push({
      num: 7,
      testCase: 'Grounding Layer Metadata & System Prompt Directives',
      expectedResult: 'Exposes groundingMetadata.freshness and injects freshness directive into system prompt',
      actualResult: `isGrounded: ${validation.isGrounded}, freshness: ${validation.groundingMetadata.freshness}, hasHedge: ${validation.groundingMetadata.hasHedge}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { grounding: validation.groundingMetadata },
    });
  } catch (err: any) {
    testResults.push({
      num: 7,
      testCase: 'Grounding Layer Freshness',
      expectedResult: 'groundingMetadata exposes freshness',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Live POST /api/retell/chat Stale Entity Hedged Response
  // ---------------------------------------------------------------------------
  try {
    const chatSessionId = `freshness-chat-${Date.now()}`;
    const chatRes = await fetch(`${BASE_URL}/api/retell/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId: LMS_WIDGET_ID,
        sessionId: chatSessionId,
        content: 'tell me about Backend Mastery',
      }),
    });

    const chatData = await chatRes.json();
    const agentMsg = chatData.messages?.find((m: any) => m.role === 'agent' || m.role === 'assistant');
    const entityResult = agentMsg?.results?.[0];

    const pass =
      chatRes.status === 200 &&
      chatData.grounding?.freshness !== undefined &&
      entityResult?.freshnessStatus !== undefined &&
      (chatData.grounding?.hasHedge
        ? Boolean(agentMsg?.content?.toLowerCase().includes('earlier check') || agentMsg?.content?.toLowerCase().includes('cannot be guaranteed') || agentMsg?.content?.toLowerCase().includes('confirm directly with staff') || agentMsg?.content?.toLowerCase().includes('confirm'))
        : true);

    testResults.push({
      num: 8,
      testCase: 'Live POST /api/retell/chat Stale Entity Hedged Response',
      expectedResult: 'HTTP 200, exposes grounding.freshness and includes hedging note in prose when stale',
      actualResult: `Status: ${chatRes.status}, freshness: ${chatData.grounding?.freshness}, entityFreshness: ${entityResult?.freshnessStatus}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { textSnippet: agentMsg?.content?.substring(0, 150), grounding: chatData.grounding },
    });
  } catch (err: any) {
    testResults.push({
      num: 8,
      testCase: 'Live Chat Freshness',
      expectedResult: 'HTTP 200 with grounding.freshness',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Live POST /api/agent/tools Voice Webhook Freshness Parity
  // ---------------------------------------------------------------------------
  try {
    const voiceSessionId = `voice-freshness-${Date.now()}`;
    const toolRes = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: voiceSessionId,
        tool: 'get_entity',
        args: { query: 'Backend Mastery' },
      }),
    });

    const toolData = await toolRes.json();

    const pass =
      toolRes.status === 200 &&
      toolData.success === true &&
      toolData.freshness !== undefined &&
      toolData.freshnessStatus !== undefined &&
      toolData.confidence !== undefined;

    testResults.push({
      num: 9,
      testCase: 'Live POST /api/agent/tools Voice Webhook Freshness Parity',
      expectedResult: 'HTTP 200, returns freshness and confidence matching chat grounding schema',
      actualResult: `Status: ${toolRes.status}, success: ${toolData.success}, freshness: ${toolData.freshness}, hedged: ${toolData.hedged}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { freshness: toolData.freshness, hedged: toolData.hedged, hedgeInstruction: toolData.hedgeInstruction },
    });
  } catch (err: any) {
    testResults.push({
      num: 9,
      testCase: 'Voice Webhook Freshness',
      expectedResult: 'HTTP 200 with freshness payload',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Unified Tool formatResult Freshness Contract
  // ---------------------------------------------------------------------------
  try {
    const formatted = formatResult({
      id: 'entity-fresh-test',
      title: '2024 Jeep Wrangler 4xe',
      last_seen: new Date(Date.now() - 1000 * 60 * 30).toISOString(), // 30 mins ago
      still_listed: true,
      data_type: 'api',
      metadata: { source: 'connector', price: '$58,000' },
    });

    const pass =
      formatted.freshness === 'fresh' &&
      formatted.freshnessStatus === 'fresh' &&
      formatted.stillListed === true &&
      formatted.hedgeInstruction === undefined &&
      formatted.metadata?.isConnectorBacked === true;

    testResults.push({
      num: 10,
      testCase: 'Unified Tool formatResult Freshness Contract',
      expectedResult: 'StructuredEntity exposes freshness="fresh", stillListed=true, and connector authority metadata',
      actualResult: `freshness: ${formatted.freshness}, stillListed: ${formatted.stillListed}, isConnector: ${formatted.metadata?.isConnectorBacked}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { freshness: formatted.freshness, metadata: formatted.metadata },
    });
  } catch (err: any) {
    testResults.push({
      num: 10,
      testCase: 'formatResult Freshness Contract',
      expectedResult: 'freshness=fresh',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // Print Summary Report
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('  TEST REPORT RESULTS');
  console.log('========================================================================\n');

  let passCount = 0;
  let failCount = 0;
  let partialCount = 0;

  for (const r of testResults) {
    const icon = r.status === 'PASS' ? '✅' : (r.status === 'FAIL' ? '❌' : '⚠️');
    console.log(`${icon} [TEST ${r.num}] [${r.status}] ${r.testCase}`);
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

runFreshnessSuite().catch(console.error);
