/**
 * HTML/metadata extractor — zero dependencies.
 * Uses regex-based parsing since we run server-side in Next.js Route Handlers
 * where cheerio/jsdom would add significant bundle weight.
 */

import { CrawledEntity } from './types';

// ─── Safe fetch with timeout ──────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export async function safeFetch(url: string): Promise<{ html: string; contentType: string; status: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      return { html: '', contentType, status: res.status };
    }

    // Stream-read with size cap
    const reader = res.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      totalBytes += value.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }

    const buffer = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    return { html, contentType, status: res.status };
  } catch {
    return null;
  }
}

/**
 * Known tracking query params to strip during URL normalization.
 */
const STRIP_QUERY_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'referrer', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid',
  '_ga', '_gl', 'source', 'campaign', 'affiliate', 'yclid', 'zanpid',
]);

/**
 * Returns true if the URL path points to a navigable HTML page (not a static asset).
 */
function isNavigablePage(pathname: string): boolean {
  return !pathname.match(/\.(css|js|mjs|cjs|woff|woff2|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp|avif|mp4|webm|ogg|mp3|pdf|zip|gz|tar|json|xml|map)$/i);
}

/**
 * Normalizes a URL for deduplication:
 * - Removes fragment (#...)
 * - Strips tracking query params
 * - Cleans double-slashes from path
 */
export function normalizeUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const resolved = new URL(rawUrl, baseUrl);
    resolved.hash = '';
    const toDelete: string[] = [];
    resolved.searchParams.forEach((_, key) => {
      if (STRIP_QUERY_PARAMS.has(key.toLowerCase())) toDelete.push(key);
    });
    toDelete.forEach(k => resolved.searchParams.delete(k));
    resolved.pathname = resolved.pathname.replace(/\/\/+/g, '/');
    return resolved.href;
  } catch {
    return null;
  }
}

/**
 * Extracts all valid same-domain links from HTML.
 * Covers: href, data-href, data-url, data-link, action (forms), data-path,
 * router.push/navigate calls, and Next.js Link patterns.
 */
export function extractSameDomainLinks(html: string, baseUrl: string): string[] {
  try {
    const base = new URL(baseUrl);
    const links = new Set<string>();

    const attrPatterns = [
      /href\s*=\s*["']([^"'#][^"']*)["']/gi,
      /data-href\s*=\s*["']([^"']+)["']/gi,
      /data-url\s*=\s*["']([^"']+)["']/gi,
      /data-link\s*=\s*["']([^"']+)["']/gi,
      /data-path\s*=\s*["']([^"']+)["']/gi,
      /action\s*=\s*["']([^"']+)["']/gi,
      /\bto\s*=\s*["'](\/?[a-zA-Z0-9/_-][^"']*)["']/gi,
    ];

    for (const regex of attrPatterns) {
      let match;
      while ((match = regex.exec(html)) !== null) {
        const raw = match[1]?.trim();
        if (!raw || raw.startsWith('javascript:') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('data:')) continue;
        const normalized = normalizeUrl(raw, base.href);
        if (!normalized) continue;
        try {
          const parsed = new URL(normalized);
          if (parsed.hostname.toLowerCase() === base.hostname.toLowerCase() && isNavigablePage(parsed.pathname)) {
            links.add(normalized);
          }
        } catch {}
      }
    }

    // SPA router push patterns
    const routerPushRegex = /(?:router\.push|history\.push(?:State)?|navigate|location\.(?:href|assign|replace))\s*[\(=]\s*["'](\/?[a-zA-Z0-9/_?#-][^"']*)["']/gi;
    let m;
    while ((m = routerPushRegex.exec(html)) !== null) {
      const raw = m[1]?.trim();
      if (!raw) continue;
      const normalized = normalizeUrl(raw, base.href);
      if (!normalized) continue;
      try {
        const parsed = new URL(normalized);
        if (parsed.hostname.toLowerCase() === base.hostname.toLowerCase() && isNavigablePage(parsed.pathname)) {
          links.add(normalized);
        }
      } catch {}
    }

    links.add(normalizeUrl(base.href) || base.href);
    return Array.from(links);
  } catch {
    return [baseUrl];
  }
}

/**
 * Parses XML sitemap content to extract candidate URLs.
 * Also returns nested sub-sitemap XML URLs for recursive fetching.
 */
export function extractSitemapUrls(xmlText: string, baseUrl: string): string[] {
  try {
    const base = new URL(baseUrl);
    const urls = new Set<string>();
    const locRegex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
    let match;
    while ((match = locRegex.exec(xmlText)) !== null) {
      const loc = match[1]?.trim();
      if (!loc || !loc.startsWith('http')) continue;
      try {
        const parsed = new URL(loc);
        if (parsed.hostname.toLowerCase() === base.hostname.toLowerCase()) {
          if (isNavigablePage(parsed.pathname)) {
            const normalized = normalizeUrl(loc);
            if (normalized) urls.add(normalized);
          } else if (parsed.pathname.endsWith('.xml')) {
            // Sitemap index sub-sitemaps
            urls.add(loc);
          }
        }
      } catch {}
    }
    return Array.from(urls);
  } catch {
    return [];
  }
}

/**
 * Fetches and parses all sitemap URLs recursively (handles sitemap index files).
 * Returns deduplicated list of navigable page URLs.
 */
export async function fetchAllSitemapUrls(origin: string, baseUrl: string, maxDepth = 3): Promise<string[]> {
  const allUrls = new Set<string>();
  const visited = new Set<string>();

  async function fetchSitemap(sitemapUrl: string, depth: number): Promise<void> {
    if (depth > maxDepth || visited.has(sitemapUrl)) return;
    visited.add(sitemapUrl);
    try {
      const res = await safeFetch(sitemapUrl);
      if (!res || res.status !== 200 || !res.html) return;
      const discovered = extractSitemapUrls(res.html, baseUrl);
      for (const url of discovered) {
        if (url.endsWith('.xml') && !visited.has(url)) {
          await fetchSitemap(url, depth + 1);
        } else {
          allUrls.add(url);
        }
      }
    } catch {}
  }

  const candidates = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/sitemap-index.xml`,
    `${origin}/vehicles_sitemap.xml`,
    `${origin}/sitemap-inventory.xml`,
    `${origin}/sitemap_inventory.xml`,
    `${origin}/sitemap-vehicles.xml`,
    `${origin}/inventory-sitemap.xml`,
    `${origin}/sitemaps/sitemap.xml`,
  ];

  for (const candidate of candidates) {
    await fetchSitemap(candidate, 0);
  }

  return Array.from(allUrls);
}

/**
 * Fetches robots.txt and extracts Sitemap: directives and non-disallowed path hints.
 */
export async function parseRobotsTxt(origin: string): Promise<{ sitemapUrls: string[]; hintPaths: string[] }> {
  const sitemapUrls: string[] = [];
  const hintPaths: string[] = [];
  try {
    const res = await safeFetch(`${origin}/robots.txt`);
    if (!res || res.status !== 200 || !res.html) return { sitemapUrls, hintPaths };
    const lines = res.html.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const sitemapMatch = trimmed.match(/^Sitemap:\s*(.+)$/i);
      if (sitemapMatch?.[1]) {
        const url = sitemapMatch[1].trim();
        if (url.startsWith('http')) sitemapUrls.push(url);
      }
      const allowMatch = trimmed.match(/^Allow:\s*(.+)$/i);
      if (allowMatch?.[1]) {
        const path = allowMatch[1].trim();
        if (path && path !== '/' && path.match(/^\/[a-zA-Z0-9/_-]+$/)) {
          hintPaths.push(path);
        }
      }
    }
  } catch {}
  return { sitemapUrls, hintPaths };
}

/**
 * Extracts Next.js route information from:
 * 1. __NEXT_DATA__ JSON embedded in the page
 * 2. _next/static build manifests
 * 3. Script src chunk filenames
 */
export async function extractNextJsRoutes(html: string, baseUrl: string): Promise<string[]> {
  const base = new URL(baseUrl);
  const routes = new Set<string>();

  try {
    // 1. Parse __NEXT_DATA__
    const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch) {
      const nextData = JSON.parse(nextDataMatch[1]);
      if (nextData.page && nextData.page !== '/_error' && nextData.page !== '/404') {
        routes.add(nextData.page);
      }
      const propsStr = JSON.stringify(nextData.props || {});
      const routeMatches = propsStr.match(/"(?:href|url|path|route|link)"\s*:\s*"(\/[^"]{1,200})"/gi);
      if (routeMatches) {
        for (const rm of routeMatches) {
          const m = rm.match(/"[^"]+"\s*:\s*"(\/[^"]+)"/);
          if (m?.[1]) routes.add(m[1].split('?')[0]);
        }
      }
    }
  } catch {}

  try {
    // 2. Try fetching build manifest for all routes
    const buildIdMatch = html.match(/"\/_next\/static\/([^\/]+)\/_buildManifest\.js"/);
    const buildId = buildIdMatch?.[1];
    if (buildId) {
      const manifestRes = await safeFetch(`${base.origin}/_next/static/${buildId}/_ssgManifest.js`);
      if (manifestRes?.html) {
        const routeMatches = manifestRes.html.match(/"(\/[^"]{1,200})"/g);
        if (routeMatches) {
          for (const rm of routeMatches) {
            const path = rm.slice(1, -1);
            if (path.startsWith('/') && !path.includes('/_') && isNavigablePage(path)) {
              routes.add(path);
            }
          }
        }
      }
    }
  } catch {}

  // 3. Script chunk filename hints
  const scriptSrcRegex = /src=["']\/_next\/static\/chunks\/pages\/([^"'?]+)["']/gi;
  let m;
  while ((m = scriptSrcRegex.exec(html)) !== null) {
    const chunkName = m[1].replace(/\.js$/, '').replace(/\[.*?\]/g, ':param');
    if (chunkName && chunkName !== 'index' && !chunkName.startsWith('_')) {
      routes.add('/' + chunkName);
    }
  }

  // 4. Client bundle inspection for Next.js App Router & SPAs
  // Scan script tags prioritizing app/, layout, page, router, and main bundles
  const allScriptMatches = Array.from(html.matchAll(/<script[^>]*src=["']([^"']+\.(?:js|mjs)(?:\?[^"']*)?)["']/gi)).map(sm => sm[1]);
  const prioritizedScripts = allScriptMatches.sort((a, b) => {
    const scoreA = (a.includes('/app/') ? 10 : 0) + (a.includes('layout') ? 5 : 0) + (a.includes('page') ? 5 : 0) + (a.includes('router') ? 4 : 0) + (a.includes('main') ? 3 : 0);
    const scoreB = (b.includes('/app/') ? 10 : 0) + (b.includes('layout') ? 5 : 0) + (b.includes('page') ? 5 : 0) + (b.includes('router') ? 4 : 0) + (b.includes('main') ? 3 : 0);
    return scoreB - scoreA;
  }).slice(0, 12);

  if (prioritizedScripts.length > 0) {
    await Promise.allSettled(
      prioritizedScripts.map(async (src) => {
        try {
          const scriptUrl = src.startsWith('http') ? src : `${base.origin}${src.startsWith('/') ? '' : '/'}${src}`;
          const res = await safeFetch(scriptUrl);
          if (!res?.html) return;

          // Look for route path string literals: "/services", "/freelancer", "/courses/...", etc.
          const pathMatches = res.html.match(/["'](\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*)["']/g);
          if (pathMatches) {
            for (const rawMatch of pathMatches) {
              const p = rawMatch.slice(1, -1);
              if (
                p.length >= 2 &&
                p.length <= 60 &&
                !p.startsWith('/_') &&
                !p.startsWith('/static') &&
                !p.startsWith('/node_modules') &&
                !p.startsWith('/api') &&
                !p.includes('webpack') &&
                isNavigablePage(p) &&
                // Ensure it looks like a clean application route
                !/[A-Z0-9]{16,}/.test(p)
              ) {
                routes.add(p);
              }
            }
          }
        } catch {}
      })
    );
  }

  const fullUrls: string[] = [];
  for (const route of routes) {
    if (route.startsWith('/')) {
      const fullUrl = normalizeUrl(`${base.origin}${route}`);
      if (fullUrl) fullUrls.push(fullUrl);
    }
  }
  return fullUrls;
}



// ─── Regex helpers ────────────────────────────────────────────────────────────

function extractTag(html: string, tag: string, attr?: string): string {
  if (attr) {
    const re = new RegExp(`<${tag}[^>]*\\s${attr}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i');
    return decodeHtmlEntities(html.match(re)?.[1]?.trim() || '');
  }
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return decodeHtmlEntities(stripTags(html.match(re)?.[1] || ''));
}

