import { CrawledEntity } from './types';
import { safeFetch, extractPageEntities } from './extractor';
import { discoverAndFetchPageApis } from './networkExtractor';

// ── Crawl Diagnostic & Coverage Types ────────────────────────────────────────

export interface CrawlDiagnostic {
  url: string;
  status?: number;
  contentType?: string;
  discoverySource: 'seed' | 'sitemap' | 'robots_hint' | 'nextjs_route' | 'html_link' | 'crawl4ai_seed' | 'frontier_bfs' | 'recrawl_escalation';
  depth: number;
  extractionMethod?: 'json-ld' | 'embedded_state' | 'api' | 'dom' | 'css' | 'llm' | 'spa_chunk' | 'html_fallback' | 'native_html' | 'crawl4ai' | 'not_visited';
  rendered: boolean;
  crawlStatus: 'queued' | 'visited' | 'skipped' | 'blocked' | 'error';
  lastSeen?: string;
  errors?: string[];
}

export interface InventoryCategoryCoverage {
  discovered: boolean;
  inventoryRoutesCount: number;
  vehiclePagesCount: number;
  extractedVehiclesCount: number;
}

export interface InventoryCoverageReport {
  new: InventoryCategoryCoverage;
  used: InventoryCategoryCoverage;
  cpo: InventoryCategoryCoverage;
  allVehiclesCount: number;
  dealerInfoDiscovered: boolean;
  businessHoursDiscovered: boolean;
  isDualInventoryExpected: boolean;
  missingCategoryWarning?: string;
}

export interface CrawlCoverageReport {
  websiteId: string;
  startUrl: string;
  crawlQualityStatus: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  qualityScore: number; // 0 to 100
  isSuspiciouslyIncomplete: boolean;
  suspiciousReasons: string[];
  missingExpectedSections: string[];
  inventoryCoverage?: InventoryCoverageReport;
  discoveredUrlsCount: number;
  successfullyCrawledCount: number;
  failedUrlsCount: number;
  skippedUrlsCount: number;
  dynamicUrlsCount: number;
  apiEndpointsCount: number;
  entityCount: number;
  entityTypesBreakdown: Record<string, number>;
  imagesCount: number;
  pricesCount: number;
  pagesByDepth: Record<number, number>;
  discoverySourcesBreakdown: Record<string, number>;
  extractionSourcesBreakdown: Record<string, number>;
  discoveredNavigationSections: string[];
  crawledNavigationSections: string[];
  diagnostics: CrawlDiagnostic[];
  warnings: string[];
  durationMs: number;
}

// ── Known Navigation Concepts ────────────────────────────────────────────────

const STANDARD_NAV_KEYWORDS = [
  'services', 'freelancers', 'courses', 'classes', 'shop', 'products',
  'inventory', 'vehicles', 'pricing', 'plans', 'about', 'contact',
  'faq', 'faqs', 'blog', 'team', 'careers', 'properties', 'listings',
  'doctors', 'menu', 'search-gigs', 'gigs', 'curriculum', 'features'
];

/**
 * Extracts visible navigation links and section labels from homepage / layout HTML.
 */
