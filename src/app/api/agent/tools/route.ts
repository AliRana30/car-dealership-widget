/**
 * Agent Tool Webhook API Handler (Production Hardened Gateway)
 *
 * POST /api/agent/tools
 *
 * Universal function-calling webhook endpoint for live Retell AI and Vapi AI voice agents.
 *
 * Security & Hardening Features:
 * 1. Provider Cryptographic Verification (Retell HMAC-SHA256 & Vapi Server Secret)
 * 2. Tenant Isolation & Cross-Widget Tampering Protection (Prevents arbitrary widget_id access)
 * 3. Sliding-Window Rate Limiting (IP and Widget levels)
 * 4. Tool-Call Abuse Protection (Batch size caps, string bounds, ReDoS prevention)
 * 5. Strict Tool Name Allowlisting
 * 6. Strict Tool Argument Schema Validation
 * 7. Server-Side Execution (Zero arbitrary SQL/DB bypass)
 * 8. Secret Redaction from Logs and Responses
 * 9. Exact Retell and Vapi Response Compatibility
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeAgentTool } from '@/lib/agents/tools';
import { getWidget } from '@/config/widgetsDb';
import {
  isToolAllowed,
  verifyProviderAuth,
  validateScopeAndTampering,
  checkGatewayRateLimit,
  validateBatchSize,
  validateToolArgs,
  sanitizeLogPayload,
} from '@/lib/agents/gatewaySecurity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const { searchParams } = new URL(req.url);
    const queryWidgetId = searchParams.get('widgetId') || searchParams.get('widget_id');
    const headerWidgetId = req.headers.get('x-widget-id');

    // 1. Safe JSON parsing with malformed body rejection
    let body: any = {};
    if (rawBody && rawBody.trim()) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        return NextResponse.json(
          { success: false, error: 'malformed_json', message: 'Request body must be valid JSON.' },
          { status: 400 }
        );
      }
    }

    // 2. Client IP Extraction
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown_ip';

    // 3. Resolve widget ID from query, header, or payload metadata
    const rawWidgetId =
      queryWidgetId ||
      headerWidgetId ||
      body.widgetId ||
      body.widget_id ||
      body.call?.metadata?.widgetId ||
      body.call?.metadata?.widget_id ||
      body.metadata?.widgetId ||
      body.metadata?.widget_id ||
      '';

    // 4. Rate Limiting (Sliding Window per IP & Widget)
    const rateCheck = checkGatewayRateLimit(ip, rawWidgetId);
    if (!rateCheck.allowed) {
      console.warn(`[agent-tools:RATE_LIMIT] Request rejected from IP ${ip} / widget ${rawWidgetId}: ${rateCheck.reason}`);
      return NextResponse.json(
        {
          success: false,
          error: 'rate_limit_exceeded',
          message: rateCheck.reason || 'Too many requests. Please slow down.',
          retryAfter: rateCheck.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfter || 60),
          },
        }
      );
    }

    // 5. Lookup Widget
    let widget = null;
    if (rawWidgetId && rawWidgetId !== '00000000-0000-0000-0000-000000000000') {
      widget = await getWidget(rawWidgetId);
    }

    // 6. Scope & Cross-Tenant Tampering Validation
    const scopeCheck = validateScopeAndTampering(rawWidgetId, widget, body, queryWidgetId);
    if (!scopeCheck.valid) {
      console.warn(`[agent-tools:SCOPE_ENFORCEMENT] Scope failure for widget '${rawWidgetId}': ${scopeCheck.error}`);
      return NextResponse.json(
        {
          success: false,
          error: scopeCheck.error === 'Widget scope missing or invalid.' ? 'widget_not_found' : 'forbidden',
          message: scopeCheck.error,
        },
        { status: scopeCheck.status || 400 }
      );
    }

    const resolvedWidgetId = widget!.id || rawWidgetId;

    // 7. Provider Authentication & Signature Verification
    const authCheck = verifyProviderAuth(req, rawBody, widget);
    if (!authCheck.valid) {
      console.warn(`[agent-tools:AUTH] Authentication failed for provider '${authCheck.provider}': ${authCheck.error}`);
      return NextResponse.json(
        {
          success: false,
          error: 'unauthorized',
          message: authCheck.error || 'Provider authentication failed.',
        },
        { status: 401 }
      );
    }

    // Resolve session ID for realtime navigation dispatch
    const sessionId =
      body.sessionId ||
      body.session_id ||
      body.call?.metadata?.sessionId ||
      body.call?.metadata?.session_id ||
      body.call?.retell_llm_dynamic_variables?.session_id ||
      body.message?.call?.variableValues?.session_id ||
      body.args?.sessionId ||
      body.parameters?.sessionId ||
      '';

    const allowAgentNavigation = widget?.config?.behavior?.allowAgentNavigation !== false;
    const context = { sessionId, allowAgentNavigation, businessName: widget?.name };

    // ── 8. Handle Vapi AI tool-calls (Modern Batch Format) ────────────────────
    if (body.message?.type === 'tool-calls' && Array.isArray(body.message.toolCalls)) {
      const batchCheck = validateBatchSize(body.message.toolCalls);
      if (!batchCheck.valid) {
        return NextResponse.json(
          { success: false, error: 'batch_limit_exceeded', message: batchCheck.error },
          { status: 400 }
        );
      }

      const toolCallResults = [];
      for (const call of body.message.toolCalls) {
        const toolName = call.function?.name || '';

        // Allowlist check
        if (!isToolAllowed(toolName)) {
          console.warn(`[agent-tools:VAPI] Rejected non-allowlisted tool '${toolName}' for widget ${resolvedWidgetId}`);
          toolCallResults.push({
            toolCallId: call.id,
            result: JSON.stringify({ error: `Tool '${toolName}' is not permitted.` }),
          });
          continue;
        }

        // Schema validation
        const argCheck = validateToolArgs(toolName, call.function?.arguments || {});
        if (!argCheck.valid) {
          toolCallResults.push({
            toolCallId: call.id,
            result: JSON.stringify({ error: argCheck.error }),
          });
          continue;
        }

        console.log(`[agent-tools/vapi] Executing tool '${toolName}' for widget ${resolvedWidgetId}`);
        const result = await executeAgentTool(resolvedWidgetId, toolName, argCheck.sanitizedArgs, context);
        const safeData = sanitizeLogPayload(result.data || { error: result.error });

        toolCallResults.push({
          toolCallId: call.id,
          result: JSON.stringify(safeData),
        });
      }
      return NextResponse.json({ results: toolCallResults });
    }

    // ── 9. Handle Vapi AI legacy function-call format ─────────────────────────
    if (body.message?.type === 'function-call' && body.message.functionCall) {
      const toolName = body.message.functionCall.name || '';

      if (!isToolAllowed(toolName)) {
        console.warn(`[agent-tools:VAPI-LEGACY] Rejected non-allowlisted tool '${toolName}'`);
        return NextResponse.json({ result: JSON.stringify({ error: `Tool '${toolName}' is not permitted.` }) });
      }

      const argCheck = validateToolArgs(toolName, body.message.functionCall.parameters || {});
      if (!argCheck.valid) {
        return NextResponse.json({ result: JSON.stringify({ error: argCheck.error }) });
      }

      console.log(`[agent-tools/vapi-legacy] Executing '${toolName}' for widget ${resolvedWidgetId}`);
      const result = await executeAgentTool(resolvedWidgetId, toolName, argCheck.sanitizedArgs, context);
      const safeData = sanitizeLogPayload(result.data || { error: result.error });
      return NextResponse.json({ result: JSON.stringify(safeData) });
    }

    // ── 10. Handle Retell AI & Frontend Widget custom_tool format ─────────────
    let rawTool =
      body.name ||
      body.tool_name ||
      body.function_name ||
      body.tool ||
      body.action ||
      body.function ||
      '';

    if (!rawTool && (body.query || body.search || body.q)) {
      rawTool = 'search_entities';
    }

    if (!rawTool) {
      return NextResponse.json(
        { success: false, error: 'missing_tool_name', message: 'Tool name is required in request payload.' },
        { status: 400 }
      );
    }

    // Allowlist check
    if (!isToolAllowed(rawTool)) {
      console.warn(`[agent-tools:RETELL] Rejected non-allowlisted tool '${rawTool}' for widget ${resolvedWidgetId}`);
      return NextResponse.json(
        { success: false, error: 'unknown_tool', message: `Tool '${rawTool}' is not permitted.` },
        { status: 200 } // Retell voice agent expects status 200 with success: false
      );
    }

    const rawArgs = body.args || body.arguments || body.parameters || body.input || body;
    const argCheck = validateToolArgs(rawTool, rawArgs);
    if (!argCheck.valid) {
      return NextResponse.json(
        { success: false, error: 'invalid_arguments', message: argCheck.error },
        { status: 200 }
      );
    }

    console.log(`[agent-tools] Executing tool '${rawTool}' for widget ${resolvedWidgetId}`);
    const result = await executeAgentTool(resolvedWidgetId, rawTool, argCheck.sanitizedArgs, context);
    const safeData = sanitizeLogPayload(result.data || {});

    return NextResponse.json({
      success: result.success,
      ...safeData,
      ...(result.error ? { error: result.error, message: result.error } : {}),
    });
  } catch (err: any) {
    console.error('[agent-tools] Webhook error:', err);
    return NextResponse.json(
      { success: false, error: 'tool_execution_failed', message: 'An internal error occurred during tool execution.' },
      { status: 200 }
    );
  }
}
