import { NextRequest, NextResponse } from 'next/server';
import { getWidget, getRelevantWebsiteRecords } from '@/config/widgetsDb';

type Params = { params: Promise<{ widgetId: string }> };

// CORS headers matching other widget endpoints
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
    'Access-Control-Allow-Headers': 'Content-Type',
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

    if (!query || query.trim() === '') {
      return NextResponse.json([], { status: 200, headers });
    }

    const widget = await getWidget(widgetId);
    if (!widget) {
      return NextResponse.json({ error: 'not_found', message: 'Widget not found' }, { status: 404, headers });
    }

    const websiteId = widget.websiteId || '00000000-0000-0000-0000-000000000000';
    const records = await getRelevantWebsiteRecords(websiteId, query, 3);

    return NextResponse.json(records, { status: 200, headers });
  } catch (err: any) {
    console.error('[api/widgets/search] GET failed:', err);
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500, headers });
  }
}
