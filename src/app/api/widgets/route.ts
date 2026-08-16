import { NextRequest, NextResponse } from 'next/server';
import { getWidget, saveWidget, listWidgets, deleteWidget } from '@/config/widgetsDb';

// GET /api/widgets
// If ID is provided, returns client-safe visual config and provider name.
// Otherwise, returns the list of all configured widgets for admin dashboard.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const widget = await getWidget(id);
      if (!widget) {
        return NextResponse.json({ error: 'not_found', message: 'Widget not found' }, { status: 404 });
      }

      // Return ONLY client-safe configurations
      return NextResponse.json({
        id: widget.id,
        name: widget.name,
        provider: widget.provider,
        hasRetellApiKey: !!widget.retellApiKey,
        hasVapiApiKey: !!widget.vapiApiKey,
        // Send only safe visual config - no API keys!
        config: widget.config,
      }, { status: 200 });
    }

    // List all widgets for dashboard/admin view
    const list = await listWidgets();
    
    // For admin view, we sanitize API keys (mask them) for security
    const sanitizedList = list.map(w => ({
      id: w.id,
      name: w.name,
      provider: w.provider,
      hasRetellKey: !!w.retellApiKey,
      hasRetellAgentId: !!w.retellAgentId,
      hasVapiKey: !!w.vapiApiKey,
      hasVapiAssistantId: !!w.vapiAssistantId,
      config: w.config,
      createdAt: w.createdAt
    }));

    return NextResponse.json(sanitizedList, { status: 200 });
  } catch (error: any) {
    console.error('[api/widgets] GET failed:', error);
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
}

// POST /api/widgets
// Saves or updates a widget configuration and API keys.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      provider: bodyProvider,
      retellApiKey,
      retellAgentId,
      vapiApiKey,
      vapiAssistantId,
      config,
    } = body;

    // provider can come from explicit body field OR from config.provider.provider
    const provider: string = bodyProvider || config?.provider?.provider || 'retell';

    if (!id || !name || !config) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Missing required fields: id, name, config' },
        { status: 400 }
      );
    }

    if (provider !== 'retell' && provider !== 'vapi') {
      return NextResponse.json(
        { error: 'bad_request', message: "Provider must be 'retell' or 'vapi'" },
        { status: 400 }
      );
    }

    const savedRecord = await saveWidget({
      id: id.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
      name: name.trim(),
      provider,
      retellApiKey: retellApiKey ? retellApiKey.trim() : undefined,
      retellAgentId: retellAgentId ? retellAgentId.trim() : undefined,
      vapiApiKey: vapiApiKey ? vapiApiKey.trim() : undefined,
      vapiAssistantId: vapiAssistantId ? vapiAssistantId.trim() : undefined,
      config,
    });

    return NextResponse.json({
      message: 'Widget saved successfully',
      widget: {
        id: savedRecord.id,
        name: savedRecord.name,
        provider: savedRecord.provider,
        config: savedRecord.config,
      }
    }, { status: 200 });
  } catch (error: any) {
    console.error('[api/widgets] POST failed:', error);
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
}

// DELETE /api/widgets
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing widget ID' }, { status: 400 });
    }

    const success = await deleteWidget(id);
    if (!success) {
      return NextResponse.json({ error: 'not_found', message: 'Widget not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Widget deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error('[api/widgets] DELETE failed:', error);
    return NextResponse.json({ error: 'server_error', message: error.message }, { status: 500 });
  }
}
