/**
 * Shopify Platform Connector
 *
 * Pulls structured product data directly from Shopify's public /products.json
 * endpoint and ingests entities into website_data with automatic vector embeddings.
 */

import { createClient } from '@supabase/supabase-js';
import { saveWebsiteDataBatch, WebsiteDataRow } from '@/config/widgetsDb';
import { processEntityImages } from '@/lib/crawler/images';

export interface ShopifyProductVariant {
  id: number;
  title: string;
  price: string;
  sku?: string;
  position: number;
  inventory_quantity?: number;
  available?: boolean;
  option1?: string;
  option2?: string;
  option3?: string;
}

export interface ShopifyProductImage {
  id: number;
  src: string;
  position: number;
  width?: number;
  height?: number;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
  vendor?: string;
  product_type?: string;
  tags?: string[] | string;
  variants?: ShopifyProductVariant[];
  images?: ShopifyProductImage[];
  options?: Array<{ name: string; position: number; values: string[] }>;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
}

/**
 * Strips HTML tags and decodes common HTML entities for clean text descriptions.
 */
function stripHtml(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Ingests all products from a Shopify store via its public /products.json endpoint.
 * Upserts on a stable key (source_url / shopifyId + widgetId) to prevent duplicates on re-run.
 */
export async function ingestShopifyProducts(website: {
  id: string;
  domain?: string;
  allowed_domains?: string[];
}): Promise<{ count: number }> {
  const supabase = getSupabase();

  // Determine base URL
  const domain =
    website.domain ||
    (website.allowed_domains && website.allowed_domains[0]) ||
    '';

  if (!domain) {
    throw new Error('[shopify-connector] Website domain is missing or undefined');
  }

  const rawDomain = domain.startsWith('http') ? domain : `https://${domain}`;
  const parsedUrl = new URL(rawDomain);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

  // Find widget(s) associated with this website
  const { data: widgets } = await supabase
    .from('widgets')
    .select('id, widget_id, website_id')
    .or(`id.eq.${website.id},website_id.eq.${website.id},widget_id.eq.${website.id}`);

  const targetWidgetIds = new Set<string>();
  if (widgets && widgets.length > 0) {
    widgets.forEach(w => {
      if (w.id) targetWidgetIds.add(w.id);
    });
  } else if (website.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(website.id)) {
    targetWidgetIds.add(website.id);
  }
  const widgetIds = Array.from(targetWidgetIds);

  console.log(`[shopify-connector] Fetching products from ${baseUrl}/products.json...`);

  // Paginate through products.json (up to 1,000 products / 10 pages)
  const allProducts: ShopifyProduct[] = [];
  let page = 1;
  const limit = 250;
  const maxPages = 10;

  while (page <= maxPages) {
    try {
      const fetchUrl = `${baseUrl}/products.json?limit=${limit}&page=${page}`;
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskShopifyConnector/1.0)',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[shopify-connector] products.json page ${page} returned status ${res.status}`);
        break;
      }

      const data = await res.json().catch(() => null);
      const products: ShopifyProduct[] = data?.products || [];

      if (products.length === 0) {
        break;
      }

      allProducts.push(...products);

      if (products.length < limit) {
        break; // End of catalog
      }

      page++;
    } catch (err: any) {
      console.warn(`[shopify-connector] Error fetching page ${page}:`, err.message || err);
      break;
    }
  }

  console.log(`[shopify-connector] Discovered ${allProducts.length} Shopify products.`);

  if (allProducts.length === 0) {
    return { count: 0 };
  }

  // Look up existing shopify records for these widgets to enable in-place updates without duplicates
  const { data: existingRows } = await supabase
    .from('website_data')
    .select('id, widget_id, source_url, metadata')
    .in('widget_id', widgetIds)
    .eq('data_type', 'shopify');

  const existingMap = new Map<string, string>(); // key: `${widget_id}:${shopifyId_or_url}` -> id
  (existingRows || []).forEach(r => {
    const shopifyId = r.metadata?.shopifyId;
    if (shopifyId) {
      existingMap.set(`${r.widget_id}:${shopifyId}`, r.id);
    }
    if (r.source_url) {
      existingMap.set(`${r.widget_id}:${r.source_url}`, r.id);
    }
  });

  // Map each product into WebsiteDataRow format
  const rowsToSave: WebsiteDataRow[] = [];

  for (const widgetId of widgetIds) {
    for (const p of allProducts) {
      const cleanDesc = stripHtml(p.body_html || '');
      const sourceUrl = `${baseUrl}/products/${p.handle}`;

      // Extract high-resolution image URLs using Phase 3.5 helper
      const rawImages = (p.images || []).map(img => img.src);
      const { imageUrls } = processEntityImages(rawImages, baseUrl);

      // Extract variant price / availability
      const variants = p.variants || [];
      const prices = variants
        .map(v => parseFloat(v.price))
        .filter(n => !isNaN(n) && n > 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const isAvailable = variants.some(v => v.available !== false);

      const tagsList = Array.isArray(p.tags)
        ? p.tags
        : typeof p.tags === 'string'
        ? p.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      // Check for existing row ID for stable upsert
      const existingId =
        existingMap.get(`${widgetId}:${p.id}`) ||
        existingMap.get(`${widgetId}:${sourceUrl}`);

      rowsToSave.push({
        ...(existingId ? { id: existingId } : {}),
        widget_id: widgetId,
        source_url: sourceUrl,
        title: p.title || 'Untitled Product',
        content: cleanDesc ? `${p.title}: ${cleanDesc}` : p.title,
        entity_type: 'product',
        data_type: 'shopify',
        short_description: cleanDesc.length > 300 ? cleanDesc.substring(0, 300) + '…' : cleanDesc,
        image_urls: imageUrls.slice(0, 5),
        category_path: p.product_type ? [p.product_type] : [],
        metadata: {
          price: minPrice,
          currency: 'USD',
          availability: isAvailable ? 'In Stock' : 'Out of Stock',
          vendor: p.vendor || '',
          productType: p.product_type || '',
          tags: tagsList,
          shopifyId: String(p.id),
          handle: p.handle,
          variants: variants.slice(0, 10).map(v => ({
            id: v.id,
            title: v.title,
            price: v.price,
            sku: v.sku || '',
            available: v.available !== false,
          })),
          imageSource: 'shopify',
        },
      });
    }
  }

  // Save via centralized Phase 2.2 path (auto-computes embeddings in batches)
  console.log(`[shopify-connector] Saving ${rowsToSave.length} product records with embeddings...`);
  await saveWebsiteDataBatch(rowsToSave);
  console.log(`[shopify-connector] Successfully ingested ${rowsToSave.length} Shopify product records.`);

  return { count: rowsToSave.length };
}
