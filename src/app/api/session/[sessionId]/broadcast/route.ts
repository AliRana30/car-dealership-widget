import { NextRequest, NextResponse } from 'next/server';
import { broadcastToSession } from '@/lib/realtime/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: any }) {
  try {
    const resolvedParams = params && typeof params.then === 'function' ? await params : params;
    const sessionId = resolvedParams?.sessionId || '';

    if (!sessionId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Missing required parameter: sessionId' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { event = 'navigate', payload = {} } = body;

    const result = await broadcastToSession(sessionId, event, payload);

    if (!result.success) {
      return NextResponse.json(
        { error: 'broadcast_failed', message: result.error || 'Failed to broadcast event' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      sessionId,
      channel: result.channel,
      event,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    console.error('[api/session/broadcast] Error:', err);
    return NextResponse.json(
      { error: 'server_error', message: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
