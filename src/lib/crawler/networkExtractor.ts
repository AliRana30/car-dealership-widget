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
 * Checks if a given object matches an inventory or catalog item shape.
 */
function isInventoryShapedObject(item: any): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;

  const title =
    item.title ||
    item.name ||
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

  // Check for at least one inventory/catalog attribute
  const hasPrice = item.price !== undefined || item.cost !== undefined || item.msrp !== undefined || item.sellingPrice !== undefined || item.amount !== undefined;
  const hasImage = !!(item.image || item.images || item.imageUrl || item.image_url || item.photos || item.thumbnail);
  const hasDesc = !!(item.description || item.desc || item.shortDescription || item.short_description || item.summary || item.details);
  const hasIdentifiers = !!(item.vin || item.sku || item.id || item.stockNumber || item.stock_number || item.modelCode);
  const hasSpecs = !!(item.mileage || item.year || item.make || item.model || item.specs || item.attributes || item.category);

  return hasPrice || hasImage || hasDesc || hasIdentifiers || hasSpecs;
}

/**
 * Normalizes an raw image field into a clean string array.
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
 * Extracts and maps an inventory-shaped object into a structured CrawledEntity.
 */
function mapInventoryObjectToEntity(item: any, pageUrl: string, apiEndpoint: string): CrawledEntity | null {
  const title = (
    item.title ||
    item.name ||
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

  const rawPrice = item.price ?? item.cost ?? item.msrp ?? item.sellingPrice ?? item.amount;
  let priceStr: string | undefined = undefined;
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
    priceStr = typeof rawPrice === 'number' ? `$${rawPrice.toLocaleString()}` : String(rawPrice).trim();
    if (/^\d+(\.\d+)?$/.test(priceStr)) priceStr = `$${priceStr}`;
  }

  const rawImages = item.images || item.image || item.imageUrl || item.image_url || item.photos || item.thumbnail || item.photoList;
  const images = extractImageUrls(rawImages, pageUrl);

  const vin = item.vin || item.VIN;
  const sku = item.sku || item.SKU;
  const mileage = item.mileage || item.miles || item.odometer;
  const year = item.year;
  const make = item.make || item.brand;
  const model = item.model;
  const trim = item.trim;
  const category = item.category || item.department || item.type;
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
  if (vin) contentParts.push(`VIN: ${vin}`);
  if (sku) contentParts.push(`SKU: ${sku}`);
  if (mileage) contentParts.push(`Mileage: ${typeof mileage === 'number' ? mileage.toLocaleString() : mileage} miles`);
  if (year || make || model) contentParts.push(`Specs: ${[year, make, model, trim].filter(Boolean).join(' ')}`);
  if (category) contentParts.push(`Category: ${category}`);
  if (rating) contentParts.push(`Rating: ${rating}★${reviews ? ` (${reviews} reviews)` : ''}`);

  // Collect extra metadata properties
  const extraProps: Record<string, any> = {};
  const ignoredKeys = new Set([
    'title', 'name', 'vehicleTitle', 'productName', 'product_name', 'item_name',
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
  if (/service|repair|maintenance|inspection|oil change|consultation|lesson|course/.test(lowerTitle)) {
    dataType = 'service';
  } else if (/pricing|plan|subscription|tier/.test(lowerTitle)) {
    dataType = 'pricing';
  }

  return {
    url: resolvedUrl,
    title,
    content: contentParts.join('\n\n'),
    dataType,
    metadata: {
      discoveryMethod: 'api',
      apiEndpoint,
      ...(priceStr ? { price: priceStr } : {}),
      ...(description ? { description } : {}),
      ...(images.length > 0 ? { images, image: images[0] } : {}),
      ...(vin ? { vin } : {}),
      ...(sku ? { sku } : {}),
      ...(mileage ? { mileage } : {}),
      ...(category ? { category } : {}),
      ...(rating ? { rating: Number(rating) } : {}),
      ...(reviews ? { reviews: Number(reviews) } : {}),
      ...extraProps,
    },
  };
}

/**
 * Parses captured network responses (XHR / fetch API calls) and extracts inventory entities.
 */
export function extractEntitiesFromNetworkResponses(
  networkResponses: NetworkResponseLog[],
  pageUrl: string,
  allowedOrigin?: string
): CrawledEntity[] {
  if (!Array.isArray(networkResponses) || networkResponses.length === 0) {
    return [];
  }

  const baseOrigin = allowedOrigin || new URL(pageUrl).origin.toLowerCase();
  const entities: CrawledEntity[] = [];
  const seenTitles = new Set<string>();

  for (const resp of networkResponses) {
    if (!resp || typeof resp !== 'object') continue;
    if (resp.status && (resp.status < 200 || resp.status >= 400)) continue;
    if (!resp.url) continue;

    // 1. Same-domain check
    try {
      const respOrigin = new URL(resp.url).origin.toLowerCase();
      if (respOrigin !== baseOrigin && !resp.url.startsWith('/')) {
        continue;
      }
    } catch {
      continue;
    }

    // 2. Discard tracking & analytics
    if (isTrackingOrTelemetryUrl(resp.url)) {
      continue;
    }

    // 3. Parse body
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

    // 4. Find candidate inventory arrays
    const candidateArrays: any[][] = [];

    if (Array.isArray(json)) {
      candidateArrays.push(json);
    } else {
      // Check envelope properties
      const envelopeKeys = [
        'data', 'results', 'items', 'products', 'vehicles', 'inventory',
        'listings', 'records', 'courses', 'hits', 'nodes', 'cars', 'properties',
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

    // 5. Extract entities from candidate arrays
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
 * in native crawl mode.
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
          if (new URL(fullUrl).origin.toLowerCase() === base.origin.toLowerCase()) {
            candidateApiUrls.add(fullUrl);
          }
        } catch {}
      }
    }
  }

  if (candidateApiUrls.size === 0) return [];

  const responses: NetworkResponseLog[] = [];

  for (const apiUrl of Array.from(candidateApiUrls).slice(0, 8)) {
    try {
      const res = await fetch(apiUrl, {
        signal: AbortSignal.timeout(3000),
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
      });

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
