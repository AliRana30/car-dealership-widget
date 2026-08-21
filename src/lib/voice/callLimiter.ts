import Retell from 'retell-sdk';

export interface CallTimeoutParams {
  callId: string;
  provider: 'retell' | 'vapi';
  apiKey: string;
  maxDurationMinutes?: number;
  widgetId?: string;
}

interface ActiveCallRecord {
  callId: string;
  provider: 'retell' | 'vapi';
  apiKey: string;
  startedAt: number;
  maxDurationMs: number;
  timer: NodeJS.Timeout;
}

// In-memory active call timer registry
const activeCallTimers = new Map<string, ActiveCallRecord>();

/**
 * Register a server-side termination timer for an active call.
 * When the timer expires, the call is terminated directly via the provider's API.
 */
export function registerCallTimeout(params: CallTimeoutParams): void {
  const { callId, provider, apiKey, maxDurationMinutes = 10, widgetId } = params;
  if (!callId || !apiKey) return;

  // Clear any existing timer for this call ID
  clearCallTimeout(callId);

  const maxDurationMs = Math.max(0.01, maxDurationMinutes) * 60 * 1000;

  const timer = setTimeout(async () => {
    activeCallTimers.delete(callId);
    console.log(`[SERVER_CALL_CAP] Max duration of ${maxDurationMinutes}m reached for call ${callId} (widget: ${widgetId || 'default'}). Terminating call server-side.`);
    
    try {
      if (provider === 'retell') {
        const client = new Retell({ apiKey });
        await client.call.stop(callId);
        console.log(`[SERVER_CALL_CAP] Successfully stopped Retell call ${callId} server-side.`);
      } else if (provider === 'vapi') {
        const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          // Try /stop endpoint fallback
          await fetch(`https://api.vapi.ai/call/${callId}/stop`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          });
        }
        console.log(`[SERVER_CALL_CAP] Successfully terminated Vapi call ${callId} server-side.`);
      }
    } catch (err: any) {
      console.error(`[SERVER_CALL_CAP] Failed to terminate call ${callId} server-side:`, err?.message || err);
    }
  }, maxDurationMs);

  // Store record
  activeCallTimers.set(callId, {
    callId,
    provider,
    apiKey,
    startedAt: Date.now(),
    maxDurationMs,
    timer,
  });

  console.log(`[SERVER_CALL_CAP] Registered ${maxDurationMinutes}m timeout for call ${callId} (provider: ${provider}).`);
}

/**
 * Clear the server-side timeout when a call ends naturally or via client.
 */
export function clearCallTimeout(callId: string): void {
  const existing = activeCallTimers.get(callId);
  if (existing) {
    clearTimeout(existing.timer);
    activeCallTimers.delete(callId);
    console.log(`[SERVER_CALL_CAP] Cleared timeout for call ${callId}.`);
  }
}

/**
 * Return currently tracked call timers (for observability and testing).
 */
export function getActiveCallTimeouts(): Array<{ callId: string; provider: string; startedAt: number; maxDurationMs: number }> {
  return Array.from(activeCallTimers.values()).map(r => ({
    callId: r.callId,
    provider: r.provider,
    startedAt: r.startedAt,
    maxDurationMs: r.maxDurationMs,
  }));
}
