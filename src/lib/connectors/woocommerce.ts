/**
 * WooCommerce Platform Connector
 *
 * Pulls structured product data directly from WooCommerce REST API (/wp-json/wc/v3/products)
 * using Basic Auth (Consumer Key & Secret) and saves records via saveWebsiteDataBatch.
 */

import { createClient } from '@supabase/supabase-js';
import { saveWebsiteDataBatch, WebsiteDataRow } from '@/config/widgetsDb';
import { decrypt } from '@/lib/encryption';
import { processEntityImages } from '@/lib/crawler/images';

export interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: string;
  status: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  stock_quantity?: number;
  categories: Array<{ id: number; name: string; slug: string }>;
  tags: Array<{ id: number; name: string; slug: string }>;
  images: Array<{ id: number; src: string; name?: string; alt?: string }>;
  attributes: Array<{ id: number; name: string; options: string[] }>;
  variations: number[];
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
}

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
 * Tests WooCommerce API credentials against a single lightweight endpoint (/wp-json/wc/v3/products?per_page=1).
 * Returns { ok: true } on success, or { ok: false, message: '...' } with a 401-style explanation.
 */
export async function testWooCommerceConnection(
  baseUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<{ ok: boolean; message?: string }> {
  if (!baseUrl || !consumerKey || !consumerSecret) {
    return { ok: false, message: 'Base URL, Consumer Key, and Consumer Secret are required' };
  }

  const cleanBase = baseUrl.replace(/\/+$/, '');
  const testUrl = `${cleanBase}/wp-json/wc/v3/products?per_page=1`;
  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const res = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskWooCommerceConnector/1.0)',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message: 'Invalid WooCommerce Consumer Key or Consumer Secret (HTTP 401/403 Unauthorized). Please verify API permissions in WooCommerce > Settings > Advanced > REST API.',
      };
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return {
        ok: false,
        message: `WooCommerce API returned HTTP ${res.status}: ${errBody || res.statusText}`,
      };
    }

    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) {
      return {
        ok: false,
        message: 'WooCommerce API responded, but response format was not a valid products array. Check your REST API endpoint URL.',
      };
    }

    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      message: `Connection failed: ${err.message || 'Network timeout or unreachable host'}`,
    };
  }
}

/**
 * Ingests all products from a WooCommerce store using authenticated REST API.
 * Upserts on a stable key (source_url / wooId + widgetId) to prevent duplicates on re-run.
 */
