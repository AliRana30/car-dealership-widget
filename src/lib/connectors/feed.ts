/**
 * Generic Feed & File Importer Module (CSV / JSON / RSS / Google Merchant XML)
 *
 * Provides a universal field-mapping engine and parsers for product feeds and manual uploads.
 */

import { createClient } from '@supabase/supabase-js';
import { saveWebsiteDataBatch, WebsiteDataRow } from '@/config/widgetsDb';
import { processEntityImages } from '@/lib/crawler/images';

export const MAX_FEED_ITEMS = 5000;
export const MAX_FEED_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_MANUAL_ITEMS = 2000;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
}

/**
 * Normalizes and extracts price number and currency from arbitrary price strings.
 * e.g. "$29.99", "29.99 USD", "£15.50", "1,299.00 EUR", 49.99
 */
export function parsePriceAndCurrency(val: any): { price: number; currency: string } {
  if (typeof val === 'number') {
    return { price: isNaN(val) ? 0 : val, currency: 'USD' };
  }
  if (!val || typeof val !== 'string') {
    return { price: 0, currency: 'USD' };
  }

  const str = val.trim();
  let currency = 'USD';

  if (str.includes('$')) currency = 'USD';
  else if (str.includes('£')) currency = 'GBP';
  else if (str.includes('€')) currency = 'EUR';
  else if (str.includes('CAD')) currency = 'CAD';
  else if (str.includes('AUD')) currency = 'AUD';
  else if (/\bUSD\b/i.test(str)) currency = 'USD';
  else if (/\bEUR\b/i.test(str)) currency = 'EUR';
  else if (/\bGBP\b/i.test(str)) currency = 'GBP';

  const cleaned = str.replace(/[^0-9.,]/g, '').replace(/,/g, '');
  const price = parseFloat(cleaned) || 0;

  return { price, currency };
}

/**
 * Universal field-mapping engine: maps any arbitrary raw key/value dictionary
 * (from CSV, JSON, XML, or manual upload) into a canonical Entity / WebsiteDataRow.
 */
