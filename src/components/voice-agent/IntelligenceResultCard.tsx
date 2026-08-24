import React, { useState } from 'react';
import { Entity } from '@/lib/crawler/types';

export interface WebsiteDataResult {
  id?: string;
  title?: string;
  shortDescription?: string;
  description?: string;
  imageUrls?: string[];
  images?: string[];
  price?: string | number;
  currency?: string;
  availability?: string;
  rating?: number | string;
  reviews?: number | string;
  attributes?: Record<string, string | number | boolean>;
  sourceUrl?: string;
  entityType?: string;
  metadata?: Record<string, any>;
}

interface IntelligenceResultCardProps {
  result: WebsiteDataResult | Entity;
  primaryColor?: string;
}

const METADATA_LABEL_MAP: Record<string, string> = {
  durationMinutes: 'Duration',
  duration: 'Duration',
  mileage: 'Mileage',
  vin: 'VIN',
  year: 'Year',
  make: 'Make',
  model: 'Model',
  trim: 'Trim',
  color: 'Color',
  transmission: 'Transmission',
  fuelType: 'Fuel Type',
  engine: 'Engine',
  sku: 'SKU',
  brand: 'Brand',
  vendor: 'Vendor',
  instructor: 'Instructor',
  location: 'Location',
  specialty: 'Specialty',
  doctor: 'Practitioner',
  practitioner: 'Practitioner',
  capacity: 'Capacity',
  warranty: 'Warranty',
  condition: 'Condition',
  weight: 'Weight',
  dimensions: 'Dimensions',
  material: 'Material',
  category: 'Category',
  author: 'Author',
  department: 'Department',
};

const IGNORED_METADATA_KEYS = new Set([
  'images',
  'image',
  'imageUrls',
  'imageSource',
  'shopifyId',
  'wooId',
  'variants',
  'description',
  'shortDescription',
  'price',
  'estimatedPrice',
  'estimated_price',
  'currency',
  'availability',
  'rating',
  'ratings',
  'reviews',
  'tags',
  'first_seen',
  'last_seen',
  'still_listed',
  'firstSeen',
  'lastSeen',
  'stillListed',
  'freshnessStatus',
  'lastSeenHuman',
  'hedgeInstruction',
  'id',
  '_id',
  'v',
  '__v',
  'apiEndpoint',
  'api_endpoint',
  'demoUrl',
  'demo_url',
  'discoveryMethod',
  'discovery_method',
  'discovery_source',
  'purchased',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
  'sources',
  'source',
  'source_url',
  'sourceUrl',
  'raw',
  'rawContent',
  'content',
]);

function formatPrice(price: string | number, currency?: string): string {
  const str = String(price).trim();
  if (!str) return '';
  // If price already contains a currency prefix ($150, £90, €50, CA$100, etc.), return cleanly
  if (/^[\$\£\€\₨\₹]/.test(str) || str.toLowerCase().startsWith('ca$') || str.toLowerCase().startsWith('a$') || str.toLowerCase().startsWith('usd')) {
    return str;
  }
  const symbol = currency
    ? { USD: '$', GBP: '£', EUR: '€', PKR: '₨', INR: '₹', CAD: 'CA$', AUD: 'A$' }[currency.toUpperCase()] || currency + ' '
    : '$';
  return `${symbol}${str}`;
}

function AvailabilityBadge({
  value,
  freshnessStatus,
  stillListed,
}: {
  value?: string;
  freshnessStatus?: string;
  stillListed?: boolean;
}) {
  if (stillListed === false || freshnessStatus === 'stale_or_unlisted') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '2px 8px', borderRadius: '999px',
        background: '#FFFBEB', color: '#B45309', fontSize: '10px', fontWeight: 700,
        border: '1px solid rgba(245, 158, 11, 0.25)',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
        {stillListed === false ? 'Unlisted' : 'Confirm with staff'}
      </span>
    );
  }

  const val = value || 'In Stock';
  const lower = val.toLowerCase();
  let bg = '#E8F5E9', color = '#2E7D32', dot = '#4CAF50';
  if (lower.includes('out') || lower.includes('unavail') || lower.includes('sold')) {
    bg = '#FFEBEE'; color = '#C62828'; dot = '#E53935';
  } else if (lower.includes('limited') || lower.includes('low') || lower.includes('few')) {
    bg = '#FFF8E1'; color = '#F57F17'; dot = '#FFC107';
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '2px 8px', borderRadius: '999px',
      background: bg, color, fontSize: '10px', fontWeight: 700,
      border: `1px solid ${dot}33`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />
      {val}
    </span>
  );
}