function extractMeta(html: string, nameOrProp: string): string {
  // <meta name="X" content="Y"> or <meta property="X" content="Y">
  const patterns = [
    new RegExp(`<meta[^>]*(?:name|property)\\s*=\\s*["']${nameOrProp}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*(?:name|property)\\s*=\\s*["']${nameOrProp}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return '';
}

function stripTags(str: string): string {
  return str
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractAllText(html: string, maxLength = 1000): string {
  // Remove scripts, styles, nav, footer, header boilerplate
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');

  // Extract main content area first if present
  const mainMatch = body.match(/<main[\s\S]*?<\/main>/i) ||
    body.match(/<article[\s\S]*?<\/article>/i) ||
    body.match(/<div[^>]*id=["'](?:main|content|body)["'][\s\S]*?<\/div>/i);
  if (mainMatch) body = mainMatch[0];

  return stripTags(body).substring(0, maxLength);
}

function extractImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];
  const ogImage = extractMeta(html, 'og:image');
  if (ogImage) images.push(resolveUrl(ogImage, baseUrl));

  const imgRe = /<img[^>]*src=["']([^"']+)["'][^>]*/gi;
  let m;
  while ((m = imgRe.exec(html)) !== null && images.length < 5) {
    const src = m[1];
    // Skip icons, tracking pixels, etc.
    if (src.match(/\.(svg|gif|ico)$/i)) continue;
    if (src.includes('data:')) continue;
    if (m[0].match(/width=["'](\d+)["']/) && parseInt(RegExp.$1) < 50) continue;
    images.push(resolveUrl(src, baseUrl));
  }
  return [...new Set(images)].slice(0, 4);
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// ─── JSON-LD extractor ────────────────────────────────────────────────────────

export function extractJsonLd(html: string): Record<string, any>[] {
  const results: Record<string, any>[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      if (Array.isArray(parsed)) results.push(...parsed);
      else if (parsed && typeof parsed === 'object') results.push(parsed);
    } catch {}
  }
  return results;
}

import { discoverAndFetchPageApis } from './networkExtractor';

// ─── JSON-LD → CrawledEntity mappers ─────────────────────────────────────────

export function mapJsonLdToEntities(jsonLdList: Record<string, any>[], pageUrl: string): CrawledEntity[] {
  const entities: CrawledEntity[] = [];

  for (const ld of jsonLdList) {
    if (!ld || typeof ld !== 'object') continue;
    const type = (ld['@type'] || ld['@Type'] || '').toString().toLowerCase();

    // 1. ItemList / OfferCatalog / CollectionPage / AutoDealer unrolling
    if (
      type.includes('itemlist') ||
      type.includes('offercatalog') ||
      type.includes('collectionpage') ||
      type.includes('autodealer') ||
      type.includes('automotivedealer') ||
      type.includes('carrepair')
    ) {
      const items = ld.itemListElement || ld.itemList || ld.offers || ld.hasOfferCatalog?.itemListElement || ld.makesOffer || ld.itemOffered || [];
      if (Array.isArray(items) && items.length > 0) {
        const unrolled = items.map((it: any) => it.item || it).filter(Boolean);
        entities.push(...mapJsonLdToEntities(unrolled, pageUrl));
      }
      if (type.includes('autodealer') || type.includes('automotivedealer')) {
        // Fall through to parse dealership contact info if present
      } else {
        continue;
      }
    }

    // 2. Product / Ecommerce / Vehicles
    if (type.includes('product')) {
      // Check if product is actually a vehicle (has VIN, modelDate, engine, or mileage)
      const isVehicleProduct =
        Boolean(ld.vehicleIdentificationNumber || ld.vin || ld.modelDate || ld.vehicleModelDate || ld.vehicleEngine || ld.mileageFromOdometer || ld.bodyType);

      if (isVehicleProduct) {
        // Route to vehicle parsing below
      } else {
        const offer = ld.offers || ld.offer || {};
        const rawImgs = Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : [];
        const entity: CrawledEntity = {
          url: pageUrl,
          title: ld.name || ld.headline || '',
          content: ld.description || ld.name || '',
          dataType: 'product',
          imageUrls: rawImgs,
          metadata: {
            discoveryMethod: 'json-ld',
            description: ld.description,
            images: rawImgs,
            image: rawImgs[0] || undefined,
            price: offer.price,
            currency: offer.priceCurrency,
            availability: simplifyAvailability(offer.availability),
            rating: ld.aggregateRating?.ratingValue ? parseFloat(ld.aggregateRating.ratingValue) : undefined,
            reviews: ld.aggregateRating?.reviewCount ? parseInt(ld.aggregateRating.reviewCount) : undefined,
            brand: ld.brand?.name || ld.brand,
            sku: ld.sku,
            category: ld.category,
          },
        };
        if (entity.title || entity.content) entities.push(entity);
        continue;
      }
    }

    // 3. Vehicle / Automotive / Car / Motorcycle / Truck
    if (
      type.includes('vehicle') ||
      type.includes('car') ||
      type.includes('motorcycle') ||
      type.includes('truck') ||
      type.includes('bus') ||
      type.includes('product')
    ) {
      const offer = ld.offers || ld.offer || {};
      const rawImgs = Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : [];
      const title = ld.name || `${ld.vehicleModelDate || ld.modelDate || ''} ${ld.brand?.name || ld.brand || ''} ${ld.model || ''}`.trim() || 'Vehicle';
      
      const conditionStr = String(ld.itemCondition || offer.itemCondition || '').toLowerCase();
      const condition = conditionStr.includes('new') || pageUrl.includes('/new-vehicles') || pageUrl.includes('/new-inventory')
        ? 'new'
        : conditionStr.includes('cpo') || conditionStr.includes('certified')
        ? 'cpo'
        : 'used';

      const drivetrain = ld.driveWheelConfiguration || ld.driveType || ld.drivetrain;
      const category = ld.category || ld.bodyType || ld.vehicleConfiguration;
      const bodyStyle = ld.bodyType || ld.vehicleConfiguration || category;
      const msrp = ld.msrp || offer.priceSpecification?.price || offer.highPrice;
      const engine = ld.vehicleEngine?.name || ld.engine?.name || ld.engine;
      const stockNumber = ld.sku || ld.stockNumber || ld.stock_number;
      const towingCapacity = ld.towingCapacity || ld.towingCapacityKg || ld.trailerWeightRating;
      const cityFuelEfficiency = ld.fuelEfficiencyCity || ld.fuelCity || ld.cityFuelEfficiency;
      const highwayFuelEfficiency = ld.fuelEfficiencyHighway || ld.fuelHighway || ld.highwayFuelEfficiency;
      const features: string[] = [];
      if (Array.isArray(ld.amenityFeature)) {
        features.push(...ld.amenityFeature.map((f: any) => String(f.name || f)).filter(Boolean));
      } else if (Array.isArray(ld.features)) {
        features.push(...ld.features.map(String).filter(Boolean));
      }

      const entity: CrawledEntity = {
        url: pageUrl,
        title,
        content: ld.description || title,
        dataType: 'product',
        imageUrls: rawImgs,
        metadata: {
          discoveryMethod: 'json-ld',
          description: ld.description,
          images: rawImgs,
          image: rawImgs[0] || undefined,
          condition,
          vin: ld.vehicleIdentificationNumber || ld.vin,
          stockNumber,
          stock_number: stockNumber,
          mileage: ld.mileageFromOdometer?.value || ld.mileageFromOdometer,
          year: ld.vehicleModelDate || ld.modelDate,
          make: ld.brand?.name || ld.brand,
          model: ld.model,
          trim: ld.vehicleConfiguration || ld.trim,
          category,
          bodyStyle,
          body_style: bodyStyle,
          drivetrain,
          towingCapacity,
          towing_capacity: towingCapacity,
          cityFuelEfficiency,
          highwayFuelEfficiency,
          color: ld.color,
          exteriorColor: ld.color || ld.exteriorColor,
          interiorColor: ld.interiorColor,
          engine,
          fuelType: ld.fuelType,
          fuel: ld.fuelType,
          transmission: ld.vehicleTransmission,
          price: offer.price,
          msrp,
          features: features.length > 0 ? features : undefined,
          vdpUrl: pageUrl,
          currency: offer.priceCurrency || (pageUrl.includes('.ca') ? 'CAD' : 'USD'),
          availability: simplifyAvailability(offer.availability),
        },
      };
      if (entity.title || entity.content) entities.push(entity);
    }

    // 4. Course / LMS / Educational Material
    else if (type.includes('course') || type.includes('learningresource') || type.includes('educational')) {
      const offer = ld.offers || ld.offer || {};
      const rawImgs = Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : [];
      const instructor = ld.instructor?.name || ld.instructor || ld.provider?.name || ld.provider || ld.author?.name || ld.author;
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || ld.headline || 'Course',
        content: ld.description || ld.name || '',
        dataType: 'service',
        imageUrls: rawImgs,
        metadata: {
          discoveryMethod: 'json-ld',
          description: ld.description,
          images: rawImgs,
          image: rawImgs[0] || undefined,
          instructor: typeof instructor === 'string' ? instructor : undefined,
          level: ld.educationalLevel || ld.courseCode,
          duration: ld.timeRequired || ld.duration,
          price: offer.price,
          currency: offer.priceCurrency,
          category: ld.about || ld.category || 'Course',
          rating: ld.aggregateRating?.ratingValue ? parseFloat(ld.aggregateRating.ratingValue) : undefined,
          reviews: ld.aggregateRating?.reviewCount ? parseInt(ld.aggregateRating.reviewCount) : undefined,
        },
      };
      if (entity.title || entity.content) entities.push(entity);
    }

    // 5. Real Estate / Property
    else if (type.includes('realestatelisting') || type.includes('residence') || type.includes('apartment') || type.includes('house') || type.includes('accommodation')) {
      const offer = ld.offers || ld.offer || {};
      const rawImgs = Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : [];
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || ld.headline || 'Property',
        content: ld.description || ld.name || '',
        dataType: 'product',
        imageUrls: rawImgs,
        metadata: {
          discoveryMethod: 'json-ld',
          description: ld.description,
          images: rawImgs,
          image: rawImgs[0] || undefined,
          price: offer.price,
          currency: offer.priceCurrency,
          bedrooms: ld.numberOfBedrooms || ld.numberOfRooms,
          bathrooms: ld.numberOfBathroomsTotal || ld.numberOfFullBathrooms,
          sqft: ld.floorSize?.value || ld.floorSize,
          address: typeof ld.address === 'object' ? `${ld.address?.streetAddress || ''}, ${ld.address?.addressLocality || ''}` : ld.address,
        },
      };
      if (entity.title || entity.content) entities.push(entity);
    }

    // 6. Healthcare / Physician / Clinic
    else if (type.includes('physician') || type.includes('medical') || type.includes('doctor') || type.includes('clinic')) {
      const rawImgs = Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : [];
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || 'Healthcare Provider',
        content: ld.description || `${ld.name || ''} — ${ld.medicalSpecialty || ld.department || ''}`.trim(),
        dataType: 'contact',
        imageUrls: rawImgs,
        metadata: {
          discoveryMethod: 'json-ld',
          description: ld.description,
          images: rawImgs,
          image: rawImgs[0] || undefined,
          specialty: ld.medicalSpecialty || ld.department,
          phone: ld.telephone,
          email: ld.email,
          address: typeof ld.address === 'object' ? `${ld.address?.streetAddress || ''}, ${ld.address?.addressLocality || ''}` : ld.address,
        },
      };
      if (entity.title || entity.content) entities.push(entity);
    }

    // 7. Menu Item / Restaurant
    else if (type.includes('menuitem') || type.includes('menu') || type.includes('dish')) {
      const offer = ld.offers || ld.offer || {};
      const rawImgs = Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : [];
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || 'Menu Item',
        content: ld.description || ld.name || '',
        dataType: 'product',
        imageUrls: rawImgs,
        metadata: {
          discoveryMethod: 'json-ld',
          description: ld.description,
          images: rawImgs,
          image: rawImgs[0] || undefined,
          price: offer.price,
          currency: offer.priceCurrency,
          nutrition: ld.nutrition,
          ingredients: Array.isArray(ld.ingredients) ? ld.ingredients.join(', ') : ld.ingredients,
        },
      };
      if (entity.title || entity.content) entities.push(entity);
    }

    // 8. Person / Profile / Freelancer / Agent
    else if (type.includes('person') || type.includes('profilepage')) {
      const rawImgs = Array.isArray(ld.image) ? ld.image : ld.image ? [ld.image] : [];
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || 'Profile',
        content: ld.description || `${ld.name || ''} — ${ld.jobTitle || ld.roleName || ''}`.trim(),
        dataType: 'service',
        imageUrls: rawImgs,
        metadata: {
          discoveryMethod: 'json-ld',
          description: ld.description,
          images: rawImgs,
          image: rawImgs[0] || undefined,
          jobTitle: ld.jobTitle,
          skills: ld.knowsAbout,
        },
      };
      if (entity.title || entity.content) entities.push(entity);
    }

    // 9. Service / Offer
    else if (type.includes('service') || type.includes('offer')) {
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || '',
        content: ld.description || ld.name || '',
        dataType: 'service',
        metadata: {
          discoveryMethod: 'json-ld',
          description: ld.description,
          price: ld.offers?.price,
          currency: ld.offers?.priceCurrency,
          category: ld.category,
        },
      };
      if (ld.image) entity.metadata.images = Array.isArray(ld.image) ? ld.image : [ld.image];
      if (entity.title || entity.content) entities.push(entity);
    }

    // 10. LocalBusiness / AutoDealer / Organization / Store
    else if (
      type.includes('localbusiness') ||
      type.includes('autodealer') ||
      type.includes('automotivedealer') ||
      type.includes('carrepair') ||
      type.includes('organization') ||
      type.includes('restaurant') ||
      type.includes('store')
    ) {
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || '',
        content: ld.description || `${ld.name || ''} — ${ld.address?.streetAddress || ''}`.trim(),
        dataType: 'contact',
        metadata: {
          discoveryMethod: 'json-ld',
          description: ld.description,
          phone: ld.telephone || ld.phone,
          email: ld.email,
          address: typeof ld.address === 'object' ? `${ld.address?.streetAddress || ''}, ${ld.address?.addressLocality || ''} ${ld.address?.addressRegion || ''} ${ld.address?.postalCode || ''}`.trim() : ld.address,
          hours: ld.openingHours || ld.openingHoursSpecification ? JSON.stringify(ld.openingHours || ld.openingHoursSpecification) : undefined,
          rating: ld.aggregateRating?.ratingValue ? parseFloat(ld.aggregateRating.ratingValue) : undefined,
        },
      };
      if (ld.image) entity.metadata.images = Array.isArray(ld.image) ? ld.image : [ld.image];
      if (entity.title || entity.content) entities.push(entity);
    }

    // 11. FAQPage / Question
    else if (type.includes('faqpage') || type.includes('question')) {
      const questions = ld.mainEntity || (type.includes('question') ? [ld] : []);
      for (const q of (Array.isArray(questions) ? questions : [questions])) {
        const answer = q.acceptedAnswer?.text || q.suggestedAnswer?.text || '';
        const entity: CrawledEntity = {
          url: pageUrl,
          title: q.name || '',
          content: answer || q.name || '',
          dataType: 'faq',
          metadata: { discoveryMethod: 'json-ld', description: answer },
        };
        if (entity.title || entity.content) entities.push(entity);
      }
    }
  }

  return entities;
}

function simplifyAvailability(val: string): string {
  if (!val) return '';
  const lower = val.toLowerCase();
  if (lower.includes('instock') || lower.includes('in_stock')) return 'In Stock';
  if (lower.includes('outofstock') || lower.includes('out_of_stock')) return 'Out of Stock';
  if (lower.includes('preorder') || lower.includes('pre_order')) return 'Pre-Order';
  if (lower.includes('discontinued')) return 'Discontinued';
  if (lower.includes('limited')) return 'Limited Availability';
  return val.replace(/^https?:\/\/schema\.org\//i, '');
}

// ─── Embedded Application State Extractor (Tier 2) ───────────────────────────

import { isInventoryShapedObject, mapInventoryObjectToEntity } from './networkExtractor';

/**
 * Extracts entities from embedded application state:
 * - Next.js __NEXT_DATA__
 * - React Server Components Flight stream (self.__next_f)
 * - Redux / Preloaded state (window.__INITIAL_STATE__, window.__PRELOADED_STATE__)
 * - Apollo GraphQL cache (window.__APOLLO_STATE__)
 */
export function extractEmbeddedAppState(html: string, pageUrl: string): CrawledEntity[] {
  const entities: CrawledEntity[] = [];
  const seenTitles = new Set<string>();

  // 1. React Server Components Flight Streams: self.__next_f.push([1, "..."])
  const rscMatches = Array.from(html.matchAll(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)/g)).map(m => m[1]);
  for (const chunk of rscMatches) {
    try {
      const unescaped = chunk.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      // Look for arrays of domain objects
      const arrayMatches = unescaped.match(/\[\s*\{[^{}]*?(?:title|name|courseName|gigTitle|productName|fullName)\s*:\s*"[^"]+"[\s\S]*?\}\s*\]/g) || [];
      for (const arrStr of arrayMatches) {
        try {
          const parsed = JSON.parse(arrStr);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (isInventoryShapedObject(item)) {
                const e = mapInventoryObjectToEntity(item, pageUrl, 'rsc_stream');
                if (e && e.title && !seenTitles.has(e.title.toLowerCase())) {
                  seenTitles.add(e.title.toLowerCase());
                  e.metadata.discoveryMethod = 'embedded_state';
                  entities.push(e);
                }
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  // 2. Next.js __NEXT_DATA__
  const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const productArrays = findDomainArrays(nextData.props || nextData);
      for (const arr of productArrays) {
        for (const item of arr) {
          if (isInventoryShapedObject(item)) {
            const e = mapInventoryObjectToEntity(item, pageUrl, '__NEXT_DATA__');
            if (e && e.title && !seenTitles.has(e.title.toLowerCase())) {
              seenTitles.add(e.title.toLowerCase());
              e.metadata.discoveryMethod = 'embedded_state';
              entities.push(e);
            }
          }
        }
      }
    } catch {}
  }

  // 3. Automotive Dealership Specific State Objects & Redux / Apollo Preloaded state
  const statePatterns = [
    /window\.__vdpJSON\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /window\.vdpJSON\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /window\.vehicleData\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/i,
    /window\.inventoryData\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/i,
    /window\.digitalData\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /window\.dealerInspireInventory\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/i,
    /window\.__DEALERON_INVENTORY__\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/i,
    /window\.vehicles\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/i,
    /window\.inventory\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*;/i,
    /window\.DDC\s*=\s*window\.DDC\s*\|\|\s*\{\};\s*window\.DDC\.dataLayer\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i,
    /window\.__APP_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/i,
  ];

  for (const pat of statePatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      try {
        const stateObj = JSON.parse(m[1]);
        const items = Array.isArray(stateObj)
          ? stateObj
          : isInventoryShapedObject(stateObj)
          ? [stateObj]
          : findDomainArrays(stateObj).flat();
        for (const item of items) {
          if (isInventoryShapedObject(item)) {
            const e = mapInventoryObjectToEntity(item, pageUrl, 'embedded_state');
            if (e && e.title && !seenTitles.has(e.title.toLowerCase())) {
              seenTitles.add(e.title.toLowerCase());
              e.metadata.discoveryMethod = 'embedded_state';
              entities.push(e);
            }
          }
        }
      } catch {}
    }
  }

  // 4. Generic <script type="application/json"> blocks
  const jsonScriptRegex = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsMatch;
  while ((jsMatch = jsonScriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsMatch[1]);
      const arrays = Array.isArray(parsed) ? [parsed] : findDomainArrays(parsed);
      for (const arr of arrays) {
        for (const item of arr) {
          if (isInventoryShapedObject(item)) {
            const e = mapInventoryObjectToEntity(item, pageUrl, 'application/json');
            if (e && e.title && !seenTitles.has(e.title.toLowerCase())) {
              seenTitles.add(e.title.toLowerCase());
              e.metadata.discoveryMethod = 'embedded_state';
              entities.push(e);
            }
          }
        }
      }
    } catch {}
  }

  return entities;
}

function findDomainArrays(obj: any, depth = 0): any[][] {
  if (depth > 5 || typeof obj !== 'object' || obj === null) return [];
  const results: any[][] = [];
  const domainKeys = [
    'products', 'items', 'listings', 'vehicles', 'vehiclesList', 'vehicleList',
    'inventory', 'allVehicles', 'usedVehicles', 'newVehicles', 'vdp', 'cars',
    'trucks', 'searchResults', 'inventoryItems', 'services', 'gigs',
    'courses', 'allCourses', 'freelancers', 'doctors', 'properties',
    'results', 'records', 'data', 'hits', 'nodes'
  ];

  for (const k of domainKeys) {
    if (Array.isArray(obj[k]) && obj[k].length > 0 && typeof obj[k][0] === 'object') {
      results.push(obj[k]);
    }
  }

  for (const v of Object.values(obj)) {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      results.push(...findDomainArrays(v, depth + 1));
    }
  }
  return results;
}

// ─── DOM Semantic Card Extractor (Tier 4) ────────────────────────────────────

/**
 * Extracts structured cards from rendered DOM HTML:
 * Handles semantic articles, product cards, automotive vehicle cards, course cards, freelancer cards, property cards.
 * Enforces strict anti-hallucination validation: requires real title + (price OR image OR description OR valid link).
 */
export function extractDomSemanticCards(html: string, pageUrl: string): CrawledEntity[] {
  const entities: CrawledEntity[] = [];
  const seenTitles = new Set<string>();
  let origin = '';
  try { origin = new URL(pageUrl).origin; } catch {}

  // Match article, li, or div card containers
  const cardRegex = /<(?:article|div|li)[^>]*(?:class|id|data-type|data-vehicle)=["'][^"']*(?:card|item|gig|course|product|listing|service|box|profile|vehicle|inventory|srp-vehicle|vdp)[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|div|li)>/gi;
  let m;

  while ((m = cardRegex.exec(html)) !== null && entities.length < 50) {
    const cardHtml = m[1];
    if (cardHtml.length < 50 || cardHtml.length > 8000) continue;

    // 1. Extract title from heading or title class
    const titleMatch = cardHtml.match(/<(?:h1|h2|h3|h4|h5|span|div|a)[^>]*(?:class=["'][^"']*(?:title|name|heading|vehicle-title)[^"']*["'])[^>]*>([^<]+)<\/(?:h1|h2|h3|h4|h5|span|div|a)>/i) ||
      cardHtml.match(/<h[2-4][^>]*>([^<]+)<\/h[2-4]>/i);
    const title = decodeHtmlEntities(titleMatch?.[1]?.trim() || '');
    if (!title || title.length < 3 || title.length > 120) continue;

    const lowerTitle = title.toLowerCase();
    const uiNoise = ['button', 'dialog', 'modal', 'card', 'loading', 'default', 'root', 'page', 'home', 'courses', 'about', 'faq', 'contact', 'services', 'freelancers'];
    if (uiNoise.includes(lowerTitle) || seenTitles.has(lowerTitle)) continue;

    // 2. Extract price
    const priceMatch = cardHtml.match(/(?:[$€£₹]\s*\d+(?:[\d,.]*\d+)?|\b\d+(?:[\d,.]*\d+)?\s*(?:USD|EUR|GBP|CAD)\b)/i) ||
      cardHtml.match(/class=["'][^"']*(?:price|cost|rate|fee|amount|selling-price|retail-price|msrp)[^"']*["'][^>]*>([^<]+)</i);
    const price = priceMatch ? priceMatch[0].replace(/class=["'][^"']*["'][^>]*>/, '').trim() : undefined;

    // 3. Extract image (src, data-src, srcset)
    const imgMatch = cardHtml.match(/<img[^>]*(?:src|data-src|data-lazy|data-original)=["']([^"']+)["'][^>]*>/i);
    const imgSrc = imgMatch?.[1]?.trim();
    const images: string[] = [];
    if (imgSrc && !imgSrc.includes('data:image') && !imgSrc.includes('placeholder') && !imgSrc.includes('favicon')) {
      try {
        images.push(new URL(imgSrc, origin).href);
      } catch {
        if (imgSrc.startsWith('http')) images.push(imgSrc);
      }
    }

    // 4. Extract link
    const linkMatch = cardHtml.match(/<a[^>]*href=["']([^"'#][^"']*)["']/i);
    let itemUrl = pageUrl;
    if (linkMatch?.[1]) {
      try {
        const resolved = new URL(linkMatch[1].trim(), origin).href;
        if (resolved.startsWith(origin)) itemUrl = resolved;
      } catch {}
    }

    // 5. Extract description & specifications
    const descMatch = cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch ? decodeHtmlEntities(stripTags(descMatch[1]).trim()) : undefined;

    // 6. Automotive Specific Extractions (VIN, Stock#, Mileage, Drivetrain, Fuel, Condition)
    const vinMatch = cardHtml.match(/\b(?:data-vin=["']|VIN:?\s*)([A-HJ-NPR-Z0-9]{17})\b/i);
    const vin = vinMatch ? vinMatch[1].toUpperCase() : undefined;

    const stockMatch = cardHtml.match(/\b(?:data-stock=["']|Stock\s*(?:#|No|Number)?:\s*)([A-Za-z0-9-_]+)\b/i);
    const stockNumber = stockMatch ? stockMatch[1].trim() : undefined;

    const mileageMatch = cardHtml.match(/\b(?:data-mileage=["'](\d+)|(\d{1,3}(?:,\d{3})*)\s*(?:miles|mi|km|odometer))\b/i);
    const mileageStr = mileageMatch ? (mileageMatch[1] || mileageMatch[2])?.replace(/,/g, '') : undefined;
    const mileage = mileageStr ? parseInt(mileageStr, 10) : undefined;

    const isVehicle = Boolean(
      vin ||
      stockNumber ||
      mileage !== undefined ||
      /wrangler|cherokee|ram\s*1500|f-150|silverado|camry|corolla|rav4|tahoe|explorer|civic|accord|vehicle|truck|suv|sedan/i.test(title) ||
      pageUrl.includes('/new-vehicles') ||
      pageUrl.includes('/used-vehicles') ||
      pageUrl.includes('/inventory')
    );

    const conditionRaw = `${cardHtml} ${title} ${pageUrl} ${itemUrl}`.toLowerCase();
    const condition = conditionRaw.includes('cpo') || conditionRaw.includes('certified')
      ? 'cpo'
      : conditionRaw.includes('new-vehicles') || conditionRaw.includes('/new-inventory') || /\bnew\b/i.test(conditionRaw)
      ? 'new'
      : 'used';

    // Anti-hallucination: require at least price OR image OR description OR different detail URL OR VIN
    if (!price && images.length === 0 && !description && !vin && itemUrl === pageUrl) {
      continue;
    }

    seenTitles.add(lowerTitle);

    let content = title;
    if (description) content += `\n\n${description}`;
    if (price) content += `\n\nPrice / Rate: ${price}`;
    if (vin) content += `\nVIN: ${vin}`;
    if (stockNumber) content += `\nStock #: ${stockNumber}`;
    if (mileage) content += `\nMileage: ${mileage.toLocaleString()} mi`;

    const metadata: Record<string, any> = {
      discoveryMethod: 'dom',
      ...(description ? { description } : {}),
      ...(price ? { price } : {}),
      ...(images.length > 0 ? { images, image: images[0] } : {}),
      ...(vin ? { vin } : {}),
      ...(stockNumber ? { stockNumber, stock_number: stockNumber } : {}),
      ...(mileage !== undefined ? { mileage } : {}),
      ...(isVehicle ? { condition, entity_type: 'vehicle' } : {}),
      ...(itemUrl !== pageUrl ? { vdpUrl: itemUrl } : {}),
    };

    entities.push({
      url: itemUrl,
      title,
      content,
      dataType: isVehicle || price ? 'product' : 'service',
      imageUrls: images,
      metadata,
    });
  }

  return entities;
}

// ─── Meta-tag & SPA page extractor ──────────────────────────────────────────

const spaScriptCache = new Map<string, string>();

export async function extractSpaChunkEntities(html: string, pageUrl: string): Promise<CrawledEntity[]> {
  try {
    const base = new URL(pageUrl);
    const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    const scriptUrls: string[] = [];
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const src = match[1];
      if (
        src.includes('chunk') ||
        src.includes('page') ||
        src.includes('index') ||
        src.includes('app') ||
        src.includes('main') ||
        src.includes('assets/') ||
        src.includes('static/')
      ) {
        try {
          const fullUrl = new URL(src, base.origin).href;
          if (!scriptUrls.includes(fullUrl)) {
            scriptUrls.push(fullUrl);
          }
        } catch {}
      }
    }

    if (scriptUrls.length === 0) return [];

    const entities: CrawledEntity[] = [];
    const seenTitles = new Set<string>();

    for (const scriptUrl of scriptUrls.slice(0, 10)) {
      try {
        let code = spaScriptCache.get(scriptUrl);
        if (!code) {
          const res = await fetch(scriptUrl, {
            signal: AbortSignal.timeout(2000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            },
          });
          if (!res.ok) continue;
          code = await res.text();
          spaScriptCache.set(scriptUrl, code);
        }

        // 1. Array of objects pattern: [{id:"...",title:"...",...},...]
        const arrayMatches = code.match(/\[\s*\{[^{}]*?(?:title|name|fullName|courseName|gigTitle|productName)\s*:\s*["'][^"']+["'][\s\S]*?\}\s*\]/g) || [];
        for (const arrStr of arrayMatches) {
          const objRegex = /\{[^{}]*?(?:title|name|fullName|courseName|gigTitle|productName)\s*:\s*["']([^"']{3,100})["'][^{}]*?\}/g;
          let objMatch;
          while ((objMatch = objRegex.exec(arrStr)) !== null) {
            parseAndPushEntity(objMatch[0], pageUrl, entities, seenTitles);
          }
        }

        // 2. Individual object literal pattern: {id:"...",title:"...",description:"...",price:"..."}
        const singleObjRegex = /\{[^{}]*?(?:title|name|fullName|courseName|gigTitle|productName)\s*:\s*["']([^"']{3,100})["'][^{}]*?\}/g;
        let singleMatch;
        while ((singleMatch = singleObjRegex.exec(code)) !== null) {
          parseAndPushEntity(singleMatch[0], pageUrl, entities, seenTitles);
        }
      } catch (err) {
        console.warn(`[extractor] Error fetching script chunk ${scriptUrl}:`, err);
      }
    }

    return entities;
  } catch (err) {
    console.warn('[extractor] SPA chunk extraction failed:', err);
    return [];
  }
}

