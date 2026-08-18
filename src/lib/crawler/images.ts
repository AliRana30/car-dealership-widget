/**
 * Responsive Image and CDN Detection Helpers
 *
 * Handles srcset and <picture> variant resolution to extract highest-resolution
 * original images and identifies CDN sources (Shopify, Cloudinary, Bunny, etc.)
 */

export interface ProcessedImages {
  imageUrls: string[];
  imageSource?: string;
}

/**
 * Parses a standard HTML srcset string and returns candidates sorted by resolution (descending).
 * Handles both width descriptors (e.g. '1200w') and density descriptors (e.g. '2x').
 */
export function parseSrcset(srcset: string, baseUrl?: string): { url: string; descriptor: number }[] {
  if (!srcset || typeof srcset !== 'string') return [];

  const candidates: { url: string; descriptor: number }[] = [];
  // Split on commas that are followed by spaces / URLs (avoid splitting commas in data URIs)
  const parts = srcset.trim().split(/,\s+(?=[^,]+)/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // Match "url [descriptor]" e.g. "https://example.com/pic.jpg 1200w" or "pic.jpg 2x"
    const match = trimmed.match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?$/i);
    if (match) {
      let rawUrl = match[1];
      const val = match[2] ? parseFloat(match[2]) : 1;
      const unit = match[3] ? match[3].toLowerCase() : 'x';

      // Width descriptor (e.g. 1920w) or pixel density multiplier (e.g. 2x -> 2000 weight)
      const descriptor = unit === 'w' ? val : val * 1000;

      const resolved = resolveUrl(rawUrl, baseUrl);
      if (resolved && isValidImageUrl(resolved)) {
        candidates.push({ url: resolved, descriptor });
      }
    } else {
      const resolved = resolveUrl(trimmed, baseUrl);
      if (resolved && isValidImageUrl(resolved)) {
        candidates.push({ url: resolved, descriptor: 1 });
      }
    }
  }

  // Sort highest resolution first
  return candidates.sort((a, b) => b.descriptor - a.descriptor);
}

/**
 * Returns the highest resolution URL from a single URL or srcset string.
 */
export function getHighestResImageUrl(urlOrSrcset: string, baseUrl?: string): string {
  if (!urlOrSrcset || typeof urlOrSrcset !== 'string') return '';
  const trimmed = urlOrSrcset.trim();

  // Check if this string is a srcset containing multiple descriptors
  if (trimmed.includes(',') && /\s+\d+[wx]/i.test(trimmed)) {
    const candidates = parseSrcset(trimmed, baseUrl);
    if (candidates.length > 0) {
      return candidates[0].url;
    }
  }

  const resolved = resolveUrl(trimmed, baseUrl);
  return isValidImageUrl(resolved) ? resolved : '';
}

/**
 * Detects if an image URL is hosted on a recognized CDN.
 * Returns an informational vendor label (e.g. 'shopify', 'cloudinary', 'bunny', etc.) or null.
 */
export function detectImageCdn(url: string): string | null {
  if (!url || typeof url !== 'string') return null;

  try {
    const normalized = url.toLowerCase();
    const hostname = new URL(url.startsWith('//') ? `https:${url}` : url).hostname.toLowerCase();

    // Shopify CDN
    if (
      hostname.includes('cdn.shopify.com') ||
      hostname.includes('shopify.com') ||
      normalized.includes('/cdn/shop/files/') ||
      normalized.includes('/cdn/shop/products/')
    ) {
      return 'shopify';
    }

    // Cloudinary
    if (hostname.includes('cloudinary.com') || hostname.includes('res.cloudinary.com')) {
      return 'cloudinary';
    }

    // Bunny CDN
    if (hostname.includes('b-cdn.net') || hostname.includes('bunnycdn.com') || hostname.includes('bunny.net')) {
      return 'bunny';
    }

    // ImageKit
    if (hostname.includes('ik.imagekit.io') || hostname.includes('imagekit.io')) {
      return 'imagekit';
    }

    // Cloudflare Images / CDN
    if (hostname.includes('imagedelivery.net') || hostname.includes('cloudflare.com')) {
      return 'cloudflare';
    }

    // AWS CloudFront
    if (hostname.includes('cloudfront.net')) {
      return 'cloudfront';
    }

    // Fastly
    if (hostname.includes('fastly.net') || hostname.includes('fastlylb.net')) {
      return 'fastly';
    }

    // Imgix
    if (hostname.includes('imgix.net')) {
      return 'imgix';
    }

    // Akamai
    if (hostname.includes('akamaihd.net') || hostname.includes('akamaized.net')) {
      return 'akamai';
    }

    // WordPress / Jetpack CDN
    if (hostname.includes('i0.wp.com') || hostname.includes('i1.wp.com') || hostname.includes('i2.wp.com')) {
      return 'wordpress';
    }
  } catch {
    // URL parsing fallback
    const lower = url.toLowerCase();
    if (lower.includes('cdn.shopify.com')) return 'shopify';
    if (lower.includes('cloudinary.com')) return 'cloudinary';
    if (lower.includes('b-cdn.net')) return 'bunny';
    if (lower.includes('imagekit.io')) return 'imagekit';
    if (lower.includes('cloudfront.net')) return 'cloudfront';
    if (lower.includes('imagedelivery.net')) return 'cloudflare';
  }

  return null;
}

/**
 * Processes an array of raw image objects / strings, resolving responsive srcset variants,
 * selecting the highest-resolution URLs, and detecting the CDN source.
 */
export function processEntityImages(rawImages: any[], baseUrl?: string): ProcessedImages {
  if (!Array.isArray(rawImages) || rawImages.length === 0) {
    return { imageUrls: [] };
  }

  const resolvedUrls: string[] = [];
  let detectedSource: string | undefined = undefined;

  for (const item of rawImages) {
    if (!item) continue;

    let candidateUrl = '';
    if (typeof item === 'string') {
      candidateUrl = getHighestResImageUrl(item, baseUrl);
    } else if (typeof item === 'object') {
      if (item.srcset && typeof item.srcset === 'string') {
        candidateUrl = getHighestResImageUrl(item.srcset, baseUrl);
      }
      if (!candidateUrl && item.url && typeof item.url === 'string') {
        candidateUrl = getHighestResImageUrl(item.url, baseUrl);
      }
      if (!candidateUrl && item.src && typeof item.src === 'string') {
        candidateUrl = getHighestResImageUrl(item.src, baseUrl);
      }
      if (!candidateUrl && item.image && typeof item.image === 'string') {
        candidateUrl = getHighestResImageUrl(item.image, baseUrl);
      }
    }

    if (candidateUrl && !resolvedUrls.includes(candidateUrl)) {
      resolvedUrls.push(candidateUrl);

      // Detect CDN source from first recognizable image URL
      if (!detectedSource) {
        const cdn = detectImageCdn(candidateUrl);
        if (cdn) detectedSource = cdn;
      }
    }
  }

  return {
    imageUrls: resolvedUrls,
    ...(detectedSource ? { imageSource: detectedSource } : {}),
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function resolveUrl(url: string, baseUrl?: string): string {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim();

  // Handle protocol-relative URL
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  if (baseUrl) {
    try {
      return new URL(trimmed, baseUrl).href;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function isValidImageUrl(url: string): boolean {
  if (!url) return false;
  // Ignore 1x1 tracking pixels, data URIs with transparent GIFs, and SVGs icons when real photos exist
  if (url.startsWith('data:image/gif;base64,R0lGODlhAQABA')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}
