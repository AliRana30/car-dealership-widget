/**
 * Website Intelligence Crawler — Crawl4AI-powered
 *
 * Replaces the hand-rolled link-follower with Crawl4AI's AsyncUrlSeeder
 * (source="sitemap+cc") for URL discovery and its headless-browser engine
 * for JS-rendered content extraction.
 *
 * Scan modes
 * ──────────
 *  QUICK_SCAN  – low page cap, homepage + immediate neighbours only
 *  MASTER_SCAN – full sitemap-driven discovery, higher cap
 */

import {
  Crawl4AIClient,
  getGenericLLMExtractionConfig,
  getJsonCssExtractionConfig,
  isCrawlResultBlocked,
  type JsonCssExtractionSchema,
} from '@/lib/crawl4ai/client';
import { processEntityImages } from './images';
import { findMatchingExistingEntity, mergeEntity } from './merge';
import { ingestShopifyProducts } from '@/lib/connectors/shopify';
import { ingestWooCommerceProducts } from '@/lib/connectors/woocommerce';
import { CrawledEntity, CrawlResult } from './types';
import {
  safeFetch,
  normalizeUrl,
  extractPageEntities,
  extractSpaChunkEntities,
  extractJsonLd,
  mapJsonLdToEntities,
  extractSameDomainLinks,
  extractSitemapUrls,
  fetchAllSitemapUrls,
  parseRobotsTxt,
  extractNextJsRoutes,
} from './extractor';
import {
  extractEntitiesFromNetworkResponses,
  discoverAndFetchPageApis,
} from './networkExtractor';
import { createClient } from '@supabase/supabase-js';
import { saveWebsiteDataBatch, WebsiteDataRow } from '@/config/widgetsDb';
import crypto from 'crypto';

export function computeContentHash(raw: string): string {
  const normalized = (raw || '')
    .trim()
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}





// ── Scan-mode and Anti-bot constants ──────────────────────────────────────────

export type ScanMode = 'quick' | 'master';

export const QUICK_SCAN_PAGE_CAP    = 15;   // max pages for a Quick Scan
export const MASTER_SCAN_PAGE_CAP   = 150;  // max pages for a Master Scan
export const BLOCKED_THRESHOLD_RATIO = 0.5;  // >50% blocked pages sets job status to 'blocked'

// ── Supabase (server-side) ────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

// ── Crawl4AI singleton ────────────────────────────────────────────────────────

