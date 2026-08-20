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
 * Extracts all valid same-domain links from HTML.
 */
export function extractSameDomainLinks(html: string, baseUrl: string): string[] {
  try {
    const base = new URL(baseUrl);
    const links = new Set<string>();
    links.add(base.href);

    const hrefRegex = /href=["']([^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      const rawHref = match[1]?.trim();
      if (
        !rawHref ||
        rawHref.startsWith('#') ||
        rawHref.startsWith('javascript:') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:')
      ) {
        continue;
      }

      try {
        const resolved = new URL(rawHref, base.href);
        if (resolved.hostname.toLowerCase() === base.hostname.toLowerCase()) {
          const path = resolved.pathname.toLowerCase();
          // Filter out static asset files
          if (!path.match(/\.(css|js|woff|woff2|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp|mp4|webm|pdf|json|xml|map)$/)) {
            resolved.hash = '';
            links.add(resolved.href);
          }
        }
      } catch {}
    }

    return Array.from(links);
  } catch {
    return [baseUrl];
  }
}

/**
 * Parses XML sitemap content to extract candidate URLs.
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
          const path = parsed.pathname.toLowerCase();
          if (!path.match(/\.(css|js|woff|woff2|png|jpg|jpeg|gif|svg|ico|webp|pdf|xml)$/)) {
            parsed.hash = '';
            urls.add(parsed.href);
          }
        }
      } catch {}
    }
    return Array.from(urls);
  } catch {
    return [];
  }
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

function extractJsonLd(html: string): Record<string, any>[] {
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

// ─── JSON-LD → CrawledEntity mappers ─────────────────────────────────────────

function mapJsonLdToEntities(jsonLdList: Record<string, any>[], pageUrl: string): CrawledEntity[] {
  const entities: CrawledEntity[] = [];

  for (const ld of jsonLdList) {
    const type = (ld['@type'] || '').toLowerCase();

    // Product
    if (type.includes('product')) {
      const offer = ld.offers || ld.offer || {};
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || ld.headline || '',
        content: ld.description || ld.name || '',
        dataType: 'product',
        metadata: {},
      };
      if (ld.description) entity.metadata.description = ld.description;
      if (ld.image) entity.metadata.images = Array.isArray(ld.image) ? ld.image : [ld.image];
      if (offer.price) entity.metadata.price = offer.price;
      if (offer.priceCurrency) entity.metadata.currency = offer.priceCurrency;
      if (offer.availability) entity.metadata.availability = simplifyAvailability(offer.availability);
      if (ld.aggregateRating?.ratingValue) entity.metadata.rating = parseFloat(ld.aggregateRating.ratingValue);
      if (ld.aggregateRating?.reviewCount) entity.metadata.reviews = parseInt(ld.aggregateRating.reviewCount);
      if (ld.brand?.name || ld.brand) entity.metadata.brand = ld.brand?.name || ld.brand;
      if (ld.sku) entity.metadata.sku = ld.sku;
      if (ld.category) entity.metadata.category = ld.category;
      if (entity.title || entity.content) entities.push(entity);
    }

    // Service
    else if (type.includes('service') || type.includes('offer')) {
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || '',
        content: ld.description || ld.name || '',
        dataType: 'service',
        metadata: {},
      };
      if (ld.description) entity.metadata.description = ld.description;
      if (ld.image) entity.metadata.images = Array.isArray(ld.image) ? ld.image : [ld.image];
      if (ld.offers?.price) entity.metadata.price = ld.offers.price;
      if (entity.title || entity.content) entities.push(entity);
    }

    // LocalBusiness / Organization
    else if (type.includes('localbusiness') || type.includes('organization') || type.includes('restaurant') || type.includes('store')) {
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || '',
        content: ld.description || `${ld.name || ''} — ${ld.address?.streetAddress || ''}`.trim(),
        dataType: 'contact',
        metadata: {},
      };
      if (ld.description) entity.metadata.description = ld.description;
      if (ld.image) entity.metadata.images = Array.isArray(ld.image) ? ld.image : [ld.image];
      if (ld.telephone) entity.metadata.phone = ld.telephone;
      if (ld.email) entity.metadata.email = ld.email;
      if (ld.address?.streetAddress) entity.metadata.address = `${ld.address.streetAddress}, ${ld.address.addressLocality || ''} ${ld.address.addressRegion || ''}`.trim();
      if (ld.openingHours || ld.openingHoursSpecification) entity.metadata.hours = JSON.stringify(ld.openingHours || ld.openingHoursSpecification);
      if (ld.aggregateRating?.ratingValue) entity.metadata.rating = parseFloat(ld.aggregateRating.ratingValue);
      if (entity.title || entity.content) entities.push(entity);
    }

    // FAQ
    else if (type.includes('faqpage') || type.includes('question')) {
      const questions = ld.mainEntity || (type.includes('question') ? [ld] : []);
      for (const q of (Array.isArray(questions) ? questions : [questions])) {
        const answer = q.acceptedAnswer?.text || q.suggestedAnswer?.text || '';
        const entity: CrawledEntity = {
          url: pageUrl,
          title: q.name || '',
          content: answer || q.name || '',
          dataType: 'faq',
          metadata: { description: answer },
        };
        if (entity.title || entity.content) entities.push(entity);
      }
    }

    // Event
    else if (type.includes('event')) {
      const entity: CrawledEntity = {
        url: pageUrl,
        title: ld.name || '',
        content: ld.description || ld.name || '',
        dataType: 'event',
        metadata: {},
      };
      if (ld.description) entity.metadata.description = ld.description;
      if (ld.image) entity.metadata.images = Array.isArray(ld.image) ? ld.image : [ld.image];
      if (ld.offers?.price) entity.metadata.price = ld.offers.price;
      if (entity.title || entity.content) entities.push(entity);
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

// ─── Inline JSON extractor (window.__DATA__, etc.) ────────────────────────────

function extractInlineJson(html: string, pageUrl: string): CrawledEntity[] {
  const entities: CrawledEntity[] = [];
  // Look for common patterns like window.__NEXT_DATA__, window.__INITIAL_STATE__
  const patterns = [
    /window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*?\});\s*(?:window|<\/script>)/,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*;/,
    /window\.__APP_DATA__\s*=\s*(\{[\s\S]*?\})\s*;/,
    /"products"\s*:\s*(\[[\s\S]{0,5000}\])/,
    /"items"\s*:\s*(\[[\s\S]{0,5000}\])/,
    /"listings"\s*:\s*(\[[\s\S]{0,5000}\])/,
  ];

  for (const pattern of patterns) {
    try {
      const m = html.match(pattern);
      if (!m?.[1]) continue;
      const parsed = JSON.parse(m[1]);
      const arr = Array.isArray(parsed) ? parsed : findProductArrays(parsed);
      for (const item of arr.slice(0, 10)) {
        if (!item || typeof item !== 'object') continue;
        const title = item.name || item.title || item.productName || '';
        const desc = item.description || item.shortDescription || '';
        if (!title && !desc) continue;
        const entity: CrawledEntity = {
          url: pageUrl,
          title,
          content: desc || title,
          dataType: guessDataType(item),
          metadata: {},
        };
        if (desc) entity.metadata.description = desc;
        const imgs = item.images || item.photos || (item.image ? [item.image] : []);
        if (imgs.length) entity.metadata.images = imgs.slice(0, 3).map((i: any) => typeof i === 'string' ? i : i?.url || '').filter(Boolean);
        if (item.price !== undefined) entity.metadata.price = item.price;
        if (item.currency || item.priceCurrency) entity.metadata.currency = item.currency || item.priceCurrency;
        if (item.availability || item.inStock !== undefined) entity.metadata.availability = item.inStock === false ? 'Out of Stock' : item.availability || 'In Stock';
        entities.push(entity);
      }
    } catch {}
  }
  return entities;
}

function findProductArrays(obj: any, depth = 0): any[] {
  if (depth > 3 || typeof obj !== 'object' || obj === null) return [];
  const keys = ['products', 'items', 'listings', 'vehicles', 'services', 'results', 'data', 'entries'];
  for (const k of keys) {
    if (Array.isArray(obj[k]) && obj[k].length > 0) return obj[k];
  }
  for (const v of Object.values(obj)) {
    const found = findProductArrays(v, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function guessDataType(item: any): CrawledEntity['dataType'] {
  const keys = Object.keys(item).join(' ').toLowerCase();
  const vals = JSON.stringify(item).toLowerCase();
  if (keys.includes('vin') || keys.includes('mileage') || vals.includes('vehicle')) return 'product';
  if (keys.includes('price') || keys.includes('sku')) return 'product';
  if (keys.includes('service') || keys.includes('treatment')) return 'service';
  if (keys.includes('faq') || keys.includes('question')) return 'faq';
  return 'product';
}

// ─── Meta-tag & SPA page extractor ──────────────────────────────────────────

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

    for (const scriptUrl of scriptUrls.slice(0, 12)) {
      try {
        const res = await fetch(scriptUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
        });
        if (!res.ok) continue;
        const code = await res.text();

        // 1. Array of objects pattern: [{id:"...",title:"...",...},...]
        const arrayMatches = code.match(/\[\s*\{[^{}]*?(?:title|name)\s*:\s*["'][^"']+["'][\s\S]*?\}\s*\]/g) || [];
        for (const arrStr of arrayMatches) {
          const objRegex = /\{[^{}]*?(?:title|name)\s*:\s*["']([^"']{3,100})["'][^{}]*?\}/g;
          let objMatch;
          while ((objMatch = objRegex.exec(arrStr)) !== null) {
            parseAndPushEntity(objMatch[0], pageUrl, entities, seenTitles);
          }
        }

        // 2. Individual object literal pattern: {id:"...",title:"...",description:"...",price:"..."}
        const singleObjRegex = /\{[^{}]*?(?:title|name)\s*:\s*["']([^"']{3,100})["'][^{}]*?\}/g;
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

  const title = extractField('title') || extractField('name');
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

  const description = extractField('description') || extractField('desc') || extractField('summary') || extractField('short_description') || extractField('details') || '';
  const price = extractField('price') || extractField('cost') || extractField('amount');
  const image = extractField('image') || extractField('imageUrl') || extractField('img') || extractField('photo') || extractField('thumbnail');
  const rating = extractField('rating') || extractField('stars');
  const level = extractField('level') || extractField('difficulty') || extractField('category') || extractField('department');
  const reviews = extractField('reviews') || extractField('reviewCount');

  // Require at least description, price, level, image, or rating to be a valid catalog item
  if (!description && !price && !level && !image && !rating) {
    return;
  }

  seenTitles.add(lowerTitle);

  let formattedContent = `${cleanTitle}`;
  if (description) formattedContent += `\n\n${description}`;
  if (price) formattedContent += `\n\nPrice: ${price}`;
  if (level) formattedContent += `\nLevel: ${level}`;
  if (rating) formattedContent += `\nRating: ${rating}★${reviews ? ` (${reviews} reviews)` : ''}`;

  const metadata: Record<string, any> = {
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

export async function extractPageEntities(html: string, pageUrl: string): Promise<CrawledEntity[]> {
  const entities: CrawledEntity[] = [];

  // 1. JSON-LD (highest fidelity)
  const jsonLd = extractJsonLd(html);
  if (jsonLd.length) {
    entities.push(...mapJsonLdToEntities(jsonLd, pageUrl));
  }

  // 2. Inline JSON data blobs
  const inlineEntities = extractInlineJson(html, pageUrl);
  entities.push(...inlineEntities);

  // 3. Client-rendered SPA JS chunk extraction
  const spaEntities = await extractSpaChunkEntities(html, pageUrl);
  if (spaEntities.length > 0) {
    entities.push(...spaEntities);
  }

  // 4. Page-level text entity
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

  // If SPA entities were extracted, append their catalog text to the page-level record
  if (spaEntities.length > 0) {
    const catalogSummary = spaEntities.map(e => `• ${e.title}: ${e.metadata?.description || ''} ${e.metadata?.price ? `(${e.metadata.price})` : ''}`).join('\n');
    fullContent += `\n\nCatalog Items / Offerings:\n${catalogSummary}`;
  }

  const decodedContent = decodeHtmlEntities(fullContent.trim());
  if (title || decodedContent) {
    const lower = (pageUrl + ' ' + title + ' ' + decodedContent).toLowerCase();
    let dataType: CrawledEntity['dataType'] = 'text';
    if (/course|learn|curriculum|syllabus|lesson|class|tutorial/.test(lower)) dataType = 'service';
    else if (/faq|frequently asked questions|question|answer/.test(lower)) dataType = 'faq';
    else if (/policy|terms|privacy|refund|cookie|compliance/.test(lower)) dataType = 'text';
    else if (/contact|support|phone|email|location|address/.test(lower)) dataType = 'contact';
    else if (/pricing|price|cost|tier|subscription/.test(lower)) dataType = 'pricing';
    else if (/product|item|cart|shop|store/.test(lower)) dataType = 'product';

    const entity: CrawledEntity = {
      url: pageUrl,
      title: decodeHtmlEntities(title.trim()),
      content: decodedContent || title,
      dataType,
      metadata: {},
    };
    if (description) entity.metadata.description = decodeHtmlEntities(description);
    const images = extractImages(html, pageUrl);
    if (images.length) entity.metadata.images = images;
    entities.push(entity);
  }

  return entities;
}


