import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// In-memory store for session conversation history (persists across page navigations within server process)
interface SessionHistoryRecord {
  sessionId: string;
  chatMessages: any[];
  transcript: any[];
  updatedAt: number;
}

const sessionHistoryStore = new Map<string, SessionHistoryRecord>();

export async function GET(req: NextRequest, { params }: { params: any }) {
  try {
    const resolvedParams = params && typeof params.then === 'function' ? await params : params;
    const sessionId = resolvedParams?.sessionId || '';

    if (!sessionId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing sessionId' }, { status: 400 });
    }

    const record = sessionHistoryStore.get(sessionId);
    if (!record) {
      return NextResponse.json({
        sessionId,
        messages: [],
        transcript: [],
        found: false,
      });
    }

    return NextResponse.json({
      sessionId,
      messages: record.chatMessages || [],
      transcript: record.transcript || [],
      updatedAt: record.updatedAt,
      found: true,
    });
  } catch (err: any) {
    console.error('[session/history] GET Error:', err);
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: any }) {
  try {
    const resolvedParams = params && typeof params.then === 'function' ? await params : params;
    const sessionId = resolvedParams?.sessionId || '';

    if (!sessionId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing sessionId' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { chatMessages = [], transcript = [] } = body;

    const record: SessionHistoryRecord = {
      sessionId,
      chatMessages: Array.isArray(chatMessages) ? chatMessages : [],
      transcript: Array.isArray(transcript) ? transcript : [],
      updatedAt: Date.now(),
    };

    sessionHistoryStore.set(sessionId, record);

    return NextResponse.json({
      success: true,
      sessionId,
      messageCount: record.chatMessages.length,
      transcriptCount: record.transcript.length,
    });
  } catch (err: any) {
    console.error('[session/history] POST Error:', err);
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500 });
  }
}
