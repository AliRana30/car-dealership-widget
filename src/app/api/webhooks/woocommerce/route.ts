/**
 * WooCommerce Webhook Handler (Phase 5.3)
 *
 * POST /api/webhooks/woocommerce
 *
 * Receives real-time product updates from WooCommerce (product.created, product.updated, product.deleted).
 * Cryptographically verifies X-WC-Webhook-Signature and updates Entity rows instantly.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { processEntityImages } from '@/lib/crawler/images';
import { saveWebsiteDataBatch, WebsiteDataRow } from '@/config/widgetsDb';
import { decrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

/**
 * Cryptographically verifies WooCommerce HMAC signature over the raw request payload.
 */
export function verifyWooCommerceHmac(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  try {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-wc-webhook-signature');
    const topic = req.headers.get('x-wc-webhook-topic') || '';
    const sourceDomain = req.headers.get('x-wc-webhook-source') || '';

    const supabase = getSupabase();

    // 1. Resolve website by source domain
    let websiteId: string | null = null;
    let webhookSecret: string = process.env.WOOCOMMERCE_WEBHOOK_SECRET || '';

    if (sourceDomain) {
      const parsedHost = new URL(sourceDomain.startsWith('http') ? sourceDomain : `https://${sourceDomain}`).hostname;
      const { data: ws } = await supabase
        .from('websites')
        .select('id, allowed_domains')
        .contains('allowed_domains', [parsedHost])
        .limit(1)
        .maybeSingle();

      if (ws) {
        websiteId = ws.id;
        // Retrieve secret for this website
        const { data: secretRow } = await supabase
          .from('widget_secrets')
          .select('consumer_secret')
          .eq('website_id', ws.id)
          .maybeSingle();

        if (secretRow?.consumer_secret) {
          try {
            webhookSecret = decrypt(secretRow.consumer_secret) || secretRow.consumer_secret;
          } catch {
            webhookSecret = secretRow.consumer_secret;
          }
        }
      }
    }

    // 2. Cryptographic signature verification
    if (webhookSecret) {
      const isValid = verifyWooCommerceHmac(rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        console.warn('[webhook/woocommerce] Signature verification failed — rejecting request.');
        return NextResponse.json({ error: 'unauthorized', message: 'Invalid WooCommerce HMAC signature' }, { status: 401 });
      }
    } else if (!signatureHeader && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'unauthorized', message: 'Missing WooCommerce signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody || '{}');
    const productId = String(payload.id || '');
    if (!productId) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing product ID in payload' }, { status: 400 });
    }

    // 3. Find associated widgets
    const { data: widgets } = await supabase
      .from('widgets')
      .select('id')
      .eq('website_id', websiteId || '00000000-0000-0000-0000-000000000000');

    const widgetIds = widgets?.map(w => w.id) || ['00000000-0000-0000-0000-000000000000'];

    // 4. Handle Product Deletion
    if (topic.includes('deleted') || topic.includes('trash')) {
      console.log(`[webhook/woocommerce] Product deleted (${productId}) on ${sourceDomain}`);
      for (const widgetId of widgetIds) {
        await supabase
          .from('website_data')
          .delete()
          .eq('widget_id', widgetId)
          .contains('metadata', { wooId: productId });
      }
      return NextResponse.json({ success: true, action: 'deleted', productId });
    }

    // 5. Handle Product Create / Update
    const title = payload.name || payload.title || 'Untitled Product';
    const cleanDesc = (payload.short_description || payload.description || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const rawImages = (payload.images || []).map((img: any) => img.src || img);
    const { imageUrls, imageSource } = processEntityImages(rawImages, payload.permalink || sourceDomain);

    const price = parseFloat(payload.price || payload.regular_price || '0') || 0;
    const availability = payload.stock_status === 'outofstock' ? 'Out of Stock' : 'In Stock';
    const categories = (payload.categories || []).map((c: any) => c.name || c);

    const rowsToUpsert: WebsiteDataRow[] = [];

    for (const widgetId of widgetIds) {
      const { data: existing } = await supabase
        .from('website_data')
        .select('id')
        .eq('widget_id', widgetId)
        .contains('metadata', { wooId: productId })
        .maybeSingle();

      rowsToUpsert.push({
        id: existing?.id,
        widget_id: widgetId,
        source_url: payload.permalink || undefined,
        title,
        content: cleanDesc ? `${title}: ${cleanDesc}` : title,
        short_description: cleanDesc.length > 300 ? cleanDesc.substring(0, 300) + '…' : cleanDesc,
        entity_type: 'product',
        data_type: 'woocommerce',
        image_urls: imageUrls.slice(0, 5),
        category_path: categories,
        metadata: {
          price,
          currency: 'USD',
          availability,
          sku: payload.sku || undefined,
          wooId: productId,
          imageSource: imageSource || 'wordpress',
          rating: payload.average_rating ? parseFloat(payload.average_rating) : undefined,
          reviews: payload.rating_count ? parseInt(payload.rating_count, 10) : undefined,
        },
      });
    }

    console.log(`[webhook/woocommerce] Real-time upsert of product ${productId} ("${title}") across ${widgetIds.length} widget(s)...`);
    await saveWebsiteDataBatch(rowsToUpsert);

    return NextResponse.json({
      success: true,
      action: 'upserted',
      productId,
      title,
      widgetCount: widgetIds.length,
    });
  } catch (err: any) {
    console.error('[webhook/woocommerce] Webhook processing failed:', err);
    return NextResponse.json({ error: 'webhook_failed', message: err.message }, { status: 500 });
  }
}