export async function ingestWooCommerceProducts(
  website: {
    id: string;
    domain?: string;
    allowed_domains?: string[];
  },
  credentials?: {
    consumerKey: string;
    consumerSecret: string;
  }
): Promise<{ count: number }> {
  const supabase = getSupabase();

  // Determine base URL
  const domain =
    website.domain ||
    (website.allowed_domains && website.allowed_domains[0]) ||
    '';

  if (!domain) {
    throw new Error('[woocommerce-connector] Website domain is missing or undefined');
  }

  const rawDomain = domain.startsWith('http') ? domain : `https://${domain}`;
  const parsedUrl = new URL(rawDomain);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

  // Retrieve credentials from widget_secrets if not passed explicitly
  let key = credentials?.consumerKey;
  let secret = credentials?.consumerSecret;

  if (!key || !secret) {
    const { data: secretRow } = await supabase
      .from('widget_secrets')
      .select('consumer_key, consumer_secret')
      .eq('website_id', website.id)
      .eq('secret_type', 'woocommerce')
      .limit(1)
      .single();

    if (secretRow) {
      key = secretRow.consumer_key ? decrypt(secretRow.consumer_key) || secretRow.consumer_key : '';
      secret = secretRow.consumer_secret ? decrypt(secretRow.consumer_secret) || secretRow.consumer_secret : '';
    }
  }

  if (!key || !secret) {
    throw new Error(`[woocommerce-connector] No WooCommerce credentials found for website ${website.id}`);
  }

  // Find widget(s) associated with this website
  const { data: widgets } = await supabase
    .from('widgets')
    .select('id')
    .eq('website_id', website.id);

  const widgetIds = widgets?.map(w => w.id) || [];
  if (widgetIds.length === 0) {
    widgetIds.push('00000000-0000-0000-0000-000000000000');
  }

  console.log(`[woocommerce-connector] Fetching products from ${baseUrl}/wp-json/wc/v3/products...`);

  const authHeader = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64');
  const allProducts: WooCommerceProduct[] = [];
  let page = 1;
  const perPage = 100;
  const maxPages = 20;

  while (page <= maxPages) {
    try {
      const fetchUrl = `${baseUrl}/wp-json/wc/v3/products?per_page=${perPage}&page=${page}&status=publish`;
      const res = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskWooCommerceConnector/1.0)',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.warn(`[woocommerce-connector] products page ${page} returned HTTP ${res.status}`);
        break;
      }

      const products: WooCommerceProduct[] = await res.json().catch(() => []);
      if (!Array.isArray(products) || products.length === 0) {
        break;
      }

      allProducts.push(...products);

      if (products.length < perPage) {
        break; // End of catalog
      }

      page++;
    } catch (err: any) {
      console.warn(`[woocommerce-connector] Error fetching page ${page}:`, err.message || err);
      break;
    }
  }

  console.log(`[woocommerce-connector] Discovered ${allProducts.length} WooCommerce products.`);

  if (allProducts.length === 0) {
    return { count: 0 };
  }

  // Look up existing woocommerce records for stable in-place updates without duplicates
  const { data: existingRows } = await supabase
    .from('website_data')
    .select('id, widget_id, source_url, metadata')
    .in('widget_id', widgetIds)
    .eq('data_type', 'woocommerce');

  const existingMap = new Map<string, string>();
  (existingRows || []).forEach(r => {
    const wooId = r.metadata?.wooId;
    if (wooId) {
      existingMap.set(`${r.widget_id}:${wooId}`, r.id);
    }
    if (r.source_url) {
      existingMap.set(`${r.widget_id}:${r.source_url}`, r.id);
    }
  });

  const rowsToSave: WebsiteDataRow[] = [];

  for (const widgetId of widgetIds) {
    for (const p of allProducts) {
      const cleanShortDesc = stripHtml(p.short_description || '');
      const cleanDesc = stripHtml(p.description || '');
      const summary = cleanShortDesc || cleanDesc;
      const sourceUrl = p.permalink || `${baseUrl}/product/${p.slug}`;

      // Extract high-resolution image URLs
      const rawImages = (p.images || []).map(img => img.src);
      const { imageUrls } = processEntityImages(rawImages, baseUrl);

      const priceNum = parseFloat(p.price || p.regular_price || '0') || 0;
      const isAvailable = p.stock_status === 'instock';

      const categoriesList = (p.categories || []).map(c => c.name).filter(Boolean);
      const tagsList = (p.tags || []).map(t => t.name).filter(Boolean);

      const existingId =
        existingMap.get(`${widgetId}:${p.id}`) ||
        existingMap.get(`${widgetId}:${sourceUrl}`);

      rowsToSave.push({
        ...(existingId ? { id: existingId } : {}),
        widget_id: widgetId,
        source_url: sourceUrl,
        title: p.name || 'Untitled Product',
        content: summary ? `${p.name}: ${summary}` : p.name,
        entity_type: 'product',
        data_type: 'woocommerce',
        short_description: summary.length > 300 ? summary.substring(0, 300) + '…' : summary,
        image_urls: imageUrls.slice(0, 5),
        category_path: categoriesList,
        metadata: {
          price: priceNum,
          currency: 'USD',
          availability: isAvailable ? 'In Stock' : 'Out of Stock',
          sku: p.sku || '',
          wooId: String(p.id),
          slug: p.slug,
          categories: categoriesList,
          tags: tagsList,
          onSale: p.on_sale || false,
          imageSource: 'woocommerce',
        },
      });
    }
  }

  console.log(`[woocommerce-connector] Saving ${rowsToSave.length} WooCommerce records with embeddings...`);
  await saveWebsiteDataBatch(rowsToSave);
  console.log(`[woocommerce-connector] Successfully ingested ${rowsToSave.length} WooCommerce product records.`);

  return { count: rowsToSave.length };
}

/**
 * Automatically registers product webhooks with WooCommerce REST API (POST /wp-json/wc/v3/webhooks).
 */
export async function registerWooCommerceWebhooks(
  domain: string,
  consumerKey: string,
  consumerSecret: string,
  deliveryUrl: string
): Promise<{ success: boolean; registered: string[] }> {
  const baseUrl = domain.startsWith('http') ? domain.replace(/\/+$/, '') : `https://${domain.replace(/\/+$/, '')}`;
  const authHeader = `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`;
  const registered: string[] = [];

  const topics = ['product.created', 'product.updated', 'product.deleted'];

  for (const topic of topics) {
    try {
      const res = await fetch(`${baseUrl}/wp-json/wc/v3/webhooks`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `FrontDesk AI - ${topic}`,
          topic,
          delivery_url: deliveryUrl,
          secret: consumerSecret,
          status: 'active',
        }),
      });

      if (res.ok) {
        registered.push(topic);
      } else {
        console.warn(`[woocommerce] Webhook registration for ${topic} returned status ${res.status}`);
      }
    } catch (err: any) {
      console.warn(`[woocommerce] Failed to auto-register webhook for ${topic}: ${err.message}`);
    }
  }

  return { success: registered.length > 0, registered };
}
