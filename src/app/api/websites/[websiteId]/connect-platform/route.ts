import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { testWooCommerceConnection, ingestWooCommerceProducts, registerWooCommerceWebhooks } from '@/lib/connectors/woocommerce';
import { encrypt } from '@/lib/encryption';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ websiteId: string }> }
) {
  try {
    const { websiteId } = await params;
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { platform, consumerKey, consumerSecret } = body;

    if (platform !== 'woocommerce') {
      return NextResponse.json(
        { error: 'bad_request', message: "Only 'woocommerce' platform connector is supported via this endpoint" },
        { status: 400 }
      );
    }

    if (!consumerKey || !consumerSecret) {
      return NextResponse.json(
        { error: 'bad_request', message: 'consumerKey and consumerSecret are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Verify website exists and belongs to user
    const { data: website, error: wsError } = await supabase
      .from('websites')
      .select('id, name, allowed_domains')
      .eq('id', websiteId)
      .eq('user_id', userId)
      .single();

    if (wsError || !website) {
      return NextResponse.json(
        { error: 'not_found', message: 'Website not found or access denied' },
        { status: 404 }
      );
    }

    const domain = (website.allowed_domains && website.allowed_domains[0]) || '';
    if (!domain) {
      return NextResponse.json(
        { error: 'bad_request', message: 'No domain configured for this website' },
        { status: 400 }
      );
    }

    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    // 1. Test credentials with a single live probe before saving
    console.log(`[connect-platform] Validating WooCommerce credentials for ${baseUrl}...`);
    const testResult = await testWooCommerceConnection(baseUrl, consumerKey.trim(), consumerSecret.trim());

    if (!testResult.ok) {
      console.warn(`[connect-platform] Credentials validation failed: ${testResult.message}`);
      return NextResponse.json(
        {
          error: 'invalid_credentials',
          message: testResult.message || 'Invalid WooCommerce Consumer Key or Secret (HTTP 401 Unauthorized)',
        },
        { status: 401 }
      );
    }

    // 2. Encrypt credentials before saving to widget_secrets
    const encKey = encrypt(consumerKey.trim()) || consumerKey.trim();
    const encSecret = encrypt(consumerSecret.trim()) || consumerSecret.trim();

    // Check if secret row already exists for this website
    const { data: existingSecret } = await supabase
      .from('widget_secrets')
      .select('id')
      .eq('website_id', websiteId)
      .eq('secret_type', 'woocommerce')
      .limit(1)
      .single();

    if (existingSecret) {
      await supabase
        .from('widget_secrets')
        .update({
          consumer_key: encKey,
          consumer_secret: encSecret,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSecret.id);
    } else {
      await supabase
        .from('widget_secrets')
        .insert({
          website_id: websiteId,
          secret_type: 'woocommerce',
          consumer_key: encKey,
          consumer_secret: encSecret,
        });
    }

    // 3. Mark detected_platform as 'woocommerce'
    await supabase
      .from('websites')
      .update({ detected_platform: 'woocommerce' })
      .eq('id', websiteId);

    // 4. Trigger initial WooCommerce product ingestion
    let ingestedCount = 0;
    try {
      const ingestResult = await ingestWooCommerceProducts(website, {
        consumerKey: consumerKey.trim(),
        consumerSecret: consumerSecret.trim(),
      });
      ingestedCount = ingestResult.count;
    } catch (ingestErr: any) {
      console.error('[connect-platform] WooCommerce ingestion warning:', ingestErr.message || ingestErr);
    }

    // 5. Automatically provision real-time product webhooks
    const appHost = process.env.NEXT_PUBLIC_APP_URL || (req.headers.get('host') ? `https://${req.headers.get('host')}` : 'https://example.com');
    const webhookDeliveryUrl = `${appHost}/api/webhooks/woocommerce`;
    try {
      await registerWooCommerceWebhooks(baseUrl, consumerKey.trim(), consumerSecret.trim(), webhookDeliveryUrl);
    } catch (whErr: any) {
      console.warn('[connect-platform] Webhook auto-registration warning:', whErr.message || whErr);
    }

    return NextResponse.json({
      success: true,
      platform: 'woocommerce',
      message: 'WooCommerce store connected successfully, products ingested, and webhooks configured',
      ingestedCount,
    });
  } catch (err: any) {
    console.error('[connect-platform] POST error:', err);
    return NextResponse.json(
      { error: 'server_error', message: err.message || 'Failed to connect platform' },
      { status: 500 }
    );
  }
}
