import { CrawledEntity } from './types';
import { NetworkResponseLog } from '@/lib/crawl4ai/client';

// ── Tracking & Analytics Filter List ──────────────────────────────────────────

const TRACKING_PATTERNS = [
  'google-analytics',
  'analytics.google',
  'googletagmanager',
  '/gtag/',
  '/collect?',
  'sentry.io',
  'datadoghq',
  'mixpanel.com',
  'segment.io',
  'segment.com',
  'hotjar.com',
  'clarity.ms',
  'facebook.com/tr',
  'connect.facebook.net',
  'tiktok.com',
  'criteo.com',
  'doubleclick.net',
  '/telemetry',
  '/metrics',
  '/beacon',
  '/csp-report',
  '/ping',
  '/log',
  'fullstory.com',
  'intercom.io',
  'drift.com',
];

/**
 * Checks if a network request URL is a third-party tracking/analytics endpoint.
 */
export function isTrackingOrTelemetryUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return TRACKING_PATTERNS.some(pattern => lower.includes(pattern));
}

/**
 * Checks if a given object matches an inventory, catalog, or course item shape.
 */
function isInventoryShapedObject(item: any): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;

  const title =
    item.title ||
    item.name ||
    item.courseName ||
    item.course_name ||
    item.vehicleTitle ||
    item.productName ||
    item.product_name ||
    item.item_name ||
    item.listingTitle ||
    item.listing_title ||
    item.headline ||
    item.modelName ||
    item.model_name ||
    '';

  if (typeof title !== 'string' || title.trim().length < 2) return false;

  const lowerTitle = title.trim().toLowerCase();
  const uiNoise = ['button', 'close', 'submit', 'menu', 'nav', 'header', 'footer', 'modal', 'card', 'loading', 'default'];
  if (uiNoise.includes(lowerTitle)) return false;

  // Check for at least one inventory/catalog/course attribute
  const hasPrice = item.price !== undefined || item.cost !== undefined || item.msrp !== undefined || item.sellingPrice !== undefined || item.amount !== undefined || item.estimatedPrice !== undefined;
  const hasImage = !!(item.image || item.images || item.imageUrl || item.image_url || item.photos || item.thumbnail);
  const hasDesc = !!(item.description || item.desc || item.shortDescription || item.short_description || item.summary || item.details);
  const hasIdentifiers = !!(item.vin || item.sku || item.id || item._id || item.stockNumber || item.stock_number || item.modelCode);
  const hasSpecs = !!(item.mileage || item.year || item.make || item.model || item.specs || item.attributes || item.category || item.tags || item.level || item.benefits);

  return hasPrice || hasImage || hasDesc || hasIdentifiers || hasSpecs;
}

/**
 * Normalizes a raw image field into a clean string array.
 */
function extractImageUrls(raw: any, pageUrl: string): string[] {
  const images: string[] = [];
  const base = new URL(pageUrl);

  const add = (val: any) => {
    if (typeof val === 'string' && val.trim().length > 5) {
      try {
        const absolute = new URL(val.trim(), base.origin).href;
        if (!images.includes(absolute)) images.push(absolute);
      } catch {}
    } else if (val && typeof val === 'object') {
      if (typeof val.url === 'string') add(val.url);
      else if (typeof val.src === 'string') add(val.src);
      else if (typeof val.href === 'string') add(val.href);
      else if (typeof val.secure_url === 'string') add(val.secure_url);
    }
  };

  if (Array.isArray(raw)) {
    raw.forEach(add);
  } else {
    add(raw);
  }

  return images.filter(img => !img.includes('data:image') && !img.includes('placeholder'));
}

/**
 * Extracts and maps an inventory or course object into a structured CrawledEntity.
 */
