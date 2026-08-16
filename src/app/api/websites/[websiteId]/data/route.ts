import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

type Params = { params: Promise<{ websiteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { websiteId } = await params;
    const supabase = getSupabase();

    const { data: records, error } = await supabase
      .from('website_data')
      .select('url, title, data_type, content, metadata')
      .eq('website_id', websiteId)
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
          
          ${(records || []).map(r => `
            <div class="card">
              <div class="card-header">
                <a href="${r.url}" target="_blank" class="card-title">${r.title || 'Untitled'}</a>
                <span class="badge">${r.data_type}</span>
              </div>
              <div class="card-content">${r.content}</div>
              ${Object.keys(r.metadata || {}).length > 0 ? `
                <pre><code>${JSON.stringify(r.metadata, null, 2)}</code></pre>
              ` : ''}
            </div>
          `).join('')}

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
