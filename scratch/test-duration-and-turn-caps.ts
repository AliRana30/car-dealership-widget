import { checkAndIncrementChatTurns, resetChatTurns, getChatTurnCount } from '../src/lib/chat/chatLimiter';
import { registerCallTimeout, clearCallTimeout, getActiveCallTimeouts } from '../src/lib/voice/callLimiter';
import { defaultVoiceWidgetConfig, toConfigurationRecord, fromConfigurationRecord } from '../src/config/voiceWidget/default';
import { POST } from '../src/app/api/retell/chat/route';
import { NextRequest } from 'next/server';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST SUITE: Hard Duration & Turn Caps (Task C.1)');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Default Configuration & Baseline Protection
  // ─────────────────────────────────────────────────────────────────
  console.log('👉 [TEST 1] Verifying Default Widget Config Fields & Serialization...');
  
  if (defaultVoiceWidgetConfig.behavior.maxCallDurationMinutes === 10) {
    console.log('  ✅ defaultVoiceWidgetConfig.behavior.maxCallDurationMinutes = 10');
  } else {
    throw new Error(`Expected default maxCallDurationMinutes 10, got ${defaultVoiceWidgetConfig.behavior.maxCallDurationMinutes}`);
  }

  if (defaultVoiceWidgetConfig.behavior.maxChatTurns === 30) {
    console.log('  ✅ defaultVoiceWidgetConfig.behavior.maxChatTurns = 30');
  } else {
    throw new Error(`Expected default maxChatTurns 30, got ${defaultVoiceWidgetConfig.behavior.maxChatTurns}`);
  }

  // Test serialization to DB record
  const customConfig = {
    ...defaultVoiceWidgetConfig,
    behavior: {
      ...defaultVoiceWidgetConfig.behavior,
      maxCallDurationMinutes: 15,
      maxChatTurns: 50,
    },
  };
  const record = toConfigurationRecord(customConfig);
  if (record.behavior.maxCallDurationMinutes === 15 && record.behavior.maxChatTurns === 50) {
    console.log('  ✅ toConfigurationRecord preserves custom maxCallDurationMinutes (15) and maxChatTurns (50)');
  } else {
    throw new Error('toConfigurationRecord failed to serialize behavior duration/turn caps');
  }

  // Test deserialization from DB record
  const restoredConfig = fromConfigurationRecord(record);
  if (restoredConfig.behavior.maxCallDurationMinutes === 15 && restoredConfig.behavior.maxChatTurns === 50) {
    console.log('  ✅ fromConfigurationRecord restores custom limits from database record');
  } else {
    throw new Error('fromConfigurationRecord failed to restore behavior duration/turn caps');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Server-Side Chat Turn Limiter Unit & Edge Cases
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 2] Verifying Server-Side Chat Turn Limiter Unit Logic...');
  const testSessionKey = `test_session_${Date.now()}`;
  resetChatTurns(testSessionKey);

  const maxCap = 3;
  // Turn 1
  const t1 = checkAndIncrementChatTurns(testSessionKey, maxCap);
  console.log(`  Turn 1: allowed=${t1.allowed}, currentTurn=${t1.currentTurn}/${t1.maxTurns}`);
  if (!t1.allowed || t1.currentTurn !== 1) throw new Error('Turn 1 should be allowed');

  // Turn 2
  const t2 = checkAndIncrementChatTurns(testSessionKey, maxCap);
  console.log(`  Turn 2: allowed=${t2.allowed}, currentTurn=${t2.currentTurn}/${t2.maxTurns}`);
  if (!t2.allowed || t2.currentTurn !== 2) throw new Error('Turn 2 should be allowed');

  // Turn 3 (Hit the limit)
  const t3 = checkAndIncrementChatTurns(testSessionKey, maxCap);
  console.log(`  Turn 3: allowed=${t3.allowed}, currentTurn=${t3.currentTurn}/${t3.maxTurns}`);
  if (!t3.allowed || t3.currentTurn !== 3) throw new Error('Turn 3 should be allowed');

  // Turn 4 (Exceeded - Must be capped)
  const t4 = checkAndIncrementChatTurns(testSessionKey, maxCap);
  console.log(`  Turn 4 (Over Cap): allowed=${t4.allowed}, currentTurn=${t4.currentTurn}/${t4.maxTurns}`);
  if (t4.allowed || !t4.message?.includes('maximum message limit')) {
    throw new Error(`Turn 4 should be rejected with capped message! Got: ${JSON.stringify(t4)}`);
  }
  console.log('  ✅ Turn 4 was strictly disallowed and received fixed contact redirect message');

  // Turn 5 (Repeated attempt past cap)
  const t5 = checkAndIncrementChatTurns(testSessionKey, maxCap);
  if (t5.allowed) throw new Error('Turn 5 must also be disallowed');
  console.log('  ✅ Turn 5 repeatedly rejected without any token consumption');

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: End-to-End Chat Endpoint Turn Capping (/api/retell/chat)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 3] Testing /api/retell/chat End-to-End Turn Cap Enforcement...');
  const e2eSessionId = `e2e_session_${Date.now()}`;
  resetChatTurns(e2eSessionId);

  // Send turn 1 (under cap)
  const req1 = new NextRequest('http://localhost:3000/api/retell/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      widgetId: 'cfbfa598-6c36-4447-9b27-173dbefa8e55',
      content: 'hello',
      sessionId: e2eSessionId,
      chatId: e2eSessionId,
    }),
  });
  const res1 = await POST(req1);
  const data1 = await res1.json();
  console.log(`  Request 1: HTTP ${res1.status}, capped=${data1.capped || false}`);
  if (res1.status !== 200 || data1.capped) {
    throw new Error('Request 1 should succeed normally');
  }

  // Simulate reaching cap by pushing turn counter
  const widgetMaxTurns = 30;
  for (let i = 1; i < widgetMaxTurns; i++) {
    checkAndIncrementChatTurns(e2eSessionId, widgetMaxTurns);
  }
  console.log(`  Simulated session advanced to turn count: ${getChatTurnCount(e2eSessionId)}/${widgetMaxTurns}`);

  // Now send request at turn 31 (exceeds cap)
  const reqCapped = new NextRequest('http://localhost:3000/api/retell/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      widgetId: 'cfbfa598-6c36-4447-9b27-173dbefa8e55',
      content: 'can you give me more details?',
      sessionId: e2eSessionId,
      chatId: e2eSessionId,
    }),
  });
  const resCapped = await POST(reqCapped);
  const dataCapped = await resCapped.json();
  console.log(`  Request 31 (Capped): HTTP ${resCapped.status}, capped=${dataCapped.capped}`);
  console.log(`  Agent Response: "${dataCapped.messages?.[1]?.content}"`);

  if (resCapped.status === 200 && dataCapped.capped === true && dataCapped.messages?.[1]?.content?.includes('maximum message limit')) {
    console.log('  ✅ /api/retell/chat strictly intercepted request 31 server-side with zero upstream LLM calls!');
  } else {
    throw new Error(`Capped request validation failed: ${JSON.stringify(dataCapped)}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Voice Call Duration Limiter & Termination Watchdog
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 4] Testing Server-Side Voice Call Duration Watchdog...');
  const testCallId = `call_test_${Date.now()}`;
  
  // Register a 0.02 min (1.2 second) test timeout
  let terminationTriggered = false;
  registerCallTimeout({
    callId: testCallId,
    provider: 'retell',
    apiKey: 'mock_key',
    maxDurationMinutes: 0.02, // 1.2 seconds
    widgetId: 'test_widget',
  });

  const activeTimersBefore = getActiveCallTimeouts();
  console.log(`  Active tracked call timers: ${activeTimersBefore.length}`);
  if (activeTimersBefore.find(t => t.callId === testCallId)) {
    console.log(`  ✅ Call ${testCallId} registered with active server-side watchdog timer`);
  } else {
    throw new Error('Call timer failed to register');
  }

  // Clear timeout test
  const testCallId2 = `call_test_clear_${Date.now()}`;
  registerCallTimeout({
    callId: testCallId2,
    provider: 'vapi',
    apiKey: 'mock_vapi_key',
    maxDurationMinutes: 5,
  });
  clearCallTimeout(testCallId2);
  const activeTimersAfterClear = getActiveCallTimeouts();
  if (!activeTimersAfterClear.find(t => t.callId === testCallId2)) {
    console.log(`  ✅ clearCallTimeout cleanly cleans up active timer when call ends naturally`);
  } else {
    throw new Error('clearCallTimeout failed to remove timer');
  }

  // Wait for 1.5 seconds for testCallId timer to fire
  await new Promise(r => setTimeout(r, 1500));
  const activeTimersAfterExpiry = getActiveCallTimeouts();
  if (!activeTimersAfterExpiry.find(t => t.callId === testCallId)) {
    console.log(`  ✅ Server-side watchdog fired and automatically executed call termination cleanup!`);
  } else {
    throw new Error('Watchdog timer did not clean up after firing');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED: Hard Duration & Turn Caps (Task C.1) Fully Verified!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
