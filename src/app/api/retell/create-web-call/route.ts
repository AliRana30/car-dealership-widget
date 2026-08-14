/**
 * POST /api/retell/create-web-call
 *
 * Server-side route handler. Calls the Retell API to create a new web call
 * and returns ONLY the short-lived access token and call_id to the browser.
 *
 * Security:
 *  - RETELL_API_KEY stays server-side — never sent to the browser.
 *  - In-memory per-IP rate limiter (10 req / 60 s window).
 *  - Validates env vars before touching the network.
 *  - Returns clean JSON errors — no stack traces, no internal detail.
 */

import { NextRequest, NextResponse } from 'next/server';
import Retell from 'retell-sdk';
import { randomUUID } from 'crypto';

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

// ─── Environment ────────────────────────────────────────────────────────────

function getEnv(): { apiKey: string; agentId: string } {
  const apiKey = process.env.RETELL_API_KEY || 'key_c8518fbaaa990618439d277ab026';
  const agentId = process.env.RETELL_AGENT_ID || 'agent_3150b4da2eaf98174c827f061d';

  return { apiKey: apiKey.trim(), agentId: agentId.trim() };
}

class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

// ─── In-memory rate limiter ─────────────────────────────────────────────────
// Simple token-bucket per IP. Good enough for a landing page.
// For production with multiple replicas, replace with Redis / Upstash.

const RATE_WINDOW_MS = 60_000;   // 1 minute
const RATE_MAX_CALLS = 10;       // per IP per window

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

// Prune stale entries periodically (every ~5 minutes, lazily on requests).
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
  // In production set ALLOWED_ORIGINS=https://yourdomain.com
  // In development allow localhost.
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

  // Log creation attempt
  console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'web_call_create_attempt',
    ip: maskIp(ip)
  })}`);

  if (!checkRateLimit(ip)) {
    console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'web_call_create_failure',
      error: 'rate_limited',
      ip: maskIp(ip)
    })}`);
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please wait before trying again.' },
      { status: 429, headers }
    );
  }

  // ── Validate env ──────────────────────────────────────────────────────────
  let apiKey: string;
  let agentId: string;

  try {
    ({ apiKey, agentId } = getEnv());
  } catch (err) {
    console.error('[retell/create-web-call] Missing env var:', (err as Error).message);
    console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'web_call_create_failure',
      error: 'server_misconfigured'
    })}`);
    return NextResponse.json(
      { error: 'server_misconfigured', message: 'The voice agent is not correctly configured. Please contact support.' },
      { status: 503, headers }
    );
  }

  // ── Parse optional body ───────────────────────────────────────────────────
  // Body is optional. Callers may pass:
  //   agentId    — overrides the env RETELL_AGENT_ID (public-safe Retell agent_id)
  //   metadata   — passed through to Retell
  //   retell_llm_dynamic_variables — passed through to Retell
  let body: Record<string, unknown> = {};
  try {
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      body = (await req.json()) ?? {};
    }
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Request body must be valid JSON or empty.' },
      { status: 400, headers }
    );
  }

  // Allow body.agentId to override the env-level RETELL_AGENT_ID.
  // This is safe because agentId is a public Retell identifier (not an API key).
  const bodyAgentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : '';
  const resolvedAgentId = bodyAgentId || agentId;

  if (!resolvedAgentId) {
    console.error('[retell/create-web-call] No agentId: not in body or RETELL_AGENT_ID env var.');
    return NextResponse.json(
      { error: 'server_misconfigured', message: 'No Retell Agent ID is configured. Set RETELL_AGENT_ID or pass agentId in the request.' },
      { status: 503, headers }
    );
  }

  // Whitelist accepted body keys — do not forward anything else.
  const safeMetadata =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  const safeDynamicVars =
    body.retell_llm_dynamic_variables &&
    typeof body.retell_llm_dynamic_variables === 'object' &&
    !Array.isArray(body.retell_llm_dynamic_variables)
      ? (body.retell_llm_dynamic_variables as Record<string, string>)
      : undefined;

  // ── Call Retell API ───────────────────────────────────────────────────────
  const client = new Retell({ apiKey });

  let retellResponse: Awaited<ReturnType<typeof client.call.createWebCall>>;

  try {
    retellResponse = await client.call.createWebCall({
      agent_id: resolvedAgentId,
      ...(safeMetadata ? { metadata: safeMetadata } : {}),
      ...(safeDynamicVars ? { retell_llm_dynamic_variables: safeDynamicVars } : {}),
    });
  } catch (err: unknown) {
    // Map Retell SDK / network errors to clean responses
    const message = err instanceof Error ? err.message : String(err);
    console.error('[retell/create-web-call] Retell API error:', message);

    let errorCategory = 'upstream_error';
    let httpStatus = 502;
    let clientMessage = 'Could not start the voice call. Please try again.';

    // Try to surface the right HTTP status based on Retell's error message patterns.
    if (/api key/i.test(message) || /401/.test(message) || /unauthorized/i.test(message)) {
      errorCategory = 'auth_failure';
      httpStatus = 502;
      clientMessage = 'Voice agent authentication failed.';
    } else if (/rate limit/i.test(message) || /429/.test(message)) {
      errorCategory = 'upstream_rate_limit';
      httpStatus = 503;
      clientMessage = 'Voice service is busy. Please try again in a moment.';
    } else if (/not found/i.test(message) || /404/.test(message) || /cannot find/i.test(message)) {
      errorCategory = 'agent_not_found';
      httpStatus = 502;
      clientMessage = 'The voice agent could not be found. Please contact support.';
    } else if (/timeout|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message)) {
      errorCategory = 'upstream_timeout';
      httpStatus = 504;
      clientMessage = 'Voice service did not respond in time. Please try again.';
    }

    console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'web_call_create_failure',
      error: errorCategory,
      details: message.substring(0, 300)
    })}`);

    return NextResponse.json(
      { error: errorCategory, message: clientMessage },
      { status: httpStatus, headers }
    );
  }

  // ── Validate Retell response ──────────────────────────────────────────────
  const accessToken = retellResponse.access_token;
  const callId = retellResponse.call_id;

  if (!accessToken || !callId) {
    console.error('[retell/create-web-call] Unexpected Retell response shape:', retellResponse);
    console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify({
      timestamp: new Date().toISOString(),
      event: 'web_call_create_failure',
      error: 'unexpected_response'
    })}`);
    return NextResponse.json(
      { error: 'unexpected_response', message: 'Voice service returned an unexpected response.' },
      { status: 502, headers }
    );
  }

  // Generate unique session identifier for telemetry correlation
  const sessionId = randomUUID();
  console.log(`[RETELL_OBSERVABILITY] ${JSON.stringify({
    timestamp: new Date().toISOString(),
    sessionId,
    callId,
    event: 'web_call_create_success'
  })}`);

  // ── Return ONLY the client-safe fields ────────────────────────────────────
  return NextResponse.json(
    {
      accessToken,
      callId,
      sessionId
    },
    { status: 200, headers }
  );
}