let _crawl4aiClient: Crawl4AIClient | null = null;
function getCrawl4AIClient(): Crawl4AIClient {
  if (!_crawl4aiClient) {
    _crawl4aiClient = new Crawl4AIClient({
      defaultTimeoutMs: 120_000, // 2 min per page batch
      maxRetries: 2,
    });
  }
  return _crawl4aiClient;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function crawlWebsite(
  websiteId: string,
  startUrl: string,
  scanMode: ScanMode = 'master'
): Promise<CrawlResult> {
  const t0 = Date.now();
  const errors: string[] = [];

  // Normalise start URL
  let base: URL;
  try {
    base = new URL(startUrl.startsWith('http') ? startUrl : `https://${startUrl}`);
  } catch {
    return {
      websiteId,
      startUrl,
      pagesVisited: 0,
      entitiesFound: 0,
      blockedPages: 0,
      isBlocked: false,
      entities: [],
      errors: ['Invalid start URL'],
      durationMs: Date.now() - t0,
    };
  }

  const pageCap = scanMode === 'quick' ? QUICK_SCAN_PAGE_CAP : MASTER_SCAN_PAGE_CAP;

  // ── Step 1: Discover URLs via Universal BFS Frontier ───────────────────────
  let candidateUrls: string[] = [];
  let crawlDiagnostics: CrawlDiagnostic[] = [];
  try {
    const frontierRes = await buildCrawlFrontier(base.href, pageCap, scanMode, errors);
    candidateUrls = frontierRes.urls;
    crawlDiagnostics = frontierRes.diagnostics;
  } catch (err: any) {
    errors.push(`Frontier error: ${err.message}`);
    // Fall back to at least the homepage
    candidateUrls = [base.href];
  }

  if (candidateUrls.length === 0) {
    candidateUrls = [base.href];
  }

  // ── Step 2: Determine Platform & Extraction Strategy ───────────────────────
  const supabase = getSupabase();
  let extractionStrategy: any = getGenericLLMExtractionConfig();
  let detectedPlatform = 'unknown';

  try {
    const { data: websiteRow } = await supabase
      .from('websites')
      .select('css_selector_schema, detected_platform, known_urls')
      .eq('id', websiteId)
      .maybeSingle();

    if (websiteRow?.detected_platform) {
      detectedPlatform = websiteRow.detected_platform;
    }

    const customCssSchema = websiteRow?.css_selector_schema as JsonCssExtractionSchema | null;
    if (
      customCssSchema &&
      typeof customCssSchema === 'object' &&
      customCssSchema.baseSelector &&
      Array.isArray(customCssSchema.fields) &&
      customCssSchema.fields.length > 0
    ) {
      extractionStrategy = getJsonCssExtractionConfig(customCssSchema);
      console.log(`[crawler] Using fast-path JsonCssExtractionStrategy for website ${websiteId}`);
    }
  } catch (e) {
    // Fall back to default LLM extraction on lookup error
  }

  // ── Step 2b: Structured Platform Connector Ingestion (Shopify/WooCommerce) ──
  let structuredProductCount = 0;
  let nonProductCandidateUrls = candidateUrls;

  if (detectedPlatform === 'shopify') {
    try {
      console.log(`[crawler] Detected Shopify platform — running structured product ingestion for ${base.href}`);
      const res = await ingestShopifyProducts({ id: websiteId, domain: base.href });
      structuredProductCount = res.count;
      // Filter out product pages from HTML crawl list to focus on non-product pages (About, FAQ, policies, etc.)
      nonProductCandidateUrls = candidateUrls.filter(u => !/\/products\/[a-z0-9-_]+/i.test(u));
      if (nonProductCandidateUrls.length === 0) nonProductCandidateUrls = [base.href];
    } catch (shopifyErr: any) {
      console.warn(`[crawler] Shopify connector failed (${shopifyErr.message}), falling back to full crawl`);
    }
  } else if (detectedPlatform === 'woocommerce') {
    try {
      console.log(`[crawler] Detected WooCommerce platform — running structured product ingestion for ${base.href}`);
      const res = await ingestWooCommerceProducts({ id: websiteId, domain: base.href });
      structuredProductCount = res.count;
      nonProductCandidateUrls = candidateUrls.filter(u => !/\/product\/[a-z0-9-_]+/i.test(u));
      if (nonProductCandidateUrls.length === 0) nonProductCandidateUrls = [base.href];
    } catch (wooErr: any) {
      // Credentials might not be configured yet; fall back gracefully to normal crawl
    }
  }

  // Enforce page cap on non-product pages
  const urlsToFetch = nonProductCandidateUrls.slice(0, pageCap);

  // Find associated widgets to retrieve existing hashes for incremental change detection
  const isTargetUuid = Boolean(websiteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId));
  const widgetIds = new Set<string>();
  if (isTargetUuid) widgetIds.add(websiteId);

  let widgets: any[] | null = null;
  if (isTargetUuid) {
    const res = await supabase
      .from('widgets')
      .select('id, widget_id, website_id')
      .or(`id.eq.${websiteId},website_id.eq.${websiteId},widget_id.eq.${websiteId}`);
    widgets = res.data;
  } else if (websiteId) {
    const res = await supabase
      .from('widgets')
      .select('id, widget_id, website_id')
      .eq('widget_id', websiteId);
    widgets = res.data;
  }

  if (widgets) {
    widgets.forEach(w => {
      if (w.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w.id)) widgetIds.add(w.id);
      if (w.website_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w.website_id)) widgetIds.add(w.website_id);
      if (w.widget_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w.widget_id)) widgetIds.add(w.widget_id);
    });
  }
  const filterWidgetIds = Array.from(widgetIds);
  if (filterWidgetIds.length === 0) {
    filterWidgetIds.push('00000000-0000-0000-0000-000000000000');
  }

  const { data: existingRows } = await supabase
    .from('website_data')
    .select('id, widget_id, source_url, content_hash, title, short_description, content, entity_type, metadata, image_urls, category_path, data_type')
    .in('widget_id', filterWidgetIds);

  // ── Step 3: Crawl discovered non-product pages via Crawl4AI ─────────────────
  const allEntities: CrawledEntity[] = [];
  let pagesVisited = 0;
  let pagesProcessed = 0;
  let pagesSkipped = 0;
  let blockedPages = 0;

  // Process in batches of 5
  const BATCH_SIZE = 5;
  let crawl4aiDisabled = !process.env.CRAWL4AI_BASE_URL;

  for (let i = 0; i < urlsToFetch.length; i += BATCH_SIZE) {
    const batch = urlsToFetch.slice(i, i + BATCH_SIZE);
    let crawl4aiSucceeded = false;

    // 1. Try Crawl4AI REST service if configured and healthy
    if (!crawl4aiDisabled) {
      try {
        const response = await getCrawl4AIClient().crawl({
          urls: batch,
          browser_config: {
            headless: true,
            verbose: false,
            magic: true,
            simulate_user: true,
            override_navigator: true,
          },
          crawler_config: {
            output_formats: ['markdown', 'metadata', 'html'],
            excluded_tags: ['nav', 'footer', 'header', 'script', 'style'],
            word_count_threshold: 20,
            same_domain: true,
            anti_bot_detection: true,
            delay_before_return_html: 2.0,
            scan_full_page: true,
            capture_network: true,
            capture_xhr: true,
            log_network: true,
            magic: true,
            extraction_strategy: extractionStrategy,
          },
        }, 15000); // 15-second cap per batch

        if (response && Array.isArray(response.results) && response.results.length > 0) {
          crawl4aiSucceeded = true;
          for (const result of response.results) {
            // Anti-bot detection: Check if page was blocked by WAF challenge / firewall
            if (isCrawlResultBlocked(result)) {
              blockedPages++;
              errors.push(`Page blocked by anti-bot/WAF (${result.url}): status ${result.status_code || 'blocked'}`);
              continue;
            }

            if (!result.success) {
              errors.push(`Failed to crawl ${result.url}: ${result.error_message || 'unknown error'}`);
              continue;
            }
            pagesVisited++;

            const rawContent = (result.markdown || result.html || result.cleaned_html || '').trim();
            const contentHash = computeContentHash(rawContent);

            const normResultUrl = result.url.replace(/\/+$/, '').toLowerCase();
            const matchingExisting = (existingRows || []).find(r => {
              if (!r.source_url) return false;
              return r.source_url.replace(/\/+$/, '').toLowerCase() === normResultUrl;
            });

            const isExistingThinOrLoading =
              !matchingExisting?.content ||
              matchingExisting.content.length < 150 ||
              matchingExisting.content.toLowerCase().includes('loading...') ||
              matchingExisting.title?.toLowerCase() === 'loading...';

            if (matchingExisting && !isExistingThinOrLoading && matchingExisting.content_hash && matchingExisting.content_hash === contentHash) {
              pagesSkipped++;
              const nowIso = new Date().toISOString();
              try {
                await supabase
                  .from('website_data')
                  .update({ last_seen: nowIso, last_checked_at: nowIso, still_listed: true })
                  .eq('id', matchingExisting.id);
              } catch {}

              allEntities.push({
                url: matchingExisting.source_url || result.url,
                title: matchingExisting.title,
                content: matchingExisting.content,
                dataType: (matchingExisting.entity_type as any) || 'text',
                contentHash: matchingExisting.content_hash,
                lastCheckedAt: nowIso,
                metadata: {
                  ...(matchingExisting.metadata || {}),
                  last_seen: nowIso,
                  still_listed: true,
                },
              });
              continue;
            }

            pagesProcessed++;
            const entities = await extractEntitiesFromCrawlResult(result);
            for (const entity of entities) {
              entity.contentHash = contentHash;
              entity.lastCheckedAt = new Date().toISOString();
              if (!isDuplicate(entity, allEntities)) {
                allEntities.push(entity);
              }
            }
          }
        }
      } catch (crawl4aiErr: any) {
        console.warn(`[crawler] Crawl4AI service error (${crawl4aiErr.message || 'connection failed'}). Switching to native high-speed crawler.`);
        crawl4aiDisabled = true;
        crawl4aiSucceeded = false;
      }
    }

    // 2. Native high-fidelity HTML crawler fallback if Crawl4AI didn't process the batch
    if (!crawl4aiSucceeded) {
      console.log(`[crawler] Executing native HTML crawling for batch: ${batch.join(', ')}`);
      for (const pageUrl of batch) {
        try {
          const pageData = await safeFetch(pageUrl);
          if (!pageData || !pageData.html || pageData.status >= 400) {
            console.warn(`[crawler] Page fetch returned status ${pageData?.status || 'network error'} for ${pageUrl}`);
            continue;
          }

          // Anti-bot check
          const probeResult: import('@/lib/crawl4ai/client').CrawlResult = {
            url: pageUrl,
            success: true,
            status_code: pageData.status,
            html: pageData.html,
            markdown: pageData.html,
          };

          if (isCrawlResultBlocked(probeResult)) {
            blockedPages++;
            errors.push(`Page blocked by anti-bot/WAF (${pageUrl}): status ${pageData.status}`);
            continue;
          }

          pagesVisited++;

          const contentHash = computeContentHash(pageData.html);
          const normResultUrl = pageUrl.replace(/\/+$/, '').toLowerCase();
          const matchingExisting = (existingRows || []).find(r => {
            if (!r.source_url) return false;
            return r.source_url.replace(/\/+$/, '').toLowerCase() === normResultUrl;
          });

          const isExistingThinOrLoading =
            !matchingExisting?.content ||
            matchingExisting.content.length < 150 ||
            matchingExisting.content.toLowerCase().includes('loading...') ||
            matchingExisting.title?.toLowerCase() === 'loading...';

          if (matchingExisting && !isExistingThinOrLoading && matchingExisting.content_hash && matchingExisting.content_hash === contentHash) {
            pagesSkipped++;
            const nowIso = new Date().toISOString();
            try {
              await supabase
                .from('website_data')
                .update({ last_seen: nowIso, last_checked_at: nowIso, still_listed: true })
                .eq('id', matchingExisting.id);
            } catch {}

            allEntities.push({
              url: matchingExisting.source_url || pageUrl,
              title: matchingExisting.title,
              content: matchingExisting.content,
              dataType: (matchingExisting.entity_type as any) || 'text',
              contentHash: matchingExisting.content_hash,
              lastCheckedAt: nowIso,
              metadata: {
                ...(matchingExisting.metadata || {}),
                last_seen: nowIso,
                still_listed: true,
              },
            });
            continue;
          }

          pagesProcessed++;
          const extractedEntities = await extractPageEntities(pageData.html, pageUrl);
          for (const entity of extractedEntities) {
            entity.contentHash = contentHash;
            entity.lastCheckedAt = new Date().toISOString();
            if (!isDuplicate(entity, allEntities)) {
              allEntities.push(entity);
            }
          }
        } catch (nativeErr: any) {
          console.warn(`[crawler] Error extracting ${pageUrl}:`, nativeErr.message);
        }
      }
    }
  }

  console.log(`[crawler] Crawl completed for ${base.href}: ${pagesProcessed} processed (new/changed), ${pagesSkipped} skipped (content hash match), ${blockedPages} blocked.`);

  // Calculate if overall job is blocked by anti-bot firewall
  const totalAttempted = pagesVisited + blockedPages;
  const isBlocked =
    blockedPages > 0 &&
    (pagesVisited === 0 || (blockedPages / (totalAttempted || 1)) >= BLOCKED_THRESHOLD_RATIO);

  // ── Step 4: Persist to Supabase ───────────────────────────────────────────
  if (allEntities.length > 0) {
    await persistEntities(websiteId, allEntities);
  }

  // Update known_urls on websites table with ALL discovered frontier URLs
  const allDiscoveredUrls = Array.from(new Set([...candidateUrls, ...allEntities.map(e => e.url)].filter(Boolean)));
  if (allDiscoveredUrls.length > 0) {
    try {
      await supabase
        .from('websites')
        .update({ known_urls: allDiscoveredUrls })
        .eq('id', websiteId);
    } catch (err: any) {
      console.warn('[crawler] Could not update known_urls on website:', err.message || err);
    }
  }

  return {
    websiteId,
    startUrl: base.href,
    pagesVisited,
    pagesProcessed,
    pagesSkipped,
    entitiesFound: allEntities.length + structuredProductCount,
    blockedPages,
    isBlocked,
    entities: allEntities,
    discoveredUrls: allDiscoveredUrls,
    diagnostics: crawlDiagnostics,
    errors,
    durationMs: Date.now() - t0,
  };
}

