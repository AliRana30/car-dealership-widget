/**
 * POST /api/retell/create-web-call
 * Alias route handler for initiating Retell WebRTC calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import Retell from 'retell-sdk';
import { randomUUID } from 'crypto';
import { getWidget, getWebsiteContextSummary } from '@/config/widgetsDb';
import { registerCallTimeout } from '@/lib/voice/callLimiter';
import { checkAndIncrementUsage } from '@/lib/usage/spendLimiter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const widgetId = body.widgetId || 'default';
    const agentIdFromReq = body.agentId;

    // 1. Try to load widget or fallback to default environment credentials
    let widget = await getWidget(widgetId);

    // 2. Check per-widget daily call limit & circuit breaker (Task C.3)
    const maxDailyCalls = widget?.config?.behavior?.maxDailyCalls ?? 100;
    const maxDailyChats = widget?.config?.behavior?.maxDailyChats ?? 500;
    const usageCheck = await checkAndIncrementUsage(widget?.widgetId || widgetId, 'call', { maxDailyCalls, maxDailyChats });

    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: 'daily_limit_exceeded',
          message: usageCheck.reason || 'This assistant is temporarily unavailable. Please try again later or contact us directly.',
          isCircuitBreakerTripped: true,
        },
        { status: 429 }
      );
    }
    
    const apiKey = (widget?.retellApiKey || process.env.RETELL_API_KEY || '').trim();
    const agentId = (agentIdFromReq || widget?.agentId || process.env.RETELL_AGENT_ID || '').trim();

    if (!apiKey || !agentId) {
      return NextResponse.json(
        {
          error: 'misconfigured',
          message: 'Retell credentials (API Key or Agent ID) are not configured. Please enter your Retell credentials in the customizer.',
        },
        { status: 503 }
      );
    }

    const websiteId = widget?.websiteId || '00000000-0000-0000-0000-000000000000';
    const websiteContext = await getWebsiteContextSummary(websiteId);

    const client = new Retell({ apiKey });
    
    const safeDynamicVars: Record<string, string> = {};
    if (body.retell_llm_dynamic_variables && typeof body.retell_llm_dynamic_variables === 'object') {
      for (const [k, v] of Object.entries(body.retell_llm_dynamic_variables)) {
        if (typeof v === 'string') safeDynamicVars[k] = v;
        else if (v !== null && v !== undefined) safeDynamicVars[k] = JSON.stringify(v);
      }
    }
    if (websiteContext) {
      safeDynamicVars.website_context = websiteContext;
    }

    const retellPayload: any = {
      agent_id: agentId,
      ...(body.metadata && typeof body.metadata === 'object' ? { metadata: body.metadata } : {}),
    };

    if (Object.keys(safeDynamicVars).length > 0) {
      retellPayload.retell_llm_dynamic_variables = safeDynamicVars;
    }

    const retellResponse = await client.call.createWebCall(retellPayload);

    const accessToken = retellResponse.access_token;
    const callId = retellResponse.call_id;

    if (!accessToken || !callId) {
      throw new Error('Retell API response is missing accessToken or callId.');
    }

    // Register server-side call duration cap & initial silence watchdog (Task C.1 & C.2)
    const maxCallDurationMinutes = widget?.config?.behavior?.maxCallDurationMinutes ?? 10;
    const initialSilenceTimeoutSeconds = widget?.config?.behavior?.initialSilenceTimeoutSeconds ?? 15;
    registerCallTimeout({
      callId,
      provider: 'retell',
      apiKey,
      maxDurationMinutes: maxCallDurationMinutes,
      initialSilenceTimeoutSeconds,
      widgetId: widget?.widgetId || widgetId,
    });

    const sessionId = randomUUID();

    return NextResponse.json({
      provider: 'retell',
      accessToken,
      callId,
      sessionId,
      maxCallDurationMinutes,
      initialSilenceTimeoutSeconds,
    });
  } catch (err: any) {
    console.error('[api/retell/create-web-call] Error:', err);
    return NextResponse.json(
      { error: 'upstream_error', message: err.message || 'Failed to create Retell web call' },
      { status: 502 }
    );
  }
}
