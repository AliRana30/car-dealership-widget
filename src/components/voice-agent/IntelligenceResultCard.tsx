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

function AvailabilityBadge({ value }: { value: string }) {
  const lower = value.toLowerCase();
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
      {value}
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
  const valid = images.filter(Boolean).slice(0, 4);
  if (valid.length === 0) return null;

  return (
    <div style={{ marginBottom: '10px' }}>
      {/* Main image */}
      <div style={{
        width: '100%', height: '120px', borderRadius: '8px',
        overflow: 'hidden', background: '#F1F5F9',
        position: 'relative',
      }}>
        <img
          src={valid[activeIdx]}
          alt={title || 'Result image'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
  const hasImages = images.length > 0;

  const rawPrice = (result as any).price ?? meta.price;
  const price = typeof rawPrice === 'object' ? undefined : rawPrice;

  const currency = typeof (result as any).currency === 'string' ? (result as any).currency : typeof meta.currency === 'string' ? meta.currency : 'USD';
  
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

  const rawSourceUrl = (result as any).sourceUrl || (result as any).source_url || meta.sourceUrl;
  const sourceUrl = typeof rawSourceUrl === 'string' ? rawSourceUrl : undefined;
  const entityType = typeof result.entityType === 'string' ? result.entityType : 'Info';

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

  const categoryTag = meta.category || (result as any).category || (entityType !== 'text' && entityType !== 'Info' ? entityType : '');
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
        <div style={{ position: 'relative', width: '100%', height: '110px', background: '#F1F5F9', overflow: 'hidden' }}>
          <img
            src={images[0]}
            alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
              background: '#10B981', color: '#FFFFFF',
              padding: '3px 8px', borderRadius: '8px', fontSize: '12px',
              fontWeight: 800, letterSpacing: '-0.01em',
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
            }}>
              {formatPrice(price, currency)}
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
              <span style={{
                background: '#10B981', color: '#FFFFFF',
                padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800,
              }}>
                {formatPrice(price, currency)}
              </span>
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

        {/* Bottom Row: Rating / Level on left, Open Page > on right */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: '4px', paddingTop: '4px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#64748B' }}>
            {hasRating ? (
              <span style={{ fontWeight: 600, color: '#0F172A' }}>★ {Number(rating).toFixed(0)}</span>
            ) : (
              <span style={{ fontWeight: 600, color: '#0F172A' }}>★ 5</span>
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
                gap: '3px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--voice-widget-primary, #2F8FE0)',
                textDecoration: 'none',
              }}
            >
              Open Page ›
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