export function mapRawItemToEntity(
  raw: Record<string, any>,
  sourceUrlFallback?: string,
  dataType: 'feed' | 'manual' = 'feed'
): { entity: Partial<WebsiteDataRow> | null; error?: string } {
  if (!raw || typeof raw !== 'object') {
    return { entity: null, error: 'Empty or invalid record' };
  }

  // 1. Resolve Title / Name
  const title =
    raw.title ||
    raw.name ||
    raw.Title ||
    raw.Name ||
    raw.product_name ||
    raw.ProductName ||
    raw.item_title ||
    raw['g:title'] ||
    raw['g:name'] ||
    raw.headline ||
    '';

  const cleanTitle = String(title).trim();
  if (!cleanTitle) {
    return { entity: null, error: 'Missing title/name' };
  }

  // 2. Resolve Description
  const description =
    raw.description ||
    raw.short_description ||
    raw.Description ||
    raw.desc ||
    raw.summary ||
    raw.body ||
    raw['g:description'] ||
    raw['g:summary'] ||
    '';

  const cleanDesc = String(description).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // 3. Resolve Price & Currency
  const rawPrice =
    raw.price !== undefined
      ? raw.price
      : raw.Price !== undefined
      ? raw.Price
      : raw.regular_price !== undefined
      ? raw.regular_price
      : raw.sale_price !== undefined
      ? raw.sale_price
      : raw['g:price'] !== undefined
      ? raw['g:price']
      : raw['g:sale_price'] !== undefined
      ? raw['g:sale_price']
      : raw.cost !== undefined
      ? raw.cost
      : raw.amount;

  const { price, currency: extractedCurrency } = parsePriceAndCurrency(rawPrice);
  const currency =
    raw.currency ||
    raw.Currency ||
    raw.currency_code ||
    raw['g:currency'] ||
    extractedCurrency ||
    'USD';

  // 4. Resolve Images
  const rawImagesList: any[] = [];
  const rawImg =
    raw.image ||
    raw.image_url ||
    raw.image_link ||
    raw.imageUrl ||
    raw.Image ||
    raw['Image URL'] ||
    raw['g:image_link'] ||
    raw['g:additional_image_link'] ||
    raw.picture ||
    raw.photo;

  if (Array.isArray(raw.images)) rawImagesList.push(...raw.images);
  else if (Array.isArray(raw.image_urls)) rawImagesList.push(...raw.image_urls);
  else if (rawImg) {
    if (typeof rawImg === 'string' && rawImg.includes(',')) {
      rawImagesList.push(...rawImg.split(',').map(s => s.trim()));
    } else {
      rawImagesList.push(rawImg);
    }
  }

  const { imageUrls, imageSource } = processEntityImages(rawImagesList, sourceUrlFallback);

  // 5. Resolve Source URL / Link
  const sourceUrl =
    raw.url ||
    raw.link ||
    raw.source_url ||
    raw.sourceUrl ||
    raw.product_url ||
    raw.Link ||
    raw.URL ||
    raw['g:link'] ||
    sourceUrlFallback ||
    '';

  // 6. Resolve Availability / Stock
  const rawStock =
    raw.availability ||
    raw.stock ||
    raw.stock_status ||
    raw.in_stock ||
    raw['g:availability'] ||
    raw.Quantity ||
    raw.inventory;

  let availability = 'In Stock';
  if (rawStock !== undefined && rawStock !== null) {
    const stockStr = String(rawStock).toLowerCase();
    if (
      stockStr.includes('out') ||
      stockStr.includes('false') ||
      stockStr === '0' ||
      stockStr.includes('backorder') ||
      stockStr.includes('unavailable')
    ) {
      availability = 'Out of Stock';
    }
  }

  // 7. Resolve SKU / ID
  const sku =
    raw.sku ||
    raw.SKU ||
    raw.id ||
    raw.ID ||
    raw.product_id ||
    raw['g:id'] ||
    raw['g:item_group_id'] ||
    '';

  // 8. Resolve Category
  const category =
    raw.category ||
    raw.Category ||
    raw.product_type ||
    raw['g:product_type'] ||
    raw['g:google_product_category'] ||
    '';

  const categoryPath = category ? [String(category).trim()] : [];

  // 9. Absorb extra properties into metadata
  const knownKeys = new Set([
    'title', 'name', 'Title', 'Name', 'product_name', 'ProductName', 'item_title', 'g:title', 'g:name', 'headline',
    'description', 'short_description', 'Description', 'desc', 'summary', 'body', 'g:description', 'g:summary',
    'price', 'Price', 'regular_price', 'sale_price', 'g:price', 'g:sale_price', 'cost', 'amount',
    'currency', 'Currency', 'currency_code', 'g:currency',
    'image', 'image_url', 'image_link', 'imageUrl', 'Image', 'Image URL', 'g:image_link', 'g:additional_image_link', 'picture', 'photo', 'images', 'image_urls',
    'url', 'link', 'source_url', 'sourceUrl', 'product_url', 'Link', 'URL', 'g:link',
    'availability', 'stock', 'stock_status', 'in_stock', 'g:availability', 'Quantity', 'inventory',
    'sku', 'SKU', 'id', 'ID', 'product_id', 'g:id', 'g:item_group_id',
    'category', 'Category', 'product_type', 'g:product_type', 'g:google_product_category',
  ]);

  const extraMetadata: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!knownKeys.has(k) && v !== undefined && v !== null && v !== '') {
      extraMetadata[k] = v;
    }
  }

  const entity: Partial<WebsiteDataRow> = {
    title: cleanTitle,
    short_description: cleanDesc.length > 300 ? cleanDesc.substring(0, 300) + '…' : cleanDesc,
    content: cleanDesc ? `${cleanTitle}: ${cleanDesc}` : cleanTitle,
    source_url: String(sourceUrl).trim() || undefined,
    entity_type: 'product',
    data_type: dataType,
    image_urls: imageUrls.slice(0, 5),
    category_path: categoryPath,
    metadata: {
      price,
      currency,
      availability,
      sku: sku ? String(sku) : undefined,
      ...(imageSource ? { imageSource } : {}),
      ...extraMetadata,
    },
  };

  return { entity };
}

/**
 * Parses raw feed text content into an array of key/value dictionaries.
 * Auto-detects JSON, CSV, or XML / RSS / Google Merchant feeds.
 */
export function parseFeedContent(
  content: string,
  contentType?: string
): { items: Record<string, any>[]; format: 'csv' | 'json' | 'xml' | 'rss' } {
  const trimmed = content.trim();

  // 1. JSON Feed Detection
  if (
    contentType?.includes('application/json') ||
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      let items: any[] = [];
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (Array.isArray(parsed.items)) {
        items = parsed.items;
      } else if (Array.isArray(parsed.products)) {
        items = parsed.products;
      } else if (Array.isArray(parsed.data)) {
        items = parsed.data;
      } else if (Array.isArray(parsed.entries)) {
        items = parsed.entries;
      }
      return { items: items.filter(it => it && typeof it === 'object'), format: 'json' };
    } catch {
      // Fall through to other formats if JSON parse fails
    }
  }

  // 2. XML / RSS / Google Merchant Feed Detection
  if (
    contentType?.includes('xml') ||
    contentType?.includes('rss') ||
    trimmed.startsWith('<?xml') ||
    trimmed.startsWith('<rss') ||
    trimmed.startsWith('<feed') ||
    trimmed.startsWith('<products')
  ) {
    const items = parseXmlFeed(trimmed);
    return { items, format: trimmed.includes('<rss') ? 'rss' : 'xml' };
  }

  // 3. CSV / TSV Fallback
  const csvItems = parseCsvContent(trimmed);
  return { items: csvItems, format: 'csv' };
}

/**
 * Robust CSV parser supporting quotes, commas/tabs/semicolons, and escaped characters.
 */
