import { NextRequest, NextResponse } from 'next/server';
import { getWidgetConfiguration, saveWidgetConfiguration } from '@/config/widgetsDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ widgetId: string }> | { widgetId: string };
};

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

// GET /api/widgets/[widgetId]/configuration
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const userId = req.headers.get('x-user-id') || undefined;

    const resolvedParams = await context.params;
    const { widgetId } = resolvedParams;

    if (!widgetId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing widget ID' }, { status: 400 });
    }

    const config = await getWidgetConfiguration(widgetId, userId);
    if (!config) {
      return NextResponse.json({ error: 'not_found', message: 'Widget or configuration not found' }, { status: 404 });
    }

    return NextResponse.json(config, {
      status: 200,
      headers: NO_CACHE_HEADERS,
    });
  } catch (error: any) {
    console.error('[api/widgets/[widgetId]/configuration] GET failed:', error);
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
}

// PUT /api/widgets/[widgetId]/configuration
export async function PUT(req: NextRequest, context: RouteContext) {
  try {
    const userId = req.headers.get('x-user-id') || undefined;

    const resolvedParams = await context.params;
    const { widgetId } = resolvedParams;

    if (!widgetId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing widget ID' }, { status: 400 });
    }

    const body = await req.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'bad_request', message: 'Invalid payload' }, { status: 400 });
    }

    // Save configuration with deep partial merging supported
    const savedConfig = await saveWidgetConfiguration(widgetId, body, userId);

    if (!savedConfig) {
      return NextResponse.json({ error: 'not_found', message: 'Widget not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: 'Configuration saved successfully',
        configuration: savedConfig,
      },
      {
        status: 200,
        headers: NO_CACHE_HEADERS,
      }
    );
  } catch (error: any) {
    console.error('[api/widgets/[widgetId]/configuration] PUT failed:', error);
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
}
