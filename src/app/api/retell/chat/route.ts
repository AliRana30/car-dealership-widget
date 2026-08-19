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
import { randomUUID } from 'crypto';
import { getWidget, getRelevantWebsiteData, getRelevantWebsiteRecords } from '@/config/widgetsDb';
import { generateBaseSystemPrompt } from '@/lib/agents/prompts';

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

async function generateChatFallbackResponse(
  content: string,
  relevantData: string | null,
  businessName: string
): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const systemPrompt = generateBaseSystemPrompt({
    businessName,
    websiteContext: relevantData || undefined,
  });

  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content.trim() },
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch (err) {
      console.warn('[retell/chat] OpenAI fallback failed:', err);
    }
  }

  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content.trim() },
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    } catch (err) {
      console.warn('[retell/chat] Groq fallback failed:', err);
    }
  }

  return `Hello! Thank you for reaching out to ${businessName}. How can I assist you with our services today?`;
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
  let body: { chatId?: string | null; content?: string; widgetId?: string; sessionId?: string } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Request body must be valid JSON.' },
      { status: 400, headers }
    );
  }

  const { content, widgetId, sessionId: incomingSessionId } = body;
  let { chatId } = body;
  const sessionId = incomingSessionId && typeof incomingSessionId === 'string' ? incomingSessionId : randomUUID();

  if (!content || typeof content !== 'string' || content.trim() === '') {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Content field is required and must be a non-empty string.' },
      { status: 400, headers }
    );
  }

  // ── Retrieve Widget Credentials ───────────────────────────────────────────
  const targetId = widgetId || 'default';
  let widget = await getWidget(targetId);
  if (!widget) {
    if (targetId === 'default' || targetId === 'front-desk' || targetId === 'myfrontdesk') {
      widget = {
        id: '00000000-0000-0000-0000-000000000000',
        widgetId: 'default',
        organizationId: '00000000-0000-0000-0000-000000000000',
        name: 'Default Widget',
        status: 'active',
        provider: 'retell',
        agentId: process.env.RETELL_AGENT_ID,
        retellApiKey: process.env.RETELL_API_KEY,
        allowedDomains: ['*'],
        config: {} as any,
      };
    } else {
      return NextResponse.json(
        { error: 'not_found', message: `Widget with ID '${targetId}' not found.` },
        { status: 404, headers }
      );
    }
  }

  if (widget.provider !== 'retell' && widget.provider !== undefined) {
    return NextResponse.json(
      { error: 'misconfigured', message: 'Text chat is only supported on Retell provider widgets.' },
      { status: 400, headers }
    );
  }

  const apiKey = (widget.retellApiKey || process.env.RETELL_API_KEY || '').trim();
  const agentId = (widget.agentId || process.env.RETELL_AGENT_ID || '').trim();
  // Check if a specific chat agent has been configured in the config overrides, or fallback to main agentId
  const chatAgentId = (widget.config?.behavior as any)?.chatAgentId || undefined;

  if (!apiKey || !agentId) {
    return NextResponse.json(
      { error: 'misconfigured', message: 'Retell credentials or Agent ID are not configured for this widget.' },
      { status: 503, headers }
    );
  }

  // Resolve relevant website intelligence data dynamically through the backend
  const websiteId = widget.websiteId || '00000000-0000-0000-0000-000000000000';
  // Run text context + structured records retrieval in parallel
  const [relevantData, relevantRecords] = await Promise.all([
    getRelevantWebsiteData(websiteId, content),
    getRelevantWebsiteRecords(websiteId, content),
  ]);

  // ── Initialize Retell SDK Client ──────────────────────────────────────────
  const client = new Retell({ apiKey });

  try {
    // Resolve chatAgentId dynamically if not configured explicitly
    let finalChatAgentId = chatAgentId;
    if (!finalChatAgentId) {
      try {
        const chatAgents = await client.chatAgent.list();
        const found = chatAgents.items?.find((a: any) => a.agent_name?.toLowerCase().includes('chat') || a.agent_name?.toLowerCase().includes('text'));
        finalChatAgentId = found ? found.agent_id : agentId;
      } catch (err) {
        console.warn('[retell/chat] Failed to list agents, falling back to widget agent:', err instanceof Error ? err.message : err);
        finalChatAgentId = agentId;
      }
    }

    // 1. Create or retrieve existing chat session
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
      const promptContent = relevantData
        ? `[Relevant Website Context:\n${relevantData}\n]\nUser Message: ${content.trim()}`
        : content.trim();

      completion = await client.chat.createChatCompletion({
        chat_id: chatId,
        content: promptContent,
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

      const promptContent = relevantData
        ? `[Relevant Website Context:\n${relevantData}\n]\nUser Message: ${content.trim()}`
        : content.trim();

      completion = await client.chat.createChatCompletion({
        chat_id: chatId,
        content: promptContent,
      });
    }

    // Clean up tone/emotion tags (e.g. [empathetic]) from the agent response
    // and strip out any injected website context from history so the client bubble stays clean.
    const rawMessages: any[] = completion.messages || [];
    const cleanMessages = rawMessages.map((m: any, idx: number) => {
      let textContent = m.content;
      if (typeof textContent === 'string') {
        textContent = textContent.replace(/\[[a-z_-\s]+\]/gi, '').replace(/\s+/g, ' ').trim();
        if (textContent.includes('User Message:')) {
          const parts = textContent.split('User Message:');
          textContent = parts[parts.length - 1].trim();
        }
      }
      const cleaned: any = { ...m, content: textContent };
      // Attach structured result cards to the last agent message only
      const isLastAgentMsg =
        m.role === 'agent' &&
        idx === rawMessages.length - 1 &&
        relevantRecords.length > 0;
      if (isLastAgentMsg) {
        cleaned.results = relevantRecords;
      }
      return cleaned;
    });

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
        sessionId,
      },
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[retell/chat] Retell API error, falling back to intelligent knowledge chat:', errMsg);

    const fallbackResponseText = await generateChatFallbackResponse(
      content,
      relevantData,
      widget.name || widget.config?.branding?.companyName || 'our business'
    );

    const fallbackMessages = [
      { role: 'user', content: content.trim() },
      {
        role: 'agent',
        content: fallbackResponseText,
        ...(relevantRecords.length > 0 ? { results: relevantRecords } : {}),
      },
    ];

    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: fallbackMessages,
        sessionId,
      },
      { status: 200, headers }
    );
  }
}
