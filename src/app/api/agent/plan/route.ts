/**
 * Query Planner Inspection & Execution API Endpoint
 *
 * POST /api/agent/plan
 *
 * Body parameters:
 *  - widgetId (string, required): Widget ID or slug
 *  - query (string, required): User query to plan or execute
 *  - execute (boolean, optional, default false): If true, runs the plan; if false, only plans
 *  - sessionId (string, optional): Session ID for context/navigation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWidget } from '@/config/widgetsDb';
import { planQuery, executePlan, planAndExecute } from '@/lib/agents/queryPlanner';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const queryWidgetId = searchParams.get('widgetId') || searchParams.get('widget_id');
    const headerWidgetId = req.headers.get('x-widget-id');

    const body = await req.json().catch(() => ({}));
    const rawWidgetId =
      queryWidgetId ||
      headerWidgetId ||
      body.widgetId ||
      body.widget_id ||
      '';

    const rawQuery = String(body.query || body.q || body.message || searchParams.get('query') || '').trim();

    if (!rawWidgetId || rawWidgetId === '00000000-0000-0000-0000-000000000000') {
      return NextResponse.json({
        success: false,
        error: 'widget_not_found',
        message: 'Widget scope missing or invalid.',
      }, { status: 400 });
    }

    if (!rawQuery) {
      return NextResponse.json({
        success: false,
        error: 'missing_query',
        message: 'Query parameter is required.',
      }, { status: 400 });
    }

    const widget = await getWidget(rawWidgetId);
    if (!widget) {
      return NextResponse.json({
        success: false,
        error: 'widget_not_found',
        message: `Widget '${rawWidgetId}' not found.`,
      }, { status: 404 });
    }

    const resolvedWidgetId = widget.id || rawWidgetId;
    const sessionId = body.sessionId || body.session_id || '';
    const allowNavigation = widget?.config?.behavior?.allowAgentNavigation !== false;
    const shouldExecute = Boolean(body.execute);

    const plan = planQuery(rawQuery, { allowNavigation, sessionId });

    if (!shouldExecute) {
      return NextResponse.json({
        success: true,
        widgetId: resolvedWidgetId,
        query: rawQuery,
        plan,
      });
    }

    const executionResult = await executePlan(plan, resolvedWidgetId, {
      sessionId,
      allowAgentNavigation: allowNavigation,
      businessName: widget.name,
    });

    return NextResponse.json({
      success: true,
      widgetId: resolvedWidgetId,
      query: rawQuery,
      plan,
      execution: executionResult,
    });
  } catch (err: any) {
    console.error('[agent-plan API] Error in /api/agent/plan:', err);
    return NextResponse.json({
      success: false,
      error: 'internal_error',
      message: err.message || 'Failed to plan or execute query.',
    }, { status: 500 });
  }
}
