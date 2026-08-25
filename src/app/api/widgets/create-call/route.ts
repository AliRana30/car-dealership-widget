import { NextRequest, NextResponse } from 'next/server';
import { getWidget, getWebsiteContextSummary } from '@/config/widgetsDb';
import Retell from 'retell-sdk';
import { randomUUID } from 'crypto';
import { registerCallTimeout } from '@/lib/voice/callLimiter';
import { checkAndIncrementUsage } from '@/lib/usage/spendLimiter';

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

// In-memory rate limiter
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CALLS = 15; // slightly higher limit for multi-widget demo

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

// CORS Headers configuration
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

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  // Rate limit
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

  try {
    let body: Record<string, any> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'invalid_request', message: 'Request body must be valid JSON.' },
        { status: 400, headers }
      );
    }

    const { widgetId, metadata, retell_llm_dynamic_variables } = body;

    if (!widgetId) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Missing required field: widgetId' },
        { status: 400, headers }
      );
    }

    let widget = await getWidget(widgetId);
    if (!widget) {
      // Fallback for default demo widget or unsaved preview
      if (widgetId === 'default' || widgetId === 'front-desk' || widgetId === 'myfrontdesk') {
        widget = {
          id: '00000000-0000-0000-0000-000000000000',
          widgetId: 'default',
          organizationId: '00000000-0000-0000-0000-000000000000',
          name: 'Default Widget',
          status: 'active',
          provider: (process.env.DEFAULT_VOICE_PROVIDER as any) || 'retell',
          agentId: process.env.RETELL_AGENT_ID,
          retellApiKey: process.env.RETELL_API_KEY,
          vapiApiKey: process.env.VAPI_API_KEY,
          allowedDomains: ['*'],
          config: {} as any,
        };
      } else {
        return NextResponse.json(
          { error: 'not_found', message: `Widget with ID '${widgetId}' not found.` },
          { status: 404, headers }
        );
      }
    }

    // ── Check per-widget daily call limit & circuit breaker (Task C.3) ───────
    const maxDailyCalls = widget.config?.behavior?.maxDailyCalls ?? 100;
    const maxDailyChats = widget.config?.behavior?.maxDailyChats ?? 500;
    const usageCheck = await checkAndIncrementUsage(widget.widgetId || widgetId, 'call', { maxDailyCalls, maxDailyChats });

    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: 'daily_limit_exceeded',
          message: usageCheck.reason || 'This assistant is temporarily unavailable. Please try again later or contact us directly.',
          isCircuitBreakerTripped: true,
        },
        { status: 429, headers }
      );
    }

    // Resolve website intelligence context for the widget
    const websiteId = widget.websiteId || '00000000-0000-0000-0000-000000000000';
    const websiteContext = await getWebsiteContextSummary(websiteId);

    // ─── Provider: Retell ──────────────────────────────────────────────────
    if (widget.provider === 'retell' || !widget.provider) {
      const apiKey = (widget.retellApiKey || process.env.RETELL_API_KEY || '').trim();
      const agentId = (widget.agentId || body.agentId || process.env.RETELL_AGENT_ID || '').trim();

      if (!apiKey || !agentId) {
        return NextResponse.json(
          { error: 'misconfigured', message: 'Retell credentials or Agent ID are not configured for this widget.' },
          { status: 503, headers }
        );
      }

      const client = new Retell({ apiKey });
      const sessionId = randomUUID();

      const safeDynamicVars: Record<string, string> = {
        business_name: widget.config?.branding?.companyName || widget.name || 'CampusCore',
        company_name: widget.config?.branding?.companyName || widget.name || 'CampusCore',
        assistant_name: widget.config?.branding?.assistantName || 'Alex',
        user_name: 'Caller',
        transfer_phone_number: '+13464441353',
      };
      if (retell_llm_dynamic_variables && typeof retell_llm_dynamic_variables === 'object') {
        for (const [k, v] of Object.entries(retell_llm_dynamic_variables)) {
          if (typeof v === 'string') safeDynamicVars[k] = v;
          else if (v !== null && v !== undefined) safeDynamicVars[k] = JSON.stringify(v);
        }
      }
      if (websiteContext) {
        safeDynamicVars.website_context = websiteContext;
      }

      const safeMetadata: Record<string, string> = {
        widget_id: widget.widgetId || widgetId,
        session_id: sessionId,
        website_id: websiteId,
        organization_id: widget.organizationId || '',
        user_id: `user_${Date.now()}`,
        provider: 'retell',
        voice_provider: 'retell',
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
      };

      const retellPayload: any = {
        agent_id: agentId,
        metadata: safeMetadata,
        retell_llm_dynamic_variables: safeDynamicVars,
      };

      try {
        const retellResponse = await client.call.createWebCall(retellPayload);

        const accessToken = retellResponse.access_token;
        const callId = retellResponse.call_id;

        if (!accessToken || !callId) {
          throw new Error('Retell API response is missing accessToken or callId.');
        }

        const maxCallDurationMinutes = widget.config?.behavior?.maxCallDurationMinutes ?? 10;
        const initialSilenceTimeoutSeconds = widget.config?.behavior?.initialSilenceTimeoutSeconds ?? 60;
        registerCallTimeout({
          callId,
          provider: 'retell',
          apiKey,
          maxDurationMinutes: maxCallDurationMinutes,
          initialSilenceTimeoutSeconds,
          widgetId: widget.widgetId || widgetId,
        });

        const sessionId = randomUUID();
        console.log(`[WIDGET_CALL_OBSERVABILITY] ${JSON.stringify({
          timestamp: new Date().toISOString(),
          widgetId,
          provider: 'retell',
          sessionId,
          callId,
          maxCallDurationMinutes,
          initialSilenceTimeoutSeconds,
          event: 'call_created'
        })}`);

        return NextResponse.json(
          {
            provider: 'retell',
            accessToken,
            callId,
            sessionId,
            maxCallDurationMinutes,
            initialSilenceTimeoutSeconds,
          },
          { status: 200, headers }
        );
      } catch (err: any) {
        console.error(`[widget/create-call] Retell SDK Error for widget ${widgetId}:`, err.message);
        return NextResponse.json(
          { error: 'upstream_error', message: err.message || 'Retell failed to create the call.' },
          { status: 502, headers }
        );
      }
    }

    // ─── Provider: Vapi ────────────────────────────────────────────────────
    if (widget.provider === 'vapi') {
      const apiKey = (widget.vapiApiKey || '').trim();
      const assistantId = (widget.assistantId || '').trim();

      if (!apiKey || !assistantId) {
        return NextResponse.json(
          { error: 'misconfigured', message: 'Vapi Public API Key or Assistant ID are not configured for this widget.' },
          { status: 503, headers }
        );
      }

      if (apiKey.startsWith('pvk_')) {
        return NextResponse.json(
          { error: 'misconfigured', message: 'You appear to have configured a Vapi Private API Key (starting with "pvk_"). Vapi requires a Public API Key for client-side connections. Please configure a valid Public API Key in your widget settings.' },
          { status: 400, headers }
        );
      }

      const maxCallDurationMinutes = widget.config?.behavior?.maxCallDurationMinutes ?? 10;
      const initialSilenceTimeoutSeconds = widget.config?.behavior?.initialSilenceTimeoutSeconds ?? 60;
      const sessionId = randomUUID();
      console.log(`[WIDGET_CALL_OBSERVABILITY] ${JSON.stringify({
        timestamp: new Date().toISOString(),
        widgetId,
        provider: 'vapi',
        sessionId,
        maxCallDurationMinutes,
        initialSilenceTimeoutSeconds,
        event: 'call_created'
      })}`);

      const vapiAssistantOverrides: Record<string, any> = {
        maxDurationSeconds: maxCallDurationMinutes * 60,
        silenceTimeoutSeconds: initialSilenceTimeoutSeconds,
      };
      if (websiteContext) {
        vapiAssistantOverrides.variableValues = {
          website_context: websiteContext,
        };
      }

      // Vapi Web client SDK handles call signaling directly client-side via WebRTC
      // utilizing the Public API Key and Assistant ID.
      return NextResponse.json(
        {
          provider: 'vapi',
          vapiPublicApiKey: apiKey,
          vapiAssistantId: assistantId,
          vapiAssistantOverrides,
          sessionId,
          maxCallDurationMinutes,
          initialSilenceTimeoutSeconds,
        },
        { status: 200, headers }
      );
    }

    return NextResponse.json(
      { error: 'bad_request', message: `Unknown provider type '${widget.provider}'` },
      { status: 400, headers }
    );
  } catch (error: any) {
    console.error('[widget/create-call] Server Error:', error);
    return NextResponse.json(
      { error: 'server_error', message: error.message || 'An internal server error occurred.' },
      { status: 500, headers }
    );
  }
}
