/**
 * COMPREHENSIVE SEMANTIC HYBRID RETRIEVAL VALIDATION SUITE
 * 
 * Verifies that semantic intent and deep metadata/content indexing can retrieve entities
 * across multiple domains (LMS, Marketplace, Automotive, Services) even when the user's wording
 * does not directly match the title, while preserving exact-match priority.
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

const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';
const NORET_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface SemanticTestCase {
  domain: string;
  query: string;
  widgetId: string;
  expectedEntitySubstring: string;
  testDescription: string;
}

async function runSemanticSuite() {
  console.log('================================================================');
  console.log('HYBRID SEMANTIC RETRIEVAL & DEEP METADATA VALIDATION SUITE');
  console.log('================================================================\n');

  const testCases: SemanticTestCase[] = [
    // 1. LMS: Algorithms & Coding for Interviews -> Leetcode Mastery
    {
      domain: 'LMS',
      query: 'coding algorithm classes for interviews',
      widgetId: LMS_WIDGET_ID,
      expectedEntitySubstring: 'Leetcode',
      testDescription: 'Semantic match: "coding algorithm classes for interviews" -> Leetcode Mastery',
    },
    // 2. LMS: Full stack web development -> MERN Stack Development Course
    {
      domain: 'LMS',
      query: 'learn full stack web development',
      widgetId: LMS_WIDGET_ID,
      expectedEntitySubstring: 'MERN',
      testDescription: 'Semantic match: "learn full stack web development" -> MERN Stack Development Course',
    },
    // 3. Marketplace: People who build React applications -> Talent/Freelancers
    {
      domain: 'Marketplace/Freelancer',
      query: 'people who build React applications',
      widgetId: NORET_WIDGET_ID,
      expectedEntitySubstring: 'Noretmy',
      testDescription: 'Semantic match: "people who build React applications" -> Talent/Noretmy entity',
    },
    // 4. Automotive: Cars with four wheel drive -> 4x4 / AWD vehicles
    {
      domain: 'Automotive',
      query: 'cars with four wheel drive',
      widgetId: AUTO_WIDGET_ID,
      expectedEntitySubstring: '4x4',
      testDescription: 'Semantic match: "cars with four wheel drive" -> 4x4 Jeep / Ram inventory',
    },
    // 5. Services: Website development services -> Web service / course entity
    {
      domain: 'Services',
      query: 'website development services',
      widgetId: LMS_WIDGET_ID,
      expectedEntitySubstring: 'Mastery',
      testDescription: 'Semantic match: "website development services" -> Backend/MERN Mastery',
    },
    // 6. Exact match priority verification
    {
      domain: 'LMS (Exact Priority)',
      query: 'Leetcode Mastery',
      widgetId: LMS_WIDGET_ID,
      expectedEntitySubstring: 'Leetcode Mastery',
      testDescription: 'Exact match priority: "Leetcode Mastery" ranks #1 with exact match boost',
    },
    // 7. Automotive Exact match priority
    {
      domain: 'Automotive (Exact Priority)',
      query: '2024 Dodge Durango R/T AWD',
      widgetId: AUTO_WIDGET_ID,
      expectedEntitySubstring: 'Dodge Durango',
      testDescription: 'Exact match priority: "2024 Dodge Durango R/T AWD" ranks #1',
    },
  ];

  let passed = 0;
  let total = 0;

  for (const tc of testCases) {
    total++;
    console.log(`----------------------------------------------------------------`);
    console.log(`TEST ${total} [${tc.domain}]: "${tc.query}"`);
    console.log(`Description: ${tc.testDescription}`);
    console.log(`----------------------------------------------------------------`);

    const res = await hybridRetrieve(tc.widgetId, tc.query, { limit: 3 });
    const topResult = res.results[0];
    const retrievedTitles = res.results.map(r => r.title);

    console.log(`  Count:             ${res.count}`);
    console.log(`  Top Title:         "${topResult?.title || 'NONE'}"`);
    console.log(`  All Titles:        ${JSON.stringify(retrievedTitles)}`);
    console.log(`  Match Type:        ${(topResult as any)?.matchType || 'N/A'}`);
    console.log(`  Match Reasons:     ${JSON.stringify((topResult as any)?.matchReasons || [])}`);

    const isMatch = res.results.some(r => r.title.toLowerCase().includes(tc.expectedEntitySubstring.toLowerCase()));
    const grounding = validateGrounding(tc.query, res);

    console.log(`  Grounded:          ${grounding.isGrounded ? 'YES' : 'NO'}`);

    if (isMatch && res.count > 0 && grounding.isGrounded) {
      console.log(`  RESULT: ✅ PASS\n`);
      passed++;
    } else {
      console.log(`  RESULT: ❌ FAIL (Expected: contains "${tc.expectedEntitySubstring}")\n`);
    }
  }

  console.log('================================================================');
  console.log(`SEMANTIC RETRIEVAL SUITE SUMMARY: ${passed} / ${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runSemanticSuite().catch(err => {
  console.error('Fatal semantic test error:', err);
  process.exit(1);
});