function StarRating({ rating }: { rating: number | string }) {
  if (typeof rating === 'object' && rating !== null) return null;
  const num = typeof rating === 'string' ? parseFloat(rating) : rating;
  if (isNaN(num)) return <span style={{ fontSize: '11px', color: '#64748B' }}>{String(rating)}</span>;
  const full = Math.floor(num);
  const half = num - full >= 0.5;
  const empty = Math.max(0, 5 - full - (half ? 1 : 0));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {Array.from({ length: full }).map((_, i) => (
        <span key={`f${i}`} style={{ color: '#F59E0B', fontSize: '12px' }}>★</span>
      ))}
      {half && <span style={{ color: '#F59E0B', fontSize: '12px' }}>☆</span>}
      {Array.from({ length: empty }).map((_, i) => (
        <span key={`e${i}`} style={{ color: '#CBD5E1', fontSize: '12px' }}>★</span>
      ))}
      <span style={{ fontSize: '11px', color: '#64748B', marginLeft: 3 }}>{num.toFixed(1)}</span>
    </span>
  );
}

function ImageGallery({ images, title }: { images: string[]; title?: string }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());

  const valid = images.filter((src, idx) => Boolean(src) && !failedImages.has(idx)).slice(0, 4);
  if (valid.length === 0) return null;

  const currentSrc = valid[Math.min(activeIdx, valid.length - 1)];

  return (
    <div style={{ marginBottom: '10px' }}>
      {/* Main image */}
      <div style={{
        width: '100%', height: '120px', borderRadius: '8px',
        overflow: 'hidden', background: '#F1F5F9',
        position: 'relative',
      }}>
        <img
          src={currentSrc}
          alt={title || 'Result image'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => {
            setFailedImages((prev) => new Set(prev).add(activeIdx));
          }}
        />
      </div>
      {/* Thumbnails */}
      {valid.length > 1 && (
        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
          {valid.map((src, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              style={{
                width: '32px', height: '32px', borderRadius: '6px',
                overflow: 'hidden', padding: 0, cursor: 'pointer',
                border: `2px solid ${i === activeIdx ? '#2F8FE0' : 'transparent'}`,
                flexShrink: 0, background: '#F1F5F9',
              }}
            >
              <img
                src={src}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => {
                  setFailedImages((prev) => new Set(prev).add(i));
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatKeyLabel(key: string): string {
  if (METADATA_LABEL_MAP[key]) return METADATA_LABEL_MAP[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

export default function IntelligenceResultCard({ result, primaryColor = '#2F8FE0' }: IntelligenceResultCardProps) {
  const meta = (result.metadata || {}) as Record<string, any>;

  const title = typeof result.title === 'string' ? result.title : '';
  const description =
    typeof (result as any).shortDescription === 'string'
      ? (result as any).shortDescription
      : typeof (result as any).description === 'string'
      ? (result as any).description
      : typeof meta.description === 'string'
      ? meta.description
      : '';

  const rawImages =
    (result as any).imageUrls ||
    (result as any).images ||
    (meta.images as string[]) ||
    (meta.image ? [String(meta.image)] : []);

  const images = Array.isArray(rawImages) ? rawImages.filter(img => typeof img === 'string' && img.length > 0) : [];
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [bannerFailed, setBannerFailed] = useState(false);
  const hasImages = images.length > 0 && !bannerFailed;
  const currentBannerImage = images[Math.min(activeImageIdx, images.length - 1)] || images[0];

  const rawPrice = (result as any).price ?? meta.price;
  const price = typeof rawPrice === 'object' ? undefined : rawPrice;

  const rawOriginalPrice = (result as any).originalPrice ?? (result as any).original_price ?? meta.originalPrice ?? meta.original_price ?? meta.compareAtPrice ?? meta.msrp;
  const originalPrice = typeof rawOriginalPrice === 'object' ? undefined : rawOriginalPrice;
  const hasOriginalPrice = originalPrice !== undefined && originalPrice !== null && originalPrice !== '' && String(originalPrice) !== String(price);

  const currency = typeof (result as any).currency === 'string' ? (result as any).currency : typeof meta.currency === 'string' ? meta.currency : undefined;
  
  const rawAvailability = (result as any).availability ?? meta.availability;
  const availability = typeof rawAvailability === 'object' ? undefined : (rawAvailability ? String(rawAvailability) : undefined);

  const rawRating = (result as any).rating ?? meta.rating;
  const rating = typeof rawRating === 'object' ? undefined : rawRating;

  const rawReviews = (result as any).reviews ?? meta.reviews;
  let reviewsCount: number | string | undefined = undefined;
  if (Array.isArray(rawReviews)) {
    reviewsCount = rawReviews.length;
  } else if (typeof rawReviews === 'number' || typeof rawReviews === 'string') {
    reviewsCount = rawReviews;
  }

  const rawSourceUrl = (result as any).canonicalUrl || (result as any).sourceUrl || (result as any).source_url || meta.sourceUrl;
  const sourceUrl = typeof rawSourceUrl === 'string' ? rawSourceUrl : undefined;
  const entityType = typeof result.entityType === 'string' ? result.entityType : typeof (result as any).type === 'string' ? (result as any).type : 'Info';

  const hasPrice = price !== undefined && price !== null && price !== '';
  const hasRating = rating !== undefined && rating !== null && rating !== '';

  // Collect generic detail attributes from metadata and attributes dict
  const rawAttributes = {
    ...(meta || {}),
    ...((result as any).attributes || {}),
  };

  const detailEntries = Object.entries(rawAttributes).filter(([k, v]) => {
    if (IGNORED_METADATA_KEYS.has(k)) return false;
    if (v === null || v === undefined || v === '') return false;
    if (typeof v === 'object' || typeof v === 'function' || Array.isArray(v)) return false;
    return true;
  });

  const hasDetails = detailEntries.length > 0;

  const categoryTag = meta.category || (result as any).category || (entityType !== 'text' && entityType !== 'Info' && entityType !== 'product' ? entityType : '');
  const levelTag = meta.level || (result as any).level || '';

  const handleCardClick = (e: React.MouseEvent) => {
    if (sourceUrl) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'voice-agent-navigate', url: sourceUrl }, '*');
      }
    }
  };

  return (
    <div
      style={{
        background: 'var(--voice-widget-bg-agent-bubble, #FFFFFF)',
        border: '1px solid var(--voice-widget-border, #E2E8F0)',
        borderRadius: '14px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(14,27,42,0.05)',
        width: '100%',
        boxSizing: 'border-box',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Top Banner Image with Badges */}
      {hasImages ? (
        <div>
          <div style={{ position: 'relative', width: '100%', height: '110px', background: '#F1F5F9', overflow: 'hidden' }}>
            <img
              src={currentBannerImage}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'opacity 0.2s ease' }}
              onError={() => setBannerFailed(true)}
            />
            {categoryTag && (
              <div style={{
                position: 'absolute', bottom: '8px', left: '8px',
                background: 'rgba(15, 23, 42, 0.88)', color: '#FFFFFF',
                padding: '2px 8px', borderRadius: '6px', fontSize: '10px',
                fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                backdropFilter: 'blur(4px)',
              }}>
                {String(categoryTag)}
              </div>
            )}
            {hasPrice && (
              <div style={{
                position: 'absolute', top: '8px', right: '8px',
                display: 'flex', alignItems: 'center', gap: '4px',
                background: '#10B981', color: '#FFFFFF',
                padding: '3px 8px', borderRadius: '8px', fontSize: '12px',
                fontWeight: 800, letterSpacing: '-0.01em',
                boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
              }}>
                {hasOriginalPrice && (
                  <span style={{ textDecoration: 'line-through', opacity: 0.75, fontSize: '10px', fontWeight: 600 }}>
                    {formatPrice(originalPrice, currency)}
                  </span>
                )}
                <span>{formatPrice(price, currency)}</span>
              </div>
            )}
          </div>
          {/* Multi-image thumbnail gallery */}
          {images.length > 1 && (
            <div style={{ display: 'flex', gap: '4px', padding: '6px 10px 0 10px', overflowX: 'auto' }}>
              {images.slice(0, 5).map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImageIdx(i)}
                  style={{
                    width: '28px', height: '28px', borderRadius: '4px',
                    overflow: 'hidden', padding: 0, cursor: 'pointer',
                    border: `2px solid ${i === activeImageIdx ? primaryColor : 'transparent'}`,
                    flexShrink: 0, background: '#F1F5F9',
                  }}
                >
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Minimal Top Bar if no image */
        (categoryTag || hasPrice) && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', background: 'rgba(14,27,42,0.03)',
            borderBottom: '1px solid var(--voice-widget-border, #E2E8F0)',
          }}>
            {categoryTag ? (
              <span style={{
                background: 'rgba(15, 23, 42, 0.08)', color: 'var(--voice-widget-text, #0F172A)',
                padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                textTransform: 'uppercase',
              }}>
                {String(categoryTag)}
              </span>
            ) : <span />}
            {hasPrice && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: '#10B981', color: '#FFFFFF',
                padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800,
              }}>
                {hasOriginalPrice && (
                  <span style={{ textDecoration: 'line-through', opacity: 0.75, fontSize: '9px', fontWeight: 600 }}>
                    {formatPrice(originalPrice, currency)}
                  </span>
                )}
                <span>{formatPrice(price, currency)}</span>
              </div>
            )}
          </div>
        )
      )}

      {/* Card Content Body */}
      <div style={{ padding: '10px 12px' }}>
        {/* Title */}
        {title && (
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--voice-widget-text, #0F172A)',
            lineHeight: '1.3',
            marginBottom: '3px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {title}
          </div>
        )}

        {/* 2-line Description */}
        {description && (
          <div style={{
            fontSize: '11px',
            color: 'var(--voice-widget-text-muted, #64748B)',
            lineHeight: '1.4',
            marginBottom: '8px',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {description}
          </div>
        )}

        {/* Structured Metadata Specs Grid */}
        {hasDetails && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '4px 12px',
            background: 'rgba(14, 27, 42, 0.03)',
            padding: '8px 10px',
            borderRadius: '8px',
            margin: '6px 0 10px 0',
            fontSize: '11px',
            border: '1px solid rgba(14, 27, 42, 0.06)',
          }}>
            {detailEntries.slice(0, 6).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--voice-widget-text-muted, #64748B)', fontWeight: 500 }}>{formatKeyLabel(k)}</span>
                <span style={{ color: 'var(--voice-widget-text, #0F172A)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '90px' }}>
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom CTA Row: Rating / Availability on left, View on site button on right */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(14, 27, 42, 0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#64748B' }}>
            {hasRating ? (
              <StarRating rating={rating!} />
            ) : availability || (result as any).freshnessStatus || (result as any).freshness || meta.freshnessStatus ? (
              <AvailabilityBadge
                value={availability}
                freshnessStatus={(result as any).freshnessStatus || (result as any).freshness || meta.freshnessStatus}
                stillListed={(result as any).stillListed !== false && (result as any).still_listed !== false && meta.stillListed !== false && meta.still_listed !== false}
              />
            ) : (
              <span />
            )}
            {levelTag && <span>• {String(levelTag).toLowerCase()}</span>}
            {reviewsCount !== undefined && !levelTag && <span>• ({String(reviewsCount)} reviews)</span>}
          </div>

          {sourceUrl && (
            <a
              href={sourceUrl}
              onClick={handleCardClick}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '999px',
                background: 'var(--voice-widget-primary, #2F8FE0)',
                color: '#FFFFFF',
                fontSize: '11.5px',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 2px 6px rgba(37,99,235,0.2)',
                transition: 'all 0.15s ease',
              }}
            >
              <span>↗ View on site</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