// ── Crawl Diagnostics ────────────────────────────────────────────────────────

export interface CrawlDiagnostic {
  url: string;
  status?: number;
  contentType?: string;
  discoverySource: 'seed' | 'sitemap' | 'robots_hint' | 'nextjs_route' | 'html_link' | 'crawl4ai_seed' | 'frontier_bfs';
  depth: number;
  extractionMethod?: 'crawl4ai' | 'native_html' | 'not_visited';
  rendered: boolean;
  crawlStatus: 'queued' | 'visited' | 'skipped' | 'blocked' | 'error';
  lastSeen?: string;
  errors?: string[];
}

// ── BFS Crawl Frontier ───────────────────────────────────────────────────────

/**
 * Universal BFS crawl frontier discovery engine.
 *
 * Discovers URLs through a multi-layer approach:
 *  1. robots.txt Sitemap: directives + Allow: paths
 *  2. Recursive sitemap.xml / sitemap_index.xml fetching
 *  3. Next.js __NEXT_DATA__ + build manifests + chunk filenames
 *  4. Crawl4AI seed endpoint (if available)
 *  5. BFS frontier expansion: fetch each queued URL → extract all links → queue new discoveries
 *
 * All URLs are normalized (fragment-stripped, tracking-param-stripped) before deduplication.
 * Same-origin boundaries are strictly enforced.
 *
 * @returns { urls, diagnostics } - discovered URL list and per-URL diagnostics
 */
