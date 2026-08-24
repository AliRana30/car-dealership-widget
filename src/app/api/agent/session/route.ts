/**
 * Session Context Inspection & Management API
 *
 * GET  /api/agent/session?widgetId=xxx&sessionId=yyy
 * POST /api/agent/session { widgetId, sessionId, action, updates, entity }
 *
 * Allows inspecting and testing durable multi-turn session state.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionContext,
  updateSessionContext,
  clearSessionContext,
  pinEntity,
  activeSessionCount,
  type DurableSessionContext,
} from '@/lib/agents/sessionContext';
import { getWidget } from '@/config/widgetsDb';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const widgetId = searchParams.get('widgetId') || searchParams.get('widget_id') || '';
    const sessionId = searchParams.get('sessionId') || searchParams.get('session_id') || '';

    if (!widgetId) {
      return NextResponse.json({
        success: false,
        error: 'missing_widget_id',
        message: 'widgetId parameter is required.',
      }, { status: 400 });
    }

    if (!sessionId) {
      return NextResponse.json({
        success: false,
        error: 'missing_session_id',
        message: 'sessionId parameter is required.',
      }, { status: 400 });
    }

    const widget = await getWidget(widgetId);
    if (!widget) {
      return NextResponse.json({
        success: false,
        error: 'widget_not_found',
        message: `Widget '${widgetId}' not found.`,
      }, { status: 404 });
    }

    const targetWidgetId = (widget.id && widget.id !== '00000000-0000-0000-0000-000000000000')
      ? widget.id
      : (widget.widgetId || widgetId);

    const session = await getSessionContext(sessionId, targetWidgetId);

    return NextResponse.json({
      success: true,
      widgetId: targetWidgetId,
      sessionId,
      session,
      activeInMemoryCount: activeSessionCount(),
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: err.message,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const widgetId = String(body.widgetId || body.widget_id || '').trim();
    const sessionId = String(body.sessionId || body.session_id || '').trim();
    const action = String(body.action || 'update').toLowerCase();

    if (!widgetId || !sessionId) {
      return NextResponse.json({
        success: false,
        error: 'missing_params',
        message: 'widgetId and sessionId are required.',
      }, { status: 400 });
    }

    const widget = await getWidget(widgetId);
    if (!widget) {
      return NextResponse.json({
        success: false,
        error: 'widget_not_found',
        message: `Widget '${widgetId}' not found.`,
      }, { status: 404 });
    }

    const targetWidgetId = (widget.id && widget.id !== '00000000-0000-0000-0000-000000000000')
      ? widget.id
      : (widget.widgetId || widgetId);

    if (action === 'clear') {
      await clearSessionContext(sessionId, targetWidgetId);
      return NextResponse.json({
        success: true,
        action: 'clear',
        sessionId,
        widgetId: targetWidgetId,
        cleared: true,
      });
    }

    if (action === 'pin' && body.entity) {
      const session = await pinEntity(sessionId, targetWidgetId, body.entity);
      return NextResponse.json({
        success: true,
        action: 'pin',
        sessionId,
        widgetId: targetWidgetId,
        session,
      });
    }

    const updates = (body.updates || {}) as Partial<DurableSessionContext>;
    const session = await updateSessionContext(sessionId, targetWidgetId, updates);

    return NextResponse.json({
      success: true,
      action: 'update',
      sessionId,
      widgetId: targetWidgetId,
      session,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'server_error',
      message: err.message,
    }, { status: 500 });
  }
}
