import { NextRequest, NextResponse } from 'next/server';
import { getWidgetConfiguration, saveWidgetConfiguration } from '@/config/widgetsDb';

type RouteContext = {
  params: Promise<{ widgetId: string }> | { widgetId: string };
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

    return NextResponse.json(config, { status: 200 });
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
    const {
      branding,
      theme,
      typography,
      launcher,
      panel,
      call,
      chat,
      behavior,
      responsive,
    } = body;

    // Validate structure
    if (
      !branding ||
      !theme ||
      !typography ||
      !launcher ||
      !panel ||
      !call ||
      !chat ||
      !behavior ||
      !responsive
    ) {
      return NextResponse.json(
        {
          error: 'bad_request',
          message: 'Missing required configuration sections. Make sure to provide branding, theme, typography, launcher, panel, call, chat, behavior, and responsive.',
        },
        { status: 400 }
      );
    }

    const savedConfig = await saveWidgetConfiguration(widgetId, {
      branding,
      theme,
      typography,
      launcher,
      panel,
      call,
      chat,
      behavior,
      responsive,
    }, userId);

    if (!savedConfig) {
      return NextResponse.json({ error: 'not_found', message: 'Widget not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: 'Configuration saved successfully',
        configuration: savedConfig,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[api/widgets/[widgetId]/configuration] PUT failed:', error);
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
}
