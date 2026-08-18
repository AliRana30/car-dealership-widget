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
    let rawWidgetId =
      queryWidgetId ||
      headerWidgetId ||
      body.widgetId ||
      body.widget_id ||
      body.call?.metadata?.widgetId ||
      body.call?.metadata?.widget_id ||
      body.metadata?.widgetId ||
      body.metadata?.widget_id ||
      '00000000-0000-0000-0000-000000000000';

    const widget = await getWidget(rawWidgetId);
    const resolvedWidgetId = widget?.id || rawWidgetId;

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
        const result = await executeAgentTool(resolvedWidgetId, toolName, args);
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
      const result = await executeAgentTool(resolvedWidgetId, toolName, args);
      return NextResponse.json({ result: JSON.stringify(result.data || { error: result.error }) });
    }

    // 4. Handle Retell AI custom_tool format
    const toolName = body.name || body.tool_name || body.function_name || body.tool || '';
    const args = body.args || body.parameters || body.arguments || body;

    console.log(`[agent-tools/retell] Executing tool '${toolName}' for widget ${resolvedWidgetId}`);
    const result = await executeAgentTool(resolvedWidgetId, toolName, args);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 400 });
    }

    return NextResponse.json(result.data);
  } catch (err: any) {
    console.error('[agent-tools] Webhook error:', err);
    return NextResponse.json({ error: 'tool_execution_failed', message: err.message }, { status: 500 });
  }
}
