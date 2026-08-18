import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

type Params = { params: Promise<{ websiteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return new NextResponse('Authentication required', { status: 401 });
    }

    const { websiteId } = await params;
    const supabase = getSupabase();

    // Verify ownership
    const { data: existingWebsite, error: checkError } = await supabase
      .from('websites')
      .select('id')
      .eq('id', websiteId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError || !existingWebsite) {
      return new NextResponse('Website not found or access denied', { status: 404 });
    }

    const { data: widgets } = await supabase
      .from('widgets')
      .select('id')
      .eq('website_id', websiteId);

    const widgetIds = widgets?.map(w => w.id) || [];
    if (widgetIds.length === 0) {
      widgetIds.push('00000000-0000-0000-0000-000000000000');
    }

    const { data: records, error } = await supabase
      .from('website_data')
      .select('source_url, title, entity_type, content, metadata, short_description, image_urls')
      .in('widget_id', widgetIds)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format output beautifully for the browser
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Website Intelligence Data</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; color: #0f172a; padding: 2rem; }
          .container { max-width: 1000px; margin: 0 auto; }
          h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
          p { color: #64748b; margin-top: 0; }
          .card { background: white; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
          .card-title { font-weight: 600; font-size: 1.1rem; color: #2563eb; text-decoration: none; }
          .card-title:hover { text-decoration: underline; }
          .badge { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 999px; background: #e2e8f0; font-weight: 600; text-transform: uppercase; }
          .card-content { font-size: 0.95rem; line-height: 1.5; margin-bottom: 1rem; }
          pre { background: #f1f5f9; padding: 1rem; border-radius: 6px; font-size: 0.85rem; overflow-x: auto; margin: 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Website Intelligence</h1>
          <p>${records?.length || 0} records indexed and ready for AI Agent context injection.</p>
          
          ${(records || []).map(r => {
            const shortDesc = r.short_description ? `<div style="font-style: italic; color: #475569; margin-bottom: 0.5rem;">${r.short_description}</div>` : '';
            const imagesHtml = Array.isArray(r.image_urls) && r.image_urls.length > 0
              ? `<div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem; overflow-x: auto;">
                  ${r.image_urls.map((img: string) => `<img src="${img}" style="height: 60px; border-radius: 4px; object-fit: cover;" />`).join('')}
                 </div>`
              : '';

            return `
              <div class="card">
                <div class="card-header">
                  <a href="${r.source_url || '#'}" target="_blank" class="card-title">${r.title || 'Untitled'}</a>
                  <span class="badge">${r.entity_type}</span>
                </div>
                ${shortDesc}
                ${imagesHtml}
                <div class="card-content">${r.content}</div>
                ${Object.keys(r.metadata || {}).length > 0 ? `
                  <pre><code>${JSON.stringify(r.metadata, null, 2)}</code></pre>
                ` : ''}
              </div>
            `;
          }).join('')}

          ${records?.length === 0 ? `
            <div class="card" style="text-align: center; color: #64748b; padding: 3rem;">
              No records found. Make sure the crawl job completed successfully.
            </div>
          ` : ''}
        </div>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
