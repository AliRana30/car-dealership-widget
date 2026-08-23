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
import { getWidget, getRelevantWebsiteData, getRelevantWebsiteRecords, WebsiteDataRecord } from '@/config/widgetsDb';
import { generateBaseSystemPrompt } from '@/lib/agents/prompts';
import {
  checkAndIncrementChatTurns,
  checkSessionChatRateLimit,
  checkDuplicateMessage,
  validateMessageLength,
} from '@/lib/chat/chatLimiter';
import { checkAndIncrementUsage } from '@/lib/usage/spendLimiter';
import {
  resolveEntityByQuery,
  resolveAnaphora,
  type ResolvedEntity,
} from '@/lib/agents/entityResolver';
import {
  getSessionContext,
  updateSessionContext,
  pinEntity,
  setLastResults,
} from '@/lib/agents/sessionContext';

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

function isExplicitNavigationIntent(query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    /^(?:take me to|navigate me to|navigate to|open|go to|redirect me to|redirect to|bring me to|launch|show me the page for|show me the|open the page for|visit|take me|can you take me to|can you navigate me to|lead me to)\b/i.test(q) ||
    /\b(?:navigate|navigation|redirect|redirecting|go to|open up|open page|open course|open product|open item)\b/i.test(q) ||
    /\b(?:page|url|website|tab|screen)\s*(?:please|now)?$/i.test(q)
  );
}

interface ChatFallbackResult {
  text: string;
  navigationUrl?: string;
  suggestedUrl?: string;
}

// ── Entity resolution + session context integration ─────────────────────────
//
// This replaces the old resolveFollowUpEntity() function.
// Resolution order:
//  1. Anaphora check (it/this/that/first one) against pinned session entity
//  2. 4-tier entity resolver: exact → partial → fuzzy → semantic
//  3. Update session context with resolved entity + result set
//
// Returns the resolved entity record (with real images from DB) OR null.

async function resolveEntityForTurn(
  content: string,
  sessionId: string,
  widgetId: string,
  history: any[],
): Promise<{
  resolvedQuery: string;
  pinnedEntity: ResolvedEntity | null;
  records: WebsiteDataRecord[];
}> {
  // Load server-side session context
  const ctx = getSessionContext(sessionId, widgetId);

  // 1. Try anaphora resolution first (pronouns, ordinals)
  const anaphoric = resolveAnaphora(
    content,
    ctx.pinnedEntity,
    ctx.lastResults,
    history,
  );

  if (anaphoric.wasAnaphoric && anaphoric.resolvedEntity) {
    // Carry over the pinned entity; make the query specific to trigger retrieval
    const resolvedQuery = `${anaphoric.resolvedEntity.title} ${content}`;
    return {
      resolvedQuery,
      pinnedEntity: anaphoric.resolvedEntity,
      records: anaphoric.resolvedEntity.record ? [anaphoric.resolvedEntity.record] : ctx.lastResults,
    };
  }

  // 2. Run 4-tier entity resolution on the user's query
  const isGreeting = /^(?:hi|hello|hey|greetings|good\s*(?:morning|afternoon|evening)|start|help)$/i.test(content.trim());
  const isYes = /^(?:yes|yeah|sure|yep|ok|okay|do it|go)[\.!]*$/i.test(content.trim());

  if (isGreeting || isYes) {
    // Don't attempt entity resolution for greetings / yes-confirmations
    return { resolvedQuery: content, pinnedEntity: ctx.pinnedEntity, records: ctx.lastResults };
  }

  const resolved = await resolveEntityByQuery(widgetId, content, 6);

  if (resolved.length > 0) {
    const top = resolved[0];
    // Pin the top entity when confidence is exact/partial/fuzzy
    if (top.confidence !== 'semantic' || resolved.length === 1) {
      pinEntity(sessionId, widgetId, top);
    }
    setLastResults(sessionId, widgetId, resolved.map((r) => r.record));

    return {
      resolvedQuery: top.title,
      pinnedEntity: top,
      records: resolved.map((r) => r.record),
    };
  }

  // 3. Nothing resolved — keep existing context, use raw query
  return { resolvedQuery: content, pinnedEntity: ctx.pinnedEntity, records: [] };
}

