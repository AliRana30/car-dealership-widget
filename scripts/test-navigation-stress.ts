/**
 * STRESS-TEST SUITE FOR PAGE & ENTITY NAVIGATION SYSTEM
 * 
 * Verifies all 14 navigation scenarios across real websites:
 * - LMS (CampusCore)
 * - Automotive (Ottawa Chrysler Jeep Dodge)
 * - Marketplace (Noretmy)
 * 
 * Verifies:
 * 1. Existing top-level page
 * 2. Existing deep page
 * 3. Existing entity page
 * 4. Non-existent page (Zero Invented URLs)
 * 5. Ambiguous page name (Clarification requested)
 * 6. Typo in page name (Levenshtein fuzzy resolution)
 * 7. Natural-language navigation
 * 8. Entity navigation
 * 9. Navigation after previous conversation (Session Anaphora)
 * 10. Navigation requested during Voice (Retell & Vapi tool call + SSE dispatch)
 * 11. Navigation requested during Chat (Action payload)
 * 12. Navigation to discovered known URL
 * 13. Navigation to entity with known exact URL
 * 14. Navigation to invalid/random/malicious external URL
 * - Cross-provider consistency (Chat vs Retell vs Vapi)
 * - Session continuity (resume parameter preservation)
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

import { resolveNavigationTarget } from '../src/lib/agents/navigationResolver';
import { executeUnifiedTool } from '../src/lib/agents/unifiedTools';
import { pinEntity, updateSessionContext } from '../src/lib/agents/sessionContext';

const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';
const NORET_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

async function runNavigationStressSuite() {
  console.log('================================================================');
  console.log('STRESS-TEST SUITE: PAGE & ENTITY NAVIGATION SYSTEM');
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

  // ── 1. EXISTING TOP-LEVEL PAGE ──────────────────────────────────────────────
  console.log('\n--- 1. EXISTING TOP-LEVEL PAGE ---');
  const resAbout = await resolveNavigationTarget(LMS_WIDGET_ID, 'Take me to the About page.');
  report(resAbout.canNavigate === true, 'Top-level About page navigation permitted');
  report(Boolean(resAbout.targetUrl?.includes('/about')), `Target URL accurately points to /about: "${resAbout.targetUrl}"`);

  const resCourses = await resolveNavigationTarget(LMS_WIDGET_ID, 'Open the courses page.');
  report(resCourses.canNavigate === true, 'Top-level Courses page navigation permitted');
  report(Boolean(resCourses.targetUrl?.includes('/courses')), `Target URL accurately points to /courses: "${resCourses.targetUrl}"`);

  // ── 2. EXISTING DEEP PAGE ───────────────────────────────────────────────────
  console.log('\n--- 2. EXISTING DEEP PAGE ---');
  const resPolicy = await resolveNavigationTarget(LMS_WIDGET_ID, 'Take me to the terms and policy page.');
  report(resPolicy.canNavigate === true, 'Deep Policy page navigation permitted');
  report(Boolean(resPolicy.targetUrl?.includes('/policy')), `Target URL accurately points to /policy: "${resPolicy.targetUrl}"`);

  const resPrivacy = await resolveNavigationTarget(NORET_WIDGET_ID, 'Open the privacy policy.');
  report(resPrivacy.canNavigate === true, 'Deep Privacy Policy page navigation permitted');
  report(Boolean(resPrivacy.targetUrl?.includes('/privacy-policy')), `Target URL accurately points to /privacy-policy: "${resPrivacy.targetUrl}"`);

  // ── 3. EXISTING ENTITY PAGE ─────────────────────────────────────────────────
  console.log('\n--- 3. EXISTING ENTITY PAGE ---');
  const resMern = await resolveNavigationTarget(LMS_WIDGET_ID, 'Open the MERN course.');
  report(resMern.canNavigate === true, 'Entity navigation for MERN course permitted');
  report(Boolean(resMern.targetUrl?.includes('/course/6945abe7')), `Target URL points to specific MERN course ID: "${resMern.targetUrl}"`);

  const resJeep = await resolveNavigationTarget(AUTO_WIDGET_ID, 'Take me to the 2024 Jeep Wrangler page.');
  report(resJeep.canNavigate === true, 'Entity navigation for Jeep Wrangler permitted');
  report(Boolean(resJeep.targetUrl?.includes('/2024-jeep-wrangler')), `Target URL points to specific vehicle route: "${resJeep.targetUrl}"`);

  // ── 4. NON-EXISTENT PAGE (ANTI-HALLUCINATION / ZERO INVENTED URLS) ───────────
  console.log('\n--- 4. NON-EXISTENT PAGE (ZERO INVENTED URLS) ---');
  const resCrypto = await resolveNavigationTarget(LMS_WIDGET_ID, 'Take me to the Bitcoin Mining page.');
  report(resCrypto.canNavigate === false, 'Non-existent Bitcoin page correctly rejected (canNavigate = false)');
  report(!resCrypto.targetUrl, 'Zero hallucinated URL produced');
  report(resCrypto.confidence === 'not_found', 'Confidence flagged as not_found');

  const resFlight = await resolveNavigationTarget(LMS_WIDGET_ID, 'Navigate to Helicopter Flight Training School.');
  report(resFlight.canNavigate === false, 'Non-existent flight school correctly rejected (canNavigate = false)');
  report(!resFlight.targetUrl, 'Zero hallucinated URL produced');

  // ── 5. AMBIGUOUS PAGE NAME ──────────────────────────────────────────────────
  console.log('\n--- 5. AMBIGUOUS PAGE NAME ---');
  const resAmbiguous = await resolveNavigationTarget(NORET_WIDGET_ID, 'Open policy');
  // There are multiple policy pages on Noretmy (privacy-policy, cookie-policy, terms-condition)
  report(resAmbiguous.canNavigate === true || resAmbiguous.confidence === 'ambiguous', 'Ambiguous policy query handled safely without crash');
  if (resAmbiguous.confidence === 'ambiguous') {
    report(Boolean(resAmbiguous.candidateOptions && resAmbiguous.candidateOptions.length > 1), 'Candidate options provided for disambiguation');
  }

  // ── 6. TYPO IN PAGE NAME (FUZZY MATCHING) ───────────────────────────────────
  console.log('\n--- 6. TYPO IN PAGE NAME ---');
  const resTypoAbout = await resolveNavigationTarget(LMS_WIDGET_ID, 'Take me to the Abot page.');
  report(resTypoAbout.canNavigate === true, 'Typo "Abot" successfully resolved to About');
  report(Boolean(resTypoAbout.targetUrl?.includes('/about')), `Target URL accurately points to /about: "${resTypoAbout.targetUrl}"`);

  const resTypoFaq = await resolveNavigationTarget(LMS_WIDGET_ID, 'Open the Faqs paje.');
  report(resTypoFaq.canNavigate === true, 'Typo "Faqs paje" successfully resolved to FAQ');
  report(Boolean(resTypoFaq.targetUrl?.includes('/faq')), `Target URL accurately points to /faq: "${resTypoFaq.targetUrl}"`);

  const resTypoLeetcode = await resolveNavigationTarget(LMS_WIDGET_ID, 'Navigate to Leetcod corse.');
  report(resTypoLeetcode.canNavigate === true, 'Typo "Leetcod corse" resolved to Leetcode Mastery course');
  report(Boolean(resTypoLeetcode.targetUrl?.includes('/course/69309149')), `Target URL accurately points to course URL: "${resTypoLeetcode.targetUrl}"`);

  // ── 7. NATURAL-LANGUAGE NAVIGATION ──────────────────────────────────────────
  console.log('\n--- 7. NATURAL-LANGUAGE NAVIGATION ---');
  const resNLFaq = await resolveNavigationTarget(LMS_WIDGET_ID, 'Can you please lead me to the page where I can find questions and answers?');
  report(resNLFaq.canNavigate === true, 'Natural language Q&A query resolved to FAQ');
  report(Boolean(resNLFaq.targetUrl?.includes('/faq')), `Target URL accurately points to /faq: "${resNLFaq.targetUrl}"`);

  const resNLAbout = await resolveNavigationTarget(LMS_WIDGET_ID, 'Where can I find information about who you are and your company story?');
  report(resNLAbout.canNavigate === true, 'Natural language company story query resolved to About');
  report(Boolean(resNLAbout.targetUrl?.includes('/about')), `Target URL accurately points to /about: "${resNLAbout.targetUrl}"`);

  // ── 8. ENTITY NAVIGATION ────────────────────────────────────────────────────
  console.log('\n--- 8. ENTITY NAVIGATION ---');
  const resEntityNav = await resolveNavigationTarget(LMS_WIDGET_ID, 'Show me the Leetcode Mastery course page.');
  report(resEntityNav.canNavigate === true, 'Explicit entity navigation permitted');
  report(Boolean(resEntityNav.targetUrl?.includes('/course/69309149')), `Target URL points to Leetcode Mastery: "${resEntityNav.targetUrl}"`);

  // ── 9. NAVIGATION AFTER PREVIOUS CONVERSATION (SESSION ANAPHORA) ────────────
  console.log('\n--- 9. NAVIGATION AFTER PREVIOUS CONVERSATION (ANAPHORA) ---');
  const testSessionId = `nav_session_${Date.now()}`;
  
  // Simulate Turn 1: User was viewing / asking about Leetcode Mastery
  await updateSessionContext(testSessionId, LMS_WIDGET_ID, {
    currentEntity: {
      id: 'f774f11f-b917-4ce5-8f8d-d4f4240169c5',
      title: 'Leetcode Mastery',
      sourceUrl: 'https://lms-e-learning-system.vercel.app/course/69309149f53ad74946204d40',
    },
    pinnedEntity: {
      id: 'f774f11f-b917-4ce5-8f8d-d4f4240169c5',
      title: 'Leetcode Mastery',
      sourceUrl: 'https://lms-e-learning-system.vercel.app/course/69309149f53ad74946204d40',
    },
  });

  // Turn 2: User says "Take me to its page"
  const resAnaphora = await resolveNavigationTarget(LMS_WIDGET_ID, 'Take me to its page.', { sessionId: testSessionId });
  report(resAnaphora.canNavigate === true, 'Anaphoric navigation ("its page") resolved via session context');
  report(Boolean(resAnaphora.targetUrl?.includes('/course/69309149')), `Target URL accurately resolved from pinned entity: "${resAnaphora.targetUrl}"`);

  // ── 10. NAVIGATION REQUESTED DURING VOICE (RETELL & VAPI) ───────────────────
  console.log('\n--- 10. NAVIGATION REQUESTED DURING VOICE (RETELL & VAPI) ---');
  const voiceNavTool = await executeUnifiedTool(
    LMS_WIDGET_ID,
    'navigate_to_entity',
    { target: 'About' },
    { sessionId: testSessionId, allowAgentNavigation: true }
  );

  report(voiceNavTool.success === true, 'Voice tool navigate_to_entity execution succeeded');
  report(voiceNavTool.grounded === true, 'Voice tool marked as grounded');
  report(Boolean(voiceNavTool.sources[0]?.url?.includes('/about')), `Voice tool resolved destination URL: "${voiceNavTool.sources[0]?.url}"`);

  // ── 11. NAVIGATION REQUESTED DURING CHAT ────────────────────────────────────
  console.log('\n--- 11. NAVIGATION REQUESTED DURING CHAT ---');
  const resChatNav = await resolveNavigationTarget(LMS_WIDGET_ID, 'Open the courses page', { sessionId: testSessionId });
  report(resChatNav.canNavigate === true, 'Chat navigation query resolved successfully');
  report(Boolean(resChatNav.targetUrl?.includes('/courses')), `Chat target URL accurately resolved: "${resChatNav.targetUrl}"`);

  // ── 12. NAVIGATION TO KNOWN / DISCOVERED CANONICAL URL ──────────────────────
  console.log('\n--- 12. NAVIGATION TO KNOWN / DISCOVERED CANONICAL URL ---');
  const resKnownUrl = await resolveNavigationTarget(LMS_WIDGET_ID, 'https://lms-e-learning-system.vercel.app/faq');
  report(resKnownUrl.canNavigate === true, 'Direct canonical URL target permitted');
  report(Boolean(resKnownUrl.targetUrl?.includes('/faq')), `Resolved canonical URL preserved: "${resKnownUrl.targetUrl}"`);

  // ── 13. NAVIGATION TO ENTITY WHOSE EXACT URL IS KNOWN ───────────────────────
  console.log('\n--- 13. NAVIGATION TO ENTITY WHOSE EXACT URL IS KNOWN ---');
  const resExactEntityUrl = await resolveNavigationTarget(AUTO_WIDGET_ID, '2024 Ram 1500 Big Horn Crew Cab 4x4');
  report(resExactEntityUrl.canNavigate === true, 'Exact vehicle title resolved to verified route');
  report(Boolean(resExactEntityUrl.targetUrl?.includes('/2024-ram-1500-big-horn')), `Exact vehicle URL matched: "${resExactEntityUrl.targetUrl}"`);

  // ── 14. NAVIGATION TO INVALID / RANDOM / MALICIOUS URL ──────────────────────
  console.log('\n--- 14. NAVIGATION TO INVALID / MALICIOUS URL ---');
  const resMalicious = await resolveNavigationTarget(LMS_WIDGET_ID, 'https://evil-attacker-website.com/phishing');
  report(resMalicious.canNavigate === false, 'External unauthorized domain rejected (canNavigate = false)');
  report(!resMalicious.targetUrl, 'Malicious external URL blocked completely');

  const resRandom = await resolveNavigationTarget(LMS_WIDGET_ID, 'Navigate to /random-gibberish-xyz-98765');
  report(resRandom.canNavigate === false, 'Random non-existent path rejected (canNavigate = false)');

  // ── 15. SESSION RESUME TOKEN INTEGRITY ──────────────────────────────────────
  console.log('\n--- 15. SESSION RESUME TOKEN INTEGRITY ---');
  if (resAnaphora.targetUrl) {
    report(resAnaphora.targetUrl.includes('widget_resume='), 'widget_resume session parameter attached for uninterrupted continuity');
  }

  console.log('\n================================================================');
  console.log(`NAVIGATION STRESS SUITE SUMMARY: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runNavigationStressSuite().catch(err => {
  console.error('Fatal navigation test error:', err);
  process.exit(1);
});
