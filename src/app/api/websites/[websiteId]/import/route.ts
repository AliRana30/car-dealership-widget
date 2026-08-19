import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { mapRawItemToEntity, MAX_MANUAL_ITEMS } from '@/lib/connectors/feed';
import { saveWebsiteDataBatch, WebsiteDataRow } from '@/config/widgetsDb';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ websiteId: string }> }
) {
  try {
    const { websiteId } = await params;
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const items: Record<string, any>[] = body?.items || body?.rows || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'bad_request', message: 'No items provided for import' },
        { status: 400 }
      );
    }

    if (items.length > MAX_MANUAL_ITEMS) {
      return NextResponse.json(
        {
          error: 'payload_too_large',
          message: `Upload exceeds maximum limit of ${MAX_MANUAL_ITEMS} items (provided ${items.length})`,
        },
        { status: 413 }
      );
    }

    const supabase = getSupabase();

    // Verify website exists and belongs to user
    const { data: website, error: wsError } = await supabase
      .from('websites')
      .select('id, name, allowed_domains')
      .eq('id', websiteId)
      .eq('user_id', userId)
      .single();

    if (wsError || !website) {
      return NextResponse.json(
        { error: 'not_found', message: 'Website not found or access denied' },
        { status: 404 }
      );
    }

    // Find associated widgets
    const { data: widgets } = await supabase
      .from('widgets')
      .select('id, widget_id, website_id')
      .or(`id.eq.${websiteId},website_id.eq.${websiteId},widget_id.eq.${websiteId}`);

    const targetWidgetIds = new Set<string>();
    if (widgets && widgets.length > 0) {
      widgets.forEach(w => {
        if (w.id) targetWidgetIds.add(w.id);
      });
    } else if (websiteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId)) {
      targetWidgetIds.add(websiteId);
    }
    const widgetIds = Array.from(targetWidgetIds);

    // Process and map each raw item
    const rowsToSave: WebsiteDataRow[] = [];
    const errors: string[] = [];
    let skippedCount = 0;

    const domain = (website.allowed_domains && website.allowed_domains[0]) || '';
    const fallbackUrl = domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : undefined;

    for (const widgetId of widgetIds) {
      items.forEach((raw, idx) => {
        const { entity, error } = mapRawItemToEntity(raw, fallbackUrl, 'manual');
        if (entity && entity.title) {
          rowsToSave.push({
            widget_id: widgetId,
            title: entity.title,
            content: entity.content || entity.title,
            short_description: entity.short_description || '',
            source_url: entity.source_url,
            entity_type: entity.entity_type || 'product',
            data_type: 'manual',
            image_urls: entity.image_urls || [],
            category_path: entity.category_path || [],
            metadata: entity.metadata || {},
          });
        } else {
          skippedCount++;
          if (errors.length < 10) {
            errors.push(`Row ${idx + 1}: ${error || 'Invalid item format'}`);
          }
        }
      });
    }

    if (rowsToSave.length > 0) {
      console.log(`[api/websites/${websiteId}/import] Ingesting ${rowsToSave.length} manual records...`);
      await saveWebsiteDataBatch(rowsToSave);
    }

    const message =
      skippedCount > 0
        ? `Imported ${rowsToSave.length} items (${skippedCount} of ${items.length} rows skipped — missing title or invalid data).`
        : `Successfully imported all ${rowsToSave.length} items.`;

    return NextResponse.json({
      success: true,
      importedCount: rowsToSave.length,
      skippedCount,
      totalRows: items.length,
      errors: errors.slice(0, 5),
      message,
    });
  } catch (err: any) {
    console.error(`[api/websites/import] Error:`, err);
    return NextResponse.json(
      { error: 'import_failed', message: err.message || 'Failed to import records' },
      { status: 500 }
    );
  }
}
