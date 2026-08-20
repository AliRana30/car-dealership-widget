/**
 * Platform Auto-Detection Module
 *
 * Automatically detects whether a connected website is running on Shopify,
 * WooCommerce, or a generic/unknown stack to enable direct structured ingestion.
 */

export type DetectedPlatform =
  | 'shopify'
  | 'woocommerce'
  | 'd2cmedia'
  | 'dealer_dot_com'
  | 'dealer_inspire'
  | 'custom_inventory'
  | 'unknown';

const PROBE_TIMEOUT_MS = 2500;

/**
 * Detects the eCommerce / CMS platform of a given domain or URL.
 * All requests use short timeouts (2.5s) and resolve cleanly to 'unknown' on failure.
 */
export async function detectPlatform(domainOrUrl: string): Promise<DetectedPlatform> {
  if (!domainOrUrl || typeof domainOrUrl !== 'string') return 'unknown';

  let baseUrl: string;
  try {
    const raw = domainOrUrl.startsWith('http') ? domainOrUrl : `https://${domainOrUrl}`;
    const parsed = new URL(raw);
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'unknown';
  }

  try {
    // ── Check 1: Shopify /products.json probe ─────────────────────────────────
    const shopifyDetected = await probeShopify(baseUrl);
    if (shopifyDetected) return 'shopify';

    // ── Check 2: WooCommerce REST API probe (/wp-json/) ───────────────────────
    const wooDetected = await probeWooCommerce(baseUrl);
    if (wooDetected) return 'woocommerce';

    // ── Check 3: Homepage HTML & Header fallback probe ────────────────────────
    const fallbackPlatform = await probeHomepageFallback(baseUrl);
    if (fallbackPlatform !== 'unknown') return fallbackPlatform;
  } catch {
    // Any unexpected probe failure safely defaults to 'unknown'
  }

  return 'unknown';
}

/**
 * Checks for Shopify public products endpoint and Shopify response headers.
 */
async function probeShopify(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/products.json?limit=1`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskPlatformBot/1.0)',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    // Check Shopify custom headers
    const shopId = res.headers.get('x-shopid') || res.headers.get('x-shopify-stage') || res.headers.get('x-sorting-hat');
    if (shopId) return true;

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json().catch(() => null);
        if (data && Array.isArray(data.products)) {
          return true;
        }
      }
    }
  } catch {
    // Probe timeout / network error
  }
  return false;
}

/**
 * Checks for WordPress / WooCommerce REST API endpoints (/wp-json/).
 */
async function probeWooCommerce(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/wp-json/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskPlatformBot/1.0)',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const text = await res.text().catch(() => '');
        if (
          text.includes('"wc/') ||
          text.includes('"woocommerce"') ||
          text.includes('wc/v3') ||
          text.includes('wc/store')
        ) {
          return true;
        }
      }
    }

    // Check WooCommerce Store API directly
    const storeApiRes = await fetch(`${baseUrl}/wp-json/wc/store/v1/products?per_page=1`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskPlatformBot/1.0)',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (storeApiRes.ok) {
      const storeData = await storeApiRes.json().catch(() => null);
      if (Array.isArray(storeData)) return true;
    }
  } catch {
    // Probe timeout / network error
  }
  return false;
}

/**
 * Inspects homepage HTML for meta generator tags, script references, or styling classes.
 */
async function probeHomepageFallback(baseUrl: string): Promise<DetectedPlatform> {
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskPlatformBot/1.0)',
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    // Check headers for platform identifiers
    const serverHeader = (res.headers.get('server') || '').toLowerCase();
    if (serverHeader.includes('cloudflare') && res.headers.get('x-shopid')) {
      return 'shopify';
    }

    if (res.ok) {
      const html = (await res.text().catch(() => '')).toLowerCase();

      // Check Shopify signatures
      if (
        html.includes('cdn.shopify.com') ||
        html.includes('shopify.theme') ||
        html.includes('window.shopify') ||
        html.includes('shopify-section') ||
        html.includes('shopify-features')
      ) {
        return 'shopify';
      }

      // Check WooCommerce signatures
      if (
        html.includes('name="generator" content="woocommerce') ||
        html.includes('woocommerce-general') ||
        html.includes('woocommerce-no-js') ||
        html.includes('wc-ajax') ||
        html.includes('class="woocommerce')
      ) {
        return 'woocommerce';
      }

      // Check D2C Media automotive signatures
      if (
        html.includes('d2cmedia.ca') ||
        html.includes("d2c media") ||
        html.includes('/ajax/detailsview') ||
        html.includes('images.d2cmedia.ca')
      ) {
        return 'd2cmedia';
      }

      // Check Dealer.com automotive signatures
      if (
        html.includes('dealer.com') ||
        html.includes('ddc-') ||
        html.includes('dealerdotcom')
      ) {
        return 'dealer_dot_com';
      }

      // Check Dealer Inspire automotive signatures
      if (
        html.includes('dealerinspire.com') ||
        html.includes('dealer inspire')
      ) {
        return 'dealer_inspire';
      }
    }
  } catch {
    // Probe timeout / network error
  }
  return 'unknown';
}
