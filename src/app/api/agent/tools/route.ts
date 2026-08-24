/**
 * Agent Tool Webhook API Handler (Phase 6.1)
 *
 * POST /api/agent/tools
 *
 * Universal function-calling webhook endpoint for live Retell AI and Vapi AI voice agents.
 * Dynamically resolves the calling widget and executes search_entities or get_entity_details.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeAgentTool } from '@/lib/agents/tools';
import { getWidget } from '@/config/widgetsDb';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryWidgetId = searchParams.get('widgetId') || searchParams.get('widget_id');
    const headerWidgetId = req.headers.get('x-widget-id');

    const body = await req.json().catch(() => ({}));

    // 1. Resolve widget ID from query, header, or payload metadata
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

    if (!rawWidgetId || rawWidgetId === '00000000-0000-0000-0000-000000000000') {
      console.warn('[agent-tools:SCOPE_ENFORCEMENT] Tool webhook called with missing widget scope. Failing closed.');
      return NextResponse.json({
        success: false,
        error: 'widget_not_found',
        message: 'Widget scope missing or invalid.',
      }, { status: 200 });
    }

    const widget = await getWidget(rawWidgetId);
    if (!widget) {
      console.warn(`[agent-tools:SCOPE_ENFORCEMENT] Tool webhook widget not found for '${rawWidgetId}'. Failing closed.`);
      return NextResponse.json({
        success: false,
        error: 'widget_not_found',
        message: `Widget '${rawWidgetId}' not found.`,
      }, { status: 200 });
    }

    const resolvedWidgetId = widget.id || rawWidgetId;

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

    const allowAgentNavigation = widget?.config?.behavior?.allowAgentNavigation ?? false;
    const context = { sessionId, allowAgentNavigation };

    // 2. Handle Vapi AI tool-calls format
    if (body.message?.type === 'tool-calls' && Array.isArray(body.message.toolCalls)) {
      const toolCallResults = [];
      for (const call of body.message.toolCalls) {
        const toolName = call.function?.name || '';
        let args = call.function?.arguments || {};
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch {}
        }
        console.log(`[agent-tools/vapi] Executing tool '${toolName}' for widget ${resolvedWidgetId}`);
        const result = await executeAgentTool(resolvedWidgetId, toolName, args, context);
        toolCallResults.push({
          toolCallId: call.id,
          result: JSON.stringify(result.data || { error: result.error }),
        });
      }
      return NextResponse.json({ results: toolCallResults });
    }

    // 3. Handle Vapi AI legacy function-call format
    if (body.message?.type === 'function-call' && body.message.functionCall) {
      const toolName = body.message.functionCall.name || '';
      const args = body.message.functionCall.parameters || {};
      console.log(`[agent-tools/vapi-legacy] Executing '${toolName}' for widget ${resolvedWidgetId}`);
      const result = await executeAgentTool(resolvedWidgetId, toolName, args, context);
      return NextResponse.json({ result: JSON.stringify(result.data || { error: result.error }) });
    }

    // 4. Handle Retell AI & Frontend Widget custom_tool format
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

    // Normalize tool names (e.g. 'search' -> 'search_entities', 'get_details' -> 'get_entity_details', 'navigate' -> 'navigate_to_entity')
    let toolName = rawTool;
    if (rawTool === 'search' || rawTool === 'search_entity' || rawTool === 'search_knowledge_base') {
      toolName = 'search_entities';
    } else if (rawTool === 'get_details' || rawTool === 'get_entity' || rawTool === 'details') {
      toolName = 'get_entity_details';
    } else if (rawTool === 'navigate' || rawTool === 'navigate_to_page' || rawTool === 'open_page') {
      toolName = 'navigate_to_entity';
    }

    let args = body.args || body.arguments || body.parameters || body.input || body;
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch {}
    }

    console.log(`[agent-tools] Executing tool '${toolName}' (raw: '${rawTool}') for widget ${resolvedWidgetId}`);
    const result = await executeAgentTool(resolvedWidgetId, toolName, args, context);

    return NextResponse.json({
      success: result.success,
      ...(result.data || {}),
      ...(result.error ? { error: result.error, message: result.error } : {}),
    });
  } catch (err: any) {
    console.error('[agent-tools] Webhook error:', err);
    return NextResponse.json({ success: false, error: 'tool_execution_failed', message: err.message }, { status: 200 });
  }
}
