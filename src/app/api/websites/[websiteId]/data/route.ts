/**
 * Website Intelligence Data Viewer Route (Phase 8.1 Enhanced)
 *
 * GET /api/websites/[websiteId]/data
 *
 * Renders an interactive, beautifully formatted data viewer displaying indexed knowledge records.
 * Features:
 * - Domain-scoped filtering (only shows records belonging to the target website)
 * - Intelligent content formatter (splits mashed text into headings, paragraphs, and bullet points)
 * - Structured key-value metadata table with expandable raw JSON view
 * - High-resolution responsive image gallery
 * - Real-time client-side source & keyword search filters
 * - Blocked-pages warning banner when anti-bot firewall challenges are detected
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

/**
 * Intelligent content formatter: parses continuous text streams from HTML scrapers
 * into structured paragraphs, section headers, bullet lists, and key takeaways.
 */
function formatReadableContent(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // 1. If text already contains newlines and markdown structure, clean and return
  if (text.includes('\n\n')) {
    return text
      .split('\n\n')
      .map(p => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');
  }

  // 2. Break up common concatenated delimiters and bullets
  text = text
    .replace(/\s*([✓•·])\s*/g, '\n• ')
    .replace(/\s*(\b\d{1,2}\s*\/\s*[A-Z][a-z]+)/g, '\n\n### $1')
    .replace(/\s*(\b0[1-9]\s+[A-Z][a-z]+)/g, '\n\n**$1**\n')
    .replace(/\s*(Frequently Asked Questions|General FAQs|Course Overview|Program Details)/gi, '\n\n### $1\n')
    .replace(/([.!?])\s+([A-Z][a-zA-Z\s]{3,30}:)/g, '$1\n\n**$2**\n')
    .replace(/([.!?])\s+([A-Z])/g, '$1\n\n$2');

  const blocks = text.split(/\n+/).map(b => b.trim()).filter(Boolean);
  
  let html = '';
  let inList = false;

  for (const block of blocks) {
    if (block.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h4 style="margin: 1rem 0 0.4rem; color: #1E293B; font-size: 0.95rem; font-weight: 700;">${escapeHtml(block.replace('### ', ''))}</h4>`;
    } else if (block.startsWith('**') && block.endsWith('**')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<div style="font-weight: 700; color: #2563EB; margin-top: 0.6rem; font-size: 0.9rem;">${escapeHtml(block.replace(/\*\*/g, ''))}</div>`;
    } else if (block.startsWith('• ') || block.startsWith('- ')) {
      if (!inList) { html += '<ul style="margin: 0.4rem 0 0.6rem 1.25rem; padding: 0;">'; inList = true; }
      html += `<li style="margin-bottom: 0.25rem; color: #334155; font-size: 0.875rem;">${escapeHtml(block.replace(/^[•-]\s*/, ''))}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p style="margin: 0 0 0.6rem; color: #334155; font-size: 0.875rem; line-height: 1.6;">${escapeHtml(block)}</p>`;
    }
  }

  if (inList) html += '</ul>';
  return html || `<p>${escapeHtml(raw)}</p>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(str?: string | null): boolean {
  return Boolean(str && UUID_REGEX.test(str.trim()));
}

export async function GET(req: NextRequest, { params }: { params: any }) {
  try {
    const resolvedParams = params && typeof params.then === 'function' ? await params : params;
    const websiteId = resolvedParams?.websiteId || '';
    const supabase = getSupabase();
    const format = req.nextUrl.searchParams.get('format') || (req.headers.get('accept')?.includes('application/json') ? 'json' : 'html');
    const isTargetUuid = isUuid(websiteId);

    // 1. Fetch website record safely
    let website: any = null;
    if (isTargetUuid) {
      const { data } = await supabase
        .from('websites')
        .select('id, name, allowed_domains, detected_platform')
        .eq('id', websiteId)
        .maybeSingle();
      website = data;
    } else if (websiteId) {
      const { data } = await supabase
        .from('websites')
        .select('id, name, allowed_domains, detected_platform')
        .ilike('name', `%${websiteId}%`)
        .limit(1)
        .maybeSingle();
      website = data;
    }

    const siteName = website?.name || (websiteId ? `${websiteId} Knowledge` : 'Website Intelligence');
    const allowedDomains = (website?.allowed_domains || []).map((d: string) =>
      d.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    );

    // 2. Fetch latest crawl job to check for blocked pages safely
    let latestJob: any = null;
    const targetWebsiteId = website?.id || (isTargetUuid ? websiteId : null);
    if (targetWebsiteId) {
      const { data } = await supabase
        .from('crawl_jobs')
        .select('id, status, pages_visited, entities_found, blocked_pages, error_message, created_at')
        .eq('website_id', targetWebsiteId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      latestJob = data;
    }

    const blockedPagesCount = latestJob?.blocked_pages || 0;
    const isJobBlocked = latestJob?.status === 'blocked' || blockedPagesCount > 0;

    // 3. Resolve widget IDs strictly matching this website or widget ID (UUID-safe)
    const widgetIds = new Set<string>();
    if (isTargetUuid) widgetIds.add(websiteId);
    if (website?.id && isUuid(website.id)) widgetIds.add(website.id);

    if (isTargetUuid) {
      const { data: widgets } = await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .or(`id.eq.${websiteId},website_id.eq.${websiteId},widget_id.eq.${websiteId}`);
      if (widgets) {
        widgets.forEach(w => {
          if (isUuid(w.id)) widgetIds.add(w.id);
          if (isUuid(w.website_id)) widgetIds.add(w.website_id);
          if (isUuid(w.widget_id)) widgetIds.add(w.widget_id);
        });
      }
    } else if (websiteId) {
      const { data: widgets } = await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .eq('widget_id', websiteId);
      if (widgets) {
        widgets.forEach(w => {
          if (isUuid(w.id)) widgetIds.add(w.id);
          if (isUuid(w.website_id)) widgetIds.add(w.website_id);
          if (isUuid(w.widget_id)) widgetIds.add(w.widget_id);
        });
      }
    }

    const filterWidgetIds = Array.from(widgetIds).filter(id => isUuid(id));
    if (filterWidgetIds.length === 0) {
      filterWidgetIds.push('00000000-0000-0000-0000-000000000000');
    }

    // 4. Fetch website data records matching strictly this website or widget ID
    let rawRecords: any[] | null = null;
    let dataError: any = null;

    const fullSelect = await supabase
      .from('website_data')
      .select('id, source_url, title, entity_type, content, metadata, short_description, image_urls, data_type, category_path, created_at, first_seen, last_seen, still_listed')
      .in('widget_id', filterWidgetIds)
      .order('created_at', { ascending: false });

    rawRecords = fullSelect.data;
    dataError = fullSelect.error;

    if (dataError && (dataError.code === 'PGRST204' || dataError.message?.includes('column') || dataError.message?.includes('schema cache'))) {
      const fallbackSelect = await supabase
        .from('website_data')
        .select('id, source_url, title, entity_type, content, metadata, short_description, image_urls, data_type, category_path, created_at')
        .in('widget_id', filterWidgetIds)
        .order('created_at', { ascending: false });
      rawRecords = fallbackSelect.data;
      dataError = fallbackSelect.error;
    }

    if (dataError) {
      return NextResponse.json({ error: dataError.message }, { status: 500 });
    }

    // Filter records strictly by this website's allowed domains if configured
    let dataList = rawRecords || [];
    if (allowedDomains.length > 0 && websiteId !== '00000000-0000-0000-0000-000000000000') {
      const domainScoped = dataList.filter(r => {
        if (!r.source_url) return false;
        try {
          const urlHost = new URL(r.source_url.startsWith('http') ? r.source_url : `https://${r.source_url}`).hostname.toLowerCase();
          return allowedDomains.some((d: string) => urlHost === d || urlHost.endsWith(`.${d}`));
        } catch {
          return false;
        }
      });

      if (domainScoped.length > 0) {
        dataList = domainScoped;
      }
    }

    // Exclude firewall rejection artifacts
    dataList = dataList.filter(r => {
      const titleLower = (r.title || '').toLowerCase();
      const contentLower = (r.content || '').toLowerCase();
      if (titleLower.includes('request rejected') || contentLower.includes("d2c media's firewall") || contentLower.includes('cf-browser-verification')) {
        return false;
      }
      return true;
    });

    const isKnowledgeEntity = (entityType?: string) => {
      const t = (entityType || '').toLowerCase();
      return ['product', 'service', 'inventory', 'article', 'faq', 'custom'].includes(t) || (!['page', 'text', 'html'].includes(t) && t.length > 0);
    };

    const entitiesCount = dataList.filter(r => isKnowledgeEntity(r.entity_type)).length;
    const pagesCount = dataList.filter(r => !isKnowledgeEntity(r.entity_type)).length;

    if (format === 'json') {
      return NextResponse.json({
        websiteId,
        websiteName: siteName,
        blockedPages: blockedPagesCount,
        latestJobStatus: latestJob?.status || 'none',
        totalCount: dataList.length,
        knowledgeEntitiesCount: entitiesCount,
        sitePagesCount: pagesCount,
        records: dataList,
      });
    }

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

    const getDiscoveryMethodBadge = (method: string) => {
      switch (method?.toLowerCase()) {
        case 'api':
          return { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', label: 'Network API' };
        case 'json-ld':
          return { bg: '#F5F3FF', color: '#6D28D9', border: '#DDD6FE', label: 'JSON-LD' };
        case 'css':
          return { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A', label: 'CSS Selector' };
        case 'llm':
          return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', label: 'LLM Strategy' };
        case 'spa_chunk':
          return { bg: '#ECFEFF', color: '#0E7490', border: '#A5F3FC', label: 'SPA Bundle' };
        case 'html_fallback':
        default:
          return { bg: '#F8FAFC', color: '#475569', border: '#E2E8F0', label: 'HTML DOM' };
      }
    };

    const getFreshnessBadge = (lastSeen?: string, stillListed?: boolean) => {
      if (stillListed === false) {
        return { bg: '#FEF2F2', color: '#991B1B', border: '#FCA5A5', label: '⚪ Missing in Latest Scan' };
      }
      const timestamp = lastSeen ? new Date(lastSeen).getTime() : Date.now();
      const hours = Math.max(0, Date.now() - timestamp) / (1000 * 60 * 60);
      if (hours < 6) {
        return { bg: '#F0FDF4', color: '#15803D', border: '#86EFAC', label: `🟢 Fresh (${hours < 1 ? 'Just now' : Math.round(hours) + 'h ago'})` };
      }
      if (hours <= 24) {
        return { bg: '#FEFCE8', color: '#A16207', border: '#FDE047', label: `🟡 Recent (${Math.round(hours)}h ago)` };
      }
      const days = Math.round(hours / 24);
      return { bg: '#FFF7ED', color: '#C2410C', border: '#FDBA74', label: `🟠 Stale (${days}d ago)` };
    };

    const formatAttributeLabel = (key: string): string => {
      const labels: Record<string, string> = {
        price: 'Price',
        currency: 'Currency',
        availability: 'Availability',
        durationMinutes: 'Duration (Mins)',
        practitioner: 'Practitioner / Doctor',
        department: 'Department',
        specialty: 'Specialty',
        brand: 'Brand',
        sku: 'SKU',
        vin: 'VIN',
        mileage: 'Mileage',
        year: 'Year',
        make: 'Make',
        model: 'Model',
        apiEndpoint: 'Observed API Endpoint',
        discoveryMethod: 'Discovery Tier',
        category: 'Category',
      };
      return labels[key] || key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
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
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #F8FAFC;
            color: #0F172A;
            margin: 0;
            padding: 2.5rem 1.5rem;
            line-height: 1.6;
          }
          .container { max-width: 1080px; margin: 0 auto; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 1.5rem;
            padding-bottom: 1.25rem;
            border-bottom: 1px solid #E2E8F0;
          }
          h1 { font-size: 1.65rem; font-weight: 800; margin: 0; color: #0F172A; letter-spacing: -0.02em; }
          .subtitle { color: #64748B; font-size: 0.9rem; margin-top: 0.25rem; }
          
          /* Navigation Tabs */
          .tab-bar {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1.25rem;
            border-bottom: 2px solid #E2E8F0;
            padding-bottom: 2px;
          }
          .tab-btn {
            background: none;
            border: none;
            padding: 0.6rem 1.1rem;
            font-size: 0.9rem;
            font-weight: 700;
            color: #64748B;
            cursor: pointer;
            border-radius: 8px 8px 0 0;
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            transition: all 0.15s ease;
            position: relative;
            bottom: -2px;
          }
          .tab-btn:hover { color: #1E293B; background: #F1F5F9; }
          .tab-btn.active {
            color: #2563EB;
            border-bottom: 3px solid #2563EB;
            background: #FFFFFF;
          }
          .tab-badge {
            font-size: 0.75rem;
            padding: 0.15rem 0.45rem;
            border-radius: 999px;
            background: #E2E8F0;
            color: #475569;
            font-weight: 700;
          }
          .tab-btn.active .tab-badge {
            background: #DBEAFE;
            color: #1D4ED8;
          }

          /* Warning Banner for Blocked Pages */
          .warning-banner {
            background: #FEF2F2;
            border: 1px solid #F87171;
            border-radius: 10px;
            padding: 1rem 1.25rem;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            color: #991B1B;
          }
          .warning-icon { font-size: 1.35rem; line-height: 1; flex-shrink: 0; }
          .warning-title { font-weight: 700; font-size: 0.95rem; margin-bottom: 0.25rem; }
          .warning-desc { font-size: 0.85rem; color: #B91C1C; line-height: 1.5; }

          /* Filter Toolbar */
          .toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
            background: #FFFFFF;
            padding: 0.85rem 1.25rem;
            border-radius: 10px;
            border: 1px solid #E2E8F0;
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
          }
          .filter-group { display: flex; align-items: center; gap: 0.5rem; }
          .filter-label { font-size: 0.825rem; font-weight: 700; color: #475569; }
          select, input {
            padding: 0.45rem 0.75rem;
            border-radius: 7px;
            border: 1px solid #CBD5E1;
            font-size: 0.85rem;
            background: #FFFFFF;
            color: #1E293B;
            outline: none;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
          }
          select:focus, input:focus { border-color: #2563EB; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
          .counter-badge {
            font-size: 0.8rem;
            color: #64748B;
            font-weight: 600;
            background: #F1F5F9;
            padding: 0.25rem 0.6rem;
            border-radius: 999px;
          }

          /* Cards */
          .card {
            background: #FFFFFF;
            border-radius: 12px;
            border: 1px solid #E2E8F0;
            padding: 1.5rem;
            margin-bottom: 1.25rem;
            box-shadow: 0 1px 4px rgba(0,0,0,0.03);
            transition: box-shadow 0.2s ease, border-color 0.2s ease;
          }
          .card:hover { border-color: #CBD5E1; box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
          .card-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 1rem;
            margin-bottom: 0.75rem;
          }
          .card-title {
            font-weight: 700;
            font-size: 1.15rem;
            color: #1E293B;
            text-decoration: none;
            line-height: 1.35;
          }
          .card-title:hover { color: #2563EB; }
          .source-link {
            font-size: 0.75rem;
            color: #64748B;
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            margin-top: 0.2rem;
            text-decoration: none;
          }
          .source-link:hover { color: #2563EB; text-decoration: underline; }
          .badges { display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap; }
          .badge {
            font-size: 0.725rem;
            font-weight: 700;
            padding: 0.25rem 0.6rem;
            border-radius: 999px;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          /* Breadcrumbs */
          .breadcrumbs {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            font-size: 0.75rem;
            color: #475569;
            background: #F1F5F9;
            padding: 0.25rem 0.65rem;
            border-radius: 6px;
            margin-bottom: 0.75rem;
            font-weight: 500;
          }
          .crumb-sep { color: #94A3B8; }

          /* Image Gallery */
          .images-row {
            display: flex;
            gap: 0.6rem;
            margin-bottom: 1rem;
            overflow-x: auto;
            padding-bottom: 0.35rem;
          }
          .thumb {
            height: 72px;
            width: 72px;
            border-radius: 8px;
            object-fit: cover;
            border: 1px solid #E2E8F0;
            background: #F8FAFC;
            transition: transform 0.15s ease;
          }
          .thumb:hover { transform: scale(1.05); }

          /* Content formatting */
          .content-box {
            background: #F8FAFC;
            border-radius: 10px;
            padding: 1.1rem 1.25rem;
            margin-bottom: 1rem;
            border: 1px solid #E2E8F0;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 0.5rem 1rem;
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 0.75rem 1rem;
            margin-bottom: 0.75rem;
          }
          .meta-item { display: flex; flex-direction: column; }
          .meta-label { font-size: 0.7rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em; }
          .meta-val { font-size: 0.85rem; font-weight: 600; color: #0F172A; }

          details {
            font-size: 0.75rem;
            color: #64748B;
            margin-top: 0.5rem;
          }
          summary { cursor: pointer; font-weight: 600; outline: none; }
          summary:hover { color: #2563EB; }
          pre {
            background: #0F172A;
            color: #F8FAFC;
            padding: 0.85rem;
            border-radius: 6px;
            font-size: 0.75rem;
            overflow-x: auto;
            margin-top: 0.5rem;
          }
          .empty-state {
            text-align: center;
            padding: 3.5rem 1.5rem;
            background: #FFFFFF;
            border-radius: 12px;
            border: 2px dashed #CBD5E1;
            color: #64748B;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <h1>${siteName} — Knowledge Viewer</h1>
              <div class="subtitle"><span id="recordCount">${dataList.length}</span> record(s) available for Voice Agent Knowledge & Realtime Ingestion.</div>
            </div>
            <div>
              <a href="?format=json" target="_blank" style="font-size: 0.825rem; font-weight: 700; color: #2563EB; text-decoration: none; padding: 0.5rem 0.9rem; border: 1px solid #BFDBFE; border-radius: 7px; background: #EFF6FF; display: inline-flex; align-items: center; gap: 4px;">
                Export Raw JSON &rarr;
              </a>
            </div>
          </div>

          <!-- Navigation Tab Switcher -->
          <div class="tab-bar">
            <button class="tab-btn active" id="tabAll" onclick="setTab('all')">
              💎 All Items <span class="tab-badge">${dataList.length}</span>
            </button>
            <button class="tab-btn" id="tabEntities" onclick="setTab('entities')">
              📦 Knowledge Records / Catalog <span class="tab-badge">${entitiesCount}</span>
            </button>
            <button class="tab-btn" id="tabPages" onclick="setTab('pages')">
              📄 Site Pages & Content <span class="tab-badge">${pagesCount}</span>
            </button>
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

          <!-- Filters -->
          <div class="toolbar">
            <div class="filter-group">
              <span class="filter-label">Source:</span>
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
              <span class="filter-label">Type:</span>
              <select id="typeFilter" onchange="applyFilters()">
                <option value="all">All Types</option>
                <option value="product">Products / Inventory</option>
                <option value="service">Services / Programs</option>
                <option value="article">Articles</option>
                <option value="faq">FAQs</option>
                <option value="page">Pages / Content</option>
              </select>
            </div>
            <div class="filter-group">
              <span class="filter-label">Tier:</span>
              <select id="tierFilter" onchange="applyFilters()">
                <option value="all">All Tiers</option>
                <option value="api">Network API</option>
                <option value="json-ld">JSON-LD</option>
                <option value="css">CSS Selector</option>
                <option value="llm">LLM Strategy</option>
                <option value="spa_chunk">SPA Bundle</option>
                <option value="html_fallback">HTML DOM</option>
              </select>
            </div>
            <div class="filter-group" style="flex: 1; max-width: 300px;">
              <span class="filter-label">Search:</span>
              <input type="text" id="searchInput" style="width: 100%;" placeholder="Keywords, titles, VIN..." oninput="applyFilters()" />
            </div>
            <span class="counter-badge" id="visibleCounter">Showing ${dataList.length} items</span>
          </div>

          <!-- Cards List -->
          <div id="cardsList">
            ${dataList.map(r => {
              const badge = getBadgeStyle(r.data_type || 'crawl');
              const meta = (r.metadata || {}) as Record<string, any>;
              const discoveryMethod = (meta.discoveryMethod || (r.data_type === 'shopify' || r.data_type === 'woocommerce' || r.data_type === 'feed' ? 'api' : 'html_fallback')) as string;
              const tierBadge = getDiscoveryMethodBadge(discoveryMethod);
              const isEntity = isKnowledgeEntity(r.entity_type);
              
              const categoryHtml = Array.isArray(r.category_path) && r.category_path.length > 0
                ? `<div class="breadcrumbs">&#128193; ${r.category_path.map((c: string) => `<span>${c}</span>`).join(' <span class="crumb-sep">&rsaquo;</span> ')}</div>`
                : '';

              const rawImages = Array.isArray(r.image_urls) && r.image_urls.length > 0
                ? r.image_urls
                : Array.isArray(meta.images) ? meta.images : meta.image ? [meta.image] : [];

              const imagesHtml = rawImages.length > 0
                ? `<div class="images-row">
                    ${rawImages.slice(0, 6).map((img: string) => `<img src="${img}" class="thumb" onerror="this.style.display='none'" />`).join('')}
                   </div>`
                : '';

              const metaEntries = Object.entries(meta).filter(([k, v]) => {
                if (['images', 'image', 'imageSource', 'description', 'first_seen', 'last_seen', 'still_listed'].includes(k)) return false;
                if (v === null || v === undefined || v === '') return false;
                if (typeof v === 'object') return false;
                return true;
              });

              const contentText = (r.content || '').trim();
              const formattedContentHtml = formatReadableContent(contentText);

              const freshnessBadge = getFreshnessBadge(r.last_seen || r.created_at, r.still_listed);

              return `
                <div class="card" data-is-entity="${isEntity ? 'true' : 'false'}" data-entity-type="${(r.entity_type || 'info').toLowerCase()}" data-source="${(r.data_type || 'crawl').toLowerCase()}" data-tier="${discoveryMethod.toLowerCase()}" data-text="${(r.title + ' ' + contentText).toLowerCase()}">
                  <div class="card-top">
                    <div>
                      <a href="${r.source_url || '#'}" target="_blank" class="card-title">${r.title || 'Untitled'}</a>
                      ${r.source_url ? `<br/><a href="${r.source_url}" target="_blank" class="source-link">&#128279; ${r.source_url}</a>` : ''}
                    </div>
                    <div class="badges">
                      <span class="badge" style="background: ${isEntity ? '#FDF2F8' : '#F1F5F9'}; color: ${isEntity ? '#BE185D' : '#475569'}; border: 1px solid ${isEntity ? '#FBCFE8' : '#CBD5E1'};">
                        ${isEntity ? '📦 Knowledge Record' : '📄 Site Page'}
                      </span>
                      <span class="badge" style="background: ${freshnessBadge.bg}; color: ${freshnessBadge.color}; border: 1px solid ${freshnessBadge.border};" title="Catalog Freshness Status">
                        ${freshnessBadge.label}
                      </span>
                      <span class="badge" style="background: ${tierBadge.bg}; color: ${tierBadge.color}; border: 1px solid ${tierBadge.border};" title="Extraction Tier">
                        ${tierBadge.label}
                      </span>
                      <span class="badge" style="background: ${badge.bg}; color: ${badge.color}; border: 1px solid ${badge.border};">
                        ${badge.label}
                      </span>
                      <span class="badge" style="background: #F1F5F9; color: #475569; border: 1px solid #CBD5E1;">
                        ${r.entity_type || 'info'}
                      </span>
                    </div>
                  </div>
                  
                  ${categoryHtml}
                  ${imagesHtml}

                  ${formattedContentHtml ? `<div class="content-box">${formattedContentHtml}</div>` : ''}

                  ${metaEntries.length > 0 ? `
                    <div class="meta-grid">
                      ${metaEntries.map(([k, v]) => `
                        <div class="meta-item">
                          <span class="meta-label">${formatAttributeLabel(k)}</span>
                          <span class="meta-val">${String(v)}</span>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}

                  ${Object.keys(meta).length > 0 ? `
                    <details>
                      <summary>View Raw JSON Metadata</summary>
                      <pre><code>${JSON.stringify(meta, null, 2)}</code></pre>
                    </details>
                  ` : ''}
                </div>
              `;
            }).join('')}

            ${dataList.length === 0 ? `
              <div class="empty-state">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">&#128269;</div>
                <div style="font-weight: 700; font-size: 1.1rem; color: #1E293B; margin-bottom: 0.25rem;">No knowledge records found</div>
                <div>Connect your domain and start a scan to index your site's content.</div>
              </div>
            ` : ''}
          </div>
        </div>

        <script>
          let currentTab = 'all';

          function setTab(tab) {
            currentTab = tab;
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            if (tab === 'all') document.getElementById('tabAll').classList.add('active');
            if (tab === 'entities') document.getElementById('tabEntities').classList.add('active');
            if (tab === 'pages') document.getElementById('tabPages').classList.add('active');
            applyFilters();
          }

          function applyFilters() {
            const selectedSource = document.getElementById('sourceFilter').value.toLowerCase();
            const selectedType = document.getElementById('typeFilter').value.toLowerCase();
            const selectedTier = document.getElementById('tierFilter').value.toLowerCase();
            const searchText = document.getElementById('searchInput').value.toLowerCase().trim();
            const cards = document.querySelectorAll('.card');
            let visibleCount = 0;

            cards.forEach(card => {
              const isEntity = card.getAttribute('data-is-entity') === 'true';
              const entityType = card.getAttribute('data-entity-type') || '';
              const source = card.getAttribute('data-source') || '';
              const tier = card.getAttribute('data-tier') || '';
              const text = card.getAttribute('data-text') || '';

              // Tab matching
              let matchesTab = true;
              if (currentTab === 'entities') matchesTab = isEntity;
              if (currentTab === 'pages') matchesTab = !isEntity;

              const matchesSource = selectedSource === 'all' || source === selectedSource;
              const matchesType = selectedType === 'all' || entityType === selectedType;
              const matchesTier = selectedTier === 'all' || tier === selectedTier;
              const matchesSearch = !searchText || text.includes(searchText);

              if (matchesTab && matchesSource && matchesType && matchesTier && matchesSearch) {
                card.style.display = 'block';
                visibleCount++;
              } else {
                card.style.display = 'none';
              }
            });

            document.getElementById('visibleCounter').textContent = 'Showing ' + visibleCount + ' items';
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
