import { NextRequest, NextResponse } from 'next/server';
import { getWidget, supabase } from '@/config/widgetsDb';

type RouteContext = {
  params: Promise<{ widgetId: string }> | { widgetId: string };
};

// GET /api/widgets/[widgetId] (Public widget configuration for embeds and external integrations)
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const resolvedParams = await context.params;
    const { widgetId } = resolvedParams;

    if (!widgetId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing widget ID' }, { status: 400 });
    }

    const widget = await getWidget(widgetId);
    if (!widget) {
      return NextResponse.json({ error: 'not_found', message: 'Widget not found' }, { status: 404 });
    }

    let websiteName = 'Default Website';
    if (widget.websiteId) {
      const { data: websiteRow } = await supabase
        .from('websites')
        .select('name')
        .eq('id', widget.websiteId)
        .single();
      if (websiteRow) {
        websiteName = websiteRow.name;
      }
    }

    return NextResponse.json({
      id: widget.widgetId,
      name: widget.name,
      provider: widget.provider,
      retellAgentId: widget.agentId,
      vapiAssistantId: widget.assistantId,
      hasRetellApiKey: !!widget.retellApiKey,
      hasVapiApiKey: !!widget.vapiApiKey,
      config: widget.config,
      allowedDomains: widget.allowedDomains || [],
      websiteId: widget.websiteId || '',
      websiteName,
      status: widget.status || 'active',
    }, { status: 200 });
  } catch (error: any) {
    console.error('[api/widgets/[widgetId]] GET failed:', error);
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
}