function mapInventoryObjectToEntity(item: any, pageUrl: string, apiEndpoint: string): CrawledEntity | null {
  const title = (
    item.title ||
    item.name ||
    item.courseName ||
    item.course_name ||
    item.vehicleTitle ||
    item.productName ||
    item.product_name ||
    item.item_name ||
    item.listingTitle ||
    item.listing_title ||
    item.headline ||
    (item.year && item.make && item.model ? `${item.year} ${item.make} ${item.model}` : '') ||
    ''
  ).toString().trim();

  if (!title || title.length < 2) return null;

  const description = (
    item.description ||
    item.desc ||
    item.shortDescription ||
    item.short_description ||
    item.summary ||
    item.details ||
    ''
  ).toString().trim();

  const rawPrice = item.price ?? item.cost ?? item.msrp ?? item.sellingPrice ?? item.amount ?? item.estimatedPrice;
  let priceStr: string | undefined = undefined;
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
    priceStr = typeof rawPrice === 'number' ? `$${rawPrice.toLocaleString()}` : String(rawPrice).trim();
    if (/^\d+(\.\d+)?$/.test(priceStr)) priceStr = `$${priceStr}`;
  }

  const rawImages = item.images || item.image || item.imageUrl || item.image_url || item.photos || item.thumbnail?.url || item.thumbnail?.secure_url || item.thumbnail || item.photoList;
  const images = extractImageUrls(rawImages, pageUrl);

  const vin = item.vin || item.VIN;
  const sku = item.sku || item.SKU;
  const mileage = item.mileage || item.miles || item.odometer;
  const year = item.year;
  const make = item.make || item.brand;
  const model = item.model;
  const trim = item.trim;
  const category = item.category || item.department || item.type || item.tags;
  const level = item.level;
  const rating = item.rating || item.stars || item.averageRating;
  const reviews = item.reviews || item.reviewCount;
  const itemUrl = item.url || item.link || item.detailUrl || item.detail_url || item.href;

  let resolvedUrl = pageUrl;
  if (typeof itemUrl === 'string' && itemUrl.trim()) {
    try {
      resolvedUrl = new URL(itemUrl.trim(), new URL(pageUrl).origin).href;
    } catch {}
  }

  // Format rich multi-line content for agent retrieval
  const contentParts: string[] = [title];
  if (description) contentParts.push(description);
  if (priceStr) contentParts.push(`Price: ${priceStr}`);
  if (level) contentParts.push(`Level: ${level}`);
  if (category) contentParts.push(`Category / Tags: ${category}`);
  if (vin) contentParts.push(`VIN: ${vin}`);
  if (sku) contentParts.push(`SKU: ${sku}`);
  if (mileage) contentParts.push(`Mileage: ${typeof mileage === 'number' ? mileage.toLocaleString() : mileage} miles`);
  if (year || make || model) contentParts.push(`Specs: ${[year, make, model, trim].filter(Boolean).join(' ')}`);
  if (rating) contentParts.push(`Rating: ${rating}★${reviews ? ` (${reviews} reviews)` : ''}`);

  // Collect extra metadata properties
  const extraProps: Record<string, any> = {};
  const ignoredKeys = new Set([
    'title', 'name', 'courseName', 'course_name', 'vehicleTitle', 'productName', 'product_name', 'item_name',
    'description', 'desc', 'shortDescription', 'short_description', 'summary', 'details',
    'price', 'cost', 'msrp', 'sellingPrice', 'amount',
    'images', 'image', 'imageUrl', 'image_url', 'photos', 'thumbnail', 'photoList',
    'url', 'link', 'detailUrl', 'detail_url', 'href',
  ]);

  for (const [k, v] of Object.entries(item)) {
    if (!ignoredKeys.has(k) && v !== undefined && v !== null && v !== '' && typeof v !== 'function') {
      extraProps[k] = v;
    }
  }

  let dataType: CrawledEntity['dataType'] = 'product';
  const lowerTitle = title.toLowerCase();
  if (/service|repair|maintenance|inspection|oil change|consultation|lesson|course|mastery|bootcamp|academy/.test(lowerTitle)) {
    dataType = 'service';
  } else if (/pricing|plan|subscription|tier/.test(lowerTitle)) {
    dataType = 'pricing';
  }

  return {
    url: resolvedUrl,
    title,
    content: contentParts.join('\n\n'),
    dataType,
    imageUrls: images,
    metadata: {
      discoveryMethod: 'api',
      apiEndpoint,
      ...(priceStr ? { price: priceStr } : {}),
      ...(description ? { description } : {}),
      ...(images.length > 0 ? { images, image: images[0] } : {}),
      ...(level ? { level } : {}),
      ...(category ? { category: String(category) } : {}),
      ...(vin ? { vin } : {}),
      ...(sku ? { sku } : {}),
      ...(mileage ? { mileage } : {}),
      ...(rating ? { rating: Number(rating) } : {}),
      ...(reviews ? { reviews: Number(reviews) } : {}),
      ...extraProps,
    },
  };
}

