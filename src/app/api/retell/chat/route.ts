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
  validateGrounding,
  type GroundedContextValidation,
  type GroundingMetadata,
} from '@/lib/retrieval/grounding';
import { hybridRetrieve } from '@/lib/retrieval/hybridRag';
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
  grounding?: GroundingMetadata;
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
  businessName: string,
  validation: GroundedContextValidation,
  lastNavUrl?: string | null
): Promise<ChatFallbackResult> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY;
  const openAiKey = (process.env.OPENAI_API_KEY || '').trim();
  const groqKey = process.env.GROQ_API_KEY;

  const isExplicit = isExplicitNavigationIntent(content);
  const trimmed = content.trim().toLowerCase();

  // 1. If not grounded, return deterministic fallback directly (Zero LLM hallucination)
  if (!validation.isGrounded) {
    return {
      text: validation.fallbackText || `I couldn't find verified information for that inquiry in the available website records for ${businessName}. Feel free to ask about our available offerings or pricing.`,
      grounding: validation.groundingMetadata,
    };
  }

  // ── "Yes" / Confirmation — navigate to the last suggested URL ──────────
  const isYesConfirmation = /^(?:yes|yeah|sure|yep|ok|okay|open it|open that|go|do it|please|let's go|yes please|navigate|open|take me there)[\.\!]*$/i.test(trimmed);
  if (isYesConfirmation && lastNavUrl) {
    return {
      text: `Opening that page on your screen now!`,
      navigationUrl: lastNavUrl,
      grounding: validation.groundingMetadata,
    };
  }

  const matchedRecords = validation.structuredResults;

  // 1. Explicit Navigation Intent Handling
  if (isExplicit) {
    // 1a. Navigation to About Page
    if (/\b(?:about|who\s+are\s+you|mission|story|company|founder|developer|team)\b/i.test(trimmed)) {
      const match = matchedRecords.find(r => /about/i.test(r.title || '') || /about/i.test(r.sourceUrl || ''));
      if (match?.sourceUrl) {
        return {
          text: `Navigating you to our About page now so you can learn more about ${businessName}!`,
          navigationUrl: match.sourceUrl,
          grounding: validation.groundingMetadata,
        };
      }
    }

    // 1b. Navigation to Policies & Terms
    if (/\b(?:policy|policies|terms|privacy|gdpr|refund|legal)\b/i.test(trimmed)) {
      const match = matchedRecords.find(r => /policy|terms|privacy/i.test(r.title || '') || /policy|terms/i.test(r.sourceUrl || ''));
      if (match?.sourceUrl) {
        return {
          text: `Opening our Policies & Terms page on your screen now!`,
          navigationUrl: match.sourceUrl,
          grounding: validation.groundingMetadata,
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
          navigationUrl: match.sourceUrl,
          grounding: validation.groundingMetadata,
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
        grounding: validation.groundingMetadata,
      };
    }
  }

  // 2. Try LLMs with strict grounding prompt from validation.systemPrompt
  const systemPrompt = validation.systemPrompt;

  if (openAiKey) {
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
          temperature: 0.2,
          max_tokens: 250,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          const topUrl = isExplicit ? matchedRecords[0]?.sourceUrl : undefined;
          return { text, navigationUrl: topUrl, grounding: validation.groundingMetadata };
        }
      }
    } catch (err) {
      console.warn('[retell/chat] OpenAI fallback failed:', err);
    }
  }

  if (geminiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUser Question: ${content.trim()}` }] }],
          generationConfig: { maxOutputTokens: 250, temperature: 0.2 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
          const topUrl = isExplicit ? matchedRecords[0]?.sourceUrl : undefined;
          return { text, navigationUrl: topUrl, grounding: validation.groundingMetadata };
        }
      }
    } catch (err) {
      console.warn('[retell/chat] Gemini fallback failed:', err);
    }
  }

  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: content.trim() }],
          temperature: 0.2,
          max_tokens: 250,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          const topUrl = isExplicit ? matchedRecords[0]?.sourceUrl : undefined;
          return { text, navigationUrl: topUrl, grounding: validation.groundingMetadata };
        }
      }
    } catch (err) {
      console.warn('[retell/chat] Groq fallback failed:', err);
    }
  }

  // 3. Dynamic Structured Synthesis Engine (Zero-LLM Fallback)
  const hedgeNotice = validation.groundingMetadata.hasHedge
    ? `\n\n*(Note: Some listings are from an earlier check; current availability and pricing cannot be guaranteed. Please confirm directly with staff.)*`
    : '';

  // Case A: Pricing & Rates Inquiries
  const isPricingQuery = /(?:pricing|price|prices|cost|costs|tuition|rate|rates|fee|fees|how much|payment|subscription)/i.test(trimmed);
  if (isPricingQuery && matchedRecords.length > 0) {
    const priceRecords = matchedRecords.filter(r => r.price);
    const targetRecords = priceRecords.length > 0 ? priceRecords : matchedRecords;
    
    if (targetRecords.length === 1) {
      const item = targetRecords[0];
      const rawPrice = String(item.price || '').trim();
      const cleanPrice = rawPrice ? (rawPrice.startsWith('$') ? rawPrice : `$${rawPrice}`) : 'Pricing not listed in current records';
      const link = item.sourceUrl ? `[${item.title}](${item.sourceUrl})` : `**${item.title}**`;
      return {
        text: `The pricing for ${link} is **${cleanPrice}**.${hedgeNotice} Would you like me to open the details page on your screen?`,
        suggestedUrl: item.sourceUrl,
        grounding: validation.groundingMetadata,
      };
    }

    const priceLines = targetRecords.slice(0, 5).map(item => {
      const rawPrice = String(item.price || '').trim();
      const cleanPrice = rawPrice ? (rawPrice.startsWith('$') ? rawPrice : `$${rawPrice}`) : 'Contact for pricing';
      const link = item.sourceUrl ? `[${item.title}](${item.sourceUrl})` : `**${item.title}**`;
      return `• ${link}: **${cleanPrice}**`;
    }).join('\n');

    return {
      text: `Here are the pricing options for ${businessName}:\n\n${priceLines}${hedgeNotice}\n\nWould you like more details on a specific item?`,
      navigationUrl: undefined,
      grounding: validation.groundingMetadata,
    };
  }

  // Case B: Specific Single Item Detail Query
  if (matchedRecords.length === 1) {
    const item = matchedRecords[0];
    const rawPrice = String(item.price || '').trim();
    const priceText = rawPrice ? ` (${rawPrice.startsWith('$') ? rawPrice : '$' + rawPrice})` : '';
    const descText = item.description || item.shortDescription ? (item.description || item.shortDescription || '').substring(0, 200).trim() : '';
    const linkText = item.sourceUrl ? `\n\n[View Full Page](${item.sourceUrl})` : '';
    return {
      text: `Here are the details for **${item.title}**${priceText}:\n\n${descText}${linkText}${hedgeNotice}\n\nWould you like me to open the page on your screen?`,
      navigationUrl: undefined,
      suggestedUrl: item.sourceUrl,
      grounding: validation.groundingMetadata,
    };
  }

  // Case C: Catalog / Multi-item Query
  if (matchedRecords.length > 1) {
    const topRecords = matchedRecords.slice(0, 5);
    const itemsList = topRecords.map(item => {
      const rawPrice = String(item.price || '').trim();
      const price = rawPrice ? ` (${rawPrice.startsWith('$') ? rawPrice : '$' + rawPrice})` : '';
      const link = item.sourceUrl ? `[${item.title}](${item.sourceUrl})` : `**${item.title}**`;
      const desc = item.description || item.shortDescription ? `: ${(item.description || item.shortDescription || '').substring(0, 90).trim()}...` : '';
      return `• ${link}${price}${desc}`;
    }).join('\n');

    return {
      text: `Here are the available offerings for ${businessName}:\n\n${itemsList}${hedgeNotice}\n\nWhich of these would you like to explore or get more details on?`,
      navigationUrl: undefined,
      grounding: validation.groundingMetadata,
    };
  }

  return {
    text: validation.fallbackText || `I'm happy to help you with ${businessName}. Feel free to ask about our offerings, services, or pricing!`,
    navigationUrl: undefined,
    grounding: validation.groundingMetadata,
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
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers }
    );
  }

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

  const rawContent = (body.content ?? (body as any).message ?? (body as any).text ?? '').trim();
  const contentValidation = validateMessageLength(rawContent, 1000);
  if (!contentValidation.valid || !rawContent) {
    return NextResponse.json(
      { error: 'invalid_request', message: contentValidation.error || 'Message cannot be empty.' },
      { status: 400, headers }
    );
  }
  const content: string = contentValidation.sanitized || rawContent;

  if (!widgetId || typeof widgetId !== 'string' || !widgetId.trim()) {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Missing widgetId parameter.' },
      { status: 400, headers }
    );
  }

  const targetId = widgetId.trim();

  // ── Scope Enforcement: Widget Lookup & Fail-Closed ──────────────────────
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
        { error: 'not_found', message: `Widget '${targetId}' not found.` },
        { status: 404, headers }
      );
    }
  }

  const businessName = widget.name || widget.config?.branding?.companyName || 'our business';

  // ── Duplicate message check ──────────────────────────────────────────────
  const duplicateCheck = checkDuplicateMessage(incomingSessionId || 'default', content);
  if (duplicateCheck.isDuplicateThrottled) {
    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: [
          { role: 'user', content: content.trim() },
          { role: 'agent', content: duplicateCheck.message || 'I already received your message and am processing your request.' },
        ],
        sessionId: incomingSessionId || `session_${randomUUID()}`,
      },
      { status: 200, headers }
    );
  }

  // ── Session rate limit (max 15 messages per minute per session) ──────────
  const sessionRate = checkSessionChatRateLimit(incomingSessionId || 'default');
  if (!sessionRate.allowed) {
    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: [
          { role: 'user', content: content.trim() },
          { role: 'agent', content: sessionRate.message || 'Please wait a moment before sending another message.' },
        ],
        sessionId: incomingSessionId || `session_${randomUUID()}`,
      },
      { status: 429, headers }
    );
  }

  // ── Spend & Usage Guard ──────────────────────────────────────────────────
  const maxDailyCalls = widget.config?.behavior?.maxDailyCalls ?? 100;
  const maxDailyChats = widget.config?.behavior?.maxDailyChats ?? 500;
  const usageCheck = await checkAndIncrementUsage(widget.widgetId || targetId, 'chat', { maxDailyCalls, maxDailyChats });

  if (!usageCheck.allowed) {
    return NextResponse.json(
      {
        error: 'usage_limit_exceeded',
        message: usageCheck.reason || 'Account usage limit reached.',
        spendLimitReached: true,
      },
      { status: 402, headers }
    );
  }

  // ── Dynamic Credential Resolution ────────────────────────────────────────
  const apiKey = (widget.retellApiKey || process.env.RETELL_API_KEY || '').trim();
  const agentId = (widget.agentId || process.env.RETELL_AGENT_ID || '').trim();
  const chatAgentId = (widget.config?.behavior as any)?.chatAgentId || undefined;

  // ── Server-side Session and Chat Turn Capping ──────────────────────────
  const sessionId = incomingSessionId || `session_${randomUUID()}`;
  const sessionTurnKey = `${widget.id || targetId}:${sessionId}`;
  const maxChatTurns = widget.config?.behavior?.maxChatTurns ?? 50;
  const turnCheck = checkAndIncrementChatTurns(sessionTurnKey, maxChatTurns);

  if (!turnCheck.allowed) {
    const cappedMessage = turnCheck.message || 'You have reached the maximum message limit for this chat session. Please contact our team directly for further assistance.';
    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: [
          { role: 'user', content: content.trim() },
          { role: 'agent', content: cappedMessage },
        ],
        sessionId,
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

  // ── Retrieve via Hybrid RAG Pipeline ──────────────────────────────────────
  const hybridOutput = await hybridRetrieve(retrievalId, resolvedQuery, { limit: 6 });

  // ── Strict Grounding Validation Layer ──────────────────────────────────────
  const validation = validateGrounding(content, hybridOutput, businessName);

  const relevantRecords = validation.structuredResults.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    shortDescription: r.shortDescription,
    images: r.images,
    imageUrls: r.imageUrls,
    price: r.price,
    currency: r.currency,
    availability: r.availability,
    rating: r.rating,
    sourceUrl: r.sourceUrl,
    entityType: r.entityType,
    category: r.category,
    freshnessStatus: r.freshnessStatus,
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    metadata: r.metadata,
  }));

  const targetUrl = pinnedEntity?.record?.sourceUrl;
  const effectiveNavUrl = targetUrl || lastNavUrl;

  // ── Empty-Context Hallucination Prevention (Deterministic Fallback) ────────
  if (!validation.isGrounded) {
    return NextResponse.json(
      {
        chatId: chatId || `chat_${Date.now()}`,
        messages: [
          { role: 'user', content: content.trim() },
          {
            role: 'agent',
            content: validation.fallbackText || `I couldn't find verified information for that inquiry in the available website records for ${businessName}. Feel free to ask about our available offerings or pricing.`,
            results: [],
          },
        ],
        sessionId,
        grounding: validation.groundingMetadata,
      },
      { status: 200, headers }
    );
  }

  // ── Zero-Retell Fallback / Standalone Chat Handler ─────────────────────────
  if (!apiKey || !agentId) {
    const fallbackResult = await generateChatFallbackResponse(
      resolvedQuery !== content ? resolvedQuery : content,
      businessName,
      validation,
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
        grounding: validation.groundingMetadata,
      },
      { status: 200, headers }
    );
  }

  // ── Initialize Retell SDK Client ──────────────────────────────────────────
  const client = new Retell({ apiKey });

  try {
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

    if (!chatId) {
      const chatSession = await client.chat.create({
        agent_id: finalChatAgentId,
      });
      chatId = chatSession.chat_id;
    }

    if (!chatId) {
      throw new Error('Failed to create or retrieve chat session ID.');
    }

    // 2. Post message with strict grounding system prompt
    let completion;
    try {
      const promptContent = [
        'SYSTEM INSTRUCTION: You MUST base your answer ONLY on the following verified website data.',
        'Do NOT invent, guess, or add any information that is not explicitly present in the data below.',
        'If the user asks about something not covered in the data, say: "I couldn\'t find that in the available website information."',
        '',
        validation.systemPrompt,
        '',
        `User Question: ${content.trim()}`,
      ].join('\n');

      completion = await client.chat.createChatCompletion({
        chat_id: chatId,
        content: promptContent,
      });
    } catch (err) {
      console.warn('[retell/chat] Failed on existing session, starting new session:', err instanceof Error ? err.message : err);
      const chatSession = await client.chat.create({
        agent_id: finalChatAgentId,
      });
      chatId = chatSession.chat_id;
      if (!chatId) {
        throw new Error('Failed to create a new chat session during recovery.');
      }

      const promptContentRetry = [
        'SYSTEM INSTRUCTION: You MUST base your answer ONLY on the following verified website data.',
        'Do NOT invent, guess, or add any information that is not explicitly present in the data below.',
        'If the user asks about something not covered in the data, say: "I couldn\'t find that in the available website information."',
        '',
        validation.systemPrompt,
        '',
        `User Question: ${content.trim()}`,
      ].join('\n');

      completion = await client.chat.createChatCompletion({
        chat_id: chatId,
        content: promptContentRetry,
      });
    }

    // Clean up response messages
    const rawMessages: any[] = completion.messages || [];
    const cleanMessages = rawMessages.map((m: any, idx: number) => {
      let textContent = m.content;
      if (typeof textContent === 'string') {
        textContent = textContent.replace(/\[[a-z_-\s]+\]/gi, '').replace(/\s+/g, ' ').trim();
        if (textContent.includes('SYSTEM INSTRUCTION:')) {
          const endMarker = '=== END VERIFIED RECORDS ===';
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
      const isLastAgentMsg =
        m.role === 'agent' &&
        idx === rawMessages.length - 1 &&
        relevantRecords.length > 0;
      if (isLastAgentMsg) {
        cleaned.results = relevantRecords;
      }
      return cleaned;
    });

    const isExplicit = isExplicitNavigationIntent(content);
    const topNavUrl = isExplicit ? (relevantRecords[0]?.sourceUrl || undefined) : undefined;

    return NextResponse.json(
      {
        chatId,
        messages: cleanMessages,
        sessionId,
        navigationUrl: topNavUrl,
        action: topNavUrl ? { type: 'navigate', url: topNavUrl } : undefined,
        grounding: validation.groundingMetadata,
      },
      { status: 200, headers }
    );

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn('[retell/chat] Retell API error, falling back to intelligent knowledge chat:', errMsg);

    const fallbackResult = await generateChatFallbackResponse(
      resolvedQuery !== content ? resolvedQuery : content,
      businessName,
      validation,
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
        grounding: validation.groundingMetadata,
      },
      { status: 200, headers }
    );
  }
}
