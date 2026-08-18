/**
 * HTML/metadata extractor — zero dependencies.
 * Uses regex-based parsing since we run server-side in Next.js Route Handlers
 * where cheerio/jsdom would add significant bundle weight.
 */

import { CrawledEntity } from './types';

// ─── Safe fetch with timeout ──────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB

export async function safeFetch(url: string): Promise<{ html: string; contentType: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FrontDeskBot/1.0 (website-intelligence-crawler; +https://frontdesk.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';
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
    return { html, contentType };
  } catch {
    return null;
  }
}

// ─── Regex helpers ────────────────────────────────────────────────────────────

function extractTag(html: string, tag: string, attr?: string): string {
  if (attr) {
    const re = new RegExp(`<${tag}[^>]*\\s${attr}\\s*=\\s*["']([^"']+)["'][^>]*>`, 'i');
    return html.match(re)?.[1]?.trim() || '';
  }
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return stripTags(html.match(re)?.[1] || '');
}

function extractMeta(html: string, nameOrProp: string): string {
  // <meta name="X" content="Y"> or <meta property="X" content="Y">
  const patterns = [
    new RegExp(`<meta[^>]*(?:name|property)\\s*=\\s*["']${nameOrProp}["'][^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*(?:name|property)\\s*=\\s*["']${nameOrProp}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1].trim();
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

// ─── Meta-tag page extractor ──────────────────────────────────────────────────

export function extractPageEntities(html: string, pageUrl: string): CrawledEntity[] {
  const entities: CrawledEntity[] = [];

  // 1. JSON-LD (highest fidelity)
  const jsonLd = extractJsonLd(html);
  if (jsonLd.length) {
    entities.push(...mapJsonLdToEntities(jsonLd, pageUrl));
  }

  // 2. Inline JSON data blobs
  const inlineEntities = extractInlineJson(html, pageUrl);
  entities.push(...inlineEntities);

  // 3. Fallback: OG/meta tags → one page-level text entity
  if (entities.length === 0) {
    const title = extractTag(html, 'title') ||
      extractMeta(html, 'og:title') ||
      extractMeta(html, 'twitter:title') || '';
    const description = extractMeta(html, 'description') ||
      extractMeta(html, 'og:description') ||
      extractMeta(html, 'twitter:description') || '';
    const bodyText = extractAllText(html, 4000);

    const content = [description, bodyText].filter(Boolean).join('\n\n').trim();
    if (title || content) {
      const entity: CrawledEntity = {
        url: pageUrl,
        title: title || new URL(pageUrl).hostname,
        content: content || title,
        dataType: 'text',
        metadata: {},
      };
      if (description) entity.metadata.description = description;
      const images = extractImages(html, pageUrl);
      if (images.length) entity.metadata.images = images;
      entities.push(entity);
    }
  }

  return entities;
}


