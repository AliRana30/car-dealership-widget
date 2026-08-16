/**
 * Website Intelligence Crawler
 *
 * Orchestrates multi-page crawling, sitemap discovery, and entity extraction.
 * Respects robots.txt disallow rules.
 * Normalizes all findings and persists them to the website_data table.
 */

import {
  safeFetch,
  extractPageEntities,
  parseSitemap,
  parseSitemapFromRobots,
  parseDisallowedPaths,
  extractInternalLinks,
} from './extractor';
import { CrawledEntity, CrawlResult } from './types';
import { createClient } from '@supabase/supabase-js';

// ── Supabase (server-side) ────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

// ── Crawler configuration ─────────────────────────────────────────────────────

const MAX_PAGES = 30;           // max pages to crawl per website
const MAX_ENTITIES = 200;       // max entities to store
const CONCURRENCY = 3;          // parallel fetch slots
const CRAWL_DELAY_MS = 250;     // polite delay between batches

// ── Main crawler ──────────────────────────────────────────────────────────────

export async function crawlWebsite(websiteId: string, startUrl: string): Promise<CrawlResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  const allEntities: CrawledEntity[] = [];
  const visited = new Set<string>();
  let pagesVisited = 0;

  // Normalize start URL
  let base: URL;
  try {
    base = new URL(startUrl.startsWith('http') ? startUrl : `https://${startUrl}`);
  } catch {
    return { websiteId, startUrl, pagesVisited: 0, entitiesFound: 0, entities: [], errors: ['Invalid start URL'], durationMs: Date.now() - t0 };
  }

  const normalizedStart = base.origin + base.pathname.replace(/\/$/, '') || base.origin;
  const toVisit: string[] = [normalizedStart];
  let disallowed: string[] = [];
  let sitemapUrls: string[] = [];

  // ── Step 1: Fetch robots.txt ──────────────────────────────────────────────
  try {
    const robotsResult = await safeFetch(`${base.origin}/robots.txt`);
    if (robotsResult && robotsResult.contentType.includes('text')) {
      disallowed = parseDisallowedPaths(robotsResult.html);
      const sitemapRefs = parseSitemapFromRobots(robotsResult.html, base.origin);
      sitemapUrls.push(...sitemapRefs);
    }
  } catch (e) {
    errors.push(`robots.txt: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Step 2: Fetch sitemap ─────────────────────────────────────────────────
  const sitemapCandidates = sitemapUrls.length
    ? sitemapUrls
    : [`${base.origin}/sitemap.xml`, `${base.origin}/sitemap_index.xml`];

  for (const sitemapUrl of sitemapCandidates.slice(0, 3)) {
    try {
      const result = await safeFetch(sitemapUrl);
      if (result && (result.contentType.includes('xml') || result.html.includes('<urlset'))) {
        const urls = parseSitemap(result.html, base.origin);
        // Prioritize content pages — filter out pagination, tag clouds, etc.
        const priority = prioritizeUrls(urls, base.hostname);
        toVisit.push(...priority.slice(0, 20));
      }
    } catch (e) {
      errors.push(`Sitemap ${sitemapUrl}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Deduplicate and limit queue
  const dedupedQueue = [...new Set(toVisit)].slice(0, MAX_PAGES + 5);

  // ── Step 3: Crawl pages in batches ────────────────────────────────────────
  let queueIdx = 0;

  while (queueIdx < dedupedQueue.length && pagesVisited < MAX_PAGES && allEntities.length < MAX_ENTITIES) {
    // Pick next batch
    const batch: string[] = [];
    while (batch.length < CONCURRENCY && queueIdx < dedupedQueue.length) {
      const url = dedupedQueue[queueIdx++];
      if (!visited.has(url)) {
        visited.add(url);
        batch.push(url);
      }
    }
    if (!batch.length) break;

    // Fetch batch in parallel
    const results = await Promise.allSettled(batch.map(url => fetchAndExtract(url, base.origin, disallowed)));

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push(String(result.reason));
        continue;
      }
      const { entities, internalLinks, pageUrl } = result.value;
      pagesVisited++;

      // Add new internal links to queue
      for (const link of internalLinks) {
        if (!visited.has(link) && !dedupedQueue.includes(link) && dedupedQueue.length < MAX_PAGES + 10) {
          dedupedQueue.push(link);
        }
      }

      // Deduplicate entities by title
      for (const entity of entities) {
        if (!isDuplicate(entity, allEntities)) {
          allEntities.push(entity);
          if (allEntities.length >= MAX_ENTITIES) break;
        }
      }
    }

    if (CRAWL_DELAY_MS > 0) {
      await new Promise(r => setTimeout(r, CRAWL_DELAY_MS));
    }
  }

  // ── Step 4: Persist to Supabase ───────────────────────────────────────────
  await persistEntities(websiteId, allEntities);

  return {
    websiteId,
    startUrl: normalizedStart,
    pagesVisited,
    entitiesFound: allEntities.length,
    entities: allEntities,
    errors,
    durationMs: Date.now() - t0,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchAndExtract(
  url: string,
  origin: string,
  disallowed: string[]
): Promise<{ pageUrl: string; entities: CrawledEntity[]; internalLinks: string[] }> {
  const result = await safeFetch(url);
  if (!result) return { pageUrl: url, entities: [], internalLinks: [] };

  const { html, contentType } = result;

  // Handle JSON API responses
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(html);
      const entities = extractJsonApiEntities(parsed, url);
      return { pageUrl: url, entities, internalLinks: [] };
    } catch {
      return { pageUrl: url, entities: [], internalLinks: [] };
    }
  }

  // HTML pages
  const entities = extractPageEntities(html, url);
  const internalLinks = extractInternalLinks(html, origin, disallowed);
  return { pageUrl: url, entities, internalLinks };
}