function parseAndPushEntity(
  objStr: string,
  pageUrl: string,
  entities: CrawledEntity[],
  seenTitles: Set<string>
) {
  const extractField = (key: string) => {
    const m = objStr.match(new RegExp(`(?:^|[{,\\s])(?:${key})\\s*:\\s*(?:"([^"]*)"|'([^']*)'|(\\d+(?:\\.\\d+)?)|true|false)`, 'i'));
    return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  };

  const title = extractField('title') || extractField('name') || extractField('fullName') || extractField('courseName') || extractField('gigTitle');
  if (!title) return;

  const cleanTitle = title.trim();
  const lowerTitle = cleanTitle.toLowerCase();

  // Filter out framework/UI noise
  if (
    cleanTitle.length < 3 ||
    seenTitles.has(lowerTitle) ||
    ['button', 'dialog', 'modal', 'card', 'loading', 'default', 'root', 'page', 'home', 'courses', 'about', 'faq', 'contact', 'terms of service', 'privacy policy'].includes(lowerTitle) ||
    lowerTitle.startsWith('animate-') ||
    lowerTitle.startsWith('w-') ||
    lowerTitle.startsWith('h-') ||
    lowerTitle.startsWith('text-')
  ) {
    return;
  }

  const description = extractField('description') || extractField('desc') || extractField('summary') || extractField('short_description') || extractField('details') || extractField('bio') || '';
  const price = extractField('price') || extractField('cost') || extractField('amount') || extractField('rate');
  const image = extractField('image') || extractField('imageUrl') || extractField('img') || extractField('photo') || extractField('thumbnail') || extractField('profilePicture');
  const rating = extractField('rating') || extractField('stars');
  const level = extractField('level') || extractField('difficulty') || extractField('category') || extractField('department');
  const reviews = extractField('reviews') || extractField('reviewCount') || extractField('totalReviews');

  // Require at least description, price, level, image, or rating to be a valid catalog item
  if (!description && !price && !level && !image && !rating) {
    return;
  }

  seenTitles.add(lowerTitle);

  let formattedContent = `${cleanTitle}`;
  if (description) formattedContent += `\n\n${description}`;
  if (price) formattedContent += `\n\nPrice / Rate: ${price}`;
  if (level) formattedContent += `\nLevel: ${level}`;
  if (rating) formattedContent += `\nRating: ${rating}★${reviews ? ` (${reviews} reviews)` : ''}`;

  const metadata: Record<string, any> = {
    discoveryMethod: 'spa_chunk',
    source: 'spa_chunk_extract',
    description: description || cleanTitle,
    ...(price ? { price } : {}),
    ...(level ? { level, category: level } : {}),
    ...(rating ? { rating: Number(rating) } : {}),
    ...(reviews ? { reviewCount: Number(reviews) } : {}),
    ...(image ? { image, images: [image] } : {}),
  };

  entities.push({
    url: pageUrl,
    title: cleanTitle,
    content: formattedContent,
    dataType: price || level ? 'service' : 'text',
    metadata,
  });
}

