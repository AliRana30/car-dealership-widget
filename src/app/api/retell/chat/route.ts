/**
 * POST /api/retell/chat
 *
 * Server-side route handler for text-based chat. Calls the Retell API to create/continue
 * a chat session and send chat completions.
 *
 * Security:
 *  - RETELL_API_KEY stays server-side — never sent to the browser.
 *  - In-memory per-IP rate limiter (15 req / 60 s window).
 *  - Returns clean JSON errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import Retell from 'retell-sdk';
import { getWidget } from '@/config/widgetsDb';

function maskIp(ip: string): string {
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.x.x`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts[0]}:${parts[1]}:x::x`;
  }
  return 'unknown';
}

// (getEnv removed to support dynamic record-based keys)

// ─── In-memory rate limiter ─────────────────────────────────────────────────

const RATE_WINDOW_MS = 60_000;   // 1 minute
const RATE_MAX_CALLS = 15;       // per IP per window

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }

  bucket.count += 1;
  return bucket.count <= RATE_MAX_CALLS;
}

// Prune stale entries periodically
let lastPrune = 0;
function maybePrune() {
  const now = Date.now();
  if (now - lastPrune < 5 * 60_000) return;
  lastPrune = now;
  for (const [ip, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt) rateBuckets.delete(ip);
  }
}

// ─── CORS helpers ───────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = (() => {
  const raw = process.env.ALLOWED_ORIGINS ?? '';
  return raw
    ? raw.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:3001'];
})();

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || process.env.NODE_ENV === 'development')
      ? origin
      : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ─── Preflight handler ──────────────────────────────────────────────────────

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  // ── Rate limit ────────────────────────────────────────────────────────────
  maybePrune();
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'chat_rate_limit_failure',
      ip: maskIp(ip)
    })}`);
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { chatId?: string | null; content?: string; widgetId?: string } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Request body must be valid JSON.' },
      { status: 400, headers }
    );
  }

  const { content, widgetId } = body;
  let { chatId } = body;

  if (!content || typeof content !== 'string' || content.trim() === '') {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Content field is required and must be a non-empty string.' },
      { status: 400, headers }
    );
  }

  // ── Retrieve Widget Credentials ───────────────────────────────────────────
  const targetId = widgetId || 'default';
  const widget = await getWidget(targetId);
  if (!widget) {
    return NextResponse.json(
      { error: 'not_found', message: `Widget with ID '${targetId}' not found.` },
      { status: 404, headers }
    );
  }

  if (widget.provider !== 'retell') {
    return NextResponse.json(
      { error: 'misconfigured', message: 'Text chat is only supported on Retell provider widgets.' },
      { status: 400, headers }
    );
  }

  const apiKey = (widget.retellApiKey || '').trim();
  const agentId = (widget.agentId || '').trim();
  // Check if a specific chat agent has been configured in the config overrides, or fallback to main agentId
  const chatAgentId = (widget.config?.behavior as any)?.chatAgentId || undefined;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: 'misconfigured', message: 'Retell credentials or Agent ID are not configured for this widget.' },
      { status: 503, headers }
    );
  }

  // ── Initialize Retell SDK Client ──────────────────────────────────────────
  const client = new Retell({ apiKey });

  try {
    // Resolve chatAgentId dynamically if not configured explicitly
    let finalChatAgentId = chatAgentId;
    if (!finalChatAgentId) {
      try {
        const chatAgents = await client.chatAgent.list();
        const found = chatAgents.items?.find((a: any) => a.channel === 'chat');
        if (found) {
          finalChatAgentId = found.agent_id;
        } else {
          const voiceAgent = await client.agent.retrieve(agentId);
          const responseEngine = voiceAgent.response_engine as any;
          const llmId = responseEngine?.llm_id;
          if (!llmId) {
            throw new Error('Voice agent response engine LLM ID not found.');
          }
          const created = await client.chatAgent.create({
            agent_name: `${voiceAgent.agent_name || 'AI Front Desk'} Chat`,
            response_engine: {
              type: 'retell-llm',
              llm_id: llmId
            }
          });
          finalChatAgentId = created.agent_id;
          console.log('[retell/chat] Created chat agent on-the-fly:', finalChatAgentId);
        }
      } catch (err) {
        console.error('[retell/chat] Failed to resolve chat agent dynamically:', err);
        finalChatAgentId = agentId; // Fallback
      }
    }

    // 1. Create a new chat session if chatId is not provided
    if (!chatId) {
      const chatSession = await client.chat.create({
        agent_id: finalChatAgentId,
      });
      chatId = chatSession.chat_id;
    }

    if (!chatId) {
      throw new Error('Failed to create or retrieve chat session ID.');
    }

    // 2. Post user message content to get completion response
    let completion;
    try {
      completion = await client.chat.createChatCompletion({
        chat_id: chatId,
        content: content.trim(),
      });
    } catch (err) {
      console.warn('[retell/chat] Failed on existing session, starting new session:', err instanceof Error ? err.message : err);
      // Let's create a new chat session to self-heal
      const chatSession = await client.chat.create({
        agent_id: finalChatAgentId,
      });
      chatId = chatSession.chat_id;
      if (!chatId) {
        throw new Error('Failed to create a new chat session during recovery.');
      }
      completion = await client.chat.createChatCompletion({
        chat_id: chatId,
        content: content.trim(),
      });
    }

    // Clean up tone/emotion tags (e.g. [empathetic]) from the agent response
    const cleanMessages = (completion.messages || []).map((m: any) => ({
      ...m,
      content: typeof m.content === 'string'
        ? m.content.replace(/\[[a-z_-\s]+\]/gi, '').replace(/\s+/g, ' ').trim()
        : m.content
    }));

    console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      chatId,
      event: 'chat_message_success',
      ip: maskIp(ip)
    })}`);

    return NextResponse.json(
      {
        chatId,
        messages: cleanMessages,
      },
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[retell/chat] Retell API error:', errMsg);

    return NextResponse.json(
      { error: 'upstream_error', message: 'Could not send message to agent. Please try again.' },
      { status: 502, headers }
    );
  }
}