export function extractNavigationSections(html: string): { label: string; href?: string }[] {
  const sections: { label: string; href?: string }[] = [];
  const seenLabels = new Set<string>();

  // 1. Extract links within <nav>, <header>, or menu classes
  const navContainerMatches = html.match(/<(?:nav|header|div)[^>]*(?:class|id)=["'][^"']*(?:nav|menu|header|navbar)[^"']*["'][^>]*>([\s\S]*?)<\/(?:nav|header|div)>/gi) || [html];

  for (const container of navContainerMatches) {
    const linkRegex = /<a[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(container)) !== null) {
      const href = m[1]?.trim();
      const rawText = m[2]?.replace(/<[^>]+>/g, '').trim();
      if (!rawText || rawText.length < 2 || rawText.length > 30) continue;

      const lower = rawText.toLowerCase();
      if (seenLabels.has(lower)) continue;

      // Check if matches known domain keywords or is a clean section link
      const isKnownKeyword = STANDARD_NAV_KEYWORDS.some(k => lower.includes(k));
      const isSectionPath = href && href.startsWith('/') && !href.startsWith('/_') && href.length < 40;

      if (isKnownKeyword || isSectionPath) {
        seenLabels.add(lower);
        sections.push({ label: rawText, href });
      }
    }
  }

  return sections;
}

/**
 * Assesses crawl completeness by comparing discovered navigation targets against extracted entities.
 */
export function assessCrawlCompleteness(params: {
  websiteId: string;
  startUrl: string;
  homepageHtml: string;
  discoveredUrls: string[];
  diagnostics: CrawlDiagnostic[];
  entities: CrawledEntity[];
  pagesVisited: number;
  pagesProcessed: number;
  pagesSkipped: number;
  blockedPages: number;
  errors: string[];
  durationMs: number;
}): CrawlCoverageReport {
  const {
    websiteId,
    startUrl,
    homepageHtml,
    discoveredUrls,
    diagnostics,
    entities,
    pagesVisited,
    pagesProcessed,
    pagesSkipped,
    blockedPages,
    errors,
    durationMs,
  } = params;

  const warnings: string[] = [];
  const suspiciousReasons: string[] = [];
  const missingSections: string[] = [];

  // 1. Breakdowns
  const entityTypesBreakdown: Record<string, number> = {};
  let imagesCount = 0;
  let pricesCount = 0;

  for (const e of entities) {
    const t = e.dataType || 'unknown';
    entityTypesBreakdown[t] = (entityTypesBreakdown[t] || 0) + 1;
    if (e.imageUrls?.length) imagesCount += e.imageUrls.length;
    else if (e.metadata?.images?.length) imagesCount += (e.metadata.images as string[]).length;
    else if (e.metadata?.image) imagesCount += 1;

    if (e.metadata?.price) pricesCount++;
  }

  const pagesByDepth: Record<number, number> = {};
  const discoverySourcesBreakdown: Record<string, number> = {};
  const extractionSourcesBreakdown: Record<string, number> = {};
  let dynamicUrlsCount = 0;
  let apiEndpointsCount = 0;
  let failedUrlsCount = 0;

  for (const d of diagnostics) {
    pagesByDepth[d.depth] = (pagesByDepth[d.depth] || 0) + 1;
    discoverySourcesBreakdown[d.discoverySource] = (discoverySourcesBreakdown[d.discoverySource] || 0) + 1;
    if (['nextjs_route', 'frontier_bfs', 'crawl4ai_seed', 'recrawl_escalation'].includes(d.discoverySource)) {
      dynamicUrlsCount++;
    }
    if (d.extractionMethod) {
      extractionSourcesBreakdown[d.extractionMethod] = (extractionSourcesBreakdown[d.extractionMethod] || 0) + 1;
    }
    if (d.crawlStatus === 'error' || d.crawlStatus === 'blocked') {
      failedUrlsCount++;
    }
  }

  for (const e of entities) {
    if (e.metadata?.discoveryMethod === 'api') apiEndpointsCount++;
  }

  // 2. Navigation Completeness Check
  const navSections = extractNavigationSections(homepageHtml);
  const discoveredNavLabels = navSections.map(s => s.label);
  const crawledNavLabels: string[] = [];

  for (const nav of navSections) {
    const term = nav.label.toLowerCase();
    const href = (nav.href || '').toLowerCase();

    // Check if this navigation section is covered by crawled entities or URLs
    const urlMatches = discoveredUrls.some(u => {
      const uLower = u.toLowerCase();
      return (href && uLower.includes(href)) || uLower.includes(term);
    });

    const entityMatches = entities.some(e => {
      const titleLower = (e.title || '').toLowerCase();
      const contentLower = (e.content || '').toLowerCase();
      const catLower = (e.metadata?.category ? String(e.metadata.category) : '').toLowerCase();
      return titleLower.includes(term) || contentLower.includes(term) || catLower.includes(term);
    });

    if (urlMatches || entityMatches) {
      crawledNavLabels.push(nav.label);
    } else {
      missingSections.push(nav.label);
    }
  }

  // 3. Suspicious Incompleteness Evaluation
  let isSuspiciouslyIncomplete = false;

  // Rule A: Homepage had major catalog sections (Services, Freelancers, Courses, Products) but 0 structured entities found
  const majorCatalogKeywords = ['services', 'freelancers', 'courses', 'shop', 'products', 'inventory', 'listings', 'search-gigs'];
  const hasCatalogInNav = navSections.some(n => majorCatalogKeywords.some(k => n.label.toLowerCase().includes(k) || (n.href && n.href.toLowerCase().includes(k))));

  if (hasCatalogInNav && entities.length <= 1) {
    isSuspiciouslyIncomplete = true;
    suspiciousReasons.push(`Navigation contains catalog sections (${navSections.map(n => n.label).join(', ')}), but crawler only extracted ${entities.length} entities.`);
  }

  // Rule B: Missing >= 50% of discovered navigation sections
  if (navSections.length >= 3 && missingSections.length > navSections.length * 0.5) {
    isSuspiciouslyIncomplete = true;
    suspiciousReasons.push(`Missed ${missingSections.length}/${navSections.length} navigation sections: ${missingSections.join(', ')}`);
  }

  // 4. Automotive Dual Inventory (NEW vs USED vs CPO) Completeness Evaluation
  const newRoutes = discoveredUrls.filter(u => /\b(?:new-vehicles|new-inventory|new-cars|\/new\/|searchnew)\b/i.test(u));
  const usedRoutes = discoveredUrls.filter(u => /\b(?:used-vehicles|used-inventory|used-cars|pre-owned|\/used\/|searchused)\b/i.test(u));
  const cpoRoutes = discoveredUrls.filter(u => /\b(?:cpo|certified-pre-owned|certified|\/cpo\/)\b/i.test(u));

  const newVehicles = entities.filter(e => e.metadata?.condition === 'new' || /\bnew\b/i.test(String(e.metadata?.condition || '')));
  const usedVehicles = entities.filter(e => e.metadata?.condition === 'used' || /\bused\b/i.test(String(e.metadata?.condition || '')));
  const cpoVehicles = entities.filter(e => e.metadata?.condition === 'cpo' || e.metadata?.condition === 'certified');

  const navHasNew = navSections.some(n => /\bnew\b/i.test(n.label) || (n.href && /\bnew\b/i.test(n.href)));
  const navHasUsed = navSections.some(n => /\b(?:used|pre-owned|preowned)\b/i.test(n.label) || (n.href && /\b(?:used|pre-owned|preowned)\b/i.test(n.href)));
  const isDualInventoryExpected = navHasNew && navHasUsed;

  let missingCategoryWarning: string | undefined = undefined;
  if (isDualInventoryExpected) {
    if (newVehicles.length === 0 && usedVehicles.length > 0) {
      missingCategoryWarning = `Dealership navigation indicates NEW inventory exists (${newRoutes.length} routes discovered), but 0 new vehicles were extracted.`;
      isSuspiciouslyIncomplete = true;
      suspiciousReasons.push(missingCategoryWarning);
    } else if (usedVehicles.length === 0 && newVehicles.length > 0) {
      missingCategoryWarning = `Dealership navigation indicates USED inventory exists (${usedRoutes.length} routes discovered), but 0 used vehicles were extracted.`;
      isSuspiciouslyIncomplete = true;
      suspiciousReasons.push(missingCategoryWarning);
    }
  }

  const hasDealerInfo = entities.some(e => e.dataType === 'contact' || (e.metadata?.phone && e.metadata?.address));
  const hasHours = entities.some(e => e.metadata?.hours);

  const inventoryCoverage: InventoryCoverageReport = {
    new: {
      discovered: newVehicles.length > 0 || newRoutes.length > 0,
      inventoryRoutesCount: newRoutes.length,
      vehiclePagesCount: newRoutes.length,
      extractedVehiclesCount: newVehicles.length,
    },
    used: {
      discovered: usedVehicles.length > 0 || usedRoutes.length > 0,
      inventoryRoutesCount: usedRoutes.length,
      vehiclePagesCount: usedRoutes.length,
      extractedVehiclesCount: usedVehicles.length,
    },
    cpo: {
      discovered: cpoVehicles.length > 0 || cpoRoutes.length > 0,
      inventoryRoutesCount: cpoRoutes.length,
      vehiclePagesCount: cpoRoutes.length,
      extractedVehiclesCount: cpoVehicles.length,
    },
    allVehiclesCount: newVehicles.length + usedVehicles.length + cpoVehicles.length,
    dealerInfoDiscovered: hasDealerInfo,
    businessHoursDiscovered: hasHours,
    isDualInventoryExpected,
    missingCategoryWarning,
  };

  // 4. Quality Score & Status Calculation
  let qualityScore = 100;

  if (pagesVisited === 0 || blockedPages > 0) qualityScore -= 40;
  if (isSuspiciouslyIncomplete) qualityScore -= 35;
  if (missingSections.length > 0) qualityScore -= Math.min(25, missingSections.length * 5);
  if (entities.length === 0) qualityScore -= 30;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  let crawlQualityStatus: CrawlCoverageReport['crawlQualityStatus'] = 'COMPLETE';
  if (qualityScore < 40 || pagesVisited === 0 || (blockedPages > 0 && pagesVisited === 0)) {
    crawlQualityStatus = 'FAILED';
  } else if (qualityScore < 80 || isSuspiciouslyIncomplete || missingSections.length > 0) {
    crawlQualityStatus = 'PARTIAL';
  }

  return {
    websiteId,
    startUrl,
    crawlQualityStatus,
    qualityScore,
    isSuspiciouslyIncomplete,
    suspiciousReasons,
    missingExpectedSections: missingSections,
    inventoryCoverage,
    discoveredUrlsCount: discoveredUrls.length,
    successfullyCrawledCount: pagesProcessed,
    failedUrlsCount,
    skippedUrlsCount: pagesSkipped,
    dynamicUrlsCount,
    apiEndpointsCount,
    entityCount: entities.length,
    entityTypesBreakdown,
    imagesCount,
    pricesCount,
    pagesByDepth,
    discoverySourcesBreakdown,
    extractionSourcesBreakdown,
    discoveredNavigationSections: discoveredNavLabels,
    crawledNavigationSections: crawledNavLabels,
    diagnostics,
    warnings,
    durationMs,
  };
}

/**
 * Automatically escalates and recrawls missing sections discovered on dynamic websites.
 */
export async function escalateAndRecrawlMissingSections(params: {
  websiteId: string;
  startUrl: string;
  missingSections: string[];
  existingEntities: CrawledEntity[];
  discoveredUrls: string[];
  diagnostics: CrawlDiagnostic[];
  maxRecrawlLimit?: number;
}): Promise<{ newlyDiscoveredEntities: CrawledEntity[]; updatedDiagnostics: CrawlDiagnostic[] }> {
  const {
    startUrl,
    missingSections,
    existingEntities,
    discoveredUrls,
    diagnostics,
    maxRecrawlLimit = 5,
  } = params;

  if (missingSections.length === 0) {
    return { newlyDiscoveredEntities: [], updatedDiagnostics: diagnostics };
  }

  console.log(`[completeness] Triggering targeted escalation recrawl for missing sections: ${missingSections.join(', ')}`);

  const origin = new URL(startUrl).origin;
  const newlyDiscoveredEntities: CrawledEntity[] = [];
  const seenTitles = new Set(existingEntities.map(e => (e.title || '').toLowerCase()));

  // Identify candidate URLs matching missing sections
  const candidateUrlsToEscalate: string[] = [];

  for (const section of missingSections) {
    const lowerSec = section.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedUrl = discoveredUrls.find(u => {
      const uClean = u.toLowerCase().replace(/[^a-z0-9]/g, '');
      return uClean.includes(lowerSec);
    });

    if (matchedUrl && !candidateUrlsToEscalate.includes(matchedUrl)) {
      candidateUrlsToEscalate.push(matchedUrl);
    } else {
      // Construct plausible candidate route
      const slugCandidate = `${origin}/${section.toLowerCase().replace(/\s+/g, '-')}`;
      if (!candidateUrlsToEscalate.includes(slugCandidate)) {
        candidateUrlsToEscalate.push(slugCandidate);
      }
    }
  }

  let recrawlCount = 0;

  for (const url of candidateUrlsToEscalate.slice(0, maxRecrawlLimit)) {
    recrawlCount++;
    console.log(`[completeness] Escalating extraction on section route: ${url}`);

    try {
      const res = await safeFetch(url);
      if (!res?.html || res.status >= 400) {
        console.warn(`[completeness] Section ${url} unreachable (HTTP ${res?.status || 'ERR'}). Recording section provenance.`);
        diagnostics.push({
          url,
          status: res?.status || 500,
          discoverySource: 'recrawl_escalation',
          depth: 1,
          crawlStatus: 'error',
          errors: [`Section discovered but data extraction failed (HTTP ${res?.status || 'fetch error'})`],
          rendered: false,
        });
        continue;
      }

      // Step 1: Run 5-tier extraction
      const extracted = await extractPageEntities(res.html, url);

      // Step 2: If extracted is empty, force API discovery from script chunks
      if (extracted.length === 0) {
        const apis = await discoverAndFetchPageApis(res.html, url);
        extracted.push(...apis);
      }

      for (const e of extracted) {
        const titleKey = (e.title || '').trim().toLowerCase();
        if (titleKey && !seenTitles.has(titleKey)) {
          seenTitles.add(titleKey);
          newlyDiscoveredEntities.push(e);
        }
      }

      diagnostics.push({
        url,
        status: res.status,
        discoverySource: 'recrawl_escalation',
        depth: 1,
        crawlStatus: 'visited',
        extractionMethod: extracted.length > 0 ? (extracted[0].metadata?.discoveryMethod as any || 'native_html') : 'html_fallback',
        rendered: true,
      });
    } catch (err: any) {
      console.warn(`[completeness] Escalation error on ${url}:`, err.message);
    }
  }

  console.log(`[completeness] Escalation complete: discovered ${newlyDiscoveredEntities.length} new entities`);
  return { newlyDiscoveredEntities, updatedDiagnostics: diagnostics };
}
