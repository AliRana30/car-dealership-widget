import { NextRequest, NextResponse } from 'next/server';
import { notifyUserSpeechDetected, clearCallTimeout } from '@/lib/voice/callLimiter';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId, callId, event, errorDetails } = body;

    // Validate request inputs strictly
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 });
    }
    if (!callId || typeof callId !== 'string') {
      return NextResponse.json({ error: 'invalid_call_id' }, { status: 400 });
    }
    
    const validEvents = ['call_start', 'call_end', 'call_error', 'user_speech_detected', 'initial_silence_timeout'];
    if (!event || !validEvents.includes(event)) {
      return NextResponse.json({ error: 'invalid_event' }, { status: 400 });
    }

    if (event === 'user_speech_detected') {
      notifyUserSpeechDetected(callId);
    } else if (event === 'call_end') {
      clearCallTimeout(callId);
    }

    // Prepare a structured, privacy-safe observability record
    const logPayload = {
      timestamp: new Date().toISOString(),
      sessionId,
      callId,
      event,
      ...(event === 'call_error' ? { errorDetails: errorDetails ? String(errorDetails).substring(0, 300) : 'unknown_error' } : {})
    };

    // Output structured log to stdout for server indexing
    console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify(logPayload)}`);

    return NextResponse.json({ success: true, event }, { status: 200 });
  } catch (err) {
    console.error('[retell/log] Telemetry logging failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