async function buildCrawlFrontier(
  startUrl: string,
  pageCap: number,
  scanMode: ScanMode,
  errors: string[]
): Promise<{ urls: string[]; diagnostics: CrawlDiagnostic[] }> {
  const parsedStart = new URL(startUrl);
  const origin = parsedStart.origin;
  const normalizedStart = normalizeUrl(startUrl) || startUrl;

  const discovered = new Map<string, CrawlDiagnostic>(); // url → diagnostic
  const frontier: string[] = [];   // BFS queue of URLs to process for link extraction
  const frontierVisited = new Set<string>(); // URLs we've already extracted links from

  // Helper to add a URL to the discovery map if not already known
  function addUrl(
    url: string,
    source: CrawlDiagnostic['discoverySource'],
    depth: number
  ): boolean {
    const normalized = normalizeUrl(url) || url;
    if (discovered.has(normalized)) return false;
    try {
      const parsed = new URL(normalized);
      // Same-origin only
      if (parsed.hostname.toLowerCase() !== parsedStart.hostname.toLowerCase()) return false;
    } catch { return false; }
    discovered.set(normalized, {
      url: normalized,
      discoverySource: source,
      depth,
      rendered: false,
      crawlStatus: 'queued',
    });
    return true;
  }

  // Always include the start URL
  addUrl(normalizedStart, 'seed', 0);
  frontier.push(normalizedStart);

  console.log(`[frontier] Starting BFS discovery from ${startUrl} (cap: ${pageCap})`);

  // ── Layer 1: robots.txt ──────────────────────────────────────────────────
  try {
    const { sitemapUrls: robotsSitemaps, hintPaths } = await parseRobotsTxt(origin);
    for (const hint of hintPaths) {
      addUrl(`${origin}${hint}`, 'robots_hint', 1);
    }
    // robots.txt sitemap directives will be parsed in sitemap layer
    for (const smUrl of robotsSitemaps) {
      try {
        const smRes = await safeFetch(smUrl);
        if (smRes?.html && smRes.status === 200) {
          const smUrls = extractSitemapUrls(smRes.html, startUrl);
          for (const u of smUrls) {
            if (!u.endsWith('.xml')) addUrl(u, 'sitemap', 1);
          }
        }
      } catch {}
    }
    console.log(`[frontier] After robots.txt: ${discovered.size} URLs`);
  } catch {}

  // ── Layer 2: Recursive sitemap discovery ─────────────────────────────────
  try {
    const sitemapUrls = await fetchAllSitemapUrls(origin, startUrl, 3);
    for (const u of sitemapUrls) {
      addUrl(u, 'sitemap', 1);
    }
    console.log(`[frontier] After sitemaps: ${discovered.size} URLs`);
  } catch {}

  // ── Layer 3: Homepage HTML — Next.js routes + initial links ──────────────
  let homepageHtml = '';
  try {
    const homeData = await safeFetch(startUrl);
    if (homeData?.html) {
      homepageHtml = homeData.html;
      const homeLinks = extractSameDomainLinks(homepageHtml, startUrl);
      for (const u of homeLinks) addUrl(u, 'html_link', 1);

      const nextJsRoutes = await extractNextJsRoutes(homepageHtml, startUrl);
      for (const u of nextJsRoutes) addUrl(u, 'nextjs_route', 1);
    }
    console.log(`[frontier] After homepage scan: ${discovered.size} URLs`);
  } catch {}

  // ── Layer 4: Crawl4AI seed endpoint ──────────────────────────────────────
  if (process.env.CRAWL4AI_BASE_URL) {
    try {
      const client = getCrawl4AIClient();
      const seedResult = await client.seed({
        url: startUrl,
        source: 'sitemap+cc',
        max_urls: pageCap,
        ...(scanMode === 'quick' ? { max_depth: 1 } : {}),
      }, 5000);
      const validUrls = (seedResult.urls || []).filter(
        (u): u is string => typeof u === 'string' && u.startsWith('http')
      );
      for (const u of validUrls) addUrl(u, 'crawl4ai_seed', 1);
      console.log(`[frontier] After Crawl4AI seed: ${discovered.size} URLs`);
    } catch {}
  }

  // ── Layer 5: BFS frontier expansion ──────────────────────────────────────
  // Add all discovered URLs to frontier for BFS expansion
  for (const [url] of discovered) {
    if (!frontierVisited.has(url) && url !== normalizedStart) {
      frontier.push(url);
    }
  }

  // BFS: expand frontier by fetching each URL and extracting links
  // Stop when we've expanded enough or hit the page cap
  const BFS_EXPANSION_LIMIT = scanMode === 'quick' ? 5 : Math.min(pageCap, 30);
  let bfsExpanded = 0;

  while (frontier.length > 0 && discovered.size < pageCap && bfsExpanded < BFS_EXPANSION_LIMIT) {
    const url = frontier.shift()!;
    if (frontierVisited.has(url)) continue;
    frontierVisited.add(url);
    bfsExpanded++;

    const currentDepth = discovered.get(url)?.depth ?? 0;
    const maxDepth = scanMode === 'quick' ? 2 : 4;
    if (currentDepth >= maxDepth) continue;

    try {
      const pageData = await safeFetch(url);
      if (!pageData?.html || pageData.status >= 400) continue;

      const diag = discovered.get(url);
      if (diag) {
        diag.crawlStatus = 'visited';
        diag.status = pageData.status;
        diag.contentType = pageData.contentType;
        diag.lastSeen = new Date().toISOString();
        diag.extractionMethod = 'native_html';
      }

      const newLinks = extractSameDomainLinks(pageData.html, url);
      const nextJsRoutes = await extractNextJsRoutes(pageData.html, url).catch(() => []);

      let addedNewUrls = 0;
      for (const newUrl of [...newLinks, ...nextJsRoutes]) {
        if (addUrl(newUrl, 'frontier_bfs', currentDepth + 1)) {
          frontier.push(newUrl);
          addedNewUrls++;
        }
      }

      if (addedNewUrls > 0) {
        console.log(`[frontier] BFS expanded ${url} → +${addedNewUrls} new URLs (total: ${discovered.size})`);
      }
    } catch (err: any) {
      const diag = discovered.get(url);
      if (diag) {
        diag.crawlStatus = 'error';
        diag.errors = [err.message || 'fetch error'];
      }
    }
  }

  const allUrls = Array.from(discovered.keys());
  const diagnostics = Array.from(discovered.values());

  console.log(`[frontier] Discovery complete: ${allUrls.length} total URLs discovered from ${startUrl}`);

  if (scanMode === 'quick') {
    return { urls: allUrls.slice(0, Math.min(pageCap, 10)), diagnostics };
  }
  return { urls: allUrls.slice(0, pageCap), diagnostics };
}