/**
 * Dedicated high-precision automotive Vehicle Detail Page (VDP) extractor.
 * Parses specification tables, key-value grids, and DOM blocks for:
 * Make, Model, Trim Level, Category, Exterior Colour, Interior Colour,
 * Kilometers/Mileage, Stock #, VIN, Drive train, Transmission, Towing capacity,
 * Price, Fuel efficiency (City & Highway), Engine, Doors, and Passengers.
 */
export function extractAutomotiveVdpDetails(html: string, pageUrl: string): CrawledEntity | null {
  const isVdpUrl = /\/(?:used|new|cpo|certified|inventory|vehicles?)\/[^/]+-id\d+\.html|\/inventory\/(?:used|new|cpo)\/[^/]+|\/vehicle\/\d+/i.test(pageUrl);
  
  // Check if page contains automotive specifications
  const hasAutoSignals = /\b(?:VIN:?|Stock\s*#:?|Kilometers?:?|Drivetrain:?|Drive\s*train:?|Transmission:?|Towing\s*capacity|Exterior\s*Colou?r:?)\b/i.test(html);
  if (!isVdpUrl && !hasAutoSignals) return null;

  let origin = '';
  try { origin = new URL(pageUrl).origin; } catch {}

  // 1. Clean HTML text pairs extraction
  const specPairs: Record<string, string> = {};
  
  const pairRegexes = [
    /<(?:div|li|tr|p)[^>]*>\s*<(?:span|strong|b|th|dt)[^>]*>([^<:]+)[:\s]*<\/(?:span|strong|b|th|dt)>\s*<(?:span|div|td|dd|p)[^>]*>([^<]+)<\/(?:span|div|td|dd|p)>/gi,
    /<(?:dt|th|span|strong|b)[^>]*>([^<:]+)[:\s]*<\/(?:dt|th|span|strong|b)>\s*<(?:dd|td|span)[^>]*>([^<]+)<\/(?:dd|td|span)>/gi,
    /\b([A-Za-z\s/]{3,30})[:\s]+([A-Za-z0-9,.\s/-]{1,60})(?:<|$|\n)/gi
  ];

  for (const regex of pairRegexes) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const key = match[1].trim().toLowerCase().replace(/[:\s]+/g, ' ');
      const val = decodeHtmlEntities(stripTags(match[2])).trim();
      if (val && !specPairs[key]) {
        specPairs[key] = val;
      }
    }
  }

  // 2. Direct regex extractions on HTML & plain text
  const extractSpec = (patterns: RegExp[]): string | undefined => {
    for (const pat of patterns) {
      const m = html.match(pat);
      if (m?.[1]) return decodeHtmlEntities(stripTags(m[1])).trim();
    }
    return undefined;
  };

  const vin = extractSpec([
    /\b(?:data-vin=["']|VIN:?\s*|Vehicle\s*Identification\s*Number:?\s*)([A-HJ-NPR-Z0-9]{17})\b/i,
    /["']vin["']\s*:\s*["']([A-HJ-NPR-Z0-9]{17})["']/i,
  ]) || specPairs['vin'];

  const stockNumber = extractSpec([
    /\b(?:data-stock=["']|Stock\s*(?:#|No|Number)?:\s*)([A-Za-z0-9-_]+)\b/i,
    /["']stockNumber["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['stock #'] || specPairs['stock number'] || specPairs['stock no'] || specPairs['stock'];

  const mileageRaw = extractSpec([
    /\b(?:data-mileage=["'](\d+)|Kilometers?:\s*([0-9,]+)\s*(?:km)?|Kilometres?:\s*([0-9,]+)\s*(?:km)?|Odometer:\s*([0-9,]+)\s*(?:km|mi)?|Mileage:\s*([0-9,]+)\s*(?:miles|mi|km)?)\b/i,
    /["']mileage["']\s*:\s*["']?(\d+)["']?/i,
  ]) || specPairs['kilometers'] || specPairs['kilometres'] || specPairs['mileage'] || specPairs['odometer'];

  const mileageStr = mileageRaw ? mileageRaw.replace(/[^0-9]/g, '') : undefined;
  const mileage = mileageStr ? parseInt(mileageStr, 10) : undefined;

  const model = extractSpec([
    /\bModel:\s*([A-Za-z0-9\s/-]+?)(?:<|\n|$)/i,
    /["']model["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['model'];

  const trim = extractSpec([
    /\bTrim(?:\s*Level)?:\s*([A-Za-z0-9\s/-]+?)(?:<|\n|$)/i,
    /["']trim["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['trim level'] || specPairs['trim'];

  const categoryRaw = extractSpec([
    /\bCategory:\s*([A-Za-z0-9\s/]+?)(?:<|\n|$)/i,
    /\bBody(?:\s*Style)?:\s*([A-Za-z0-9\s/]+?)(?:<|\n|$)/i,
  ]) || specPairs['category'] || specPairs['body style'] || specPairs['body'];

  const exteriorColor = extractSpec([
    /\b(?:Exterior\s*Colou?r|Couleur\s*extérieure|Paint):\s*([A-Za-z0-9\s/.-]+?)(?:<|\n|$)/i,
    /["']exteriorColor["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['exterior colour'] || specPairs['exterior color'] || specPairs['couleur extérieure'] || specPairs['paint'] || specPairs['colour'] || specPairs['color'];

  const interiorColor = extractSpec([
    /\b(?:Interior\s*Colou?r|Couleur\s*intérieure|Upholstery|Interior|Cabin|Seating):\s*([A-Za-z0-9\s/.,+-]+?)(?:<|\n|$)/i,
    /["']interiorColor["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['interior colour'] || specPairs['interior color'] || specPairs['upholstery'] || specPairs['interior'] || specPairs['couleur intérieure'] || specPairs['seating'] || specPairs['cabin'];

  const drivetrain = extractSpec([
    /\bDrive\s*train:\s*([A-Za-z0-9\s/.-]+?)(?:<|\n|$)/i,
    /\bDrivetrain:\s*([A-Za-z0-9\s/.-]+?)(?:<|\n|$)/i,
    /["']drivetrain["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['drive train'] || specPairs['drivetrain'] || specPairs['rouage'];

  const transmission = extractSpec([
    /\bTransmission:\s*([A-Za-z0-9\s/.-]+?)(?:<|\n|$)/i,
    /["']transmission["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['transmission'];

  const engine = extractSpec([
    /\b(?:Engine|Moteur):\s*([A-Za-z0-9\s/.,()+-]+?)(?:<|\n|$)/i,
    /["']engine["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['engine'] || specPairs['moteur'] || specPairs['motor'];

  const fuel = extractSpec([
    /\b(?:Fuel(?:\s*Type)?|Carburant):\s*([A-Za-z0-9\s/.-]+?)(?:<|\n|$)/i,
    /["']fuelType["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['fuel type'] || specPairs['fuel'] || specPairs['carburant'];

  const passengersRaw = extractSpec([
    /\b(?:Passengers?|Seating(?:\s*capacity)?|Places?):\s*(\d+)/i,
    /["']seatingCapacity["']\s*:\s*["']?(\d+)["']?/i,
  ]) || specPairs['passengers'] || specPairs['seating capacity'] || specPairs['seating'] || specPairs['places'];

  const doorsRaw = extractSpec([
    /\b(?:Doors?|Portes?):\s*(\d+)/i,
    /["']numberOfDoors["']\s*:\s*["']?(\d+)["']?/i,
  ]) || specPairs['doors'] || specPairs['portes'];

  const towingRaw = extractSpec([
    /\b(?:Towing\s*capacity(?:\s*up\s*to)?|Capacité\s*de\s*remorquage(?:\s*jusqu'à)?):\s*([0-9,]+\s*(?:kg|lbs|pounds)?)(?:<|\n|$)/i,
    /["']towingCapacity["']\s*:\s*["']([^"']+)["']/i,
  ]) || specPairs['towing capacity up to'] || specPairs['towing capacity'] || specPairs['capacité de remorquage jusqu\'à'] || specPairs['capacité de remorquage'] || specPairs['towing'];

  const cityFuelRaw = extractSpec([
    /\bCity(?:\s*fuel)?:\s*([0-9.]+)\s*(?:l\/100km|le\/100km|mpg)?/i,
    /\bFuel\s*efficiency\s*:\s*City\s*([0-9.]+)/i,
  ]) || (specPairs['city'] && /\d/.test(specPairs['city']) ? specPairs['city'] : undefined)
     || (specPairs['city fuel'] && /\d/.test(specPairs['city fuel']) ? specPairs['city fuel'] : undefined)
     || (specPairs['city fuel efficiency'] && /\d/.test(specPairs['city fuel efficiency']) ? specPairs['city fuel efficiency'] : undefined);

  const highwayFuelRaw = extractSpec([
    /\bHighway(?:\s*fuel)?:\s*([0-9.]+)\s*(?:l\/100km|le\/100km|mpg)?/i,
    /\bFuel\s*efficiency\s*:\s*.*?Highway\s*([0-9.]+)/i,
  ]) || (specPairs['highway'] && /\d/.test(specPairs['highway']) ? specPairs['highway'] : undefined)
     || (specPairs['highway fuel'] && /\d/.test(specPairs['highway fuel']) ? specPairs['highway fuel'] : undefined)
     || (specPairs['highway fuel efficiency'] && /\d/.test(specPairs['highway fuel efficiency']) ? specPairs['highway fuel efficiency'] : undefined);

  const msrpRaw = extractSpec([
    /\b(?:MSRP|Retail\s*Price|Original\s*Price|Regular\s*Price|Prix\s*de\s*détail):\s*([$€£₹]?\s*[0-9,]+(?:\.[0-9]{2})?)/i,
    /<span[^>]*class=["'][^"']*(?:msrp|original-price|regular-price)[^"']*["'][^>]*>\s*([$€£₹]?\s*[0-9,]+)/i,
    /["']msrp["']\s*:\s*["']?([0-9,]+(?:\.[0-9]{2})?)["']?/i,
  ]) || specPairs['msrp'] || specPairs['retail price'] || specPairs['regular price'] || specPairs['prix de détail'];

  const priceRaw = extractSpec([
    /\b(?:Selling\s*Price|Sale\s*Price|Cash\s*Price|Our\s*Price|Prix\s*de\s*vente):\s*([$€£₹]?\s*[0-9,]+(?:\.[0-9]{2})?)/i,
    /\bPrice:\s*([$€£₹]?\s*[0-9,]+(?:\.[0-9]{2})?)/i,
    /<span[^>]*class=["'][^"']*(?:selling-price|sale-price|price-value|dealer-price)[^"']*["'][^>]*>\s*([$€£₹]?\s*[0-9,]+)/i,
    /["']sellingPrice["']\s*:\s*["']?([0-9,]+(?:\.[0-9]{2})?)["']?/i,
    /["']price["']\s*:\s*["']?([0-9,]+(?:\.[0-9]{2})?)["']?/i,
  ]) || specPairs['selling price'] || specPairs['price'] || specPairs['sale price'] || specPairs['cash price'] || specPairs['prix de vente'];

  // Title extraction
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    html.match(/<title>([^<|—]+)/i);
  const title = titleMatch ? decodeHtmlEntities(stripTags(titleMatch[1])).trim() : '';

  // Images gallery extraction
  const imageRegex = /<img[^>]*(?:src|data-src|data-lazy|data-highres|data-large)=["']([^"']+)["'][^>]*>/gi;
  const rawImages: string[] = [];
  let imgM;
  while ((imgM = imageRegex.exec(html)) !== null) {
    const src = imgM[1].trim();
    if (!src.includes('data:image') && !src.includes('placeholder') && !src.includes('icon') && !src.includes('logo')) {
      try {
        rawImages.push(new URL(src, origin).href);
      } catch {
        if (src.startsWith('http')) rawImages.push(src);
      }
    }
  }

  const cleanImages = Array.from(new Set(rawImages.filter((u) => typeof u === 'string' && u.startsWith('http')).map((u) => {
    try {
      return encodeURI(decodeURI(u.trim()));
    } catch {
      return u.trim().replace(/\s+/g, '%20');
    }
  })));

  // If no title, vin, and price, not a valid VDP
  if (!title && !vin && !stockNumber) return null;

  const conditionStr = `${pageUrl} ${title} ${html}`.toLowerCase();
  const condition = conditionStr.includes('cpo') || conditionStr.includes('certified')
    ? 'cpo'
    : conditionStr.includes('/new-vehicles') || conditionStr.includes('/new-inventory') || /\bnew\b/i.test(conditionStr)
    ? 'new'
    : 'used';

  const yearMatch = (title || pageUrl).match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

  const makes = ['Ford', 'Jeep', 'Ram', 'Dodge', 'Chrysler', 'BMW', 'Mercedes-Benz', 'Audi', 'Toyota', 'Honda', 'Hyundai', 'Kia', 'Nissan', 'Chevrolet', 'GMC', 'Cadillac', 'Buick', 'Volkswagen', 'Subaru', 'Mazda', 'Lexus', 'Acura', 'Infiniti', 'Volvo', 'Lincoln', 'Genesis', 'Porsche', 'Land Rover', 'Jaguar', 'Fiat', 'Alfa Romeo', 'Tesla'];
  let make: string | undefined;
  const titleAndUrl = `${title} ${pageUrl}`;
  for (const m of makes) {
    if (new RegExp(`\\b${m}\\b`, 'i').test(titleAndUrl)) {
      make = m;
      break;
    }
  }

  let content = title || `${year || ''} ${make || ''} ${model || 'Vehicle'}`.trim();
  if (priceRaw) content += `\nPrice: ${priceRaw}`;
  if (msrpRaw) content += `\nMSRP: ${msrpRaw}`;
  if (vin) content += `\nVIN: ${vin}`;
  if (stockNumber) content += `\nStock #: ${stockNumber}`;
  if (mileage) content += `\nKilometers: ${mileage.toLocaleString()} km`;
  if (categoryRaw) content += `\nCategory: ${categoryRaw}`;
  if (exteriorColor) content += `\nExterior Colour: ${exteriorColor}`;
  if (interiorColor) content += `\nInterior Colour: ${interiorColor}`;
  if (drivetrain) content += `\nDrive train: ${drivetrain}`;
  if (transmission) content += `\nTransmission: ${transmission}`;
  if (engine) content += `\nEngine: ${engine}`;
  if (fuel) content += `\nFuel: ${fuel}`;
  if (towingRaw) content += `\nTowing capacity up to: ${towingRaw}`;
  if (cityFuelRaw || highwayFuelRaw) content += `\nFuel efficiency: City ${cityFuelRaw || ''} / Highway ${highwayFuelRaw || ''}`;

  return {
    url: pageUrl,
    title: title || `${year || ''} ${make || ''} ${model || 'Vehicle'}`.trim(),
    content,
    dataType: 'product',
    imageUrls: cleanImages,
    metadata: {
      discoveryMethod: 'vdp_spec_extractor',
      entity_type: 'vehicle',
      condition,
      year,
      make,
      model,
      trim,
      vin,
      stockNumber,
      stock_number: stockNumber,
      mileage,
      category: categoryRaw,
      bodyStyle: categoryRaw,
      exteriorColor,
      interiorColor,
      drivetrain,
      transmission,
      engine,
      fuel,
      passengers: passengersRaw ? parseInt(passengersRaw, 10) : undefined,
      doors: doorsRaw ? parseInt(doorsRaw, 10) : undefined,
      towingCapacity: towingRaw,
      towing_capacity: towingRaw,
      cityFuelEfficiency: cityFuelRaw ? parseFloat(cityFuelRaw) : undefined,
      highwayFuelEfficiency: highwayFuelRaw ? parseFloat(highwayFuelRaw) : undefined,
      fuelEfficiencyUnit: pageUrl.includes('.ca') ? 'L/100km' : 'MPG',
      price: priceRaw ? parseFloat(priceRaw.replace(/[^0-9.]/g, '')) : undefined,
      msrp: msrpRaw ? parseFloat(msrpRaw.replace(/[^0-9.]/g, '')) : undefined,
      images: cleanImages,
      vdpUrl: pageUrl,
    }
  };
}

/**
 * Universal 5-tier page entity extractor with intelligent merging and provenance tracking.
 */
export async function extractPageEntities(html: string, pageUrl: string): Promise<CrawledEntity[]> {
  const allDiscovered: CrawledEntity[] = [];

  // Tier 0: Dedicated Automotive VDP Specification Extractor
  const vdpEntity = extractAutomotiveVdpDetails(html, pageUrl);
  if (vdpEntity) {
    allDiscovered.push(vdpEntity);
  }

  // Tier 1: JSON-LD / Schema.org (Highest structural fidelity)
  const jsonLd = extractJsonLd(html);
  if (jsonLd.length > 0) {
    const jsonLdEntities = mapJsonLdToEntities(jsonLd, pageUrl);
    allDiscovered.push(...jsonLdEntities);
  }

  // Tier 2: Embedded application state (__NEXT_DATA__, RSC self.__next_f, Redux, Apollo)
  const appStateEntities = extractEmbeddedAppState(html, pageUrl);
  allDiscovered.push(...appStateEntities);

  // Tier 3: Dynamic AJAX / Public API discovery
  const apiEntities = await discoverAndFetchPageApis(html, pageUrl);
  allDiscovered.push(...apiEntities);

  // Tier 4: Client-rendered SPA JS chunk extraction
  const spaEntities = await extractSpaChunkEntities(html, pageUrl);
  allDiscovered.push(...spaEntities);

  // Tier 5: DOM Semantic Cards (articles, cards, grids, items)
  const domCards = extractDomSemanticCards(html, pageUrl);
  allDiscovered.push(...domCards);

  // Intelligent Deduplication & Precedence Merging
  // Priority: vdp_spec_extractor (0) > json-ld (1) > embedded_state (2) > api (3) > spa_chunk (4) > dom (5)
  const priorityMap: Record<string, number> = {
    'vdp_spec_extractor': 0,
    'json-ld': 1,
    'embedded_state': 2,
    'api': 3,
    'spa_chunk': 4,
    'dom': 5,
    'html_fallback': 6,
  };

  const entityMap = new Map<string, CrawledEntity>();

  for (const entity of allDiscovered) {
    if (!entity.title) continue;
    const key = entity.title.trim().toLowerCase();
    const existing = entityMap.get(key);

    if (!existing) {
      entityMap.set(key, entity);
    } else {
      const existingPrio = priorityMap[existing.metadata?.discoveryMethod as string] ?? 99;
      const newPrio = priorityMap[entity.metadata?.discoveryMethod as string] ?? 99;

      if (newPrio < existingPrio) {
        // Replace with higher-fidelity entity, but merge any extra images/metadata
        const mergedImages = Array.from(new Set([...(entity.imageUrls || []), ...(existing.imageUrls || [])]));
        entity.imageUrls = mergedImages;
        entity.metadata = { ...existing.metadata, ...entity.metadata };
        entityMap.set(key, entity);
      } else {
        // Keep existing higher-fidelity entity, but merge any extra images/metadata
        const mergedImages = Array.from(new Set([...(existing.imageUrls || []), ...(entity.imageUrls || [])]));
        existing.imageUrls = mergedImages;
        existing.metadata = { ...entity.metadata, ...existing.metadata };
      }
    }
  }

  const structuredEntities = Array.from(entityMap.values());

  // Tier 6: Page-level Text Fallback
  // Always produce a page-level record for informational pages (About, Contact, FAQ, Policies)
  // or when zero structured items were extracted on the page.
  const lowerUrl = pageUrl.toLowerCase();
  const isInformational = /policy|terms|privacy|refund|cookie|compliance|legal|about|faq|contact|support/i.test(lowerUrl);

  if (structuredEntities.length === 0 || isInformational) {
    const h1 = extractTag(html, 'h1');
    const siteTitle = extractTag(html, 'title') ||
      extractMeta(html, 'og:title') ||
      extractMeta(html, 'twitter:title') || '';
    
    let title = h1 || siteTitle || new URL(pageUrl).pathname.replace(/^\/+/, '') || new URL(pageUrl).hostname;
    if (h1 && siteTitle && !h1.toLowerCase().includes(siteTitle.toLowerCase()) && !siteTitle.toLowerCase().includes(h1.toLowerCase())) {
      title = `${h1} — ${siteTitle}`;
    }

    const description = extractMeta(html, 'description') ||
      extractMeta(html, 'og:description') ||
      extractMeta(html, 'twitter:description') || '';
    const bodyText = extractAllText(html, 8000);
    let fullContent = [description, bodyText].filter(Boolean).join('\n\n').trim();

    // If structured entities exist on this catalog page, append a concise catalog summary
    if (structuredEntities.length > 0 && !isInformational) {
      const catalogSummary = structuredEntities.map(e => `• ${e.title}: ${e.metadata?.description || ''} ${e.metadata?.price ? `(${e.metadata.price})` : ''}`).join('\n');
      fullContent += `\n\nCatalog Items / Offerings:\n${catalogSummary}`;
    }

    const decodedContent = decodeHtmlEntities(fullContent.trim());
    if (title || decodedContent) {
      let dataType: CrawledEntity['dataType'] = 'text';

      if (/policy|terms|privacy|refund|cookie|compliance|legal|disclaimer/.test(lowerUrl)) {
        dataType = 'text';
      } else if (/faq|frequently-asked|questions|help/.test(lowerUrl)) {
        dataType = 'faq';
      } else if (/about|team|mission|contact|support/.test(lowerUrl)) {
        dataType = 'text';
      } else if (/pricing|price|tier|subscription/.test(lowerUrl)) {
        dataType = 'pricing';
      }

      const pageEntity: CrawledEntity = {
        url: pageUrl,
        title: decodeHtmlEntities(title.trim()),
        content: decodedContent || title,
        dataType,
        metadata: {
          discoveryMethod: 'html_fallback',
        },
      };
      if (description) pageEntity.metadata.description = decodeHtmlEntities(description);
      const images = extractImages(html, pageUrl);
      if (images.length) pageEntity.metadata.images = images;

      structuredEntities.push(pageEntity);
    }
  }

  return structuredEntities;
}


