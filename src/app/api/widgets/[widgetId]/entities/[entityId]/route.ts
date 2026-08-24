/**
 * Widget Single Entity Lookup Route (Phase 6.1)
 *
 * GET /api/widgets/[widgetId]/entities/[entityId]
 *
 * Retrieves exact live details for a single entity by ID, scoped to the widget.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWidget } from '@/config/widgetsDb';
import { getEntityDetails } from '@/lib/agents/tools';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ widgetId: string; entityId: string }> };

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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin');
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function GET(req: NextRequest, { params }: Params) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  try {
    const { widgetId, entityId } = await params;

    const widget = await getWidget(widgetId);
    if (!widget) {
      return NextResponse.json(
        { error: 'not_found', message: `Widget '${widgetId}' not found` },
        { status: 404, headers }
      );
    }

    const entity = await getEntityDetails(widget.id, entityId);

    if (!entity) {
      return NextResponse.json(
        { error: 'not_found', message: `Entity '${entityId}' not found for widget '${widgetId}'` },
        { status: 404, headers }
      );
    }

    return NextResponse.json({ entity }, { status: 200, headers });
  } catch (err: any) {
    console.error('[api/widgets/entities/[entityId]] GET error:', err);
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500, headers });
  }
}
