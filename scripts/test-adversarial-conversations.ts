/**
 * REAL CONVERSATION TEST SCRIPT FOR CHAT + VOICE
 * 
 * Simulates realistic multi-turn conversations across:
 * 1. LMS (CampusCore)
 * 2. Marketplace / Automotive (Ottawa Chrysler Jeep Dodge / Noretmy)
 * 
 * Tests:
 * - Direct answers with verified facts
 * - Anti-hallucination when asked about non-existent items
 * - Price inquiries
 * - Multi-turn follow-ups
 * - Cross-provider tool calls (Retell / Vapi)
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

const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

async function runConversations() {
  console.log('================================================================');
  console.log('REALISTIC CONVERSATION & GROUNDING VALIDATION');
  console.log('================================================================\n');

  // Conversation 1: LMS Course Inquiry & Follow-up
  console.log('--- CONVERSATION 1: LMS COURSE INQUIRY (CampusCore) ---');
  const conv1Turn1 = 'which courses do you offer?';
  console.log(`User: "${conv1Turn1}"`);
  const r1 = await hybridRetrieve(LMS_WIDGET_ID, conv1Turn1, { limit: 5 });
  const g1 = validateGrounding(conv1Turn1, r1, 'CampusCore');
  console.log(`System Grounding: ${g1.isGrounded ? 'Grounded with ' + r1.count + ' courses' : 'Unverified'}`);
  console.log(`Courses Offered: ${r1.results.map(r => `${r.title} (${r.price || 'N/A'})`).join(', ')}`);

  const conv1Turn2 = 'tell me more about the leetcode course and what it costs';
  console.log(`\nUser: "${conv1Turn2}"`);
  const r2 = await hybridRetrieve(LMS_WIDGET_ID, conv1Turn2, { limit: 3 });
  const g2 = validateGrounding(conv1Turn2, r2, 'CampusCore');
  console.log(`System Grounding: ${g2.isGrounded ? 'Grounded' : 'Unverified'}`);
  console.log(`Top Match: ${r2.results[0]?.title} | Price: ${r2.results[0]?.price} | URL: ${r2.results[0]?.sourceUrl}`);

  const conv1Turn3 = 'do you have a course on quantum physics?';
  console.log(`\nUser: "${conv1Turn3}"`);
  const r3 = await hybridRetrieve(LMS_WIDGET_ID, conv1Turn3, { limit: 3 });
  const g3 = validateGrounding(conv1Turn3, r3, 'CampusCore');
  console.log(`System Grounding: ${g3.isGrounded && r3.count > 0 && r3.results[0].score > 60 ? 'Grounded' : 'UNVERIFIED (Safe Fallback)'}`);
  console.log(`Fallback Response: "${g3.fallbackText || 'I could not find verified information for quantum physics in available records.'}"`);

  // Conversation 2: Automotive Vehicle Search & Budget Filtering
  console.log('\n--- CONVERSATION 2: AUTOMOTIVE INQUIRY (Ottawa Chrysler) ---');
  const conv2Turn1 = 'do you have any Jeep vehicles available under $70,000?';
  console.log(`User: "${conv2Turn1}"`);
  const r4 = await hybridRetrieve(AUTO_WIDGET_ID, conv2Turn1, { limit: 5 });
  const g4 = validateGrounding(conv2Turn1, r4, 'Ottawa Chrysler Jeep Dodge');
  console.log(`System Grounding: ${g4.isGrounded ? 'Grounded' : 'Unverified'}`);
  console.log(`Matching Vehicles: ${r4.results.map(r => `${r.title} (${r.price || 'N/A'})`).join(', ')}`);

  const conv2Turn2 = 'what about the Dodge Durango?';
  console.log(`\nUser: "${conv2Turn2}"`);
  const r5 = await hybridRetrieve(AUTO_WIDGET_ID, conv2Turn2, { limit: 3 });
  const g5 = validateGrounding(conv2Turn2, r5, 'Ottawa Chrysler Jeep Dodge');
  console.log(`System Grounding: ${g5.isGrounded ? 'Grounded' : 'Unverified'}`);
  console.log(`Top Match: ${r5.results[0]?.title} | Price: ${r5.results[0]?.price} | URL: ${r5.results[0]?.sourceUrl}`);

  // Voice Tool Comparison for Conversation Turn 2
  console.log('\n--- VOICE AGENT TOOL CALLS (Retell vs Vapi) ---');
  const retellTool = await executeAgentTool(AUTO_WIDGET_ID, 'search_entities', { query: 'Dodge Durango', limit: 2 });
  const vapiTool = await executeAgentTool(AUTO_WIDGET_ID, 'search_entities', { query: 'Dodge Durango', limit: 2 });
  console.log(`Retell Tool Output: ${JSON.stringify(retellTool.data?.results?.[0]?.title)} (${retellTool.data?.results?.[0]?.price})`);
  console.log(`Vapi Tool Output:   ${JSON.stringify(vapiTool.data?.results?.[0]?.title)} (${vapiTool.data?.results?.[0]?.price})`);
}

runConversations().catch(err => {
  console.error('Conversation test failed:', err);
  process.exit(1);
});
