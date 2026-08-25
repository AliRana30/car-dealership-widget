/**
 * Autonomous Page & Entity Navigation Validation Suite
 *
 * Validates:
 * 1. "navigate me to about page" (resolves /about on LMS)
 * 2. "take me to about us" (resolves /about on Noretmy)
 * 3. "open contact" (resolves /contact-us on Noretmy)
 * 4. "go to FAQ" (resolves /faq on LMS)
 * 5. "show me your courses" (resolves /courses on LMS)
 * 6. "open the course catalog" (resolves /courses on LMS)
 * 7. "take me to the homepage" (resolves root / on LMS)
 * 8. "open privacy policy" (resolves /policy on LMS or /privacy-policy on Noretmy)
 * 9. "open terms" (resolves /terms-condition on Noretmy)
 * 10. "go to something that doesn't exist" (zero hallucination, returns not_found)
 * 11. Misspelled page names ("abot us", "contct", "polcy")
 * 12. URL slug instead of title ("open /about", "open privacy-policy")
 * 13. Ambiguous requests ("open the Jeep" -> clarification prompt)
 * 14. Entity request vs Page request ("open MERN Stack course" vs "open courses")
 * 15. Page existing under different slug ("who are you" -> /about)
 * 16. Pronoun / anaphoric navigation ("open that course")
 * 17. Ordinal navigation ("open the 2nd one")
 * 18. Voice Agent Webhook Navigation (POST /api/agent/tools)
 * 19. Live Chat Navigation Integration (POST /api/retell/chat)
 * 20. Navigation Disabled Guard (allowAgentNavigation: false)
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

import { NextRequest } from 'next/server';
import { resolveNavigationTarget } from '../src/lib/agents/navigationResolver';
import { executeUnifiedTool } from '../src/lib/agents/unifiedTools';
import { pinEntity, setLastResults, getSessionContext } from '../src/lib/agents/sessionContext';
import { POST as handleChatPost } from '../src/app/api/retell/chat/route';

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
  // TEST 1: "navigate me to about page" (LMS Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-1-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'navigate me to about page', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/about')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 1,
      testCase: 'Resolve "navigate me to about page" (LMS)',
      expectedResult: 'Resolves discovered About page URL (/about) with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}", title: "${result.pageTitle}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl, source: result.source },
    });
  } catch (err: any) {
    testResults.push({
      num: 1,
      testCase: 'Resolve "navigate me to about page"',
      expectedResult: 'canNavigate=true with /about URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: "take me to about us" (Noretmy Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-2-${Date.now()}`;
    const result = await resolveNavigationTarget(NORETMY_WIDGET_ID, 'take me to about us', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/about')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 2,
      testCase: 'Resolve "take me to about us" (Noretmy)',
      expectedResult: 'Resolves discovered About page URL (/about) with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}", title: "${result.pageTitle}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 2,
      testCase: 'Resolve "take me to about us"',
      expectedResult: 'canNavigate=true with /about URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: "open contact" (Noretmy Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-3-${Date.now()}`;
    const result = await resolveNavigationTarget(NORETMY_WIDGET_ID, 'open contact', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/contact')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 3,
      testCase: 'Resolve "open contact" (Noretmy)',
      expectedResult: 'Resolves discovered Contact page URL (/contact-us) with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}", title: "${result.pageTitle}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 3,
      testCase: 'Resolve "open contact"',
      expectedResult: 'canNavigate=true with /contact URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: "go to FAQ" (LMS Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-4-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'go to FAQ', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/faq')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 4,
      testCase: 'Resolve "go to FAQ" (LMS)',
      expectedResult: 'Resolves discovered FAQ page URL (/faq) with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}", title: "${result.pageTitle}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 4,
      testCase: 'Resolve "go to FAQ"',
      expectedResult: 'canNavigate=true with /faq URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: "show me your courses" (LMS Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-5-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'show me your courses', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/courses')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 5,
      testCase: 'Resolve "show me your courses" (LMS)',
      expectedResult: 'Resolves discovered Courses directory/page URL (/courses) with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}", title: "${result.pageTitle}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 5,
      testCase: 'Resolve "show me your courses"',
      expectedResult: 'canNavigate=true with /courses URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: "open the course catalog" (LMS Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-6-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'open the course catalog', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/courses')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 6,
      testCase: 'Resolve "open the course catalog" (LMS)',
      expectedResult: 'Resolves discovered course catalog URL (/courses) with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}", title: "${result.pageTitle}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 6,
      testCase: 'Resolve "open the course catalog"',
      expectedResult: 'canNavigate=true with /courses URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: "take me to the homepage" (LMS Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-7-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'take me to the homepage', { sessionId });

    const pass =
      result.canNavigate === true &&
      result.confidence === 'exact' &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 7,
      testCase: 'Resolve "take me to the homepage" (LMS)',
      expectedResult: 'Resolves root homepage destination with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 7,
      testCase: 'Resolve "take me to the homepage"',
      expectedResult: 'canNavigate=true with root URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: "open privacy policy" (LMS Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-8-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'open privacy policy', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/policy')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 8,
      testCase: 'Resolve "open privacy policy" (LMS)',
      expectedResult: 'Resolves discovered privacy policy page URL (/policy) with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 8,
      testCase: 'Resolve "open privacy policy"',
      expectedResult: 'canNavigate=true with policy URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: "open terms" (Noretmy Website)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-9-${Date.now()}`;
    const result = await resolveNavigationTarget(NORETMY_WIDGET_ID, 'open terms', { sessionId });

    const pass =
      result.canNavigate === true &&
      (Boolean(result.targetUrl?.toLowerCase().includes('terms')) || Boolean(result.targetUrl?.toLowerCase().includes('legal'))) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 9,
      testCase: 'Resolve "open terms" (Noretmy)',
      expectedResult: 'Resolves discovered Terms page URL (/terms-condition) with widget_resume token',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 9,
      testCase: 'Resolve "open terms"',
      expectedResult: 'canNavigate=true with terms URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Nonexistent Page Refusal (Zero Hallucination)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-10-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'take me to the rocket ship simulator page', { sessionId });

    const pass =
      result.canNavigate === false &&
      result.confidence === 'not_found' &&
      result.targetUrl === undefined;

    testResults.push({
      num: 10,
      testCase: 'Nonexistent Destination Refusal ("rocket ship simulator" on LMS)',
      expectedResult: 'Refuses navigation, canNavigate=false, targetUrl=undefined, zero hallucinated URL',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, failureReason: "${result.failureReason}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { failureReason: result.failureReason },
    });
  } catch (err: any) {
    testResults.push({
      num: 10,
      testCase: 'Nonexistent Destination Refusal',
      expectedResult: 'canNavigate=false',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Misspelled Page Names ("abot us" & "contct")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-11-${Date.now()}`;
    const resultAbout = await resolveNavigationTarget(LMS_WIDGET_ID, 'navigate to abot us', { sessionId });
    const resultContact = await resolveNavigationTarget(NORETMY_WIDGET_ID, 'open contct', { sessionId });

    const pass =
      resultAbout.canNavigate === true &&
      Boolean(resultAbout.targetUrl?.toLowerCase().includes('/about')) &&
      resultContact.canNavigate === true &&
      Boolean(resultContact.targetUrl?.toLowerCase().includes('/contact'));

    testResults.push({
      num: 11,
      testCase: 'Misspelled Page Names ("abot us" & "contct")',
      expectedResult: 'Tolerates minor typos and resolves canonical URLs with widget_resume',
      actualResult: `About: canNavigate=${resultAbout.canNavigate} (${resultAbout.targetUrl}), Contact: canNavigate=${resultContact.canNavigate} (${resultContact.targetUrl})`,
      status: pass ? 'PASS' : 'FAIL',
      details: { aboutUrl: resultAbout.targetUrl, contactUrl: resultContact.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 11,
      testCase: 'Misspelled Page Names',
      expectedResult: 'canNavigate=true with typo tolerance',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 12: URL Slug instead of Title ("open /about" & "open privacy-policy")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-12-${Date.now()}`;
    const resultSlug = await resolveNavigationTarget(LMS_WIDGET_ID, 'open /about', { sessionId });
    const resultPolicy = await resolveNavigationTarget(NORETMY_WIDGET_ID, 'open privacy-policy', { sessionId });

    const pass =
      resultSlug.canNavigate === true &&
      Boolean(resultSlug.targetUrl?.toLowerCase().includes('/about')) &&
      resultPolicy.canNavigate === true &&
      Boolean(resultPolicy.targetUrl?.toLowerCase().includes('privacy'));

    testResults.push({
      num: 12,
      testCase: 'URL Slug instead of Title ("open /about" & "open privacy-policy")',
      expectedResult: 'Resolves direct pathnames and slugs to canonical URLs',
      actualResult: `Slug /about: ${resultSlug.targetUrl}, Slug privacy-policy: ${resultPolicy.targetUrl}`,
      status: pass ? 'PASS' : 'FAIL',
      details: { slugUrl: resultSlug.targetUrl, policyUrl: resultPolicy.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 12,
      testCase: 'URL Slug navigation',
      expectedResult: 'canNavigate=true',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 13: Ambiguous Request Disambiguation ("open the Jeep" on Noretmy)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-13-${Date.now()}`;
    const result = await resolveNavigationTarget(NORETMY_WIDGET_ID, 'open the Jeep', { sessionId });

    const pass =
      result.canNavigate === false &&
      result.confidence === 'ambiguous' &&
      Boolean(result.clarificationMessage?.toLowerCase().includes('which')) &&
      Array.isArray(result.candidateOptions) &&
      result.candidateOptions.length >= 2;

    testResults.push({
      num: 13,
      testCase: 'Ambiguous Request Disambiguation ("open the Jeep" on Multi-Jeep Inventory)',
      expectedResult: 'Refuses to guess, canNavigate=false, returns clarification prompt listing candidate models',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, clarification: "${result.clarificationMessage}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { candidateCount: result.candidateOptions?.length, candidates: result.candidateOptions?.map(c => c.title) },
    });
  } catch (err: any) {
    testResults.push({
      num: 13,
      testCase: 'Ambiguous Request Disambiguation',
      expectedResult: 'canNavigate=false with clarification',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 14: Entity Request vs Page Request Discrimination
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-14-${Date.now()}`;
    // Entity request: "open MERN Stack course"
    const entityResult = await resolveNavigationTarget(LMS_WIDGET_ID, 'open MERN Stack course', { sessionId });
    // Page request: "open courses"
    const pageResult = await resolveNavigationTarget(LMS_WIDGET_ID, 'open courses', { sessionId });

    const pass =
      entityResult.canNavigate === true &&
      Boolean(entityResult.targetUrl?.includes('/course/6945abe7c4769ef223f140fd')) &&
      pageResult.canNavigate === true &&
      Boolean(pageResult.targetUrl?.endsWith('/courses') || pageResult.targetUrl?.includes('/courses?'));

    testResults.push({
      num: 14,
      testCase: 'Entity Request vs Page Request Discrimination',
      expectedResult: 'Entity request resolves specific course URL; Page request resolves /courses catalog page',
      actualResult: `Entity: "${entityResult.targetUrl}", Page: "${pageResult.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { entityUrl: entityResult.targetUrl, pageUrl: pageResult.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 14,
      testCase: 'Entity vs Page Discrimination',
      expectedResult: 'canNavigate=true for both with distinct appropriate URLs',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 15: Page Existing Under Different Slug ("who are you" -> About Page)
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-15-${Date.now()}`;
    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'who are you', { sessionId });

    const pass =
      result.canNavigate === true &&
      Boolean(result.targetUrl?.toLowerCase().includes('/about')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 15,
      testCase: 'Page with Natural-Language Question ("who are you" -> /about on LMS)',
      expectedResult: 'Resolves concept alias "who are you" to canonical /about URL',
      actualResult: `canNavigate: ${result.canNavigate}, confidence: ${result.confidence}, targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.pageTitle, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 15,
      testCase: 'Concept alias navigation',
      expectedResult: 'canNavigate=true with /about URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 16: Pronoun / Anaphoric Navigation ("open that course" / "open it")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-16-${Date.now()}`;
    await pinEntity(sessionId, LMS_WIDGET_ID, {
      id: '0df20794-c3f8-47ad-8831-08eb75bd1a9a',
      title: 'MERN Stack Development Course',
      sourceUrl: 'https://lms-e-learning-system.vercel.app/course/6945abe7c4769ef223f140fd',
      price: '$150',
    });

    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'open that course', { sessionId });

    const pass =
      result.canNavigate === true &&
      result.confidence === 'exact' &&
      Boolean(result.targetUrl?.includes('/course/6945abe7c4769ef223f140fd')) &&
      Boolean(result.targetUrl?.includes(`widget_resume=${sessionId}`));

    testResults.push({
      num: 16,
      testCase: 'Pronoun / Anaphoric Navigation ("open that course")',
      expectedResult: 'Resolves pinned currentEntity from session and returns its canonical URL with widget_resume',
      actualResult: `canNavigate: ${result.canNavigate}, Entity: "${result.resolvedEntity?.title}", targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.resolvedEntity?.title, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 16,
      testCase: 'Pronoun Navigation',
      expectedResult: 'canNavigate=true to pinned entity',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 17: Ordinal Navigation ("open the 2nd one")
  // ---------------------------------------------------------------------------
  try {
    const sessionId = `nav-test-17-${Date.now()}`;
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

    const result = await resolveNavigationTarget(LMS_WIDGET_ID, 'open the 2nd one', { sessionId });

    const pass =
      result.canNavigate === true &&
      result.confidence === 'exact' &&
      result.resolvedEntity?.title === 'Backend Mastery' &&
      Boolean(result.targetUrl?.includes('/course/6a8885e7b07fd83e210c84d6'));

    testResults.push({
      num: 17,
      testCase: 'Ordinal Navigation ("open the 2nd one")',
      expectedResult: 'Resolves index 1 from lastResults (Backend Mastery) and navigates to its URL',
      actualResult: `canNavigate: ${result.canNavigate}, Selected: "${result.resolvedEntity?.title}", targetUrl: "${result.targetUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { title: result.resolvedEntity?.title, targetUrl: result.targetUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 17,
      testCase: 'Ordinal Navigation',
      expectedResult: 'canNavigate=true to 2nd item',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 18: Voice Agent Navigation (Unified Tool & Session Context)
  // ---------------------------------------------------------------------------
  try {
    const voiceSessionId = `voice-nav-${Date.now()}`;
    const toolResult = await executeUnifiedTool(
      LMS_WIDGET_ID,
      'navigate_to_entity',
      { target: 'about page' },
      { sessionId: voiceSessionId, allowAgentNavigation: true }
    );

    const ctx = await getSessionContext(voiceSessionId, LMS_WIDGET_ID);

    const pass =
      toolResult.success === true &&
      Boolean(toolResult.sources?.[0]?.url?.includes('/about')) &&
      Boolean(ctx.lastNavigationTarget?.includes('/about'));

    testResults.push({
      num: 18,
      testCase: 'Voice Agent Navigation (executeUnifiedTool for "about page")',
      expectedResult: 'tool success=true, canonical /about URL returned, lastNavigationTarget recorded in session context',
      actualResult: `success: ${toolResult.success}, url: "${toolResult.sources?.[0]?.url}", recordedNav: "${ctx.lastNavigationTarget}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { success: toolResult.success, recordedNav: ctx.lastNavigationTarget },
    });
  } catch (err: any) {
    testResults.push({
      num: 18,
      testCase: 'Voice Webhook Navigation',
      expectedResult: 'success=true with navigation URL',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 19: Live Chat Explicit Navigation Integration (POST /api/retell/chat)
  // ---------------------------------------------------------------------------
  try {
    const chatSessionId = `chat-nav-${Date.now()}`;
    const req = new NextRequest('http://localhost:3000/api/retell/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId: LMS_WIDGET_ID,
        sessionId: chatSessionId,
        content: 'navigate me to about page',
      }),
    });

    const chatRes = await handleChatPost(req);
    const chatData = await chatRes.json();
    const pass =
      chatRes.status === 200 &&
      Boolean(chatData.navigationUrl?.includes('/about')) &&
      chatData.action?.type === 'navigate' &&
      Boolean(chatData.action?.url?.includes('/about'));

    testResults.push({
      num: 19,
      testCase: 'Live Chat Navigation Handler (for "navigate me to about page")',
      expectedResult: 'HTTP 200, returns navigationUrl (/about) and action: { type: "navigate", url } for verified target',
      actualResult: `Status: ${chatRes.status}, action: ${JSON.stringify(chatData.action)}, navUrl: "${chatData.navigationUrl}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { action: chatData.action, navigationUrl: chatData.navigationUrl },
    });
  } catch (err: any) {
    testResults.push({
      num: 19,
      testCase: 'Live Chat Explicit Navigation',
      expectedResult: 'HTTP 200 with action.navigate',
      actualResult: err.message,
      status: 'FAIL',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 20: Navigation Disabled Safety Guard
  // ---------------------------------------------------------------------------
  try {
    const disabledSessionId = `disabled-nav-${Date.now()}`;
    const result = await executeUnifiedTool(
      LMS_WIDGET_ID,
      'navigate_to_entity',
      { target: 'about page' },
      { sessionId: disabledSessionId, allowAgentNavigation: false }
    );

    const pass =
      result.success === false &&
      Boolean(result.error?.toLowerCase().includes('disabled'));

    testResults.push({
      num: 20,
      testCase: 'Navigation Disabled Safety Guard (allowAgentNavigation: false)',
      expectedResult: 'Fails closed with success=false and navigation disabled error message',
      actualResult: `success: ${result.success}, error: "${result.error}"`,
      status: pass ? 'PASS' : 'FAIL',
      details: { success: result.success, error: result.error },
    });
  } catch (err: any) {
    testResults.push({
      num: 20,
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