// ── Entity extraction from Crawl4AI result ────────────────────────────────────

async function extractEntitiesFromCrawlResult(
  result: import('@/lib/crawl4ai/client').CrawlResult
): Promise<CrawledEntity[]> {
  // ── TIER 1: Explicit JSON-LD (Highest Preference) ──────────────────────────
  if (result.html) {
    try {
      const jsonLd = extractJsonLd(result.html);
      if (jsonLd.length > 0) {
        const jsonLdEntities = mapJsonLdToEntities(jsonLd, result.url);
        if (jsonLdEntities.length > 0) {
          jsonLdEntities.forEach(e => {
            e.metadata = { ...e.metadata, discoveryMethod: 'json-ld' };
          });
          return jsonLdEntities;
        }
      }
    } catch {}
  }

  // ── TIER 2: Observed Network API JSON (XHR / Fetch Responses) ───────────────
  const rawNetworkResponses = [
    ...(Array.isArray(result.network_responses) ? result.network_responses : []),
    ...(Array.isArray(result.xhr_responses) ? result.xhr_responses : []),
    ...(Array.isArray(result.captured_requests) ? result.captured_requests : []),
    ...(Array.isArray(result.metadata?.network_responses) ? result.metadata.network_responses : []),
    ...(Array.isArray(result.metadata?.api_calls) ? result.metadata.api_calls : []),
  ];

  let apiEntities = extractEntitiesFromNetworkResponses(rawNetworkResponses, result.url);

  // If no observed network logs in result, but HTML is present, try dynamic AJAX discovery
  if (apiEntities.length === 0 && result.html) {
    try {
      apiEntities = await discoverAndFetchPageApis(result.html, result.url);
    } catch {}
  }

  if (apiEntities.length > 0) {
    apiEntities.forEach(e => {
      e.metadata = { ...e.metadata, discoveryMethod: 'api' };
    });
    return apiEntities;
  }

  // ── TIER 3 & 4: Structured Output from Crawl4AI (CSS Selector or LLM) ────────
  if (result.extracted_content) {
    try {
      let parsed = result.extracted_content;
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }

      const rawEntities: any[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.entities)
        ? parsed.entities
        : parsed?.title
        ? [parsed]
        : [];

      if (rawEntities.length > 0) {
        const isCssStrategy = !!(result.metadata?.extraction_strategy === 'json_css' || result.metadata?.strategy === 'css');
        const discoveryMethod: CrawledEntity['metadata']['discoveryMethod'] = isCssStrategy ? 'css' : 'llm';
        const entities: CrawledEntity[] = [];
        const knownKeys = new Set([
          'title', 'shortDescription', 'short_description', 'description', 'content',
          'imageUrls', 'image_urls', 'imageUrl', 'image_url', 'image',
          'sourceUrl', 'source_url', 'url',
          'entityType', 'entity_type', 'metadata',
        ]);

        for (const item of rawEntities) {
          if (!item || typeof item !== 'object') continue;
          const title = (item.title || item.name || '').trim();
          if (!title) continue;

          const desc =
            (typeof item.shortDescription === 'string' ? item.shortDescription : '') ||
            (typeof item.short_description === 'string' ? item.short_description : '') ||
            (typeof item.description === 'string' ? item.description : '') ||
            (typeof item.content === 'string' ? item.content : '') ||
            '';

          const rawImages: any[] = [
            ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
            ...(Array.isArray(item.image_urls) ? item.image_urls : []),
            ...(item.imageUrl ? [item.imageUrl] : []),
            ...(item.image_url ? [item.image_url] : []),
            ...(item.image ? [item.image] : []),
            ...(item.srcset ? [item.srcset] : []),
          ];

          const { imageUrls, imageSource } = processEntityImages(rawImages, result.url);
          const entityType = (item.entityType || item.entity_type || 'text') as CrawledEntity['dataType'];

          const extraProps: Record<string, any> = {};
          for (const [k, v] of Object.entries(item)) {
            if (!knownKeys.has(k) && v !== undefined && v !== null && v !== '') {
              extraProps[k] = v;
            }
          }

          const meta: Record<string, any> = {
            discoveryMethod,
            ...extraProps,
            ...(imageSource ? { imageSource } : {}),
            ...(typeof item.metadata === 'object' && item.metadata !== null ? item.metadata : {}),
          };

          entities.push({
            url: item.sourceUrl || item.source_url || result.url,
            title,
            content: desc || title,
            dataType: entityType,
            metadata: {
              discoveryMethod,
              description: desc,
              images: imageUrls.slice(0, 5),
              statusCode: result.status_code,
              ...flattenMeta(meta),
            },
          });
        }

        if (entities.length > 0) {
          return entities;
        }
      }
    } catch (parseErr) {
      console.warn(`[crawler] Failed to parse structured extracted_content for ${result.url}:`, parseErr);
    }
  }

  // ── TIER 5: SPA Client-Rendered Script Chunks & HTML Fallback ───────────────
  const spaEntities = result.html ? await extractSpaChunkEntities(result.html, result.url) : [];
  if (spaEntities.length > 0) {
    spaEntities.forEach(e => {
      e.metadata = { ...e.metadata, discoveryMethod: 'spa_chunk' };
    });
  }

  const markdown = result.markdown || result.cleaned_html || result.html || '';
  const meta     = result.metadata || {};

  if (!markdown && !meta.title && spaEntities.length === 0) return [];

  const title =
    (typeof meta.title === 'string' ? meta.title : '') ||
    extractTitleFromMarkdown(markdown) ||
    new URL(result.url).pathname.replace(/[-_/]/g, ' ').trim() ||
    result.url;

  const description =
    (typeof meta.description === 'string' ? meta.description : '') ||
    extractFirstParagraph(markdown);

  const rawFallbackImages: any[] = [];
  if (typeof meta.og_image === 'string' && meta.og_image) rawFallbackImages.push(meta.og_image);
  if (Array.isArray(meta.images)) {
    for (const img of meta.images) {
      if (img) rawFallbackImages.push(img);
    }
  }

  const { imageUrls: fallbackImageUrls, imageSource: fallbackImageSource } = processEntityImages(rawFallbackImages, result.url);

  const entityType = classifyEntityType(result.url, markdown);

  const fallbackMeta: Record<string, any> = {
    ...flattenMeta(meta),
    ...(fallbackImageSource ? { imageSource: fallbackImageSource } : {}),
  };

  let fullContent = description || markdown.substring(0, 2000);
  if (spaEntities.length > 0) {
    const catalogSummary = spaEntities.map(e => `• ${e.title}: ${e.metadata?.description || ''} ${e.metadata?.price ? `(${e.metadata.price})` : ''}`).join('\n');
    fullContent += `\n\nCatalog Items / Offerings:\n${catalogSummary}`;
  }

  const cleanedContent = cleanStructuredContent(fullContent);
  const entities: CrawledEntity[] = [...spaEntities];

  if (title.trim() || cleanedContent) {
    entities.push({
      url: result.url,
      title: title.trim(),
      content: cleanedContent || title.trim(),
      dataType: entityType as CrawledEntity['dataType'],
      metadata: {
        discoveryMethod: 'html_fallback',
        description: description,
        images: fallbackImageUrls.slice(0, 5),
        statusCode: result.status_code,
        ...fallbackMeta,
      },
    });
  }

  return entities;
}