/**
 * Extracts entities from raw HTTP network response logs captured during crawling.
 */
export function extractEntitiesFromNetworkResponses(
  networkResponses: NetworkResponseLog[],
  pageUrl: string,
  allowedOrigin?: string
): CrawledEntity[] {
  if (!Array.isArray(networkResponses) || networkResponses.length === 0) {
    return [];
  }

  const entities: CrawledEntity[] = [];
  const seenTitles = new Set<string>();

  for (const resp of networkResponses) {
    if (!resp || typeof resp !== 'object') continue;
    if (resp.status && (resp.status < 200 || resp.status >= 400)) continue;
    if (!resp.url) continue;

    // Discard tracking & analytics
    if (isTrackingOrTelemetryUrl(resp.url)) {
      continue;
    }

    // Parse body
    let json: any = resp.body;
    if (typeof json === 'string') {
      const trimmed = json.trim();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) continue;
      try {
        json = JSON.parse(trimmed);
      } catch {
        continue;
      }
    }

    if (!json || typeof json !== 'object') continue;

    // Find candidate inventory / course arrays
    const candidateArrays: any[][] = [];

    if (Array.isArray(json)) {
      candidateArrays.push(json);
    } else {
      // Check envelope properties
      const envelopeKeys = [
        'data', 'results', 'items', 'products', 'vehicles', 'inventory',
        'listings', 'records', 'courses', 'allCourses', 'hits', 'nodes', 'cars', 'properties',
      ];
      for (const key of envelopeKeys) {
        if (Array.isArray(json[key])) {
          candidateArrays.push(json[key]);
        }
      }
      // If single entity response (e.g. details endpoint)
      if (isInventoryShapedObject(json)) {
        candidateArrays.push([json]);
      }
    }

    // Extract entities from candidate arrays
    for (const arr of candidateArrays) {
      for (const rawItem of arr) {
        if (isInventoryShapedObject(rawItem)) {
          const entity = mapInventoryObjectToEntity(rawItem, pageUrl, resp.url);
          if (entity && entity.title) {
            const key = entity.title.toLowerCase();
            if (!seenTitles.has(key)) {
              seenTitles.add(key);
              entities.push(entity);
            }
          }
        }
      }
    }
  }

  return entities;
}

/**
 * Discovers and safely fetches candidate dynamic AJAX / API endpoints from page HTML
 * and JS script bundle chunks in native crawl mode.
 */
