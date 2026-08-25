import Retell from 'retell-sdk';

export const DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS = 15;

export interface CallTimeoutParams {
  callId: string;
  provider: 'retell' | 'vapi';
  apiKey: string;
  maxDurationMinutes?: number;
  initialSilenceTimeoutSeconds?: number;
  widgetId?: string;
}

interface ActiveCallRecord {
  callId: string;
  provider: 'retell' | 'vapi';
  apiKey: string;
  startedAt: number;
  maxDurationMs: number;
  timer: NodeJS.Timeout;
  silenceTimer?: NodeJS.Timeout;
  hasUserSpoken: boolean;
}

// In-memory active call timer registry
const activeCallTimers = new Map<string, ActiveCallRecord>();

/**
 * Terminate a call server-side via Retell or Vapi provider API.
 */
export async function endCallServerSide(
  callId: string,
  provider: 'retell' | 'vapi',
  apiKey: string,
  reason = 'manual'
): Promise<boolean> {
  try {
    if (provider === 'retell') {
      const client = new Retell({ apiKey });
      await client.call.stop(callId);
      console.log(`[SERVER_CALL_CAP] Successfully stopped Retell call ${callId} server-side (reason: ${reason}).`);
      return true;
    } else if (provider === 'vapi') {
      const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        console.log(`[SERVER_CALL_CAP] Successfully stopped Vapi call ${callId} server-side (reason: ${reason}).`);
        return true;
      }
      console.warn(`[SERVER_CALL_CAP] Vapi delete call ${callId} returned status ${res.status}`);
      return false;
    }
    return false;
  } catch (err: any) {
    console.error(`[SERVER_CALL_CAP] Failed to terminate call ${callId} server-side:`, err.message || err);
    return false;
  }
}

/**
 * Register a server-side termination timer and initial silence watchdog for an active call.
 */
export function registerCallTimeout(params: CallTimeoutParams): void {
  const {
    callId,
    provider,
    apiKey,
    maxDurationMinutes = 10,
    initialSilenceTimeoutSeconds = DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS,
    widgetId,
  } = params;
  if (!callId || !apiKey) return;

  // Clear any existing timer for this call ID
  clearCallTimeout(callId);

  const maxDurationMs = Math.max(0.01, maxDurationMinutes) * 60 * 1000;
  // If silence timeout is > 0, set silence auto-hangup watchdog (default 15s)
  const effectiveSilenceSeconds = initialSilenceTimeoutSeconds > 0 ? initialSilenceTimeoutSeconds : DEFAULT_INITIAL_SILENCE_TIMEOUT_SECONDS;
  const silenceTimeoutMs = effectiveSilenceSeconds * 1000;

  // 1. Hard max duration watchdog
  const timer = setTimeout(async () => {
    activeCallTimers.delete(callId);
    console.log(`[SERVER_CALL_CAP] Max duration of ${maxDurationMinutes}m reached for call ${callId} (widget: ${widgetId || 'default'}). Terminating call server-side.`);
    await endCallServerSide(callId, provider, apiKey, 'max_duration_cap');
  }, maxDurationMs);

  // 2. Initial silence watchdog: Ends call if caller never speaks in the first window
  let silenceTimer: NodeJS.Timeout | undefined;
  if (silenceTimeoutMs > 0) {
    silenceTimer = setTimeout(async () => {
      const record = activeCallTimers.get(callId);
      if (record && !record.hasUserSpoken) {
        console.log(`[SILENCE_AUTO_HANGUP] No user speech detected within ${effectiveSilenceSeconds}s initial window for call ${callId} (widget: ${widgetId || 'default'}). Ending call server-side.`);
        activeCallTimers.delete(callId);
        await endCallServerSide(callId, provider, apiKey, 'initial_silence_timeout');
      }
    }, silenceTimeoutMs);
  }

  // Store record
  activeCallTimers.set(callId, {
    callId,
    provider,
    apiKey,
    startedAt: Date.now(),
    maxDurationMs,
    timer,
    silenceTimer,
    hasUserSpoken: false,
  });

  console.log(`[SERVER_CALL_CAP] Registered ${maxDurationMinutes}m max duration & ${initialSilenceTimeoutSeconds}s initial silence watchdog for call ${callId} (provider: ${provider}).`);
}

/**
 * Mark that the caller has spoken. Permanently cancels the initial silence watchdog
 * so natural conversational pauses are never interrupted.
 */
export function notifyUserSpeechDetected(callId: string): boolean {
  const record = activeCallTimers.get(callId);
  if (record) {
    if (!record.hasUserSpoken) {
      record.hasUserSpoken = true;
      if (record.silenceTimer) {
        clearTimeout(record.silenceTimer);
        record.silenceTimer = undefined;
      }
      console.log(`[SILENCE_AUTO_HANGUP] User speech detected for call ${callId}. Initial silence watchdog permanently disarmed.`);
    }
    return true;
  }
  return false;
}

/**
 * Clear all server-side timeouts when a call ends naturally or via client.
 */
export function clearCallTimeout(callId: string): void {
  const existing = activeCallTimers.get(callId);
  if (existing) {
    clearTimeout(existing.timer);
    if (existing.silenceTimer) {
      clearTimeout(existing.silenceTimer);
    }
    activeCallTimers.delete(callId);
    console.log(`[SERVER_CALL_CAP] Cleared all timeouts for call ${callId}.`);
  }
}

/**
 * Return currently tracked call timers (for observability and testing).
 */
export function getActiveCallTimeouts(): Array<{
  callId: string;
  provider: string;
  startedAt: number;
  maxDurationMs: number;
  hasUserSpoken: boolean;
  hasSilenceTimer: boolean;
}> {
  return Array.from(activeCallTimers.values()).map(r => ({
    callId: r.callId,
    provider: r.provider,
    startedAt: r.startedAt,
    maxDurationMs: r.maxDurationMs,
    hasUserSpoken: r.hasUserSpoken,
    hasSilenceTimer: !!r.silenceTimer,
  }));
}
