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
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
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

  // ── Step 1: Discover URLs via Crawl4AI seeder ──────────────────────────────
  let candidateUrls: string[] = [];
  try {
    candidateUrls = await discoverUrlsViaSeeder(base.href, pageCap, scanMode, errors);
  } catch (err: any) {
    errors.push(`Seeder error: ${err.message}`);
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
      .select('css_selector_schema, detected_platform')
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
  const { data: widgets } = await supabase
    .from('widgets')
    .select('id, widget_id, website_id')
    .or(`id.eq.${websiteId},website_id.eq.${websiteId},widget_id.eq.${websiteId}`);

  const widgetIds = new Set<string>();
  if (websiteId) widgetIds.add(websiteId);
  if (widgets) {
    widgets.forEach(w => {
      if (w.id) widgetIds.add(w.id);
      if (w.widget_id) widgetIds.add(w.widget_id);
      if (w.website_id) widgetIds.add(w.website_id);
    });
  }
  const filterWidgetIds = Array.from(widgetIds);

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

  // Process in batches of 5 to avoid overwhelming the service
  const BATCH_SIZE = 5;
  for (let i = 0; i < urlsToFetch.length; i += BATCH_SIZE) {
    const batch = urlsToFetch.slice(i, i + BATCH_SIZE);
    try {
      const response = await getCrawl4AIClient().crawl({
        urls: batch,
        browser_config: {
          headless: true,
          verbose: false,
          // Crawl4AI anti-bot handling and user emulation
          magic: true,
          simulate_user: true,
          override_navigator: true,
        },
        crawler_config: {
          // Extract clean markdown content from each page
          output_formats: ['markdown', 'metadata'],
          // Skip media-heavy boilerplate for speed
          excluded_tags: ['nav', 'footer', 'header', 'script', 'style'],
          word_count_threshold: 20,
          // Follow only same-domain links
          same_domain: true,
          // Built-in anti-bot detection
          anti_bot_detection: true,
          magic: true,
          // CSS fast-path if configured, otherwise generic LLM strategy
          extraction_strategy: extractionStrategy,
        },
      });

      for (const result of response.results) {
        // Anti-bot detection: Check if page was blocked by WAF challenge / firewall
        if (isCrawlResultBlocked(result)) {
          blockedPages++;
          errors.push(`Page blocked by anti-bot/WAF (${result.url}): status ${result.status_code || 'blocked'}`);
          continue; // DO NOT insert an Entity row for a blocked page
        }

        if (!result.success) {
          errors.push(`Failed to crawl ${result.url}: ${result.error_message || 'unknown error'}`);
          continue;
        }
        pagesVisited++;

        // Compute content hash on fetched content
        const rawContent = (result.markdown || result.html || result.cleaned_html || '').trim();
        const contentHash = computeContentHash(rawContent);

        // Check if matching existing entity has unchanged content hash
        const normResultUrl = result.url.replace(/\/+$/, '').toLowerCase();
        const matchingExisting = (existingRows || []).find(r => {
          if (!r.source_url) return false;
          return r.source_url.replace(/\/+$/, '').toLowerCase() === normResultUrl;
        });

        if (matchingExisting && matchingExisting.content_hash && matchingExisting.content_hash === contentHash) {
          pagesSkipped++;
          console.log(`[crawler] Page unchanged (hash ${contentHash.slice(0, 8)}) — skipped re-extraction: ${result.url}`);

          // Update last_checked_at timestamp on existing entity
          try {
            await supabase
              .from('website_data')
              .update({ last_checked_at: new Date().toISOString() })
              .eq('id', matchingExisting.id);
          } catch {}

          // Preserve existing entity in active crawl list
          allEntities.push({
            url: matchingExisting.source_url || result.url,
            title: matchingExisting.title,
            content: matchingExisting.content,
            dataType: (matchingExisting.entity_type as any) || 'text',
            contentHash: matchingExisting.content_hash,
            lastCheckedAt: new Date().toISOString(),
            metadata: matchingExisting.metadata || {},
          });
          continue;
        }

        // New or modified page: proceed with extraction and attach contentHash
        pagesProcessed++;
        const entities = extractEntitiesFromCrawlResult(result);
        for (const entity of entities) {
          entity.contentHash = contentHash;
          entity.lastCheckedAt = new Date().toISOString();
          if (!isDuplicate(entity, allEntities)) {
            allEntities.push(entity);
          }
        }
      }
    } catch (err: any) {
      errors.push(`Batch crawl error (${batch.join(', ')}): ${err.message}`);
    }
  }

  console.log(`[crawler] Crawl completed for ${base.href}: ${pagesProcessed} processed, ${pagesSkipped} skipped (content hash match), ${blockedPages} blocked.`);

  // Calculate if overall job is blocked by anti-bot firewall
  const totalAttempted = pagesVisited + blockedPages;
  const isBlocked =
    blockedPages > 0 &&
    (pagesVisited === 0 || (blockedPages / (totalAttempted || 1)) >= BLOCKED_THRESHOLD_RATIO);

  // ── Step 4: Persist to Supabase ───────────────────────────────────────────
  if (allEntities.length > 0) {
    await persistEntities(websiteId, allEntities);
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
    errors,
    durationMs: Date.now() - t0,
  };
}