export async function discoverAndFetchPageApis(html: string, pageUrl: string): Promise<CrawledEntity[]> {
  if (!html || !pageUrl) return [];

  const base = new URL(pageUrl);
  const candidateApiUrls = new Set<string>();

  // 1. Detect dynamic API endpoints in inline scripts and HTML attributes
  const apiPatterns = [
    /["'](\/(?:api|en\/ajax|ajax|inventory\/api|search\/api|services\/api)[^"'\s<>]+)["']/gi,
    /(?:data-api|data-endpoint|data-inventory-url|data-url)=["']([^"'\s<>]+)["']/gi,
    /(?:fetch|\$\.ajax|\$\.getJSON|\$\.get|axios(?:\.get)?)\s*\(\s*["']([^"'\s<>]+)["']/gi,
  ];

  for (const regex of apiPatterns) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const endpoint = match[1];
      if (endpoint && !isTrackingOrTelemetryUrl(endpoint)) {
        try {
          const fullUrl = new URL(endpoint, base.origin).href;
          candidateApiUrls.add(fullUrl);
        } catch {}
      }
    }
  }

  // 2. Scan script bundle chunks for API bases and endpoints (e.g. Next.js / React / Redux / Render backend)
  const scriptRegex = /<script[^>]*src=["']([^"']+)["']/gi;
  const scriptUrls: string[] = [];
  let scriptMatch;
  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const src = scriptMatch[1];
    if (src.includes('chunk') || src.includes('main') || src.includes('app') || src.includes('page') || src.includes('index')) {
      try {
        const fullScriptUrl = new URL(src, base.origin).href;
        if (!scriptUrls.includes(fullScriptUrl)) scriptUrls.push(fullScriptUrl);
      } catch {}
    }
  }

  let discoveredApiBase = '';
  for (const sUrl of scriptUrls.slice(0, 10)) {
    try {
      const scriptRes = await fetch(sUrl, {
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!scriptRes.ok) continue;
      const code = await scriptRes.text();

      // Look for backend server URIs (Render, Railway, Heroku, Vercel, or standard /api/v1)
      const baseMatches = code.match(/https?:\/\/[a-zA-Z0-9.-]+\.(?:onrender\.com|railway\.app|herokuapp\.com|vercel\.app|fly\.dev)(?:\/api(?:\/v\d+)?)?/gi);
      if (baseMatches) {
        for (const bm of baseMatches) {
          if (!bm.includes('_next')) {
            discoveredApiBase = bm;
            break;
          }
        }
      }

      // Look for candidate endpoints like get-courses, get-products, etc.
      const epMatches = code.match(/(?:url\s*:\s*["']([^"']+)["']|["'](?:get-courses|get-all-courses|all-courses|courses|catalog|inventory|get-products)["'])/gi);
      if (epMatches) {
        for (const ep of epMatches) {
          const clean = ep.replace(/url\s*:\s*["']|["']/gi, '').trim();
          if (/courses|products|inventory|catalog|items|listings/i.test(clean)) {
            if (discoveredApiBase) {
              candidateApiUrls.add(`${discoveredApiBase.replace(/\/+$/, '')}/${clean.replace(/^\/+/, '')}`);
            }
            try {
              candidateApiUrls.add(new URL(`/api/${clean.replace(/^\/+/, '')}`, base.origin).href);
            } catch {}
          }
        }
      }
    } catch {}
  }

  if (candidateApiUrls.size === 0) return [];

  const responses: NetworkResponseLog[] = [];

  for (const apiUrl of Array.from(candidateApiUrls).slice(0, 10)) {
    try {
      let res = await fetch(apiUrl, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });

      // Retry once if 503 (e.g. Render/free-tier cold start)
      if (res.status === 503) {
        await new Promise(r => setTimeout(r, 2000));
        res = await fetch(apiUrl, {
          signal: AbortSignal.timeout(5000),
          headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
        });
      }

      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json') && !contentType.includes('javascript') && !contentType.includes('text')) continue;

      const bodyText = await res.text();
      try {
        const bodyJson = JSON.parse(bodyText);
        responses.push({
          url: apiUrl,
          status: res.status,
          contentType,
          body: bodyJson,
        });
      } catch {}
    } catch (fetchErr) {
      console.warn(`[networkExtractor] Failed to fetch candidate API ${apiUrl}:`, fetchErr);
    }
  }

  return extractEntitiesFromNetworkResponses(responses, pageUrl, base.origin);
}
