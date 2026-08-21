import {
  registerCallTimeout,
  clearCallTimeout,
  notifyUserSpeechDetected,
  getActiveCallTimeouts,
  DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS,
} from '../src/lib/voice/callLimiter';
import { defaultVoiceWidgetConfig, toConfigurationRecord, fromConfigurationRecord } from '../src/config/voiceWidget/default';
import { POST as logPost } from '../src/app/api/retell/log/route';
import { NextRequest } from 'next/server';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TEST SUITE: Silence-Based Auto-Hangup (Task C.2)');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────
  // TEST 1: Default Constants & Widget Config Roundtrip
  // ─────────────────────────────────────────────────────────────────
  console.log('👉 [TEST 1] Verifying Default Tunable Constant & Config Serialization...');
  
  if (DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS === 15) {
    console.log(`  ✅ DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS is configured as a constant: ${DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS}s`);
  } else {
    throw new Error(`Expected DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS to be 15, got ${DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS}`);
  }

  if (defaultVoiceWidgetConfig.behavior.initialSilenceTimeoutSeconds === 15) {
    console.log('  ✅ defaultVoiceWidgetConfig.behavior.initialSilenceTimeoutSeconds = 15s');
  } else {
    throw new Error(`Expected default config initialSilenceTimeoutSeconds 15, got ${defaultVoiceWidgetConfig.behavior.initialSilenceTimeoutSeconds}`);
  }

  // Serialization test
  const customConfig = {
    ...defaultVoiceWidgetConfig,
    behavior: {
      ...defaultVoiceWidgetConfig.behavior,
      initialSilenceTimeoutSeconds: 12,
    },
  };
  const record = toConfigurationRecord(customConfig);
  if (record.behavior.initialSilenceTimeoutSeconds === 12) {
    console.log('  ✅ toConfigurationRecord preserves custom initialSilenceTimeoutSeconds (12s)');
  } else {
    throw new Error('toConfigurationRecord failed to serialize initialSilenceTimeoutSeconds');
  }

  const restored = fromConfigurationRecord(record);
  if (restored.behavior.initialSilenceTimeoutSeconds === 12) {
    console.log('  ✅ fromConfigurationRecord restores custom initialSilenceTimeoutSeconds from database record');
  } else {
    throw new Error('fromConfigurationRecord failed to deserialize initialSilenceTimeoutSeconds');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 2: Silent Caller Auto-Hangup (Simulated Silent Call)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 2] Verifying Silent Caller Auto-Hangup (Full Timeout Expiry)...');
  const silentCallId = `silent_call_${Date.now()}`;
  
  // Register call with 1.2 second silence timeout for test
  registerCallTimeout({
    callId: silentCallId,
    provider: 'retell',
    apiKey: 'mock_retell_key',
    maxDurationMinutes: 10,
    initialSilenceTimeoutSeconds: 1.2, // 1.2s timeout
    widgetId: 'test_widget',
  });

  const activeBefore = getActiveCallTimeouts();
  const trackedSilent = activeBefore.find(c => c.callId === silentCallId);
  if (!trackedSilent || !trackedSilent.hasSilenceTimer) {
    throw new Error('Silent call failed to register initial silence watchdog timer');
  }
  console.log(`  ✅ Silent call ${silentCallId} registered with active silence watchdog timer`);

  // Wait 1.5 seconds without speaking
  console.log('  ⏳ Waiting for silence timeout window (1.2s) to elapse with 0 speech activity...');
  await new Promise(r => setTimeout(r, 1500));

  const activeAfter = getActiveCallTimeouts();
  const trackedAfter = activeAfter.find(c => c.callId === silentCallId);
  if (!trackedAfter) {
    console.log('  ✅ Call was automatically terminated server-side due to initial silence!');
  } else {
    throw new Error('Call was not terminated after initial silence timeout expired');
  }

  // ─────────────────────────────────────────────────────────────────
  // TEST 3: Normal Conversational Flow (Caller Speaks -> Watchdog Disarmed)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 3] Verifying Normal Conversational Flow (Speech Detected & Natural Pauses Unaffected)...');
  const normalCallId = `normal_call_${Date.now()}`;

  registerCallTimeout({
    callId: normalCallId,
    provider: 'retell',
    apiKey: 'mock_retell_key',
    maxDurationMinutes: 10,
    initialSilenceTimeoutSeconds: 1.5,
    widgetId: 'test_widget',
  });

  // Caller speaks after 400ms
  await new Promise(r => setTimeout(r, 400));
  console.log('  🗣️ Caller speaks: notifying server of speech detection...');
  const speechDetected = notifyUserSpeechDetected(normalCallId);
  if (!speechDetected) throw new Error('notifyUserSpeechDetected failed to locate active call');

  const activeDuring = getActiveCallTimeouts();
  const normalTracked = activeDuring.find(c => c.callId === normalCallId);
  if (normalTracked?.hasUserSpoken === true && normalTracked.hasSilenceTimer === false) {
    console.log('  ✅ Initial silence watchdog was permanently disarmed upon first speech detection');
  } else {
    throw new Error(`Watchdog not disarmed properly: ${JSON.stringify(normalTracked)}`);
  }

  // Simulate long natural conversational pauses past original 1.5s window
  console.log('  ⏳ Simulating a natural 2.0s conversational pause (past original 1.5s silence window)...');
  await new Promise(r => setTimeout(r, 2000));

  const activeAfterPause = getActiveCallTimeouts();
  const normalStillActive = activeAfterPause.find(c => c.callId === normalCallId);
  if (normalStillActive && normalStillActive.hasUserSpoken) {
    console.log('  ✅ Call remained alive and unaffected during natural pauses!');
  } else {
    throw new Error('Normal call was erroneously terminated during natural conversational pause');
  }

  // Clean up normal call
  clearCallTimeout(normalCallId);
  console.log('  ✅ Cleaned up normal call');

  // ─────────────────────────────────────────────────────────────────
  // TEST 4: Telemetry & Log Route Event Integration (/api/retell/log)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n👉 [TEST 4] Testing /api/retell/log Event Endpoint Signal Dispatching...');
  const eventCallId = `event_call_${Date.now()}`;
  const eventSessionId = `session_${Date.now()}`;

  registerCallTimeout({
    callId: eventCallId,
    provider: 'retell',
    apiKey: 'mock_key',
    maxDurationMinutes: 10,
    initialSilenceTimeoutSeconds: 3,
  });

  // Send user_speech_detected telemetry event
  const reqSpeech = new NextRequest('http://localhost:3000/api/retell/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: eventSessionId,
      callId: eventCallId,
      event: 'user_speech_detected',
    }),
  });
  const resSpeech = await logPost(reqSpeech);
  const dataSpeech = await resSpeech.json();
  if (resSpeech.status !== 200 || !dataSpeech.success) {
    throw new Error(`Failed to send user_speech_detected: ${JSON.stringify(dataSpeech)}`);
  }

  const activeEventCall = getActiveCallTimeouts().find(c => c.callId === eventCallId);
  if (activeEventCall?.hasUserSpoken && !activeEventCall.hasSilenceTimer) {
    console.log('  ✅ /api/retell/log user_speech_detected event correctly disarmed server-side silence timer!');
  } else {
    throw new Error('user_speech_detected event did not update server call state');
  }

  clearCallTimeout(eventCallId);

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED: Silence-Based Auto-Hangup (Task C.2) Fully Verified!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