function cleanStructuredContent(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\s*([✓•·])\s*/g, '\n• ')
    .replace(/([.!?])\s+([A-Z][a-zA-Z\s]{3,30}:)/g, '$1\n\n$2\n')
    .replace(/\s*(Questions clinics actually ask\.|Frequently Asked Questions)/gi, '\n\n$1\n')
    .replace(/\s*(Built for Every Role|One Platform\. Three Portals|Ambient Audio Doctor Portal|Patient Portal|Admin Intelligence|Real-time Metrics|THE WORKFLOW)/gi, '\n\n$1\n')
    .trim();
}

function extractTitleFromMarkdown(md: string): string {
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function extractFirstParagraph(md: string): string {
  // Skip headings, find first substantial text block
  const lines = md.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('!'));
  return lines.slice(0, 5).join(' ').substring(0, 500);
}

function classifyEntityType(
  url: string,
  content: string
): CrawledEntity['dataType'] {
  const lower = url.toLowerCase() + ' ' + content.toLowerCase().substring(0, 200);
  if (/product|item|sku|shop|store|buy|cart|price|\$|£|€/.test(lower)) return 'product';
  if (/service|solution|offer|package|plan/.test(lower))                return 'service';
  if (/faq|question|answer|help|support/.test(lower))                   return 'faq';
  if (/contact|phone|email|address|location|map/.test(lower))           return 'contact';
  if (/pricing|cost|fee|subscription/.test(lower))                      return 'pricing';
  if (/event|webinar|conference|workshop/.test(lower))                   return 'event';
  return 'text';
}