function extractJsonApiEntities(data: any, url: string): CrawledEntity[] {
  const entities: CrawledEntity[] = [];
  const arr = Array.isArray(data) ? data : (data.data || data.results || data.items || data.products || data.vehicles || []);
  if (!Array.isArray(arr)) return entities;

  for (const item of arr.slice(0, 20)) {
    if (typeof item !== 'object' || !item) continue;
    const title = item.name || item.title || item.make && `${item.year || ''} ${item.make} ${item.model || ''}`.trim() || '';
    const content = item.description || item.summary || title;
    if (!title && !content) continue;

    const entity: CrawledEntity = {
      url: item.url || item.link || url,
      title,
      content: content || title,
      dataType: 'product',
      metadata: {},
    };
    if (item.description) entity.metadata.description = item.description;
    const imgs = item.images || item.photos || (item.image ? [item.image] : item.imageUrl ? [item.imageUrl] : []);
    if (imgs.length) entity.metadata.images = imgs.slice(0, 3).map((i: any) => typeof i === 'string' ? i : i?.url || '').filter(Boolean);
    if (item.price !== undefined) entity.metadata.price = item.price;
    if (item.currency || item.priceCurrency) entity.metadata.currency = item.currency || item.priceCurrency;
    entities.push(entity);
  }
  return entities;
}

function isDuplicate(entity: CrawledEntity, existing: CrawledEntity[]): boolean {
  if (!entity.title) return false;
  return existing.some(e => e.title?.toLowerCase() === entity.title?.toLowerCase());
}

function prioritizeUrls(urls: string[], hostname: string): string[] {
  const high: string[] = [];
  const normal: string[] = [];

  const highPriorityPatterns = [
    /\/(products?|services?|pricing|plans?|vehicle|inventory|fleet|menu|catalog|shop|store)/i,
    /\/(about|faq|contact|locations?|hours|team)/i,
    /\/(cars?|trucks?|suvs?|sedans?|vehicles?)\//i,
  ];
  const lowPriorityPatterns = [
    /\/(tag|category|author|page|archive|feed|sitemap|rss)/i,
    /\/\d{4}\/\d{2}\//,  // date-based blog archives
  ];

  for (const url of urls) {
    try {
      const u = new URL(url);
      if (u.hostname !== hostname) continue;
      if (lowPriorityPatterns.some(p => p.test(u.pathname))) continue;
      if (highPriorityPatterns.some(p => p.test(u.pathname))) high.push(url);
      else normal.push(url);
    } catch {}
  }
  return [...high, ...normal];
}

// ── Supabase persistence ──────────────────────────────────────────────────────

async function persistEntities(websiteId: string, entities: CrawledEntity[]): Promise<void> {
  if (!entities.length) return;
  const supabase = getSupabase();

  // Delete old crawled entries (preserve any manually added ones by skipping if you prefer)
  await supabase
    .from('website_data')
    .delete()
    .eq('website_id', websiteId)
    .not('url', 'is', null); // only delete URL-tagged crawled rows

  const rows = entities.map(e => ({
    website_id: websiteId,
    url: e.url,
    title: e.title || 'Untitled',
    content: e.content || e.title || '',
    data_type: e.dataType,
    metadata: e.metadata || {},
  }));

  // Batch insert in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabase.from('website_data').insert(chunk);
    if (error) {
      console.error('[crawler] Insert error:', error.message);
    }
  }
}

// ── Crawl job management ──────────────────────────────────────────────────────

export async function createCrawlJob(websiteId: string, startUrl: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('crawl_jobs')
    .insert({
      website_id: websiteId,
      start_url: startUrl,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(error?.message || 'Failed to create crawl job');
  return data.id;
}

export async function updateCrawlJob(
  jobId: string,
  updates: {
    status?: string;
    pages_visited?: number;
    entities_found?: number;
    error_message?: string;
    completed_at?: string;
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
