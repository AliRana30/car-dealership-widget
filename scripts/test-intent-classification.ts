/**
 * INTENT CLASSIFICATION & INFORMATIONAL RETRIEVAL VALIDATION SUITE
 * 
 * Verifies that semantic targets (FAQ, Policies, About, Contact, Courses, Products, Services)
 * correctly determine intent and retrieval behavior, regardless of leading verbs
 * ("show", "find", "give me", "list", "tell me", "display", "open").
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

import { understandQuery } from '../src/lib/retrieval/queryUnderstanding';
import { hybridRetrieve } from '../src/lib/retrieval/hybridRag';
import { validateGrounding } from '../src/lib/retrieval/grounding';

const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';
const NORET_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface IntentTestCase {
  query: string;
  widgetId: string;
  expectedIntent: 'faq' | 'policy' | 'about' | 'contact' | 'catalog' | 'navigation';
  expectedIsInformational: boolean;
  expectedTitleKeywords: string[];
}

async function runIntentSuite() {
  console.log('================================================================');
  console.log('INTENT CLASSIFICATION & INFORMATIONAL RETRIEVAL TEST SUITE');
  console.log('================================================================\n');

  const testCases: IntentTestCase[] = [
    // 1. FAQ Intent Queries
    {
      query: 'show FAQs',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'faq',
      expectedIsInformational: true,
      expectedTitleKeywords: ['FAQ', 'Frequently Asked Questions'],
    },
    {
      query: 'show me FAQs',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'faq',
      expectedIsInformational: true,
      expectedTitleKeywords: ['FAQ', 'Frequently Asked Questions'],
    },
    {
      query: 'what are the FAQs?',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'faq',
      expectedIsInformational: true,
      expectedTitleKeywords: ['FAQ', 'Frequently Asked Questions'],
    },
    {
      query: 'show frequently asked questions',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'faq',
      expectedIsInformational: true,
      expectedTitleKeywords: ['FAQ', 'Frequently Asked Questions'],
    },
    {
      query: 'tell me about your FAQ',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'faq',
      expectedIsInformational: true,
      expectedTitleKeywords: ['FAQ', 'Frequently Asked Questions'],
    },
    {
      query: 'open FAQs',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'faq',
      expectedIsInformational: true,
      expectedTitleKeywords: ['FAQ', 'Frequently Asked Questions'],
    },
    {
      query: 'tell me about FAQs',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'faq',
      expectedIsInformational: true,
      expectedTitleKeywords: ['FAQ', 'Frequently Asked Questions'],
    },
    {
      query: 'open FAQ page',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'faq',
      expectedIsInformational: true,
      expectedTitleKeywords: ['FAQ', 'Frequently Asked Questions'],
    },

    // 2. Policy & Terms Intent Queries
    {
      query: 'show policies',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'policy',
      expectedIsInformational: true,
      expectedTitleKeywords: ['Policies', 'Terms', 'Policy'],
    },
    {
      query: 'show terms',
      widgetId: NORET_WIDGET_ID,
      expectedIntent: 'policy',
      expectedIsInformational: true,
      expectedTitleKeywords: ['Terms and Conditions'],
    },
    {
      query: 'show privacy policy',
      widgetId: NORET_WIDGET_ID,
      expectedIntent: 'policy',
      expectedIsInformational: true,
      expectedTitleKeywords: ['Privacy Policy'],
    },

    // 3. About Intent Queries
    {
      query: 'show about page',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'about',
      expectedIsInformational: true,
      expectedTitleKeywords: ['Empowering Learners', 'About', 'CampusCore'],
    },

    // 4. Catalog Intent Queries (Must NOT be broken by leading verbs)
    {
      query: 'show courses',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'catalog',
      expectedIsInformational: false,
      expectedTitleKeywords: ['Mastery', 'MERN Stack', 'Backend'],
    },
    {
      query: 'show products',
      widgetId: AUTO_WIDGET_ID,
      expectedIntent: 'catalog',
      expectedIsInformational: false,
      expectedTitleKeywords: ['Jeep', 'Ram', 'Dodge'],
    },
    {
      query: 'show vehicles',
      widgetId: AUTO_WIDGET_ID,
      expectedIntent: 'catalog',
      expectedIsInformational: false,
      expectedTitleKeywords: ['Jeep', 'Ram', 'Dodge'],
    },
    {
      query: 'show services',
      widgetId: LMS_WIDGET_ID,
      expectedIntent: 'catalog',
      expectedIsInformational: false,
      expectedTitleKeywords: ['Mastery', 'MERN', 'Backend', 'CampusCore'],
    },
    {
      query: 'show freelancers',
      widgetId: NORET_WIDGET_ID,
      expectedIntent: 'catalog',
      expectedIsInformational: false,
      expectedTitleKeywords: ['Talent', 'Noretmy'],
    },
  ];

  let passedTests = 0;
  let totalTests = 0;

  for (const tc of testCases) {
    totalTests++;
    console.log(`----------------------------------------------------------------`);
    console.log(`TEST ${totalTests}: "${tc.query}"`);
    console.log(`----------------------------------------------------------------`);

    // 1. Understand Query
    const understood = understandQuery(tc.query);
    console.log(`  Parsed Intent:           "${understood.intent}" (Expected: "${tc.expectedIntent}")`);
    console.log(`  isInformational:         ${understood.isInformational} (Expected: ${tc.expectedIsInformational})`);

    let pass = true;
    let failDetail = '';

    if (understood.intent !== tc.expectedIntent) {
      pass = false;
      failDetail += `Intent mismatch: got "${understood.intent}", expected "${tc.expectedIntent}". `;
    }

    if (understood.isInformational !== tc.expectedIsInformational) {
      pass = false;
      failDetail += `isInformational mismatch: got ${understood.isInformational}, expected ${tc.expectedIsInformational}. `;
    }

    // 2. Execute Hybrid Retrieval against real widget database
    const retrieval = await hybridRetrieve(tc.widgetId, tc.query, { limit: 3 });
    const titles = retrieval.results.map(r => r.title);
    console.log(`  Retrieved Count:         ${retrieval.count}`);
    console.log(`  Retrieved Titles:        ${JSON.stringify(titles)}`);

    if (retrieval.count === 0) {
      pass = false;
      failDetail += `Retrieval returned 0 records! `;
    } else {
      const matchFound = tc.expectedTitleKeywords.some(kw =>
        titles.some(t => t.toLowerCase().includes(kw.toLowerCase()))
      );
      if (!matchFound) {
        pass = false;
        failDetail += `None of expected keywords [${tc.expectedTitleKeywords.join(', ')}] found in retrieved titles: ${JSON.stringify(titles)}. `;
      }
    }

    // 3. Grounding validation
    const grounding = validateGrounding(tc.query, retrieval);
    console.log(`  Grounded Status:         ${grounding.isGrounded ? 'YES' : 'NO'}`);

    if (!grounding.isGrounded) {
      pass = false;
      failDetail += `Grounding validation failed! `;
    }

    if (pass) {
      console.log(`  RESULT: ✅ PASS\n`);
      passedTests++;
    } else {
      console.error(`  RESULT: ❌ FAIL - ${failDetail}\n`);
    }
  }

  console.log('================================================================');
  console.log(`INTENT SUITE SUMMARY: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runIntentSuite().catch(err => {
  console.error('Fatal intent test error:', err);
  process.exit(1);
});
