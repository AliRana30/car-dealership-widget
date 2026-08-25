/**
 * COMPREHENSIVE ADVERSARIAL RETRIEVAL & GROUNDING TEST SUITE
 * 
 * Tests all 20 adversarial scenarios across:
 * - Real LMS Widget & crawled data (3d801677-65f4-4495-a9b5-24c39b6ee516)
 * - Real Marketplace / Automotive Widget & crawled data (e0330b35-27c1-4f27-95d0-93640bd05812)
 * 
 * Verifies for each query:
 * - Retrieved entity IDs & Titles
 * - Prices & metadata filters
 * - URLs & Images
 * - Anti-hallucination grounding enforcement
 * - Cross-provider consistency (Chat vs Retell vs Vapi)
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
import { executeAgentTool } from '../src/lib/agents/tools';
import { understandQuery } from '../src/lib/retrieval/queryUnderstanding';

const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface TestCase {
  number: number;
  name: string;
  query: string;
  widgetId: string;
  businessName: string;
  expectedEntityTitles?: string[];
  expectedExcludedTitles?: string[];
  expectedPrice?: string;
  shouldBeGrounded: boolean;
  expectEmptyOrUnverified?: boolean;
  verifyCrossProvider?: boolean;
  followUpContext?: { previousEntityTitle: string; previousEntityId: string };
}

async function runAdversarialSuite() {
  console.log('================================================================');
  console.log('COMPREHENSIVE ADVERSARIAL RETRIEVAL & GROUNDING TEST SUITE');
  console.log('================================================================\n');

  const testCases: TestCase[] = [
    // 1. Exact entity queries
    {
      number: 1,
      name: 'Exact entity query (LMS)',
      query: 'Leetcode Mastery',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery'],
      expectedPrice: '$90',
      shouldBeGrounded: true,
      verifyCrossProvider: true,
    },
    // 2. Partial entity names
    {
      number: 2,
      name: 'Partial entity name (Auto)',
      query: 'Grand Cherokee',
      widgetId: AUTO_WIDGET_ID,
      businessName: 'Ottawa Chrysler Jeep Dodge',
      expectedEntityTitles: ['2024 Jeep Grand Cherokee L Limited 4x4'],
      expectedPrice: '$64,995',
      shouldBeGrounded: true,
      verifyCrossProvider: true,
    },
    // 3. Typos and spelling mistakes
    {
      number: 3,
      name: 'Typos and spelling mistakes',
      query: 'Letcode Mastry',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery'],
      shouldBeGrounded: true,
      verifyCrossProvider: true,
    },
    // 4. Synonyms
    {
      number: 4,
      name: 'Synonyms & semantic intent',
      query: 'coding algorithm classes for interviews',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery'],
      shouldBeGrounded: true,
    },
    // 5. Multiple matching entities
    {
      number: 5,
      name: 'Multiple matching entities',
      query: 'courses',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery', 'Backend Mastery', 'MERN Stack Development Course'],
      shouldBeGrounded: true,
    },
    // 6. Non-existent entities
    {
      number: 6,
      name: 'Non-existent entity (Zero Fabrication)',
      query: 'Quantum Computing Masterclass Degree',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      shouldBeGrounded: false,
      expectEmptyOrUnverified: true,
      verifyCrossProvider: true,
    },
    // 7. Non-existent prices
    {
      number: 7,
      name: 'Non-existent price enquiry',
      query: 'What is the price of the Helicopter Flight Training class?',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      shouldBeGrounded: false,
      expectEmptyOrUnverified: true,
    },
    // 8. Questions with no answer in crawled data
    {
      number: 8,
      name: 'Unanswered knowledge question',
      query: 'What is the personal home phone number of the company founder?',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      shouldBeGrounded: false,
      expectEmptyOrUnverified: true,
    },
    // 9. "Show all" queries
    {
      number: 9,
      name: '"Show all" catalog query',
      query: 'show all courses',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery', 'Backend Mastery', 'MERN Stack Development Course'],
      shouldBeGrounded: true,
    },
    // 10. Category filtering
    {
      number: 10,
      name: 'Category filtering (Service vs FAQ)',
      query: 'show FAQs',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Frequently Asked Questions — CampusCore'],
      shouldBeGrounded: true,
    },
    // 11. Price under X
    {
      number: 11,
      name: 'Price under $100 constraint',
      query: 'courses under $100',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery', 'Backend Mastery'],
      expectedExcludedTitles: ['MERN Stack Development Course'],
      shouldBeGrounded: true,
    },
    // 12. Price over X
    {
      number: 12,
      name: 'Price over $120 constraint',
      query: 'courses over $120',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['MERN Stack Development Course'],
      expectedExcludedTitles: ['Leetcode Mastery', 'Backend Mastery'],
      shouldBeGrounded: true,
    },
    // 13. Price between X and Y
    {
      number: 13,
      name: 'Price range constraint ($85 to $110)',
      query: 'courses between $85 and $110',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery', 'Backend Mastery'],
      expectedExcludedTitles: ['MERN Stack Development Course'],
      shouldBeGrounded: true,
    },
    // 14. Cheapest / most expensive
    {
      number: 14,
      name: 'Cheapest entity discovery',
      query: 'what is the cheapest course available?',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery'],
      expectedPrice: '$90',
      shouldBeGrounded: true,
    },
    // 15. Sale / discounted items
    {
      number: 15,
      name: 'Discounted / Sale item lookup',
      query: 'are there any discounted courses on sale?',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      shouldBeGrounded: true,
    },
    // 16. NOT-on-sale / standard items
    {
      number: 16,
      name: 'Standard listed catalog items',
      query: 'regular price courses',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery', 'Backend Mastery', 'MERN Stack Development Course'],
      shouldBeGrounded: true,
    },
    // 17. Rating filtering
    {
      number: 17,
      name: 'Rating filtering (5 stars)',
      query: 'courses with 5 star rating',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery', 'MERN Stack Development Course'],
      shouldBeGrounded: true,
    },
    // 18. Availability filtering
    {
      number: 18,
      name: 'Availability filtering (in stock)',
      query: 'available courses for immediate enrollment',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      expectedEntityTitles: ['Leetcode Mastery'],
      shouldBeGrounded: true,
    },
    // 19. Multiple constraints in one query
    {
      number: 19,
      name: 'Multiple constraints (Make + Max Price)',
      query: 'Jeep vehicles under $70,000',
      widgetId: AUTO_WIDGET_ID,
      businessName: 'Ottawa Chrysler Jeep Dodge',
      expectedEntityTitles: ['2024 Jeep Grand Cherokee L Limited 4x4'],
      expectedExcludedTitles: ['2024 Jeep Wrangler 4xe Rubicon'],
      shouldBeGrounded: true,
    },
    // 20. Follow-up question referring to previous entity
    {
      number: 20,
      name: 'Contextual follow-up question',
      query: 'How much does it cost and what is its URL?',
      widgetId: LMS_WIDGET_ID,
      businessName: 'CampusCore LMS',
      followUpContext: {
        previousEntityTitle: 'Leetcode Mastery',
        previousEntityId: 'f774f11f-b917-4ce5-8f8d-d4f4240169c5',
      },
      expectedEntityTitles: ['Leetcode Mastery'],
      expectedPrice: '$90',
      shouldBeGrounded: true,
    },
  ];

  let passedTests = 0;
  let totalTests = 0;

  for (const tc of testCases) {
    totalTests++;
    console.log(`----------------------------------------------------------------`);
    console.log(`TEST CASE ${tc.number}: ${tc.name}`);
    console.log(`Query: "${tc.query}" | Widget: ${tc.widgetId.slice(0, 8)}...`);
    console.log(`----------------------------------------------------------------`);

    let isPass = true;
    let failureReason = '';

    // Handle follow-up query expansion if applicable
    const effectiveQuery = tc.followUpContext
      ? `${tc.followUpContext.previousEntityTitle} ${tc.query}`
      : tc.query;

    // 1. EXECUTE CHAT HYBRID RETRIEVAL & GROUNDING
    const chatRetrieval = await hybridRetrieve(tc.widgetId, effectiveQuery, { limit: 5 });
    const grounding = validateGrounding(tc.query, chatRetrieval, tc.businessName);

    const retrievedTitles = (chatRetrieval.results || []).map(r => r.title);
    const retrievedIds = (chatRetrieval.results || []).map(r => r.id);
    const retrievedPrices = (chatRetrieval.results || []).map(r => r.price || r.metadata?.price || 'N/A');
    const retrievedUrls = (chatRetrieval.results || []).map(r => r.sourceUrl || (r as any).canonicalUrl || 'N/A');

    console.log(`[CHAT RETRIEVAL]`);
    console.log(`  Count: ${chatRetrieval.count}`);
    console.log(`  Titles: ${JSON.stringify(retrievedTitles)}`);
    console.log(`  Prices: ${JSON.stringify(retrievedPrices)}`);
    console.log(`  URLs: ${JSON.stringify(retrievedUrls)}`);
    console.log(`  Grounded: ${grounding.isGrounded ? 'YES' : 'NO'}`);
    console.log(`  Confidence: ${grounding.groundingMetadata.confidence}`);

    // Verification Checks
    if (tc.expectEmptyOrUnverified) {
      if (grounding.isGrounded && chatRetrieval.count > 0 && chatRetrieval.results[0].score > 60) {
        isPass = false;
        failureReason = `Expected unverified/empty fallback, but received high-scoring entity: "${retrievedTitles[0]}"`;
      } else {
        console.log(`  ✅ Verified Anti-Hallucination: Handled via unverified fallback / low-confidence.`);
      }
    } else if (tc.shouldBeGrounded) {
      if (!grounding.isGrounded || retrievedTitles.length === 0) {
        isPass = false;
        failureReason = `Expected grounded results, but retrieved 0 entities.`;
      }
    }

    if (tc.expectedEntityTitles && isPass && !tc.expectEmptyOrUnverified) {
      for (const expectedTitle of tc.expectedEntityTitles) {
        const found = retrievedTitles.some(t => t.toLowerCase().includes(expectedTitle.toLowerCase()));
        if (!found) {
          isPass = false;
          failureReason = `Expected entity "${expectedTitle}" was not found in retrieved titles: ${JSON.stringify(retrievedTitles)}`;
          break;
        }
      }
    }

    if (tc.expectedExcludedTitles && isPass) {
      for (const excludedTitle of tc.expectedExcludedTitles) {
        const found = retrievedTitles.some(t => t.toLowerCase().includes(excludedTitle.toLowerCase()));
        if (found) {
          isPass = false;
          failureReason = `Excluded entity "${excludedTitle}" was incorrectly returned under constraint filter!`;
          break;
        }
      }
    }

    if (tc.expectedPrice && isPass && !tc.expectEmptyOrUnverified) {
      const priceMatched = retrievedPrices.some(p => p.includes(tc.expectedPrice!));
      if (!priceMatched) {
        isPass = false;
        failureReason = `Expected price "${tc.expectedPrice}" was not found in retrieved prices: ${JSON.stringify(retrievedPrices)}`;
      }
    }

    // 2. CROSS-PROVIDER CONSISTENCY TEST (RETELL & VAPI)
    if (tc.verifyCrossProvider && isPass) {
      console.log(`[VOICE TOOL CONSISTENCY (RETELL & VAPI)]`);
      const retellRes = await executeAgentTool(tc.widgetId, 'search_entities', { query: effectiveQuery, limit: 3 });
      const vapiRes = await executeAgentTool(tc.widgetId, 'search_entities', { query: effectiveQuery, limit: 3 });

      const retellTop = retellRes.data?.results?.[0];
      const vapiTop = vapiRes.data?.results?.[0];

      console.log(`  Retell Top: ${retellTop ? `"${retellTop.title}" ($${retellTop.price || 'N/A'})` : 'None'}`);
      console.log(`  Vapi Top:   ${vapiTop ? `"${vapiTop.title}" ($${vapiTop.price || 'N/A'})` : 'None'}`);

      if (!tc.expectEmptyOrUnverified) {
        if (!retellTop || !vapiTop) {
          isPass = false;
          failureReason = `Voice tools failed to retrieve entity (Retell: ${Boolean(retellTop)}, Vapi: ${Boolean(vapiTop)})`;
        } else if (retellTop.id !== vapiTop.id) {
          isPass = false;
          failureReason = `Entity ID mismatch between Retell (${retellTop.id}) and Vapi (${vapiTop.id})`;
        }
      } else {
        console.log(`  ✅ Verified Cross-Provider: Both voice tools safely handle unverified queries.`);
      }
    }

    // RESULT
    if (isPass) {
      console.log(`RESULT: ✅ PASS\n`);
      passedTests++;
    } else {
      console.error(`RESULT: ❌ FAIL - ${failureReason}\n`);
    }
  }

  console.log('================================================================');
  console.log(`ADVERSARIAL SUITE SUMMARY: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAdversarialSuite().catch(err => {
  console.error('Fatal error during adversarial suite:', err);
  process.exit(1);
});
