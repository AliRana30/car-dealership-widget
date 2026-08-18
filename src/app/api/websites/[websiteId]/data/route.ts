/**
 * Website Intelligence Data Viewer Route (Phase 8.1)
 *
 * GET /api/websites/[websiteId]/data
 *
 * Renders an interactive, searchable data viewer displaying indexed knowledge records.
 * Features:
 * - dataType source badge per row (crawl, shopify, woocommerce, feed, manual)
 * - Source type interactive filter dropdown
 * - Category breadcrumb display (categoryPath)
 * - Blocked-pages warning banner when recent crawl encountered WAF challenges
 * - JSON and HTML view formats
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
}

type Params = { params: Promise<{ websiteId: string }> };

export async function GET(req: NextRequest, { params }: { params: any }) {
  try {
    const resolvedParams = params && typeof params.then === 'function' ? await params : params;
    const websiteId = resolvedParams?.websiteId || '';
    const supabase = getSupabase();
    const format = req.nextUrl.searchParams.get('format') || (req.headers.get('accept')?.includes('application/json') ? 'json' : 'html');

    // 1. Fetch website record
    const { data: website } = await supabase
      .from('websites')
      .select('id, name, allowed_domains, detected_platform')
      .eq('id', websiteId)
      .maybeSingle();

    const siteName = website?.name || 'Website Intelligence';

    // 2. Fetch latest crawl job to check for blocked pages
    const { data: latestJob } = await supabase
      .from('crawl_jobs')
      .select('id, status, pages_visited, entities_found, blocked_pages, error_message, created_at')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const blockedPagesCount = latestJob?.blocked_pages || 0;
    const isJobBlocked = latestJob?.status === 'blocked' || blockedPagesCount > 0;

    // 3. Resolve widget IDs
    const { data: widgets } = await supabase
      .from('widgets')
      .select('id')
      .eq('website_id', websiteId);

    const widgetIds = widgets?.map(w => w.id) || [];
    if (widgetIds.length === 0) {
      widgetIds.push('00000000-0000-0000-0000-000000000000');
    }

    // 4. Fetch website data records
    const { data: records, error: dataError } = await supabase
      .from('website_data')
      .select('id, source_url, title, entity_type, content, metadata, short_description, image_urls, data_type, category_path, created_at')
      .in('widget_id', widgetIds)
      .order('created_at', { ascending: false });

    if (dataError) {
      return NextResponse.json({ error: dataError.message }, { status: 500 });
    }

    const dataList = records || [];

    // Return JSON if requested
    if (format === 'json') {
      return NextResponse.json({
        websiteId,
        websiteName: siteName,
        blockedPages: blockedPagesCount,
        latestJobStatus: latestJob?.status || 'none',
        count: dataList.length,
        records: dataList,
      });
    }

    // Colors for source badges
    const getBadgeStyle = (type: string) => {
      switch (type?.toLowerCase()) {
        case 'shopify':
          return { bg: '#DCFCE7', color: '#15803D', border: '#86EFAC', label: 'Shopify' };
        case 'woocommerce':
          return { bg: '#F3E8FF', color: '#7E22CE', border: '#D8B4FE', label: 'WooCommerce' };
        case 'feed':
          return { bg: '#FFEDD5', color: '#C2410C', border: '#FDBA74', label: 'Product Feed' };
        case 'manual':
          return { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: 'Manual Upload' };
        default:
          return { bg: '#EFF6FF', color: '#1D4ED8', border: '#93C5FD', label: 'Web Crawl' };
      }
    };

    // 5. Render HTML Viewer
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${siteName} — Knowledge Data Viewer</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: #F8FAFC;
            color: #0F172A;
            margin: 0;
            padding: 2rem 1.5rem;
            line-height: 1.5;
          }
          .container { max-width: 1040px; margin: 0 auto; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 1.5rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid #E2E8F0;
          }
          h1 { font-size: 1.5rem; font-weight: 700; margin: 0; color: #0F172A; }
          .subtitle { color: #64748B; font-size: 0.875rem; margin-top: 0.25rem; }
          
          /* Warning Banner for Blocked Pages */
          .warning-banner {
            background: #FEF2F2;
            border: 1px solid #F87171;
            border-radius: 8px;
            padding: 1rem 1.25rem;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            color: #991B1B;
          }
          .warning-icon { font-size: 1.25rem; line-height: 1; flex-shrink: 0; margin-top: 1px; }
          .warning-title { font-weight: 700; font-size: 0.95rem; margin-bottom: 0.25rem; }
          .warning-desc { font-size: 0.85rem; color: #B91C1C; }

          /* Filter Toolbar */
          .toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1.25rem;
            background: #FFFFFF;
            padding: 0.75rem 1rem;
            border-radius: 8px;
            border: 1px solid #E2E8F0;
          }
          .filter-group { display: flex; align-items: center; gap: 0.5rem; }
          .filter-label { font-size: 0.85rem; font-weight: 600; color: #475569; }
          select, input {
            padding: 0.4rem 0.75rem;
            border-radius: 6px;
            border: 1px solid #CBD5E1;
            font-size: 0.85rem;
            background: #FFFFFF;
            color: #1E293B;
            outline: none;
          }
          select:focus, input:focus { border-color: #2563EB; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }

          /* Cards */
          .card {
            background: #FFFFFF;
            border-radius: 10px;
            border: 1px solid #E2E8F0;
            padding: 1.25rem;
            margin-bottom: 1rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            transition: transform 0.1s ease, box-shadow 0.1s ease;
          }
          .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.06); }
          .card-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 0.75rem;
            margin-bottom: 0.5rem;
          }
          .card-title {
            font-weight: 700;
            font-size: 1.05rem;
            color: #1E293B;
            text-decoration: none;
          }
          .card-title:hover { color: #2563EB; text-decoration: underline; }
          .badges { display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap; }
          .badge {
            font-size: 0.7rem;
            font-weight: 700;
            padding: 0.2rem 0.5rem;
            border-radius: 999px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          /* Breadcrumbs */
          .breadcrumbs {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            font-size: 0.75rem;
            color: #64748B;
            background: #F1F5F9;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            margin-bottom: 0.5rem;
          }
          .crumb-sep { color: #94A3B8; }

          .short-desc {
            font-size: 0.85rem;
            color: #475569;
            font-style: italic;
            margin-bottom: 0.5rem;
          }
          .images-row {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
            overflow-x: auto;
            padding-bottom: 0.25rem;
          }
          .thumb {
            height: 64px;
            width: 64px;
            border-radius: 6px;
            object-fit: cover;
            border: 1px solid #E2E8F0;
            background: #F8FAFC;
          }
          .content-box {
            font-size: 0.875rem;
            color: #334155;
            margin-bottom: 0.75rem;
            white-space: pre-wrap;
          }
          pre {
            background: #F8FAFC;
            border: 1px solid #E2E8F0;
            padding: 0.75rem;
            border-radius: 6px;
            font-size: 0.75rem;
            overflow-x: auto;
            margin: 0;
            color: #334155;
          }
          .empty-state {
            text-align: center;
            padding: 3rem;
            background: #FFFFFF;
            border-radius: 8px;
            border: 1px dashed #CBD5E1;
            color: #64748B;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <h1>${siteName} — Knowledge Viewer</h1>
              <div class="subtitle">${dataList.length} entity record(s) indexed for Widgetized AI Agent injection.</div>
            </div>
            <div>
              <a href="?format=json" target="_blank" style="font-size: 0.8rem; font-weight: 600; color: #2563EB; text-decoration: none; padding: 0.4rem 0.8rem; border: 1px solid #BFDBFE; border-radius: 6px; background: #EFF6FF;">
                Export Raw JSON &rarr;
              </a>
            </div>
          </div>

          ${isJobBlocked ? `
            <div class="warning-banner">
              <div class="warning-icon">&#9888;</div>
              <div>
                <div class="warning-title">Anti-Bot / Firewall Challenge Warning</div>
                <div class="warning-desc">
                  The most recent crawl job encountered <strong>${blockedPagesCount} blocked page(s)</strong> due to anti-bot WAF challenges (Cloudflare, Akamai, or Datadome).
                  These firewall pages were safely isolated and excluded from your agent's knowledge base.
                </div>
              </div>
            </div>
          ` : ''}

          <!-- Filter Toolbar -->
          <div class="toolbar">
            <div class="filter-group">
              <span class="filter-label">Filter Source:</span>
              <select id="sourceFilter" onchange="applyFilters()">
                <option value="all">All Sources (${dataList.length})</option>
                <option value="shopify">Shopify</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="feed">Product Feed</option>
                <option value="crawl">Web Crawl</option>
                <option value="manual">Manual Upload</option>
              </select>
            </div>
            <div class="filter-group">
              <span class="filter-label">Search:</span>
              <input type="text" id="searchInput" placeholder="Search titles & content..." oninput="applyFilters()" />
            </div>
          </div>

          <!-- Cards List -->
          <div id="cardsList">
            ${dataList.map(r => {
              const badge = getBadgeStyle(r.data_type || 'crawl');
              const shortDesc = r.short_description ? `<div class="short-desc">${r.short_description}</div>` : '';
              
              const categoryHtml = Array.isArray(r.category_path) && r.category_path.length > 0
                ? `<div class="breadcrumbs">&#128193; ${r.category_path.map((c: string) => `<span>${c}</span>`).join(' <span class="crumb-sep">&rsaquo;</span> ')}</div>`
                : '';

              const imagesHtml = Array.isArray(r.image_urls) && r.image_urls.length > 0
                ? `<div class="images-row">
                    ${r.image_urls.map((img: string) => `<img src="${img}" class="thumb" onerror="this.style.display='none'" />`).join('')}
                   </div>`
                : '';

              return `
                <div class="card" data-source="${(r.data_type || 'crawl').toLowerCase()}" data-text="${(r.title + ' ' + (r.content || '')).toLowerCase()}">
                  <div class="card-top">
                    <a href="${r.source_url || '#'}" target="_blank" class="card-title">${r.title || 'Untitled'}</a>
                    <div class="badges">
                      <span class="badge" style="background: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.border};">
                        ${badge.label}
                      </span>
                      <span class="badge" style="background: #E2E8F0; color: #475569;">
                        ${r.entity_type || 'info'}
                      </span>
                    </div>
                  </div>
                  
                  ${categoryHtml}
                  ${shortDesc}
                  ${imagesHtml}

                  <div class="content-box">${r.content || ''}</div>

                  ${Object.keys(r.metadata || {}).length > 0 ? `
                    <pre><code>${JSON.stringify(r.metadata, null, 2)}</code></pre>
                  ` : ''}
                </div>
              `;
            }).join('')}

            ${dataList.length === 0 ? `
              <div class="empty-state">
                No knowledge records indexed yet. Connect a domain or platform connector to ingest inventory.
              </div>
            ` : ''}
          </div>
        </div>

        <script>
          function applyFilters() {
            const selectedSource = document.getElementById('sourceFilter').value.toLowerCase();
            const searchText = document.getElementById('searchInput').value.toLowerCase().trim();
            const cards = document.querySelectorAll('.card');
            let visibleCount = 0;

            cards.forEach(card => {
              const source = card.getAttribute('data-source') || '';
              const text = card.getAttribute('data-text') || '';

              const matchesSource = selectedSource === 'all' || source === selectedSource;
              const matchesSearch = !searchText || text.includes(searchText);

              if (matchesSource && matchesSearch) {
                card.style.display = 'block';
                visibleCount++;
              } else {
                card.style.display = 'none';
              }
            });
          }
        </script>
      </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err: any) {
    console.error('[websites/data] Error:', err);
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500 });
  }
}