// ── Seeder: discover URLs via Crawl4AI AsyncUrlSeeder ────────────────────────

/**
 * Calls the Crawl4AI seeder endpoint (POST /seed) to get candidate URLs from
 * sitemap discovery + Common Crawl index fallback.
 *
 * Quick Scan: limits results to the homepage and its immediately-linked pages.
 * Master Scan: returns the full sitemap-driven URL list up to pageCap.
 */
async function discoverUrlsViaSeeder(
  startUrl: string,
  pageCap: number,
  scanMode: ScanMode,
  errors: string[]
): Promise<string[]> {
  const client = getCrawl4AIClient();

  try {
    const seedResult = await client.seed({
      url: startUrl,
      source: 'sitemap+cc',
      max_urls: pageCap,
      ...(scanMode === 'quick' ? { max_depth: 1 } : {}),
    });

    const validUrls = (seedResult.urls || []).filter(
      (u): u is string => typeof u === 'string' && u.startsWith('http')
    );

    if (validUrls.length > 0) {
      return validUrls;
    }

    errors.push('Seeder returned no URLs; falling back to homepage');
    return [startUrl];
  } catch (err: any) {
    errors.push(`Seeder error (${err.message}), falling back to homepage`);
    return [startUrl];
  }
}


// ── Entity extraction from Crawl4AI result ────────────────────────────────────

