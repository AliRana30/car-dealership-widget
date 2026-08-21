import {
  checkSessionChatRateLimit,
  checkDuplicateMessage,
  validateMessageLength,
  resetChatTurns,
  DEFAULT_CHAT_RATE_LIMIT_PER_MINUTE,
  DEFAULT_DUPLICATE_REPEAT_THRESHOLD,
  DEFAULT_MAX_MESSAGE_CHARACTERS,
  STATIC_DUPLICATE_THROTTLE_REPLY,
  STATIC_RATE_LIMIT_REPLY,
} from '../src/lib/chat/chatLimiter';
import { defaultVoiceWidgetConfig, toConfigurationRecord, fromConfigurationRecord } from '../src/config/voiceWidget/default';
import { POST as chatPost } from '../src/app/api/retell/chat/route';
import { NextRequest } from 'next/server';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST SUITE: Session-Based Chat Rate Limiting & Throttling (Task C.4)');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Config Defaults & Serialization Roundtrip
  // ─────────────────────────────────────────────────────────────────
  console.log('👉 [TEST 1] Verifying C.4 Config Constants & Serialization...');
  
  if (DEFAULT_CHAT_RATE_LIMIT_PER_MINUTE === 15 && DEFAULT_MAX_MESSAGE_CHARACTERS === 1000) {
    console.log(`  ✅ Default constants: Rate Limit = ${DEFAULT_CHAT_RATE_LIMIT_PER_MINUTE} msg/min, Max Chars = ${DEFAULT_MAX_MESSAGE_CHARACTERS}, Repeat Threshold = ${DEFAULT_DUPLICATE_REPEAT_THRESHOLD}`);
  } else {
    throw new Error('Default constants mismatch');
  }

  if (defaultVoiceWidgetConfig.behavior.chatRateLimitPerMinute === 15 && defaultVoiceWidgetConfig.behavior.maxMessageCharacters === 1000) {
    console.log('  ✅ defaultVoiceWidgetConfig has chatRateLimitPerMinute: 15, maxMessageCharacters: 1000');
  } else {
    throw new Error('defaultVoiceWidgetConfig missing C.4 fields');
  }

  const customCfg = {
    ...defaultVoiceWidgetConfig,
    behavior: {
      ...defaultVoiceWidgetConfig.behavior,
      chatRateLimitPerMinute: 20,
      maxMessageCharacters: 1500,
    },
  };
  const record = toConfigurationRecord(customCfg);
  const restored = fromConfigurationRecord(record);
  if (restored.behavior.chatRateLimitPerMinute === 20 && restored.behavior.maxMessageCharacters === 1500) {
    console.log('  ✅ Custom rate limit (20 msg/min) and max chars (1500) serialized & deserialized accurately');
  } else {
    throw new Error('Database config roundtrip failed');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Message Length Validation & Oversized Input Rejection
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 2] Testing Message Length Validation & Rejection...');
  
  const normalMsg = 'Hello, what services do you offer?';
  const validRes = validateMessageLength(normalMsg, 1000);
  if (validRes.valid && validRes.sanitized === normalMsg) {
    console.log('  ✅ Normal message under 1000 characters passes validation');
  } else {
    throw new Error('Valid message was rejected');
  }

  const giantMsg = 'A'.repeat(1050);
  const invalidRes = validateMessageLength(giantMsg, 1000);
  if (!invalidRes.valid && invalidRes.error?.includes('1,000 characters')) {
    console.log('  ✅ Oversized message (1,050 chars) was rejected with length error message');
  } else {
    throw new Error('Oversized message was not rejected');
  }

  // Test via /api/retell/chat route
  const reqOversized = new NextRequest('http://localhost:3000/api/retell/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      widgetId: 'default',
      content: 'B'.repeat(1200),
      sessionId: `session_len_${Date.now()}`,
    }),
  });
  const resOversized = await chatPost(reqOversized);
  if (resOversized.status === 400) {
    const errData = await resOversized.json();
    console.log(`  ✅ /api/retell/chat rejected oversized payload with HTTP 400: "${errData.message}"`);
  } else {
    throw new Error(`Expected HTTP 400 for oversized payload, got ${resOversized.status}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Session-Scoped Sliding Window Rate Limiting
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 3] Testing Session-Scoped Sliding Window Rate Limiting...');
  const rateSessionKey = `test_rate_session_${Date.now()}`;
  const testRateLimit = 3; // 3 msg/min limit for test

  // First 3 messages should succeed
  for (let i = 1; i <= testRateLimit; i++) {
    const check = checkSessionChatRateLimit(rateSessionKey, testRateLimit);
    if (!check.allowed || check.currentWindowCount !== i) {
      throw new Error(`Message ${i} should be allowed`);
    }
    console.log(`  Message ${i}/${testRateLimit} in current minute: Allowed`);
  }

  // 4th message should be throttled
  const throttledCheck = checkSessionChatRateLimit(rateSessionKey, testRateLimit);
  if (!throttledCheck.allowed && throttledCheck.message === STATIC_RATE_LIMIT_REPLY) {
    console.log(`  ✅ Message 4 throttled! Retry after: ${throttledCheck.retryAfterSeconds}s`);
    console.log(`  Reply: "${throttledCheck.message}"`);
  } else {
    throw new Error('4th message was not rate-limited');
  }

  // Verify independent session is unaffected (session-level isolation)
  const anotherSessionKey = `another_session_${Date.now()}`;
  const independentCheck = checkSessionChatRateLimit(anotherSessionKey, testRateLimit);
  if (independentCheck.allowed && independentCheck.currentWindowCount === 1) {
    console.log('  ✅ Independent session is unaffected by another session\'s throttling');
  } else {
    throw new Error('Independent session was erroneously throttled');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Duplicate-Message Throttling (Static Fallback Reply)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 4] Testing Duplicate-Message Throttling (Repeated Queries)...');
  const dupSessionKey = `test_dup_session_${Date.now()}`;
  const repeatText = 'What are your hours of operation?';

  // 1st time: distinct message -> not throttled
  const dup1 = checkDuplicateMessage(dupSessionKey, repeatText, 2);
  if (!dup1.isDuplicateThrottled && dup1.duplicateCount === 1) {
    console.log('  Send 1: Distinct message -> generates fresh response (count: 1)');
  } else {
    throw new Error(`Send 1 failed: ${JSON.stringify(dup1)}`);
  }

  // 2nd time: duplicate repeat -> hits threshold (2) -> throttled with static reply
  const dup2 = checkDuplicateMessage(dupSessionKey, repeatText, 2);
  if (dup2.isDuplicateThrottled && dup2.message === STATIC_DUPLICATE_THROTTLE_REPLY) {
    console.log('  Send 2: Identical message repeat -> THROTTLED!');
    console.log(`  Static Reply (0 LLM compute): "${dup2.message}"`);
  } else {
    throw new Error(`Send 2 was not throttled: ${JSON.stringify(dup2)}`);
  }

  // 3rd time: consecutive duplicate -> still throttled
  const dup3 = checkDuplicateMessage(dupSessionKey, repeatText, 2);
  if (dup3.isDuplicateThrottled && dup3.duplicateCount === 3) {
    console.log('  Send 3: Consecutively repeated duplicate -> still throttled');
  } else {
    throw new Error(`Send 3 was not throttled: ${JSON.stringify(dup3)}`);
  }

  // 4th time: send a DIFFERENT message -> resets duplicate counter!
  const newMsgText = 'Do you offer online classes?';
  const dupNew = checkDuplicateMessage(dupSessionKey, newMsgText, 2);
  if (!dupNew.isDuplicateThrottled && dupNew.duplicateCount === 1) {
    console.log('  Send 4 (Different Message): Counter reset -> generates fresh response normally');
  } else {
    throw new Error(`Different message was incorrectly throttled: ${JSON.stringify(dupNew)}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: /api/retell/chat End-to-End Duplicate Throttling Interception
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 5] Testing /api/retell/chat End-to-End Duplicate Message Interception...');
  const e2eSessionId = `e2e_dup_${Date.now()}`;
  const e2ePrompt = 'Tell me about the course syllabus.';

  // First request (Passes)
  const req1 = new NextRequest('http://localhost:3000/api/retell/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      widgetId: 'default',
      content: e2ePrompt,
      sessionId: e2eSessionId,
    }),
  });
  const res1 = await chatPost(req1);
  const data1 = await res1.json();
  console.log(`  E2E Request 1: HTTP ${res1.status}, isDuplicateThrottled: ${!!data1.isDuplicateThrottled}`);

  // Second request with exact same content (Should be throttled with static reply)
  const req2 = new NextRequest('http://localhost:3000/api/retell/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      widgetId: 'default',
      content: e2ePrompt,
      sessionId: e2eSessionId,
    }),
  });
  const res2 = await chatPost(req2);
  const data2 = await res2.json();

  if (res2.status === 200 && data2.isDuplicateThrottled && data2.messages[1]?.content === STATIC_DUPLICATE_THROTTLE_REPLY) {
    console.log('  ✅ /api/retell/chat intercepted duplicate repeat server-side:');
    console.log(`  Agent Static Response: "${data2.messages[1]?.content}"`);
  } else {
    throw new Error(`E2E duplicate was not intercepted: ${JSON.stringify(data2)}`);
  }

  // Cleanup
  resetChatTurns(rateSessionKey);
  resetChatTurns(anotherSessionKey);
  resetChatTurns(dupSessionKey);
  resetChatTurns(e2eSessionId);

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED: Session Rate Limiting & Throttling (Task C.4) Fully Verified!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
