import {
  checkAndIncrementUsage,
  getWidgetUsageStatus,
  resetWidgetDailyUsage,
  getUtcDateStr,
  DEFAULT_MAX_DAILY_CALLS,
  DEFAULT_MAX_DAILY_CHATS,
} from '../src/lib/usage/spendLimiter';
import { defaultVoiceWidgetConfig, toConfigurationRecord, fromConfigurationRecord } from '../src/config/voiceWidget/default';
import { POST as chatPost } from '../src/app/api/retell/chat/route';
import { POST as retellCallPost } from '../src/app/api/retell/create-web-call/route';
import { NextRequest } from 'next/server';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST SUITE: Per-Widget Spend Cap with Circuit Breaker (Task C.3)');
  console.log('================================================================\n');

  const today = getUtcDateStr();
  const tomorrow = getUtcDateStr(new Date(Date.now() + 86400000));
  const testWidgetId = `spend_test_widget_${Date.now()}`;

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Default Ceilings & Configuration Roundtrip
  // ─────────────────────────────────────────────────────────────────
  console.log('👉 [TEST 1] Verifying Default Quotas and Config Roundtrip...');
  
  if (DEFAULT_MAX_DAILY_CALLS === 100 && DEFAULT_MAX_DAILY_CHATS === 500) {
    console.log(`  ✅ Global constants: DEFAULT_MAX_DAILY_CALLS = ${DEFAULT_MAX_DAILY_CALLS}, DEFAULT_MAX_DAILY_CHATS = ${DEFAULT_MAX_DAILY_CHATS}`);
  } else {
    throw new Error('Default daily constants mismatch');
  }

  if (defaultVoiceWidgetConfig.behavior.maxDailyCalls === 100 && defaultVoiceWidgetConfig.behavior.maxDailyChats === 500) {
    console.log('  ✅ defaultVoiceWidgetConfig behavior has maxDailyCalls: 100, maxDailyChats: 500');
  } else {
    throw new Error('defaultVoiceWidgetConfig missing spend limits');
  }

  const customCfg = {
    ...defaultVoiceWidgetConfig,
    behavior: {
      ...defaultVoiceWidgetConfig.behavior,
      maxDailyCalls: 25,
      maxDailyChats: 150,
    },
  };
  const record = toConfigurationRecord(customCfg);
  const restored = fromConfigurationRecord(record);
  if (restored.behavior.maxDailyCalls === 25 && restored.behavior.maxDailyChats === 150) {
    console.log('  ✅ Custom daily quotas correctly serialized to and deserialized from database record');
  } else {
    throw new Error('Database config serialization roundtrip failed');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Voice Call Quota Enforcement & Circuit Breaker Trip
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 2] Verifying Daily Voice Call Quota & Circuit Breaker Trip...');
  const smallCallLimit = 3;

  for (let i = 1; i <= smallCallLimit; i++) {
    const res = await checkAndIncrementUsage(testWidgetId, 'call', { maxDailyCalls: smallCallLimit, maxDailyChats: 100 }, today);
    if (!res.allowed || res.currentCount !== i) {
      throw new Error(`Call ${i} should have been allowed, got: ${JSON.stringify(res)}`);
    }
    console.log(`  Call ${i}/${smallCallLimit}: Allowed (currentCount: ${res.currentCount})`);
  }

  // Next call should trip circuit breaker
  const overCallRes = await checkAndIncrementUsage(testWidgetId, 'call', { maxDailyCalls: smallCallLimit, maxDailyChats: 100 }, today);
  if (!overCallRes.allowed && overCallRes.isCircuitBreakerTripped) {
    console.log('  ✅ Call 4 was BLOCKED: Circuit breaker tripped!');
    console.log(`  Fallback Message: "${overCallRes.reason}"`);
  } else {
    throw new Error(`Expected call 4 to be blocked by circuit breaker, got: ${JSON.stringify(overCallRes)}`);
  }

  // Verify that once circuit breaker is tripped, chats are ALSO blocked
  const chatAfterTrip = await checkAndIncrementUsage(testWidgetId, 'chat', { maxDailyCalls: smallCallLimit, maxDailyChats: 100 }, today);
  if (!chatAfterTrip.allowed && chatAfterTrip.isCircuitBreakerTripped) {
    console.log('  ✅ Subsequent chats are also blocked while circuit breaker is tripped');
  } else {
    throw new Error('Chats should be blocked when widget circuit breaker is tripped');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Automatic Date Partition Rollover (Next Day Auto-Reset)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 3] Verifying Automatic Date Partition Rollover (Next Day Reset)...');
  console.log(`  Today (${today}): Circuit Breaker is active.`);
  console.log(`  Simulating request arriving tomorrow (${tomorrow})...`);

  const nextDayCall = await checkAndIncrementUsage(testWidgetId, 'call', { maxDailyCalls: smallCallLimit, maxDailyChats: 100 }, tomorrow);
  if (nextDayCall.allowed && nextDayCall.currentCount === 1 && !nextDayCall.isCircuitBreakerTripped) {
    console.log(`  ✅ Next day (${tomorrow}) call allowed immediately with 0 manual intervention! Count: ${nextDayCall.currentCount}/${smallCallLimit}`);
  } else {
    throw new Error(`Next day rollover failed: ${JSON.stringify(nextDayCall)}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Fail-Safe Operation (Fail-Open on Unexpected Errors)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 4] Verifying Fail-Safe Mechanism (Fail-Open)...');
  
  // Pass an invalid object that would trigger unexpected behavior if unhandled
  const failSafeRes = await checkAndIncrementUsage(null as any, 'call', undefined, today);
  if (failSafeRes.allowed) {
    console.log('  ✅ Fail-safe activated: Exception was caught and request was allowed without outage');
  } else {
    throw new Error('Fail-safe failed: should fail open');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 5: Chat API Route End-to-End Circuit Breaker Trip
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 5] Testing /api/retell/chat End-to-End Circuit Breaker Interception...');
  const chatWidgetId = 'default';

  // Explicitly trip the circuit breaker for 'default'
  await checkAndIncrementUsage(chatWidgetId, 'chat', { maxDailyCalls: 50, maxDailyChats: 1 }, today);
  await checkAndIncrementUsage(chatWidgetId, 'chat', { maxDailyCalls: 50, maxDailyChats: 1 }, today); // Trips breaker

  const reqCapped = new NextRequest('http://localhost:3000/api/retell/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      widgetId: chatWidgetId,
      content: 'Can I book a session?',
      sessionId: `session_${Date.now()}`,
    }),
  });

  const resCapped = await chatPost(reqCapped);
  const dataCapped = await resCapped.json();

  if (resCapped.status === 200 && dataCapped.isCircuitBreakerTripped && dataCapped.dailyUsageExceeded) {
    console.log('  ✅ /api/retell/chat returned HTTP 200 with circuit breaker fallback:');
    console.log(`  Agent Response: "${dataCapped.messages[1]?.content}"`);
  } else {
    throw new Error(`Chat API did not return circuit breaker fallback: ${JSON.stringify(dataCapped)}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 6: Dashboard Usage Status & Indicator
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 6] Testing Dashboard Usage Status Resolution...');
  const status = getWidgetUsageStatus(testWidgetId, { maxDailyCalls: smallCallLimit, maxDailyChats: 100 }, today);
  if (status.isCircuitBreakerTripped && status.calls === 3) {
    console.log('  ✅ getWidgetUsageStatus accurately reflects tripped state and counts:');
    console.log(`     calls: ${status.calls}/${status.maxDailyCalls}, chats: ${status.chats}/${status.maxDailyChats}, isCircuitBreakerTripped: ${status.isCircuitBreakerTripped}`);
  } else {
    throw new Error(`Status resolution incorrect: ${JSON.stringify(status)}`);
  }

  // Cleanup
  resetWidgetDailyUsage(testWidgetId, today);
  resetWidgetDailyUsage(testWidgetId, tomorrow);
  resetWidgetDailyUsage(chatWidgetId, today);

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED: Spend Cap with Circuit Breaker (Task C.3) Fully Verified!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
