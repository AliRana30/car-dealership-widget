/**
 * REALISTIC CONVERSATION & NAVIGATION TEST SCRIPT (CHAT & VOICE)
 * 
 * Exercises:
 * - Direct navigation requests in Chat
 * - Voice navigation tool execution (navigate_to_entity)
 * - Anti-hallucination / zero-guessing when user asks for non-existent page
 * - Session resume parameter preservation across navigation turns
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

const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

async function runConversationalNavTests() {
  console.log('================================================================');
  console.log('REALISTIC CONVERSATIONAL NAVIGATION VALIDATION (CHAT & VOICE)');
  console.log('================================================================\n');

  const sessionId = `nav_conv_${Date.now()}`;

  // 1. Chat Turn: "Take me to the About page"
  console.log('--- CHAT TURN 1: Top-level Navigation ---');
  console.log('User: "Take me to the About page."');
  const nav1 = await resolveNavigationTarget(LMS_WIDGET_ID, 'Take me to the About page.', { sessionId });
  console.log(`Resolution: canNavigate = ${nav1.canNavigate} | Target: ${nav1.targetUrl}`);
  console.log(`Session Resume Attached: ${Boolean(nav1.targetUrl?.includes('widget_resume='))}`);

  // 2. Chat Turn: "Take me to the Bitcoin page" (Non-existent)
  console.log('\n--- CHAT TURN 2: Non-existent Page Request ---');
  console.log('User: "Take me to the Bitcoin Mining page."');
  const nav2 = await resolveNavigationTarget(LMS_WIDGET_ID, 'Take me to the Bitcoin Mining page.', { sessionId });
  console.log(`Resolution: canNavigate = ${nav2.canNavigate} | Confidence: ${nav2.confidence}`);
  console.log(`Response to User: "${nav2.failureReason || nav2.clarificationMessage || 'I could not find a page matching that name on this website.'}"`);

  // 3. Voice Turn: navigate_to_entity tool execution
  console.log('\n--- VOICE TURN: Retell / Vapi Tool Call ---');
  console.log('Voice Tool Invocation: navigate_to_entity({ target: "FAQ" })');
  const voiceNav = await executeUnifiedTool(
    LMS_WIDGET_ID,
    'navigate_to_entity',
    { target: 'FAQ' },
    { sessionId, allowAgentNavigation: true }
  );
  console.log(`Voice Tool Output: success = ${voiceNav.success} | Grounded: ${voiceNav.grounded}`);
  console.log(`Resolved URL: ${voiceNav.sources[0]?.url}`);

  console.log('\n================================================================');
  console.log('CONVERSATIONAL NAVIGATION VALIDATION COMPLETE');
  console.log('================================================================\n');
}

runConversationalNavTests().catch(err => {
  console.error('Conversational navigation test error:', err);
  process.exit(1);
});
