import fs from 'fs';
if (fs.existsSync('.env')) {
  process.loadEnvFile('.env');
}
import { POST } from '../src/app/api/retell/chat/route';
import { NextRequest } from 'next/server';

async function testDirectHandler() {
  const widgetId = 'front-desk';
  const queries = [
    'can you tell me which courses do you have/',
    'can you show me the mern sstack course?',
    'show me your about',
    'what is your policy?',
    'show me courses under $100',
  ];

  for (const q of queries) {
    console.log(`\n========================================`);
    console.log(`User Question: "${q}"`);
    console.log(`========================================`);

    const req = new NextRequest('http://localhost:3000/api/retell/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId,
        content: q,
        chatId: `test_${Date.now()}`,
      }),
    });

    const res = await POST(req);
    const data = await res.json();
    const agentMsg = data.messages?.find((m: any) => m.role === 'agent');
    console.log('HTTP Status:', res.status);
    console.log('Agent Response Text:\n', agentMsg?.content);
    console.log('Attached Results Cards Count:', agentMsg?.results?.length || 0);
    if (agentMsg?.results?.length) {
      agentMsg.results.forEach((r: any, i: number) => {
        console.log(`  Card ${i+1}: ${r.title} | Price: ${r.price} | URL: ${r.sourceUrl}`);
      });
    }
    console.log('Navigation URL:', data.navigationUrl || 'None');
    console.log('Action:', JSON.stringify(data.action));
  }

  console.log(`\n========================================`);
  console.log(`Testing /api/widgets/create-call`);
  console.log(`========================================`);
  const { POST: createCallPost } = await import('../src/app/api/widgets/create-call/route');
  const callReq = new NextRequest('http://localhost:3000/api/widgets/create-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ widgetId: 'front-desk' }),
  });
  const start = Date.now();
  const callRes = await createCallPost(callReq);
  const dur = Date.now() - start;
  const callData = await callRes.json();
  console.log(`Create Call Status: ${callRes.status} (elapsed: ${dur}ms)`);
  console.log('Provider:', callData.provider);
  console.log('Call ID:', callData.callId);
  console.log('Access Token exists:', Boolean(callData.accessToken));
  if (callData.error) console.log('Error:', callData);
}

testDirectHandler().catch(console.error);
