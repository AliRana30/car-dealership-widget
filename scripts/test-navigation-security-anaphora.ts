/**
 * COMPREHENSIVE ANAPHORA & URL SECURITY NAVIGATION VALIDATION SUITE
 * 
 * Verifies:
 * PART A: Anaphoric entity navigation
 *  - Entity -> "its page"
 *  - Entity -> "that page"
 *  - Entity -> "open this"
 *  - Entity -> "open his profile"
 *  - Non-existent context -> fail closed (not_found)
 *  - Multiple candidates context -> disambiguation (ambiguous)
 * 
 * PART B: External URL Security & Allowed Domains
 *  - Arbitrary external domain -> BLOCKED
 *  - Phishing domain -> BLOCKED
 *  - javascript: / data: / blob: -> BLOCKED
 *  - Protocol-relative URL (//evil.com) -> BLOCKED
 *  - Embedded credentials (@) -> BLOCKED
 *  - Private IP / SSRF loopback -> BLOCKED
 *  - Random unverified internal path -> BLOCKED
 *  - Valid internal page -> ALLOWED
 *  - Valid entity URL -> ALLOWED
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
import { updateSessionContext } from '../src/lib/agents/sessionContext';

const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface SecurityAnaphoraTest {
  name: string;
  setupSession?: {
    sessionId: string;
    widgetId: string;
    currentEntity?: any;
    lastEntities?: any[];
  };
  query: string;
  widgetId: string;
  sessionId?: string;
  expectedCanNavigate: boolean;
  expectedConfidence: string;
  expectedUrlSubstr?: string;
  expectedSecurityDecision: 'ALLOW' | 'BLOCK';
}

async function runSuite() {
  console.log('================================================================');
  console.log('ANAPHORA & URL SECURITY NAVIGATION VALIDATION SUITE');
  console.log('================================================================\n');

  const testCases: SecurityAnaphoraTest[] = [
    // PART A: Anaphora
    {
      name: '1. Entity -> "its page" (Leetcode Mastery)',
      setupSession: {
        sessionId: 'test_anaphora_1',
        widgetId: LMS_WIDGET_ID,
        currentEntity: {
          id: '69309149f53ad74946204d40',
          title: 'Leetcode Mastery',
          sourceUrl: 'https://lms-e-learning-system.vercel.app/course/69309149f53ad74946204d40',
        },
      },
      query: 'Take me to its page.',
      widgetId: LMS_WIDGET_ID,
      sessionId: 'test_anaphora_1',
      expectedCanNavigate: true,
      expectedConfidence: 'exact',
      expectedUrlSubstr: '/course/69309149f53ad74946204d40',
      expectedSecurityDecision: 'ALLOW',
    },
    {
      name: '2. Entity -> "that page" (2024 Jeep Wrangler)',
      setupSession: {
        sessionId: 'test_anaphora_2',
        widgetId: AUTO_WIDGET_ID,
        currentEntity: {
          id: 'jeep-wrangler-4xe',
          title: '2024 Jeep Wrangler 4xe Rubicon',
          sourceUrl: 'https://www.ottawachryslerjeepdodge.com/new-vehicles/2024-jeep-wrangler-4xe-rubicon/',
        },
      },
      query: 'Open that page.',
      widgetId: AUTO_WIDGET_ID,
      sessionId: 'test_anaphora_2',
      expectedCanNavigate: true,
      expectedConfidence: 'exact',
      expectedUrlSubstr: '2024-jeep-wrangler-4xe-rubicon',
      expectedSecurityDecision: 'ALLOW',
    },
    {
      name: '3. Entity -> "open this" (Backend Mastery)',
      setupSession: {
        sessionId: 'test_anaphora_3',
        widgetId: LMS_WIDGET_ID,
        currentEntity: {
          id: '6a8885e7b07fd83e210c84d6',
          title: 'Backend Mastery',
          sourceUrl: 'https://lms-e-learning-system.vercel.app/course/6a8885e7b07fd83e210c84d6',
        },
      },
      query: 'Open this.',
      widgetId: LMS_WIDGET_ID,
      sessionId: 'test_anaphora_3',
      expectedCanNavigate: true,
      expectedConfidence: 'exact',
      expectedUrlSubstr: '/course/6a8885e7b07fd83e210c84d6',
      expectedSecurityDecision: 'ALLOW',
    },
    {
      name: '4. Entity -> "open his profile" (Ali Rana)',
      setupSession: {
        sessionId: 'test_anaphora_4',
        widgetId: LMS_WIDGET_ID,
        currentEntity: {
          id: 'ali-rana-profile',
          title: 'Ali Rana',
          sourceUrl: 'https://lms-e-learning-system.vercel.app/instructor/ali-rana',
        },
      },
      query: 'Open his profile.',
      widgetId: LMS_WIDGET_ID,
      sessionId: 'test_anaphora_4',
      expectedCanNavigate: true,
      expectedConfidence: 'exact',
      expectedUrlSubstr: '/instructor/ali-rana',
      expectedSecurityDecision: 'ALLOW',
    },
    {
      name: '5. Non-existent context reference -> fail closed (not_found)',
      setupSession: {
        sessionId: 'test_anaphora_5_empty',
        widgetId: LMS_WIDGET_ID,
      },
      query: 'Open its page.',
      widgetId: LMS_WIDGET_ID,
      sessionId: 'test_anaphora_5_empty',
      expectedCanNavigate: false,
      expectedConfidence: 'not_found',
      expectedSecurityDecision: 'BLOCK',
    },
    {
      name: '6. Multi-entity context -> clarification (ambiguous)',
      setupSession: {
        sessionId: 'test_anaphora_6_multi',
        widgetId: LMS_WIDGET_ID,
        lastEntities: [
          { id: '1', title: 'Course A', sourceUrl: 'https://lms.com/a' },
          { id: '2', title: 'Course B', sourceUrl: 'https://lms.com/b' },
        ],
      },
      query: 'Open its page.',
      widgetId: LMS_WIDGET_ID,
      sessionId: 'test_anaphora_6_multi',
      expectedCanNavigate: false,
      expectedConfidence: 'ambiguous',
      expectedSecurityDecision: 'BLOCK',
    },

    // PART B: Security Validation
    {
      name: '7. Malicious external domain (evil-attacker-website.com)',
      query: 'https://evil-attacker-website.com/phishing',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: false,
      expectedConfidence: 'invalid_url',
      expectedSecurityDecision: 'BLOCK',
    },
    {
      name: '8. Random unverified internal path (/random-gibberish-xyz-98765)',
      query: '/random-gibberish-xyz-98765',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: false,
      expectedConfidence: 'not_found',
      expectedSecurityDecision: 'BLOCK',
    },
    {
      name: '9. Valid internal canonical page (/courses)',
      query: 'https://lms-e-learning-system.vercel.app/courses',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: true,
      expectedConfidence: 'exact',
      expectedUrlSubstr: '/courses',
      expectedSecurityDecision: 'ALLOW',
    },
    {
      name: '10. Valid entity URL (/course/69309149f53ad74946204d40)',
      query: 'https://lms-e-learning-system.vercel.app/course/69309149f53ad74946204d40',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: true,
      expectedConfidence: 'exact',
      expectedUrlSubstr: '/course/69309149f53ad74946204d40',
      expectedSecurityDecision: 'ALLOW',
    },
    {
      name: '11. Dangerous pseudo-protocol (javascript:alert(1))',
      query: 'javascript:alert(document.cookie)',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: false,
      expectedConfidence: 'invalid_url',
      expectedSecurityDecision: 'BLOCK',
    },
    {
      name: '12. Dangerous pseudo-protocol (data:text/html)',
      query: 'data:text/html,<script>alert(1)</script>',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: false,
      expectedConfidence: 'invalid_url',
      expectedSecurityDecision: 'BLOCK',
    },
    {
      name: '13. Protocol-relative external URL (//evil.com/steal)',
      query: '//evil.com/steal',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: false,
      expectedConfidence: 'invalid_url',
      expectedSecurityDecision: 'BLOCK',
    },
    {
      name: '14. URL credentials bypass (https://admin:pass@evil.com)',
      query: 'https://admin:pass@evil.com/leak',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: false,
      expectedConfidence: 'invalid_url',
      expectedSecurityDecision: 'BLOCK',
    },
    {
      name: '15. Private IP / SSRF attempt (http://127.0.0.1:8080)',
      query: 'http://127.0.0.1:8080/admin',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: false,
      expectedConfidence: 'invalid_url',
      expectedSecurityDecision: 'BLOCK',
    },
    {
      name: '16. Cloud metadata SSRF attempt (http://169.254.169.254)',
      query: 'http://169.254.169.254/latest/meta-data',
      widgetId: LMS_WIDGET_ID,
      expectedCanNavigate: false,
      expectedConfidence: 'invalid_url',
      expectedSecurityDecision: 'BLOCK',
    },
  ];

  let passed = 0;
  let total = 0;

  for (const tc of testCases) {
    total++;
    console.log(`----------------------------------------------------------------`);
    console.log(`TEST ${total}: ${tc.name}`);
    console.log(`Query: "${tc.query}"`);
    console.log(`----------------------------------------------------------------`);

    // 1. Setup session if specified
    if (tc.setupSession) {
      await updateSessionContext(tc.setupSession.sessionId, tc.setupSession.widgetId, {
        currentEntity: tc.setupSession.currentEntity || null,
        pinnedEntity: tc.setupSession.currentEntity || null,
        lastEntities: tc.setupSession.lastEntities || [],
        lastResults: tc.setupSession.lastEntities || [],
      });
    }

    // 2. Resolve navigation
    const res = await resolveNavigationTarget(tc.widgetId, tc.query, {
      sessionId: tc.sessionId,
    });

    const actualSecurityDecision = res.canNavigate ? 'ALLOW' : 'BLOCK';
    console.log(`  Security Decision:       ${actualSecurityDecision} (Expected: ${tc.expectedSecurityDecision})`);
    console.log(`  canNavigate:             ${res.canNavigate} (Expected: ${tc.expectedCanNavigate})`);
    console.log(`  Confidence:              ${res.confidence} (Expected: ${tc.expectedConfidence})`);
    console.log(`  Resolved URL:            ${res.targetUrl || 'None'}`);
    if (res.failureReason) console.log(`  Failure / Block Reason:  ${res.failureReason}`);
    if (res.clarificationMessage) console.log(`  Clarification Msg:       ${res.clarificationMessage}`);

    let testPass = true;
    let failReasons: string[] = [];

    if (res.canNavigate !== tc.expectedCanNavigate) {
      testPass = false;
      failReasons.push(`canNavigate mismatch: got ${res.canNavigate}, expected ${tc.expectedCanNavigate}`);
    }

    if (res.confidence !== tc.expectedConfidence) {
      testPass = false;
      failReasons.push(`confidence mismatch: got ${res.confidence}, expected ${tc.expectedConfidence}`);
    }

    if (tc.expectedUrlSubstr && (!res.targetUrl || !res.targetUrl.includes(tc.expectedUrlSubstr))) {
      testPass = false;
      failReasons.push(`URL substring mismatch: expected "${tc.expectedUrlSubstr}", got "${res.targetUrl}"`);
    }

    if (actualSecurityDecision !== tc.expectedSecurityDecision) {
      testPass = false;
      failReasons.push(`Security decision mismatch: got ${actualSecurityDecision}, expected ${tc.expectedSecurityDecision}`);
    }

    if (testPass) {
      console.log(`  RESULT: ✅ PASS\n`);
      passed++;
    } else {
      console.log(`  RESULT: ❌ FAIL - ${failReasons.join(' | ')}\n`);
    }
  }

  console.log('================================================================');
  console.log(`ANAPHORA & SECURITY SUITE SUMMARY: ${passed} / ${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
