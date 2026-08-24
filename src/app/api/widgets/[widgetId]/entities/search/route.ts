/**
 * Widget Entity Search API Route (Phase 6.1)
 *
 * GET / POST /api/widgets/[widgetId]/entities/search
 *
 * Executes real-time vector similarity and keyword search scoped to a specific widget.
 * Returns results in full Entity shape.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWidget } from '@/config/widgetsDb';
import { searchEntities } from '@/lib/agents/tools';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ widgetId: string }> };

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    const { widgetId } = await params;
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 3;

    if (!query || !query.trim()) {
      return NextResponse.json({ entities: [], count: 0, query: '' }, { status: 200, headers });
    }

    // Resolve widget ID if slug was passed
    const widget = await getWidget(widgetId);
    if (!widget) {
      return NextResponse.json({ error: 'not_found', message: `Widget '${widgetId}' not found` }, { status: 404, headers });
    }

    const entities = await searchEntities(widget.id, query, limit);

    return NextResponse.json({
      entities,
      count: entities.length,
      query,
    }, { status: 200, headers });
  } catch (err: any) {
    console.error('[api/widgets/entities/search] GET error:', err);
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500, headers });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  try {
    const { widgetId } = await params;
    const body = await req.json().catch(() => ({}));
    const query = String(body.query || '');
    const limit = typeof body.limit === 'number' ? body.limit : 3;

    if (!query || !query.trim()) {
      return NextResponse.json({ entities: [], count: 0, query: '' }, { status: 200, headers });
    }

    const widget = await getWidget(widgetId);
    if (!widget) {
      return NextResponse.json({ error: 'not_found', message: `Widget '${widgetId}' not found` }, { status: 404, headers });
    }

    const entities = await searchEntities(widget.id, query, limit);

    return NextResponse.json({
      entities,
      count: entities.length,
      query,
    }, { status: 200, headers });
  } catch (err: any) {
    console.error('[api/widgets/entities/search] POST error:', err);
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500, headers });
  }
}