function flattenMeta(meta: Record<string, any>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      safe[k] = v;
    }
  }
  return safe;
}

function isDuplicate(entity: CrawledEntity, existing: CrawledEntity[]): boolean {
  if (!entity.title) return false;
  return existing.some(e => e.title?.toLowerCase() === entity.title?.toLowerCase());
}

// ── Supabase persistence ──────────────────────────────────────────────────────

async function persistEntities(websiteId: string, entities: CrawledEntity[]): Promise<void> {
  if (!entities.length) return;
  const supabase = getSupabase();

  // Find widget(s) associated with websiteId (matching id, website_id, or widget_id)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId);
  const { data: widgets, error: widgetError } = isUuid
    ? await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .or(`id.eq.${websiteId},website_id.eq.${websiteId},widget_id.eq.${websiteId}`)
    : await supabase
        .from('widgets')
        .select('id, widget_id, website_id')
        .eq('widget_id', websiteId);

  if (widgetError) {
    console.error('[crawler] Widget lookup error:', widgetError.message);
  }

  const targetWidgetIds = new Set<string>();
  if (widgets && widgets.length > 0) {
    widgets.forEach(w => {
      if (w.id) targetWidgetIds.add(w.id);
    });
  } else {
    // If no widget explicitly linked yet, find the default widget to satisfy foreign key constraint
    const { data: defaultWidget } = await supabase
      .from('widgets')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (defaultWidget?.id) {
      targetWidgetIds.add(defaultWidget.id);
      if (isUuid) {
        await supabase
          .from('widgets')
          .update({ website_id: websiteId })
          .eq('id', defaultWidget.id);
      }
    }
  }
  const widgetIds = Array.from(targetWidgetIds);

  // Fetch existing records for these widgets to check for connector-sourced rows
  const { data: existingRecords } = await supabase
    .from('website_data')
    .select('*')
    .in('widget_id', widgetIds);

  const rowsToSave: WebsiteDataRow[] = [];
  const claimedExistingIds = new Set<string>();

  for (const widgetId of widgetIds) {
    for (const e of entities) {
      const rawImgs: string[] = [];
      if (Array.isArray(e.imageUrls)) {
        e.imageUrls.forEach((img: any) => { if (typeof img === 'string' && img.startsWith('http')) rawImgs.push(img); });
      }
      if (Array.isArray(e.metadata?.images)) {
        (e.metadata.images as any[]).forEach((img: any) => { if (typeof img === 'string' && img.startsWith('http')) rawImgs.push(img); });
      }
      if (typeof e.metadata?.image === 'string' && e.metadata.image.startsWith('http')) {
        rawImgs.push(e.metadata.image);
      }
      if (typeof e.metadata?.photoUrl === 'string' && e.metadata.photoUrl.startsWith('http')) {
        rawImgs.push(e.metadata.photoUrl);
      }
      if (typeof e.metadata?.thumbnail === 'string' && e.metadata.thumbnail.startsWith('http')) {
        rawImgs.push(e.metadata.thumbnail);
      }
      const imageUrls = Array.from(new Set(rawImgs));

      const categoryPath: string[] = [];
      if (typeof e.metadata?.category === 'string' && e.metadata.category) {
        categoryPath.push(e.metadata.category as string);
      }

      const nowIso = new Date().toISOString();
      const incomingRow: WebsiteDataRow = {
        widget_id:         widgetId,
        source_url:        e.url,
        title:             e.title || 'Untitled',
        content:           e.content || e.title || '',
        entity_type:       e.dataType || 'text',
        metadata:          e.metadata || {},
        short_description: (e.metadata?.description as string) || e.content?.substring(0, 300) || '',
        image_urls:        imageUrls,
        data_type:         'crawl',
        category_path:     categoryPath,
        content_hash:      e.contentHash,
        last_checked_at:   e.lastCheckedAt || nowIso,
        first_seen:        nowIso,
        last_seen:         nowIso,
        still_listed:      true,
      };

      // Match against existing records (Shopify, WooCommerce, Feed, Manual, or previous Crawl)
      const matchingExisting = findMatchingExistingEntity(incomingRow, (existingRecords || []) as WebsiteDataRow[], claimedExistingIds);
      if (matchingExisting) {
        if (matchingExisting.id) claimedExistingIds.add(matchingExisting.id);
        // Precedence merge: preserve connector fields, fill in missing JSON-LD/crawled fields
        const mergedRow = mergeEntity(matchingExisting, incomingRow);
        rowsToSave.push(mergedRow);
      } else {
        rowsToSave.push(incomingRow);
      }
    }
  }

  // Deduplicate rowsToSave by ID if ID is present
  const uniqueRows: WebsiteDataRow[] = [];
  const seenSavedIds = new Set<string>();
  for (const r of rowsToSave) {
    if (r.id) {
      if (seenSavedIds.has(r.id)) continue;
      seenSavedIds.add(r.id);
    }
    uniqueRows.push(r);
  }

  // Batch insert/upsert in chunks of 50 via centralized embedding path
  for (let i = 0; i < uniqueRows.length; i += 50) {
    const chunk = uniqueRows.slice(i, i + 50);
    try {
      await saveWebsiteDataBatch(chunk);
    } catch (err: any) {
      console.error('[crawler] Insert/merge error:', err.message || err);
    }
  }

  // Gracefully mark entities that disappeared from this crawl as still_listed = false without deleting them
  const savedRowIds = new Set(rowsToSave.map(r => r.id).filter(Boolean));
  const missingCrawlRecords = (existingRecords || []).filter(
    r => r.id && r.data_type === 'crawl' && !savedRowIds.has(r.id) && r.still_listed !== false
  );
  if (missingCrawlRecords.length > 0) {
    const nowIso = new Date().toISOString();
    for (const record of missingCrawlRecords) {
      try {
        const updatedMeta = {
          ...(record.metadata || {}),
          still_listed: false,
        };
        const { error: updErr } = await supabase
          .from('website_data')
          .update({
            still_listed: false,
            metadata: updatedMeta,
            last_checked_at: nowIso,
          })
          .eq('id', record.id);

        if (updErr && (updErr.code === '42703' || updErr.message?.includes('column'))) {
          // Fallback to updating metadata only if table column not yet created
          await supabase
            .from('website_data')
            .update({
              metadata: updatedMeta,
              last_checked_at: nowIso,
            })
            .eq('id', record.id);
        }
      } catch (err: any) {
        console.warn('[crawler] Could not mark unlisted items:', err.message || err);
      }
    }
  }
}

