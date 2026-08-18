/**
 * Shopify Webhook Handler (Phase 5.3)
 *
 * POST /api/webhooks/shopify
 *
 * Receives real-time product updates from Shopify (products/create, products/update, products/delete).
 * Cryptographically verifies X-Shopify-Hmac-Sha256 and updates Entity rows instantly.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { processEntityImages } from '@/lib/crawler/images';
import { saveWebsiteDataBatch, WebsiteDataRow } from '@/config/widgetsDb';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
}

/**
 * Cryptographically verifies Shopify HMAC signature over the raw request payload.
 */
export function verifyShopifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  try {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
    const topic = req.headers.get('x-shopify-topic') || '';
    const shopDomain = req.headers.get('x-shopify-shop-domain') || '';

    const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || '';

    // If a webhook secret is configured in env, strictly verify cryptographic signature
    if (webhookSecret) {
      const isValid = verifyShopifyHmac(rawBody, hmacHeader, webhookSecret);
      if (!isValid) {
        console.warn('[webhook/shopify] Signature verification failed — rejecting request.');
        return NextResponse.json({ error: 'unauthorized', message: 'Invalid HMAC signature' }, { status: 401 });
      }
    } else if (!hmacHeader) {
      // In production without secret, reject unsigned requests
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'unauthorized', message: 'Missing Shopify HMAC signature' }, { status: 401 });
      }
    }

    const payload = JSON.parse(rawBody || '{}');
    const productId = String(payload.id || '');
    if (!productId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing product ID in payload' }, { status: 400 });
    }

    const supabase = getSupabase();

    // 1. Resolve website by shop domain or allowed_domains
    let websiteId: string | null = null;
    if (shopDomain) {
      const { data: ws } = await supabase
        .from('websites')
        .select('id, allowed_domains')
        .contains('allowed_domains', [shopDomain.toLowerCase()])
        .limit(1)
        .maybeSingle();

      if (ws) websiteId = ws.id;
    }

    // Fallback: look up by single default website if shopDomain lookup yields nothing
    if (!websiteId) {
      const { data: wsList } = await supabase
        .from('websites')
        .select('id')
        .eq('detected_platform', 'shopify')
        .limit(1);

      if (wsList && wsList.length > 0) {
        websiteId = wsList[0].id;
      }
    }

    // 2. Find associated widgets
    const { data: widgets } = await supabase
      .from('widgets')
      .select('id')
      .eq('website_id', websiteId || '00000000-0000-0000-0000-000000000000');

    const widgetIds = widgets?.map(w => w.id) || ['00000000-0000-0000-0000-000000000000'];

    // 3. Handle Product Deletion
    if (topic.includes('delete')) {
      console.log(`[webhook/shopify] Product deleted (${productId}) on ${shopDomain}`);
      for (const widgetId of widgetIds) {
        await supabase
          .from('website_data')
          .delete()
          .eq('widget_id', widgetId)
          .contains('metadata', { shopifyId: productId });
      }
      return NextResponse.json({ success: true, action: 'deleted', productId });
    }

    // 4. Handle Product Create / Update
    const title = payload.title || 'Untitled Product';
    const cleanDesc = (payload.body_html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const rawImages = (payload.images || []).map((img: any) => img.src || img);
    const domainBase = shopDomain ? (shopDomain.startsWith('http') ? shopDomain : `https://${shopDomain}`) : undefined;
    const { imageUrls, imageSource } = processEntityImages(rawImages, domainBase);

    const variants = (payload.variants || []).map((v: any) => ({
      id: v.id,
      title: v.title,
      price: v.price,
      sku: v.sku,
      available: v.available ?? true,
    }));

    const price = variants.length > 0 && variants[0].price ? parseFloat(variants[0].price) || 0 : 0;
    const availability = variants.some((v: any) => v.available) ? 'In Stock' : 'Out of Stock';

    const sourceUrl = domainBase && payload.handle
      ? `${domainBase}/products/${payload.handle}`
      : undefined;

    const rowsToUpsert: WebsiteDataRow[] = [];

    for (const widgetId of widgetIds) {
      // Check existing row to preserve stable primary key ID
      const { data: existing } = await supabase
        .from('website_data')
        .select('id')
        .eq('widget_id', widgetId)
        .contains('metadata', { shopifyId: productId })
        .maybeSingle();

      rowsToUpsert.push({
        id: existing?.id,
        widget_id: widgetId,
        source_url: sourceUrl,
        title,
        content: cleanDesc ? `${title}: ${cleanDesc}` : title,
        short_description: cleanDesc.length > 300 ? cleanDesc.substring(0, 300) + '…' : cleanDesc,
        entity_type: 'product',
        data_type: 'shopify',
        image_urls: imageUrls.slice(0, 5),
        category_path: payload.product_type ? [payload.product_type] : [],
        metadata: {
          price,
          currency: 'USD',
          availability,
          shopifyId: productId,
          variants,
          imageSource: imageSource || 'shopify',
          vendor: payload.vendor,
          tags: payload.tags,
        },
      });
    }

    console.log(`[webhook/shopify] Real-time upsert of product ${productId} ("${title}") across ${widgetIds.length} widget(s)...`);
    await saveWebsiteDataBatch(rowsToUpsert);

    return NextResponse.json({
      success: true,
      action: 'upserted',
      productId,
      title,
      widgetCount: widgetIds.length,
    });
  } catch (err: any) {
    console.error('[webhook/shopify] Webhook processing failed:', err);
    return NextResponse.json({ error: 'webhook_failed', message: err.message }, { status: 500 });
  }
}
