import fs from 'fs';
import path from 'path';

// Load .env
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
} catch (e) {}

import { POST } from '../src/app/api/retell/chat/route';
import { NextRequest } from 'next/server';

function createMockRequest(body: any): NextRequest {
  const url = 'http://localhost:3000/api/retell/chat';
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '127.0.0.1',
    },
    body: JSON.stringify(body),
  });
}

async function runChatTests() {
  console.log('====================================================');
  console.log('TESTING FULL CONVERSATION & FOLLOW-UP RESOLUTION');
  console.log('====================================================\n');

  // TURN 1: User asks for catalog
  console.log('--- TURN 1: "What courses do you offer?" ---');
  const req1 = createMockRequest({
    content: 'What courses do you offer?',
    widgetId: 'default',
  });
  const res1 = await POST(req1);
  const data1 = await res1.json();
  const agentMsg1 = data1.messages?.find((m: any) => m.role === 'agent');
  console.log('Agent Response:\n', agentMsg1?.content);
  console.log('Result Cards Count:', agentMsg1?.results?.length || 0);
  console.log('Card Titles:', agentMsg1?.results?.map((r: any) => r.title));

  const history = [
    { role: 'user', content: 'What courses do you offer?' },
    agentMsg1,
  ];

  // TURN 2: Ordinal follow-up ("Tell me about the second one")
  console.log('\n--- TURN 2: "Tell me about the second one" ---');
  const req2 = createMockRequest({
    content: 'Tell me about the second one',
    widgetId: 'default',
    history,
  });
  const res2 = await POST(req2);
  const data2 = await res2.json();
  const agentMsg2 = data2.messages?.find((m: any) => m.role === 'agent');
  console.log('Agent Response:\n', agentMsg2?.content);
  const secondTitle = agentMsg1?.results?.[1]?.title || '';
  if (agentMsg2?.content?.includes(secondTitle) || agentMsg2?.content?.includes('Backend')) {
    console.log(`✅ PASS: Successfully resolved ordinal reference ("second one") to ${secondTitle}!`);
  } else {
    console.log(`❌ FAIL: Expected info on ${secondTitle}, got:`, agentMsg2?.content);
  }

  // TURN 3: Pronoun follow-up ("What's its price?")
  console.log('\n--- TURN 3: "What\'s its price?" ---');
  history.push({ role: 'user', content: 'Tell me about the second one' });
  history.push(agentMsg2);

  const req3 = createMockRequest({
    content: "What's its price?",
    widgetId: 'default',
    history,
  });
  const res3 = await POST(req3);
  const data3 = await res3.json();
  const agentMsg3 = data3.messages?.find((m: any) => m.role === 'agent');
  console.log('Agent Response:\n', agentMsg3?.content);
  if (agentMsg3?.content?.includes('100') || agentMsg3?.content?.includes('$')) {
    console.log('✅ PASS: Successfully resolved anaphoric question ("its price")!');
  } else {
    console.log('❌ FAIL: Expected price in response, got:', agentMsg3?.content);
  }

  // TURN 4: Negative Query ("Do you offer frontend course?")
  console.log('\n--- TURN 4: Negative Query ("Do you offer frontend course?") ---');
  const req4 = createMockRequest({
    content: 'Do you offer frontend course?',
    widgetId: 'default',
  });
  const res4 = await POST(req4);
  const data4 = await res4.json();
  const agentMsg4 = data4.messages?.find((m: any) => m.role === 'agent');
  console.log('Agent Response:\n', agentMsg4?.content);
  console.log('Result cards on negative query:', agentMsg4?.results?.length || 0);

  const isHonestNegative = agentMsg4?.content?.toLowerCase().includes("couldn't find") ||
    agentMsg4?.content?.toLowerCase().includes("do not") ||
    agentMsg4?.content?.toLowerCase().includes("not currently offer");

  if (isHonestNegative && (!agentMsg4?.results || agentMsg4?.results?.length === 0)) {
    console.log('✅ PASS: Anti-hallucination active! Agent stated course not found without dumping catalog.');
  } else {
    console.log('❌ FAIL: Hallucinated or dumped catalog on negative query:', agentMsg4?.content);
  }

  console.log('\n====================================================');
  console.log('ALL CHAT & FOLLOW-UP CONVERSATION TESTS COMPLETED');
  console.log('====================================================');
}

runChatTests().catch(console.error);