export function parseCsvContent(csv: string): Record<string, string>[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length < 2) return [];

  // Detect delimiter (, or ; or \t)
  const headerLine = lines[0];
  const commaCount = (headerLine.match(/,/g) || []).length;
  const semiCount = (headerLine.match(/;/g) || []).length;
  const tabCount = (headerLine.match(/\t/g) || []).length;

  const delimiter = tabCount > commaCount && tabCount > semiCount ? '\t' : semiCount > commaCount ? ';' : ',';

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const next = line[i + 1];
      if (c === '"') {
        if (inQ && next === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === delimiter && !inQ) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length === 0 || (values.length === 1 && !values[0])) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (header) {
        row[header] = values[idx] !== undefined ? values[idx] : '';
      }
    });
    rows.push(row);
  }

  return rows;
}

/**
 * Lightweight XML/RSS/Google Merchant feed parser.
 * Extracts item nodes (<item>, <entry>, <product>) and tag values into object key/values.
 */
export function parseXmlFeed(xml: string): Record<string, any>[] {
  const items: Record<string, any>[] = [];

  // Match all <item>...</item>, <entry>...</entry>, or <product>...</product>
  const itemRegex = /<(?:item|entry|product)[\s>]([\s\S]*?)<\/(?:item|entry|product)>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemBlock = match[1];
    const row: Record<string, any> = {};

    // Match individual child elements: <tag attr="...">content</tag>
    const tagRegex = /<([a-zA-Z0-9_:-]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagRegex.exec(itemBlock)) !== null) {
      const tagName = tagMatch[1];
      let val = tagMatch[2].trim();

      // Handle CDATA e.g. <![CDATA[...]]>
      if (val.startsWith('<![CDATA[') && val.endsWith(']]>')) {
        val = val.substring(9, val.length - 3).trim();
      }

      if (val) {
        if (row[tagName]) {
          if (Array.isArray(row[tagName])) {
            row[tagName].push(val);
          } else {
            row[tagName] = [row[tagName], val];
          }
        } else {
          row[tagName] = val;
        }
      }
    }

    if (Object.keys(row).length > 0) {
      items.push(row);
    }
  }

  return items;
}

/**
 * Ingests products from a remote feed URL (CSV, JSON, RSS, Google Merchant XML).
 */
export async function ingestFeed(
  website: {
    id: string;
    domain?: string;
    allowed_domains?: string[];
  },
  feedUrl: string
): Promise<{ count: number; format: string; skipped: number; errors: string[] }> {
  const supabase = getSupabase();

  if (!feedUrl || !feedUrl.startsWith('http')) {
    throw new Error('Valid HTTP/HTTPS feed URL is required');
  }

  // 1. Fetch remote feed with timeout and byte size limit check
  console.log(`[feed-importer] Fetching feed from ${feedUrl}...`);
  const res = await fetch(feedUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskFeedImporter/1.0)',
      'Accept': 'text/csv,application/json,application/xml,text/xml,application/rss+xml,*/*',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Feed request returned HTTP ${res.status}: ${res.statusText}`);
  }

  const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_FEED_BYTES) {
    throw new Error(`Feed size (${(contentLength / 1024 / 1024).toFixed(1)}MB) exceeds maximum limit of 10MB`);
  }

  const rawText = await res.text();
  if (rawText.length > MAX_FEED_BYTES) {
    throw new Error(`Feed content exceeds maximum limit of 10MB`);
  }

  const contentType = res.headers.get('content-type') || '';
  const { items, format } = parseFeedContent(rawText, contentType);

  if (items.length === 0) {
    return { count: 0, format, skipped: 0, errors: ['Feed was parsed but contains 0 product items'] };
  }

  const cappedItems = items.slice(0, MAX_FEED_ITEMS);

  // 2. Find associated widgets
  const { data: widgets } = await supabase
    .from('widgets')
    .select('id')
    .eq('website_id', website.id);

  const widgetIds = widgets?.map(w => w.id) || [];
  if (widgetIds.length === 0) {
    widgetIds.push('00000000-0000-0000-0000-000000000000');
  }

  // 3. Map items to WebsiteDataRow
  const rowsToSave: WebsiteDataRow[] = [];
  let skipped = 0;
  const errors: string[] = [];

  for (const widgetId of widgetIds) {
    cappedItems.forEach((raw, idx) => {
      const { entity, error } = mapRawItemToEntity(raw, website.domain, 'feed');
      if (entity && entity.title) {
        rowsToSave.push({
          widget_id: widgetId,
          title: entity.title,
          content: entity.content || entity.title,
          short_description: entity.short_description || '',
          source_url: entity.source_url,
          entity_type: entity.entity_type || 'product',
          data_type: 'feed',
          image_urls: entity.image_urls || [],
          category_path: entity.category_path || [],
          metadata: entity.metadata || {},
        });
      } else {
        skipped++;
        if (errors.length < 5) {
          errors.push(`Row ${idx + 1}: ${error || 'Unknown validation failure'}`);
        }
      }
    });
  }

  if (rowsToSave.length > 0) {
    console.log(`[feed-importer] Saving ${rowsToSave.length} feed products with embeddings...`);
    await saveWebsiteDataBatch(rowsToSave);
  }

  return {
    count: rowsToSave.length,
    format,
    skipped,
    errors,
  };
}