async function generateChatFallbackResponse(
  content: string,
  relevantData: string | null,
  businessName: string,
  matchedRecords: WebsiteDataRecord[] = [],
  lastNavUrl?: string | null
): Promise<ChatFallbackResult> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY;
  const openAiKey = (process.env.OPENAI_API_KEY || '').trim();
  const groqKey = process.env.GROQ_API_KEY;

  const isExplicit = isExplicitNavigationIntent(content);
  const trimmed = content.trim().toLowerCase();
  const isGreeting = /^(?:hi|hello|hey|greetings|good\s*(?:morning|afternoon|evening)|start|help)$/i.test(trimmed);
  if (isGreeting) {
    return {
      text: `Hello! I'm your AI assistant for ${businessName}. How can I help you today? Feel free to ask about our offerings, pricing, details, or policies.`
    };
  }

  // ── "Yes" / Confirmation — navigate to the last suggested URL ──────────
  const isYesConfirmation = /^(?:yes|yeah|sure|yep|ok|okay|open it|open that|go|do it|please|let's go|yes please|navigate|open|take me there)[\.\!]*$/i.test(trimmed);
  if (isYesConfirmation && lastNavUrl) {
    return {
      text: `Opening that page on your screen now!`,
      navigationUrl: lastNavUrl,
    };
  }
  if (isYesConfirmation && !lastNavUrl) {
    return {
      text: `Sure! What would you like me to help with? You can ask about our offerings, pricing, or I can navigate you to a specific page.`,
    };
  }

  // 1. Explicit Navigation Intent Handling
  if (isExplicit) {
    // 1a. Navigation to About Page
    if (/\b(?:about|who\s+are\s+you|mission|story|company|founder|developer|team)\b/i.test(trimmed)) {
      const match = matchedRecords.find(r => /about/i.test(r.title || '') || /about/i.test(r.sourceUrl || ''));
      if (match?.sourceUrl) {
        return {
          text: `Navigating you to our About page now so you can learn more about ${businessName}!`,
          navigationUrl: match.sourceUrl
        };
      }
    }

    // 1b. Navigation to Policies & Terms
    if (/\b(?:policy|policies|terms|privacy|gdpr|refund|legal)\b/i.test(trimmed)) {
      const match = matchedRecords.find(r => /policy|terms|privacy/i.test(r.title || '') || /policy|terms/i.test(r.sourceUrl || ''));
      if (match?.sourceUrl) {
        return {
          text: `Opening our Policies & Terms page on your screen now!`,
          navigationUrl: match.sourceUrl
        };
      }
    }

    // 1c. Navigation to FAQ / Help / Contact
    if (/\b(?:faq|frequently asked|questions?|help|contact|support)\b/i.test(trimmed)) {
      const isFaq = /\b(?:faq|frequently asked|questions?|help)\b/i.test(trimmed);
      const match = matchedRecords.find(r => (isFaq ? /faq/i : /contact/i).test(r.title || '') || (isFaq ? /faq/i : /contact/i).test(r.sourceUrl || ''));
      if (match?.sourceUrl) {
        return {
          text: `Navigating you to our ${isFaq ? 'FAQ' : 'Contact'} page now!`,
          navigationUrl: match.sourceUrl
        };
      }
    }

    // 1d. Navigation to specific named item or general catalog
    const queryWords = trimmed.split(/\s+/).filter(w => w.length > 2 && !['navigate', 'take', 'open', 'page', 'course', 'product', 'item', 'me', 'the', 'you', 'show', 'to', 'can'].includes(w));
    const targetItem = matchedRecords.find(r => {
      const t = (r.title || '').toLowerCase();
      return queryWords.some(w => t.includes(w));
    }) || matchedRecords[0];

    if (targetItem?.sourceUrl) {
      return {
        text: `Opening the page for **${targetItem.title}** on your screen now! Let me know if you have any questions about it.`,
        navigationUrl: targetItem.sourceUrl,
      };
    }

    if (queryWords.length === 0) {
      return {
        text: `Sure! Which page would you like me to open? You can ask for our catalog, about page, contact page, or name a specific item.`,
        navigationUrl: undefined,
      };
    }

    return {
      text: `I couldn't find a matching page for "${queryWords.join(' ')}" in our website. Would you like to explore our main offerings instead?`,
      navigationUrl: undefined,
    };
  }

  // 2. Try LLMs (OpenAI, Gemini, Groq) with strict anti-hallucination prompt if keys exist.
  // Bug 4 fix: if BOTH the retrieved text context AND the structured records are empty,
  // skip the LLM entirely — it has no grounded data and would hallucinate.
  // Jump straight to the structured zero-result synthesis engine below.
  const hasGroundedData = Boolean(relevantData && relevantData.trim()) || matchedRecords.length > 0;
  if (!hasGroundedData && !isExplicit) {
    // Fall through to the structured synthesis engine (Cases A-D below) which correctly
    // says "I couldn't find that" without inventing website information.
    console.log('[retell/chat] No grounded data for this query — skipping LLM to prevent hallucination.');
  }

  const systemPrompt = `You are a helpful AI receptionist and assistant for ${businessName}.
Use ONLY the following website information to answer accurately and concisely.
If the answer is NOT present in the website information below, or if the user asks about an item/course/product that is NOT listed below, clearly state: "I couldn't find that in the available website information." Do NOT invent or guess any website information.

Relevant Website Information:
${relevantData || 'No specific matching records found.'}

Guidelines:
- Provide clear, professional, and friendly answers.
- Format item lists cleanly using bullet points, titles, and prices when available.
- If the user asks about a specific item that does not exist in the information, say you couldn't find a matching offering.
- Keep responses concise (under 120 words).`;

  if (hasGroundedData && openAiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content.trim() }
          ],
          temperature: 0.3,
          max_tokens: 250,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          const topUrl = isExplicit ? matchedRecords[0]?.sourceUrl : undefined;
          return { text, navigationUrl: topUrl };
        }
      }
    } catch (err) {
      console.warn('[retell/chat] OpenAI fallback failed:', err);
    }
  }

  if (hasGroundedData && geminiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${content.trim()}` }] }],
          generationConfig: { maxOutputTokens: 250, temperature: 0.3 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          const topUrl = isExplicit ? matchedRecords[0]?.sourceUrl : undefined;
          return { text, navigationUrl: topUrl };
        }
      }
    } catch (err) {
      console.warn('[retell/chat] Gemini fallback failed:', err);
    }
  }

  if (hasGroundedData && groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: content.trim() }],
          temperature: 0.3,
          max_tokens: 250,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          const topUrl = isExplicit ? matchedRecords[0]?.sourceUrl : undefined;
          return { text, navigationUrl: topUrl };
        }
      }
    } catch (err) {
      console.warn('[retell/chat] Groq fallback failed:', err);
    }
  }

  // 3. Dynamic Structured Synthesis Engine (Zero-LLM Fallback)

  // Case A: Pricing & Rates Inquiries
  const isPricingQuery = /(?:pricing|price|prices|cost|costs|tuition|rate|rates|fee|fees|how much|payment|subscription)/i.test(trimmed);
  if (isPricingQuery && matchedRecords.length > 0) {
    const priceRecords = matchedRecords.filter(r => r.price);
    const targetRecords = priceRecords.length > 0 ? priceRecords : matchedRecords;
    
    if (targetRecords.length === 1) {
      const item = targetRecords[0];
      const rawPrice = String(item.price || '').trim();
      const cleanPrice = rawPrice ? (rawPrice.startsWith('$') ? rawPrice : `$${rawPrice}`) : 'Standard Rate';
      const link = item.sourceUrl ? `[${item.title}](${item.sourceUrl})` : `**${item.title}**`;
      return {
        text: `The pricing for ${link} is **${cleanPrice}**. Would you like me to open the details page on your screen?`,
        suggestedUrl: item.sourceUrl,
      };
    }

    const priceLines = targetRecords.slice(0, 5).map(item => {
      const rawPrice = String(item.price || '').trim();
      const cleanPrice = rawPrice ? (rawPrice.startsWith('$') ? rawPrice : `$${rawPrice}`) : 'Contact for pricing';
      const link = item.sourceUrl ? `[${item.title}](${item.sourceUrl})` : `**${item.title}**`;
      return `• ${link}: **${cleanPrice}**`;
    }).join('\n');

    return {
      text: `Here are the pricing options for ${businessName}:\n\n${priceLines}\n\nWould you like more details on a specific item?`,
      navigationUrl: undefined
    };
  }

  // Case B: Specific Single Item Detail Query
  if (matchedRecords.length === 1) {
    const item = matchedRecords[0];
    const rawPrice = String(item.price || '').trim();
    const priceText = rawPrice ? ` (${rawPrice.startsWith('$') ? rawPrice : '$' + rawPrice})` : '';
    const descText = item.description ? item.description.substring(0, 200).trim() : '';
    const linkText = item.sourceUrl ? `\n\n[View Full Page](${item.sourceUrl})` : '';
    return {
      text: `Here are the details for **${item.title}**${priceText}:\n\n${descText}${linkText}\n\nWould you like me to open the page on your screen?`,
      navigationUrl: undefined,
      suggestedUrl: item.sourceUrl,
    };
  }

  // Case C: Catalog / Multi-item Query
  if (matchedRecords.length > 1) {
    const topRecords = matchedRecords.slice(0, 5);
    const itemsList = topRecords.map(item => {
      const rawPrice = String(item.price || '').trim();
      const price = rawPrice ? ` (${rawPrice.startsWith('$') ? rawPrice : '$' + rawPrice})` : '';
      const link = item.sourceUrl ? `[${item.title}](${item.sourceUrl})` : `**${item.title}**`;
      const desc = item.description ? `: ${item.description.substring(0, 90).trim()}...` : '';
      return `• ${link}${price}${desc}`;
    }).join('\n');

    return {
      text: `Here are the available offerings for ${businessName}:\n\n${itemsList}\n\nWhich of these would you like to explore or get more details on?`,
      navigationUrl: undefined
    };
  }

  // Case D: No match found — strict anti-hallucination response
  const searchTerms = content.trim().split(/\s+/).filter(w => w.length > 2 && !['what', 'does', 'have', 'your', 'offer', 'available', 'about', 'course', 'courses', 'product', 'products', 'program', 'programs', 'do', 'you', 'with', 'that', 'this', 'there', 'any', 'the', 'tell', 'show', 'how', 'much'].includes(w.toLowerCase())).slice(0, 3).join(' ');

  if (searchTerms) {
    return {
      text: `I couldn't find a matching offering for "${searchTerms}" in the available website information. Would you like to explore our general catalog or ask about another topic?`,
      navigationUrl: undefined
    };
  }

  return {
    text: `I'm happy to help you with ${businessName}. Feel free to ask about our offerings, services, or pricing!`,
    navigationUrl: undefined
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
  let body: { chatId?: string | null; content?: string; widgetId?: string; sessionId?: string; lastNavUrl?: string | null; history?: any[] } = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Request body must be valid JSON.' },
      { status: 400, headers }
    );
  }

  const { widgetId, sessionId: incomingSessionId, lastNavUrl } = body;
  const history: any[] = Array.isArray(body.history) ? body.history : [];
  let { chatId } = body;
  const rawContent = body.content;
  const sessionId = incomingSessionId && typeof incomingSessionId === 'string' ? incomingSessionId : randomUUID();

  if (!rawContent || typeof rawContent !== 'string' || rawContent.trim() === '') {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Content field is required and must be a non-empty string.' },
      { status: 400, headers }
    );
  }

  const content: string = rawContent.trim();

  // Validate message content length cap (Task C.4)
  const lengthValidation = validateMessageLength(content, 1000);
  if (!lengthValidation.valid) {
    return NextResponse.json(
      { error: 'invalid_request', message: lengthValidation.error || 'Message cannot be empty.' },
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

  // ── Enforce Per-Widget Daily Chat Limit & Circuit Breaker (Task C.3) ───
  const maxDailyCalls = widget.config?.behavior?.maxDailyCalls ?? 100;
  const maxDailyChats = widget.config?.behavior?.maxDailyChats ?? 500;
  const usageCheck = await checkAndIncrementUsage(widget.widgetId || targetId, 'chat', { maxDailyCalls, maxDailyChats });

  if (!usageCheck.allowed) {
    const circuitBreakerMessage = usageCheck.reason || 'This assistant is temporarily unavailable. Please try again later or contact us directly.';
    console.warn(`[SPEND_CIRCUIT_BREAKER] Widget ${targetId} exceeded daily chat quota (${usageCheck.currentCount}/${usageCheck.maxLimit}). Returning circuit breaker fallback.`);

    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: [
          { role: 'user', content: content.trim() },
          { role: 'agent', content: circuitBreakerMessage },
        ],
        sessionId,
        isCircuitBreakerTripped: true,
        dailyUsageExceeded: true,
      },
      { status: 200, headers }
    );
  }

  // ── Session-Scoped Chat Rate Limiting (Task C.4) ──────────────────────
  const chatRateLimitPerMinute = widget.config?.behavior?.chatRateLimitPerMinute ?? 15;
  const sessionTurnKey = chatId || sessionId || ip;
  const rateLimitCheck = checkSessionChatRateLimit(sessionTurnKey, chatRateLimitPerMinute);

  if (!rateLimitCheck.allowed) {
    const rateLimitMessage = rateLimitCheck.message || "You're sending messages too fast. Please wait a moment before trying again.";
    console.warn(`[CHAT_RATE_LIMIT] Session ${sessionTurnKey} throttled (${rateLimitCheck.currentWindowCount}/${rateLimitCheck.maxPerMinute} msg/min).`);

    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: [
          { role: 'user', content: content.trim() },
          { role: 'agent', content: rateLimitMessage },
        ],
        sessionId,
        isRateLimited: true,
        retryAfterSeconds: rateLimitCheck.retryAfterSeconds,
      },
      { status: 429, headers }
    );
  }

  // ── Duplicate-Message Throttling (Task C.4) ───────────────────────────
  const duplicateCheck = checkDuplicateMessage(sessionTurnKey, content);
  if (duplicateCheck.isDuplicateThrottled) {
    const staticReply = duplicateCheck.message || "I've already answered that — is there something else I can help with?";

    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: [
          { role: 'user', content: content.trim() },
          { role: 'agent', content: staticReply },
        ],
        sessionId,
        isDuplicateThrottled: true,
        duplicateCount: duplicateCheck.duplicateCount,
      },
      { status: 200, headers }
    );
  }

  // ── Enforce Hard Server-Side Chat Turn Limits (Task C.1) ─────────────────
  const maxChatTurns = widget.config?.behavior?.maxChatTurns ?? 30;
  const turnCheck = checkAndIncrementChatTurns(sessionTurnKey, maxChatTurns);

  if (!turnCheck.allowed) {
    const cappedMessage = turnCheck.message || 'You have reached the maximum message limit for this chat session. Please contact our team directly for further assistance.';
    console.log(`[SERVER_CHAT_CAP] Session ${sessionTurnKey} exceeded max chat turns (${maxChatTurns}). Rejecting LLM generation and returning capped response.`);

    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: [
          { role: 'user', content: content.trim() },
          { role: 'agent', content: cappedMessage },
        ],
        sessionId,
        capped: true,
        turnCount: turnCheck.currentTurn,
        maxTurns: turnCheck.maxTurns,
      },
      { status: 200, headers }
    );
  }

  // ── Conversational Follow-Up & Universal Entity Resolution ───────────────
  const retrievalId = (widget.id && widget.id !== '00000000-0000-0000-0000-000000000000')
    ? widget.id
    : (widget.widgetId || targetId);

  const { resolvedQuery, pinnedEntity, records: resolvedRecords } = await resolveEntityForTurn(
    content,
    sessionId,
    retrievalId,
    history
  );

  // Retrieve grounded text context using resolved query
  const relevantData = await getRelevantWebsiteData(retrievalId, resolvedQuery);
  const relevantRecords = resolvedRecords.length > 0
    ? resolvedRecords
    : await getRelevantWebsiteRecords(retrievalId, resolvedQuery);

  const targetUrl = pinnedEntity?.record?.sourceUrl;
  const effectiveNavUrl = targetUrl || lastNavUrl;

  if (!apiKey || !agentId) {
    const fallbackResult = await generateChatFallbackResponse(
      resolvedQuery !== content ? resolvedQuery : content,
      relevantData,
      widget.name || widget.config?.branding?.companyName || 'our business',
      relevantRecords,
      effectiveNavUrl
    );

    const isInfoIntent = /about|policy|privacy|terms|faq|contact|support/i.test(content.trim());

    const fallbackMessages = [
      { role: 'user', content: content.trim() },
      {
        role: 'agent',
        content: fallbackResult.text,
        ...(relevantRecords.length > 0 && !isInfoIntent ? { results: relevantRecords.slice(0, 6) } : {}),
        ...(fallbackResult.navigationUrl ? { navigationUrl: fallbackResult.navigationUrl } : {}),
        ...(fallbackResult.suggestedUrl ? { suggestedUrl: fallbackResult.suggestedUrl } : {}),
      },
    ];

    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: fallbackMessages,
        sessionId,
        navigationUrl: fallbackResult.navigationUrl,
        suggestedUrl: fallbackResult.suggestedUrl,
        action: fallbackResult.navigationUrl ? { type: 'navigate', url: fallbackResult.navigationUrl } : undefined,
      },
      { status: 200, headers }
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
      // Bug 3 fix: Wrap the website context with an explicit SYSTEM INSTRUCTION header so the
      // Retell agent treats it as a mandatory data source rather than ordinary user text.
      // This prevents the Retell LLM from ignoring the context and answering from its own training.
      const promptContent = relevantData
        ? [
            'SYSTEM INSTRUCTION: You MUST base your answer ONLY on the following verified website data.',
            'Do NOT invent, guess, or add any information that is not explicitly present in the data below.',
            'If the user asks about something not covered in the data, say: "I couldn\'t find that in the available website information."',
            '',
            '=== VERIFIED WEBSITE DATA ===',
            relevantData,
            '=== END WEBSITE DATA ===',
            '',
            `User Question: ${content.trim()}`,
          ].join('\n')
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

      const promptContentRetry = relevantData
        ? [
            'SYSTEM INSTRUCTION: You MUST base your answer ONLY on the following verified website data.',
            'Do NOT invent, guess, or add any information that is not explicitly present in the data below.',
            'If the user asks about something not covered in the data, say: "I couldn\'t find that in the available website information."',
            '',
            '=== VERIFIED WEBSITE DATA ===',
            relevantData,
            '=== END WEBSITE DATA ===',
            '',
            `User Question: ${content.trim()}`,
          ].join('\n')
        : content.trim();

      completion = await client.chat.createChatCompletion({
        chat_id: chatId,
        content: promptContentRetry,
      });
    }

    // Clean up tone/emotion tags (e.g. [empathetic]) from the agent response
    // and strip out any injected website context from history so the client bubble stays clean.
    const rawMessages: any[] = completion.messages || [];
    const cleanMessages = rawMessages.map((m: any, idx: number) => {
      let textContent = m.content;
      if (typeof textContent === 'string') {
        textContent = textContent.replace(/\[[a-z_-\s]+\]/gi, '').replace(/\s+/g, ' ').trim();
        // Strip out our injected system instruction block so the user sees only their own question
        if (textContent.includes('SYSTEM INSTRUCTION:')) {
          const endMarker = '=== END WEBSITE DATA ===';
          const endIdx = textContent.indexOf(endMarker);
          if (endIdx !== -1) {
            textContent = textContent.slice(endIdx + endMarker.length).replace(/^[\s\n]*User Question:/i, '').trim();
          }
        }
        if (textContent.includes('User Message:')) {
          const parts = textContent.split('User Message:');
          textContent = parts[parts.length - 1].trim();
        }
      }
      const cleaned: any = { ...m, content: textContent };
      // Bug 5 fix: attach structured result cards whenever the retrieval found records.
      // This is now vertical-agnostic — it no longer requires LMS-specific keywords.
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

    const isExplicit = isExplicitNavigationIntent(content);
    const topNavUrl = isExplicit ? (relevantRecords[0]?.sourceUrl || undefined) : undefined;

    return NextResponse.json(
      {
        chatId,
        messages: cleanMessages,
        sessionId,
        navigationUrl: topNavUrl,
        action: topNavUrl ? { type: 'navigate', url: topNavUrl } : undefined,
      },
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[retell/chat] Retell API error, falling back to intelligent knowledge chat:', errMsg);

    const fallbackResult = await generateChatFallbackResponse(
      resolvedQuery !== content ? resolvedQuery : content,
      relevantData,
      widget.name || widget.config?.branding?.companyName || 'our business',
      relevantRecords,
      effectiveNavUrl
    );

    const isInfoIntent = /about|policy|privacy|terms|faq|contact|support/i.test(content.trim());

    const fallbackMessages = [
      { role: 'user', content: content.trim() },
      {
        role: 'agent',
        content: fallbackResult.text,
        ...(relevantRecords.length > 0 && !isInfoIntent ? { results: relevantRecords.slice(0, 6) } : {}),
        ...(fallbackResult.navigationUrl ? { navigationUrl: fallbackResult.navigationUrl } : {}),
        ...(fallbackResult.suggestedUrl ? { suggestedUrl: fallbackResult.suggestedUrl } : {}),
      },
    ];

    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: fallbackMessages,
        sessionId,
        navigationUrl: fallbackResult.navigationUrl,
        suggestedUrl: fallbackResult.suggestedUrl,
        action: fallbackResult.navigationUrl ? { type: 'navigate', url: fallbackResult.navigationUrl } : undefined,
      },
      { status: 200, headers }
    );
  }
}
