/**
 * Autonomous Page & Entity Navigation Validation Suite
 *
 * Validates:
 * 1. Exact entity navigation
 * 2. Informational page navigation
 * 3. Ambiguous entity protection (Zero-guessing, returns clarification)
 * 4. Pronoun / anaphoric navigation ("open that course")
 * 5. Ordinal navigation ("show me the first one", "open the 2nd one")
 * 6. Nonexistent entity refusal (No blind fallback to first record)
 * 7. Invalid URL handling
 * 8. Navigation during active voice session (POST /api/agent/tools)
 * 9. Live POST /api/retell/chat explicit navigation integration
 * 10. Navigation disabled safety check
 */

import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach((line) => {
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

import { resolveNavigationTarget } from '../src/lib/agents/navigationResolver';
import { executeUnifiedTool } from '../src/lib/agents/unifiedTools';
import { pinEntity, setLastResults, getSessionContext } from '../src/lib/agents/sessionContext';

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

async function runValidationSuite() {
  console.log('\n========================================================================');
  console.log('  STARTING AUTONOMOUS PAGE & ENTITY NAVIGATION VALIDATION SUITE');
  console.log('========================================================================\n');

  const testResults: TestResult[] = [];

  // ---------------------------------------------------------------------------
  // TEST 1: Exact Entity Navigation ("open Backend Mastery")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-1-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'open Backend Mastery', { sessionId });

    const pass =
      result.canNavigate === true &&
      result.confidence === 'exact' &&
      Boolean(result.targetUrl?.includes('/course/6a8885e7b07fd83e210c84d6')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 1,
      testCase: 'Exact Entity Navigation ("open Backend Mastery")',
      expectedResult: 'Resolves exact course and returns canonical course URL with widget_resume parameter',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.resolvedEntity?.title, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 1,
      testCase: 'Exact Entity Navigation',
      expectedResult: 'canNavigate=true with URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Informational Page Navigation ("navigate to the policy page")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-2-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'navigate to the policy page', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/policy')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 2,
      testCase: 'Informational Page Navigation ("navigate to the policy page")',
      expectedResult: 'Resolves canonical /policy page URL and appends widget_resume',
      actualResult: `canNavigate: ${result.canNavigate}, targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { pageTitle: result.resolvedPageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 2,
      testCase: 'Page Navigation',
      expectedResult: 'canNavigate=true with /policy URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Ambiguous Entity Protection (Zero Guessing, Returns Clarification)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-3-${Date.now()}`;
    // On Noretmy Chrysler dealership, "open Jeep" matches multiple distinct Jeep models
    const result = await resolveNavigationTarget(NORETMY_WIDGET_ID, 'open the Jeep', { sessionId });

    const pass =
      result.canNavigate === false &&
      result.confidence === 'ambiguous' &&
      Boolean(result.clarificationMessage?.toLowerCase().includes('which')) &&
      Array.isArray(result.candidateOptions) &&
      result.candidateOptions.length >= 2;

    testResults.push({
      num: 3,
      testCase: 'Ambiguous Entity Protection ("open the Jeep" on Multi-Jeep Inventory)',
      expectedResult: 'Refuses to guess, canNavigate=false, returns clarification prompt listing candidate models',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, clarification: "${result.clarificationMessage}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { candidateCount: result.candidateOptions?.length, candidates: result.candidateOptions?.map(c => c.title) },
    });
  } catch (err: any) {
    testResults.push({
      num: 3,
      testCase: 'Ambiguous Entity Protection',
      expectedResult: 'canNavigate=false with clarification',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Pronoun / Anaphoric Navigation ("open that course" / "open it")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-4-${Date.now()}`;
    // Simulate Turn 1: user discusses MERN Stack -> system pins MERN Stack
    await pinEntity(sessionId, LMS_WIDGET_ID, {
      id: '0df20794-c3f8-47ad-8831-08eb75bd1a9a',
      title: 'MERN Stack Development Course',
      sourceUrl: 'https://lms-e-learning-system.vercel.app/course/6945abe7c4769ef223f140fd',
      price: '$150',
    });

    // Turn 2: "open that course"
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'open that course', { sessionId });

    const pass =
      result.canNavigate === true &&
      result.confidence === 'exact' &&
      Boolean(result.targetUrl?.includes('/course/6945abe7c4769ef223f140fd')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 4,
      testCase: 'Pronoun / Anaphoric Navigation ("open that course")',
      expectedResult: 'Resolves pinned currentEntity from session and returns its canonical URL with widget_resume',
      actualResult: `canNavigate: ${result.canNavigate}, Entity: "${result.resolvedEntity?.title}", targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.resolvedEntity?.title, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 4,
      testCase: 'Pronoun Navigation',
      expectedResult: 'canNavigate=true to pinned entity',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Ordinal Navigation ("show me the first one" & "open the 2nd one")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-5-${Date.now()}`;
    // Turn 1: List 3 courses
    await setLastResults(sessionId, LMS_WIDGET_ID, [
      {
        id: 'mern-1',
        title: 'MERN Stack Development Course',
        sourceUrl: 'https://lms-e-learning-system.vercel.app/course/6945abe7c4769ef223f140fd',
      },
      {
        id: 'backend-2',
        title: 'Backend Mastery',
        sourceUrl: 'https://lms-e-learning-system.vercel.app/course/6a8885e7b07fd83e210c84d6',
      },
      {
        id: 'leetcode-3',
        title: 'Leetcode Mastery',
        sourceUrl: 'https://lms-e-learning-system.vercel.app/course/6e77c34e0851c5d255944a6d',
      },
    ]);

    // Turn 2: "open the 2nd one"
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'open the 2nd one', { sessionId });

    const pass =
      result.canNavigate === true &&
      result.confidence === 'exact' &&
      result.resolvedEntity?.title === 'Backend Mastery' &&
      Boolean(result.targetUrl?.includes('/course/6a8885e7b07fd83e210c84d6'));

    testResults.push({
      num: 5,
      testCase: 'Ordinal Navigation ("open the 2nd one")',
      expectedResult: 'Resolves index 1 from lastResults (Backend Mastery) and navigates to its URL',
      actualResult: `canNavigate: ${result.canNavigate}, Selected: "${result.resolvedEntity?.title}", targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.resolvedEntity?.title, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 5,
      testCase: 'Ordinal Navigation',
      expectedResult: 'canNavigate=true to 2nd item',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Nonexistent Entity Refusal (Zero Blind Fallback to First Record)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-6-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'take me to the page for Ferrari 488 Pista Spider', { sessionId });

    const pass =
      result.canNavigate === false &&
      result.confidence === 'not_found' &&
      result.targetUrl === undefined;

    testResults.push({
      num: 6,
      testCase: 'Nonexistent Entity Refusal ("Ferrari 488 Pista" on LMS)',
      expectedResult: 'canNavigate=false, targetUrl=undefined, never picks first available course as fallback',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, failureReason: "${result.failureReason}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { failureReason: result.failureReason },
    });
  } catch (err: any) {
    testResults.push({
      num: 6,
      testCase: 'Nonexistent Entity Refusal',
      expectedResult: 'canNavigate=false',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Invalid URL / Missing URL Protection
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-7-${Date.now()}`;
    // Provide a query that has no valid URL
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'nonexistent-uuid-00000000-0000-0000-0000-000000000000', { sessionId });

    const pass =
      result.canNavigate === false &&
      (result.confidence === 'not_found' || result.confidence === 'invalid_url') &&
      !result.targetUrl;

    testResults.push({
      num: 7,
      testCase: 'Invalid / Missing URL Handling',
      expectedResult: 'Refuses navigation when entity or page URL is missing or invalid',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { failureReason: result.failureReason },
    });
  } catch (err: any) {
    testResults.push({
      num: 7,
      testCase: 'Invalid URL Handling',
      expectedResult: 'canNavigate=false',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Navigation during Active Voice Session (POST /api/agent/tools)
  // ---------------------------------------------------------------------------
  try {
    const voiceSessionId = `voice-nav-${Date.now()}`;
    const toolRes = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: voiceSessionId,
        tool: 'navigate_to_entity',
        args: { entityId: 'Backend Mastery' },
      }),
    });

    const toolData = await toolRes.json();
    const ctx = await getSessionContext(voiceSessionId, LMS_WIDGET_ID);

    const pass =
      toolRes.status === 200 &&
      toolData.success === true &&
      Boolean(toolData.url?.includes('/course/6a8885e7b07fd83e210c84d6')) &&
      Boolean(ctx.lastNavigationTarget?.includes('/course/6a8885e7b07fd83e210c84d6'));

    testResults.push({
      num: 8,
      testCase: 'Voice Agent Webhook Navigation (POST /api/agent/tools)',
      expectedResult: 'HTTP 200, tool success=true, canonical URL returned, lastNavigationTarget recorded in session context',
      actualResult: `Status: ${toolRes.status}, success: ${toolData.success}, recordedNav: "${ctx.lastNavigationTarget}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { success: toolData.success, recordedNav: ctx.lastNavigationTarget },
    });
  } catch (err: any) {
    testResults.push({
      num: 8,
      testCase: 'Voice Webhook Navigation',
      expectedResult: 'HTTP 200 success with navigation URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Live POST /api/retell/chat Explicit Navigation Integration
  // ---------------------------------------------------------------------------
  try {
    const chatSessionId = `chat-nav-${Date.now()}`;
    const chatRes = await fetch(`${BASE_URL}/api/retell/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId: LMS_WIDGET_ID,
        sessionId: chatSessionId,
        content: 'take me to the page for Backend Mastery',
      }),
    });

    const chatData = await chatRes.json();
    const pass =
      chatRes.status === 200 &&
      Boolean(chatData.navigationUrl?.includes('/course/6a8885e7b07fd83e210c84d6')) &&
      chatData.action?.type === 'navigate' &&
      Boolean(chatData.action?.url?.includes('/course/6a8885e7b07fd83e210c84d6'));

    testResults.push({
      num: 9,
      testCase: 'Live POST /api/retell/chat Explicit Navigation Integration',
      expectedResult: 'HTTP 200, returns navigationUrl and action: { type: "navigate", url } for verified target',
      actualResult: `Status: ${chatRes.status}, action: ${JSON.stringify(chatData.action)}, navUrl: "${chatData.navigationUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { action: chatData.action, navigationUrl: chatData.navigationUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 9,
      testCase: 'Live Chat Explicit Navigation',
      expectedResult: 'HTTP 200 with action.navigate',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Navigation Disabled Safety Guard
  // ---------------------------------------------------------------------------
  try {
    const disabledSessionId = `disabled-nav-${Date.now()}`;
    const result = await executeUnifiedTool(
      LMS_WIDGET_ID,
      'navigate_to_entity',
      { entityId: 'Backend Mastery' },
      { sessionId: disabledSessionId, allowAgentNavigation: false }
    );

    const pass =
      result.success === false &&
      Boolean(result.error?.toLowerCase().includes('disabled'));

    testResults.push({
      num: 10,
      testCase: 'Navigation Disabled Safety Guard (allowAgentNavigation: false)',
      expectedResult: 'Fails closed with success=false and navigation disabled error message',
      actualResult: `success: ${result.success}, error: "${result.error}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { success: result.success, error: result.error },
    });
  } catch (err: any) {
    testResults.push({
      num: 10,
      testCase: 'Navigation Disabled Guard',
      expectedResult: 'success=false',
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

runValidationSuite().catch(console.error);
