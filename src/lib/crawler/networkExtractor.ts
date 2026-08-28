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
 * Checks if a given object matches an inventory, catalog, freelancer, course, or service item shape.
 */
export function isInventoryShapedObject(item: any): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;

  const title =
    item.title ||
    item.name ||
    item.fullName ||
    item.full_name ||
    item.courseName ||
    item.course_name ||
    item.gigTitle ||
    item.gig_title ||
    item.serviceTitle ||
    item.service_name ||
    item.productName ||
    item.product_name ||
    item.vehicleTitle ||
    item.propertyTitle ||
    item.propertyName ||
    item.doctorName ||
    item.physicianName ||
    item.menuItem ||
    item.dishName ||
    item.appName ||
    item.softwareName ||
    item.listingTitle ||
    item.listing_title ||
    item.headline ||
    (item.year && item.make && item.model ? `${item.year} ${item.make} ${item.model}` : '') ||
    '';

  if (typeof title !== 'string' || title.trim().length < 2) return false;

  const lowerTitle = title.trim().toLowerCase();
  const uiNoise = ['button', 'close', 'submit', 'menu', 'nav', 'header', 'footer', 'modal', 'card', 'loading', 'default', 'root', 'page', 'app'];
  if (uiNoise.includes(lowerTitle)) return false;

  // Check for domain attributes across all supported models
  const hasPrice = item.price !== undefined || item.cost !== undefined || item.msrp !== undefined || item.sellingPrice !== undefined || item.amount !== undefined || item.rate !== undefined || item.hourlyRate !== undefined || item.fee !== undefined;
  const hasImage = !!(item.image || item.images || item.imageUrl || item.image_url || item.photos || item.photoList || item.thumbnail || item.profilePicture || item.avatar);
  const hasDesc = !!(item.description || item.desc || item.shortDescription || item.short_description || item.summary || item.details || item.bio || item.about);
  const hasIdentifiers = !!(item.vin || item.sku || item.id || item._id || item.stockNumber || item.stock_number || item.modelCode || item.username || item.handle);
  const hasReviews = !!(item.rating || item.stars || item.averageRating || item.reviews || item.totalReviews || item.recentReviews || item.reviewCount);
  const hasSpecs = !!(item.mileage || item.year || item.make || item.model || item.specs || item.attributes || item.category || item.tags || item.level || item.skills || item.subcategories || item.specialty || item.bedrooms || item.ingredients);

  return hasPrice || hasImage || hasDesc || hasIdentifiers || hasReviews || hasSpecs;
}

/**
 * Normalizes a raw image field into a clean string array, rejecting logos, icons, and 1x1 tracking pixels.
 */
export function extractImageUrls(raw: any, pageUrl: string): string[] {
  const images: string[] = [];
  let origin = '';
  try { origin = new URL(pageUrl).origin; } catch {}

  const add = (val: any) => {
    if (typeof val === 'string' && val.trim().length > 5) {
      const trimmed = val.trim();
      const lower = trimmed.toLowerCase();
      // Skip tracking pixels, generic svg icons, favicons, default avatars
      if (
        lower.includes('data:image') ||
        lower.includes('placeholder') ||
        lower.includes('favicon') ||
        lower.endsWith('.ico') ||
        lower.includes('1x1') ||
        lower.includes('pixel')
      ) {
        return;
      }
      try {
        const absolute = origin ? new URL(trimmed, origin).href : trimmed;
        if (!images.includes(absolute)) images.push(absolute);
      } catch {
        if (trimmed.startsWith('http') && !images.includes(trimmed)) images.push(trimmed);
      }
    } else if (val && typeof val === 'object') {
      if (typeof val.url === 'string') add(val.url);
      else if (typeof val.src === 'string') add(val.src);
      else if (typeof val.href === 'string') add(val.href);
      else if (typeof val.secure_url === 'string') add(val.secure_url);
      else if (typeof val.profilePicture === 'string') add(val.profilePicture);
    }
  };

  if (Array.isArray(raw)) {
    raw.forEach(add);
  } else {
    add(raw);
  }

  return images;
}