// ── Crawl job management (resilient to RLS and missing tables) ───────────────

export async function createCrawlJob(
  websiteId: string,
  startUrl: string,
  scanMode: ScanMode = 'master'
): Promise<string> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('crawl_jobs')
      .insert({
        website_id: websiteId,
        start_url:  startUrl,
        status:     'pending',
        scan_mode:  scanMode,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[crawler] Warning inserting into crawl_jobs (RLS or schema):', error.message);
      return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    return data?.id || `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  } catch (err: any) {
    console.warn('[crawler] Error in createCrawlJob:', err.message);
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export async function updateCrawlJob(
  jobId: string,
  updates: {
    status?:          'pending' | 'running' | 'completed' | 'failed' | 'blocked' | string;
    pages_visited?:   number;
    entities_found?:  number;
    blocked_pages?:   number;
    error_message?:   string;
    completed_at?:    string;
  }
): Promise<void> {
  if (!jobId || jobId.startsWith('job_')) return;
  try {
    const supabase = getSupabase();
    await supabase.from('crawl_jobs').update(updates).eq('id', jobId);
  } catch (err: any) {
    console.warn('[crawler] Failed to update crawl_jobs row:', err.message);
  }
}

export async function getCrawlJob(jobId: string) {
  if (!jobId || jobId.startsWith('job_')) return null;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('crawl_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}

export async function getLatestCrawlJob(websiteId: string) {
  if (!websiteId) return null;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('crawl_jobs')
      .select('*')
      .eq('website_id', websiteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch {
    return null;
  }
}