function extractEntitiesFromCrawlResult(
  result: import('@/lib/crawl4ai/client').CrawlResult
): CrawledEntity[] {
  // 1. Check for structured output from Crawl4AI (LLM or CSS extraction strategy)
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
        const entities: CrawledEntity[] = [];
        const knownKeys = new Set([
          'title', 'shortDescription', 'short_description', 'description', 'content',
          'imageUrls', 'image_urls', 'imageUrl', 'image_url', 'image',
          'sourceUrl', 'source_url', 'url',
          'entityType', 'entity_type', 'metadata',
        ]);

        for (const item of rawEntities) {
          if (!item || typeof item !== 'object') continue;
          const title = (item.title || '').trim();
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

          // Extract additional CSS / custom properties into metadata
          const extraProps: Record<string, any> = {};
          for (const [k, v] of Object.entries(item)) {
            if (!knownKeys.has(k) && v !== undefined && v !== null && v !== '') {
              extraProps[k] = v;
            }
          }

          const meta = {
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

  // 2. Generic fallback extraction (no vertical-specific branching)
  const markdown = result.markdown || result.cleaned_html || result.html || '';
  const meta     = result.metadata || {};

  if (!markdown && !meta.title) return [];

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

  // Classify entity type generically
  const entityType = classifyEntityType(result.url, markdown);

  const fallbackMeta = {
    ...flattenMeta(meta),
    ...(fallbackImageSource ? { imageSource: fallbackImageSource } : {}),
  };

  const cleanedContent = cleanStructuredContent(description || markdown.substring(0, 1500));

  const entity: CrawledEntity = {
    url: result.url,
    title: title.trim(),
    content: cleanedContent,
    dataType: entityType as CrawledEntity['dataType'],
    metadata: {
      description: description,
      images: fallbackImageUrls.slice(0, 5),
      statusCode: result.status_code,
      ...fallbackMeta,
    },
  };

  return [entity];
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
  const { data: widgets, error: widgetError } = await supabase
    .from('widgets')
    .select('id, widget_id, website_id')
    .or(`id.eq.${websiteId},website_id.eq.${websiteId},widget_id.eq.${websiteId}`);

  if (widgetError) {
    console.error('[crawler] Widget lookup error:', widgetError.message);
  }

  const targetWidgetIds = new Set<string>();
  if (websiteId && websiteId !== '00000000-0000-0000-0000-000000000000') {
    targetWidgetIds.add(websiteId);
  }
  if (widgets && widgets.length > 0) {
    widgets.forEach(w => {
      if (w.id) targetWidgetIds.add(w.id);
      if (w.widget_id) targetWidgetIds.add(w.widget_id);
    });
  }
  if (targetWidgetIds.size === 0) {
    targetWidgetIds.add(websiteId);
  }
  const widgetIds = Array.from(targetWidgetIds);

  // Fetch existing records for these widgets to check for connector-sourced rows
  const { data: existingRecords } = await supabase
    .from('website_data')
    .select('*')
    .in('widget_id', widgetIds);

  const rowsToSave: WebsiteDataRow[] = [];

  for (const widgetId of widgetIds) {
    for (const e of entities) {
      const imageUrls: string[] = Array.isArray(e.metadata?.images)
        ? (e.metadata.images as any[]).filter((img): img is string => typeof img === 'string')
        : typeof e.metadata?.image === 'string' && e.metadata.image
        ? [e.metadata.image as string]
        : [];

      const categoryPath: string[] = [];
      if (typeof e.metadata?.category === 'string' && e.metadata.category) {
        categoryPath.push(e.metadata.category as string);
      }

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
        last_checked_at:   e.lastCheckedAt || new Date().toISOString(),
      };

      // Match against existing records (Shopify, WooCommerce, Feed, Manual, or previous Crawl)
      const matchingExisting = findMatchingExistingEntity(incomingRow, (existingRecords || []) as WebsiteDataRow[]);
      if (matchingExisting) {
        // Precedence merge: preserve connector fields, fill in missing JSON-LD/crawled fields
        const mergedRow = mergeEntity(matchingExisting, incomingRow);
        rowsToSave.push(mergedRow);
      } else {
        rowsToSave.push(incomingRow);
      }
    }
  }

  // Batch insert/upsert in chunks of 50 via centralized embedding path
  for (let i = 0; i < rowsToSave.length; i += 50) {
    const chunk = rowsToSave.slice(i, i + 50);
    try {
      await saveWebsiteDataBatch(chunk);
    } catch (err: any) {
      console.error('[crawler] Insert/merge error:', err.message || err);
    }
  }
}

// ── Crawl job management (unchanged public API) ───────────────────────────────

export async function createCrawlJob(
  websiteId: string,
  startUrl: string,
  scanMode: ScanMode = 'master'
): Promise<string> {
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

  if (error || !data) throw new Error(error?.message || 'Failed to create crawl job');
  return data.id;
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
  const supabase = getSupabase();
  await supabase.from('crawl_jobs').update(updates).eq('id', jobId);
}

export async function getCrawlJob(jobId: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('crawl_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  return data;
}

export async function getLatestCrawlJob(websiteId: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('crawl_jobs')
    .select('*')
    .eq('website_id', websiteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data;
}