/**
 * Extracts and maps a domain object into a structured CrawledEntity with rich domain metadata.
 */
export function mapInventoryObjectToEntity(item: any, pageUrl: string, apiEndpoint: string): CrawledEntity | null {
  const title = (
    item.title ||
    item.name ||
    item.fullName ||
    item.full_name ||
    item.courseName ||
    item.course_name ||
    item.gigTitle ||
    item.gig_title ||
    item.serviceTitle ||
    item.service_name ||
    item.productName ||
    item.product_name ||
    item.vehicleTitle ||
    item.propertyTitle ||
    item.propertyName ||
    item.doctorName ||
    item.physicianName ||
    item.menuItem ||
    item.dishName ||
    item.appName ||
    item.softwareName ||
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
    item.bio ||
    item.about ||
    ''
  ).toString().trim();

  const rawPrice = item.price ?? item.cost ?? item.msrp ?? item.sellingPrice ?? item.amount ?? item.rate ?? item.hourlyRate ?? item.fee ?? item.prices?.priceInteger ?? item.prices?.price;
  let priceStr: string | undefined = undefined;
  if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
    priceStr = typeof rawPrice === 'number' ? `$${rawPrice.toLocaleString()}` : String(rawPrice).trim();
    if (/^\d+(\.\d+)?$/.test(priceStr)) priceStr = `$${priceStr}`;
  }

  const rawImages = item.images || item.image || item.imageUrl || item.image_url || item.photos || item.photoList || item.thumbnail || item.profilePicture || item.avatar || item.fbMetaImage;
  const images = extractImageUrls(rawImages, pageUrl);

  const vin = item.vin || item.VIN || item.niv || item.NIV || (Array.isArray(item.specsVin) ? item.specsVin[0] : undefined);
  const sku = item.sku || item.SKU;
  const stockNumber = item.stockNumber || item.stock_number || item.stockNo || item.sn || item.popupstocknumber || (Array.isArray(item.specsNoStock) ? item.specsNoStock[0] : undefined) || sku;
  
  // Odometer / Mileage extraction (handles km, miles, specsKM)
  const rawMileage = item.mileage || item.miles || item.km || item.odometer || (Array.isArray(item.specsKM) ? item.specsKM[0] : undefined);
  let mileage: number | undefined = undefined;
  if (typeof rawMileage === 'number') {
    mileage = rawMileage;
  } else if (typeof rawMileage === 'string') {
    const num = parseInt(rawMileage.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num)) mileage = num;
  }

  const year = item.year;
  const make = (typeof item.make === 'object' ? item.make?.basic || item.make?.title || item.make?.modified : item.make) || item.brand;
  const model = (typeof item.model === 'object' ? item.model?.basic || item.model?.title || item.model?.modified : item.model);
  const trim = (typeof item.version === 'object' ? item.version?.basic || item.version?.full : item.trim);
  const drivetrain = item.drivetrain || item.driveType || item.driveTrain;
  const bodyStyle = item.bodyStyle || item.body_style || item.bodyType || item.vehicleCategory || item.bodytype;
  
  // Engine & Transmission (including parsing optionRaw)
  let engine = item.engine || item.motor;
  let transmission = item.transmission;
  if (typeof item.optionRaw === 'string') {
    const engMatch = item.optionRaw.match(/Engine:\s*([^,]+)/i);
    if (engMatch && (!engine || engine === 'N.A.')) engine = engMatch[1].trim();
    const transMatch = item.optionRaw.match(/Transmission:\s*([^,]+)/i);
    if (transMatch && !transmission) transmission = transMatch[1].trim();
  }
  if (engine === 'N.A.') engine = undefined;

  const fuel = item.fuel || item.fuelType || item.fueltype || (Array.isArray(item.specsFuel) ? item.specsFuel[0] : undefined);
  const exteriorColor = item.color?.exteriorOrig || item.color?.exterior || (Array.isArray(item.specsExtColor) ? item.specsExtColor[0] : undefined) || item.exteriorColor || item.extColor || item.color;
  const interiorColor = item.color?.interiorOrig || item.color?.interior || item.interiorColor || item.intColor;
  const msrp = item.msrp || item.originalPrice || item.prices?.originalPriceWithoutCustomFees;
  const features = Array.isArray(item.features) ? item.features : Array.isArray(item.options) ? item.options : (typeof item.optionRaw === 'string' ? item.optionRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined);

  const itemUrl = item.url || item.link || item.detailUrl || item.detail_url || item.href;
  const conditionRaw = String(item.condition || '').toLowerCase();
  const condition = conditionRaw.includes('new') || pageUrl.includes('/new-vehicles') || (itemUrl && String(itemUrl).includes('/new-vehicles'))
    ? 'new'
    : conditionRaw.includes('cpo') || conditionRaw.includes('certified')
    ? 'cpo'
    : 'used';

  const category = item.category || item.department || item.type || item.tags || (Array.isArray(item.subcategories) ? item.subcategories.join(', ') : item.subcategories);
  const skills = Array.isArray(item.skills) ? item.skills.join(', ') : item.skills;
  const level = item.level || item.difficulty;
  const rating = item.rating || item.stars || item.averageRating || item.star;
  const reviews = item.reviews || item.totalReviews || item.reviewCount || (Array.isArray(item.recentReviews) ? item.recentReviews.length : undefined);
  const username = item.username || item.handle;
  const location = item.location || item.address || item.city || item.country;
  const availability = item.availability || (item.inStock !== undefined ? (item.inStock ? 'In Stock' : 'Out of Stock') : undefined);

  let resolvedUrl = pageUrl;
  try {
    const origin = new URL(pageUrl).origin;
    if (typeof itemUrl === 'string' && itemUrl.trim()) {
      resolvedUrl = new URL(itemUrl.trim(), origin).href;
    } else if (item._id || item.id || item.slug || username) {
      const rawId = item._id || item.id || item.slug || username;
      const lowerTitle = title.toLowerCase();
      if (item.fullName || item.username || item.profilePicture || /freelancer|seller|author|instructor|doctor|agent/.test(lowerTitle)) {
        resolvedUrl = `${origin}/freelancer/${rawId}`;
      } else if (pageUrl.includes('/courses') || pageUrl.includes('/course') || /course|mastery|bootcamp|academy|lesson|tutorial/.test(lowerTitle)) {
        resolvedUrl = `${origin}/course/${rawId}`;
      } else if (/inventory|vehicle|car|truck|suv/.test(pageUrl) || vin) {
        resolvedUrl = `${origin}/inventory/${rawId}`;
      } else if (pageUrl.includes('/products') || sku) {
        resolvedUrl = `${origin}/products/${item.handle || item.slug || rawId}`;
      } else if (/gig|service/.test(lowerTitle) || item.gigTitle) {
        resolvedUrl = `${origin}/service/${rawId}`;
      } else if (/property|house|apartment|listing/.test(lowerTitle)) {
        resolvedUrl = `${origin}/property/${rawId}`;
      } else {
        resolvedUrl = `${origin}/item/${rawId}`;
      }
    }
  } catch {}

  // Format rich multi-line content for agent retrieval and grounded prompts
  const contentParts: string[] = [title];
  if (username) contentParts.push(`Username / Handle: @${username}`);
  if (condition) contentParts.push(`Condition: ${condition.toUpperCase()}`);
  if (description) contentParts.push(description);
  if (priceStr) contentParts.push(`Price / Rate: ${priceStr}`);
  if (msrp) contentParts.push(`MSRP: $${Number(msrp).toLocaleString()}`);
  if (level) contentParts.push(`Level: ${level}`);
  if (category) contentParts.push(`Category: ${category}`);
  if (skills) contentParts.push(`Skills & Expertise: ${skills}`);
  if (location) contentParts.push(`Location: ${typeof location === 'object' ? JSON.stringify(location) : location}`);
  if (vin) contentParts.push(`VIN: ${vin}`);
  if (stockNumber) contentParts.push(`Stock #: ${stockNumber}`);
  if (mileage !== undefined && mileage !== null) {
    contentParts.push(`Mileage: ${typeof mileage === 'number' ? mileage.toLocaleString() : mileage} miles`);
  }
  if (year || make || model) contentParts.push(`Vehicle Specs: ${[year, make, model, trim].filter(Boolean).join(' ')}`);
  if (drivetrain) contentParts.push(`Drivetrain: ${drivetrain}`);
  if (transmission) contentParts.push(`Transmission: ${transmission}`);
  if (engine) contentParts.push(`Engine: ${engine}`);
  if (fuel) contentParts.push(`Fuel Type: ${fuel}`);
  if (exteriorColor) contentParts.push(`Exterior Color: ${exteriorColor}`);
  if (interiorColor) contentParts.push(`Interior Color: ${interiorColor}`);
  if (features && features.length > 0) contentParts.push(`Features: ${features.join(', ')}`);
  if (rating) contentParts.push(`Rating: ${rating}★${reviews ? ` (${reviews} reviews)` : ''}`);
  if (Array.isArray(item.recentReviews) && item.recentReviews.length > 0) {
    const sampleReviews = item.recentReviews.slice(0, 3).map((r: any) => `"${r.desc || r.comment || r.text || ''}" - ${r.star || r.rating || 5}★`).filter(Boolean).join('; ');
    if (sampleReviews) contentParts.push(`Recent Reviews: ${sampleReviews}`);
  }

  // Determine dataType
  let dataType: CrawledEntity['dataType'] = 'product';
  const lowerTitle = title.toLowerCase();
  if (item.fullName || item.username || item.profilePicture || /freelancer|developer|designer|consultant|doctor|physician|agent|instructor/.test(lowerTitle)) {
    dataType = 'service';
  } else if (/service|repair|maintenance|inspection|consultation|lesson|course|mastery|bootcamp|academy|gig/.test(lowerTitle)) {
    dataType = 'service';
  } else if (/pricing|plan|subscription|tier/.test(lowerTitle)) {
    dataType = 'pricing';
  } else if (/faq|question|help/.test(lowerTitle)) {
    dataType = 'faq';
  }

  // Collect extra metadata properties
  const extraProps: Record<string, any> = {};
  const ignoredKeys = new Set([
    'title', 'name', 'fullName', 'full_name', 'courseName', 'course_name', 'vehicleTitle', 'productName', 'product_name', 'item_name',
    'description', 'desc', 'shortDescription', 'short_description', 'summary', 'details', 'bio', 'about',
    'price', 'cost', 'msrp', 'sellingPrice', 'amount', 'rate', 'hourlyRate',
    'images', 'image', 'imageUrl', 'image_url', 'photos', 'photoList', 'thumbnail', 'profilePicture', 'avatar',
    'url', 'link', 'detailUrl', 'detail_url', 'href',
  ]);

  for (const [k, v] of Object.entries(item)) {
    if (!ignoredKeys.has(k) && v !== undefined && v !== null && v !== '' && typeof v !== 'function') {
      extraProps[k] = v;
    }
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
      condition,
      vin,
      stockNumber,
      stock_number: stockNumber,
      year,
      make,
      model,
      trim,
      drivetrain,
      bodyStyle,
      body_style: bodyStyle,
      transmission,
      engine,
      fuel,
      fuelType: fuel,
      color: exteriorColor,
      exteriorColor,
      interiorColor,
      features,
      vdpUrl: resolvedUrl,
      ...(priceStr ? { price: priceStr } : {}),
      ...(msrp ? { msrp } : {}),
      ...(description ? { description } : {}),
      ...(images.length > 0 ? { images, image: images[0] } : {}),
      ...(level ? { level } : {}),
      ...(category ? { category: String(category) } : {}),
      ...(skills ? { skills: String(skills) } : {}),
      ...(username ? { username: String(username) } : {}),
      ...(location ? { location: String(location) } : {}),
      ...(sku ? { sku } : {}),
      ...(mileage !== undefined && mileage !== null ? { mileage } : {}),
      ...(rating ? { rating: Number(rating) } : {}),
      ...(reviews ? { reviews: Number(reviews) } : {}),
      ...(availability ? { availability } : {}),
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

  // Prioritize app/, page, search, gigs, courses, catalog, and main scripts
  const prioritizedScriptUrls = scriptUrls.sort((a, b) => {
    const scoreA = (a.includes('/app/') ? 10 : 0) + (a.includes('page') ? 6 : 0) + (a.includes('search') ? 5 : 0) + (a.includes('gig') ? 5 : 0) + (a.includes('course') ? 5 : 0) + (a.includes('main') ? 3 : 0);
    const scoreB = (b.includes('/app/') ? 10 : 0) + (b.includes('page') ? 6 : 0) + (b.includes('search') ? 5 : 0) + (b.includes('gig') ? 5 : 0) + (b.includes('course') ? 5 : 0) + (b.includes('main') ? 3 : 0);
    return scoreB - scoreA;
  });

const apiScriptCache = new Map<string, string>();

  let discoveredApiBase = '';
  for (const sUrl of prioritizedScriptUrls.slice(0, 10)) {
    try {
      let code = apiScriptCache.get(sUrl);
      if (!code) {
        const scriptRes = await fetch(sUrl, {
          signal: AbortSignal.timeout(2000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!scriptRes.ok) continue;
        code = await scriptRes.text();
        apiScriptCache.set(sUrl, code);
      }

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

      // Look for candidate endpoints like get-courses, get-products, users/search, gigs, etc.
      const epMatches = code.match(/(?:url\s*:\s*["']([^"']+)["']|["'](?:\/api\/|\/users\/|\/gigs|\/courses|\/products|\/services|\/inventory|\/listings|\/properties|\/doctors|\/menu)[a-zA-Z0-9/_-]*["']|["'](?:get-courses|get-all-courses|all-courses|courses|catalog|inventory|get-products|search-freelancers|freelancers|gigs)["'])/gi);
      if (epMatches) {
        for (const ep of epMatches) {
          const clean = ep.replace(/url\s*:\s*["']|["']/gi, '').trim();
          if (clean.length > 2 && !clean.includes('webpack') && !clean.includes('.js') && !clean.includes('.css')) {
            if (discoveredApiBase && !clean.startsWith('http')) {
              candidateApiUrls.add(`${discoveredApiBase.replace(/\/+$/, '')}/${clean.replace(/^\/+/, '')}`);
            }
            try {
              if (clean.startsWith('http')) {
                candidateApiUrls.add(clean);
              } else {
                candidateApiUrls.add(new URL(clean.startsWith('/') ? clean : `/api/${clean}`, base.origin).href);
              }
            } catch {}
          }
        }
      }
    } catch {}
  }

  // If a backend base URL was discovered, add standard public endpoints
  if (discoveredApiBase) {
    const baseClean = discoveredApiBase.replace(/\/+$/, '');
    const standardEndpoints = [
      `${baseClean}/users/search/freelancers`,
      `${baseClean}/freelancers`,
      `${baseClean}/gigs`,
      `${baseClean}/services`,
      `${baseClean}/courses`,
      `${baseClean}/products`,
      `${baseClean}/inventory`,
      `${baseClean}/categories`,
      `${baseClean}/listings`,
    ];
    for (const sep of standardEndpoints) {
      candidateApiUrls.add(sep);
    }
  }

  if (candidateApiUrls.size === 0) return [];

  const responses: NetworkResponseLog[] = [];
  const targetUrls = Array.from(candidateApiUrls).slice(0, 10);

  // Fetch candidate endpoints concurrently in parallel
  await Promise.allSettled(
    targetUrls.map(async (apiUrl) => {
      try {
        let res = await fetch(apiUrl, {
          signal: AbortSignal.timeout(2500),
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
        });

        // Retry once if 503 (e.g. Render/free-tier cold start)
        if (res.status === 503) {
          await new Promise(r => setTimeout(r, 1500));
          res = await fetch(apiUrl, {
            signal: AbortSignal.timeout(3500),
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          });
        }

        if (!res.ok) return;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('json') && !contentType.includes('javascript') && !contentType.includes('text')) return;

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
      } catch {}
    })
  );

  return extractEntitiesFromNetworkResponses(responses, pageUrl, base.origin);
}
