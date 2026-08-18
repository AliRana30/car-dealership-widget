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
  'imageSource',
  'shopifyId',
  'wooId',
  'variants',
  'description',
  'price',
  'currency',
  'availability',
  'rating',
  'reviews',
  'tags',
]);

function formatPrice(price: string | number, currency?: string): string {
  const symbol = currency
    ? { USD: '$', GBP: '£', EUR: '€', PKR: '₨', INR: '₹', CAD: 'CA$', AUD: 'A$' }[currency.toUpperCase()] || currency + ' '
    : '$';
  return `${symbol}${price}`;
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
  const num = typeof rating === 'string' ? parseFloat(rating) : rating;
  if (isNaN(num)) return <span style={{ fontSize: '11px', color: '#64748B' }}>{rating}</span>;
  const full = Math.floor(num);
  const half = num - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
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

  const title = result.title || '';
  const description =
    (result as any).shortDescription ||
    (result as any).description ||
    (meta.description as string) ||
    '';

  const rawImages =
    (result as any).imageUrls ||
    (result as any).images ||
    (meta.images as string[]) ||
    (meta.image ? [String(meta.image)] : []);

  const images = Array.isArray(rawImages) ? rawImages.filter(Boolean) : [];
  const hasImages = images.length > 0;

  const price = (result as any).price ?? meta.price;
  const currency = (result as any).currency || meta.currency || 'USD';
  const availability = (result as any).availability || meta.availability;
  const rating = (result as any).rating ?? meta.rating;
  const reviews = (result as any).reviews ?? meta.reviews;
  const sourceUrl = (result as any).sourceUrl || (result as any).source_url || meta.sourceUrl;
  const entityType = result.entityType || 'Info';

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
    if (typeof v === 'object') return false;
    return true;
  });

  const hasDetails = detailEntries.length > 0;

  return (
    <div style={{
      background: 'var(--voice-widget-bg-agent-bubble, #FFFFFF)',
      border: '1px solid var(--voice-widget-border, rgba(14,27,42,0.1))',
      borderRadius: '12px',
      overflow: 'hidden',
      marginTop: '6px',
      boxShadow: '0 2px 8px rgba(14,27,42,0.06)',
      width: '100%',
      maxWidth: '100%',
    }}>
      {/* Entity type header */}
      {entityType && (
        <div style={{
          background: 'rgba(47,143,224,0.07)',
          borderBottom: '1px solid rgba(47,143,224,0.13)',
          padding: '4px 10px',
          fontSize: '9px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: primaryColor,
        }}>
          {entityType === 'text' ? 'Website Info' : entityType}
        </div>
      )}

      <div style={{ padding: '10px 12px' }}>
        {/* Responsive Image gallery (gracefully omitted if no images) */}
        {hasImages && <ImageGallery images={images} title={title} />}

        {/* Title */}
        {title && (
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--voice-widget-text, #0E1B2A)',
            lineHeight: '1.3',
            marginBottom: '4px',
          }}>
            {title}
          </div>
        )}

        {/* Description */}
        {description && (
          <div style={{
            fontSize: '11px',
            color: 'var(--voice-widget-text-muted, #64748B)',
            lineHeight: '1.5',
            marginBottom: '8px',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {description}
          </div>
        )}

        {/* Price & availability */}
        {(hasPrice || availability) && (
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '4px',
          }}>
            {hasPrice && (
              <span style={{
                fontSize: '15px',
                fontWeight: 800,
                color: primaryColor,
                letterSpacing: '-0.01em',
              }}>
                {formatPrice(price, currency)}
              </span>
            )}
            {availability && <AvailabilityBadge value={String(availability)} />}
          </div>
        )}

        {/* Rating & reviews */}
        {(hasRating || reviews) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: '8px', flexWrap: 'wrap',
          }}>
            {hasRating && <StarRating rating={rating} />}
            {reviews && (
              <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                ({typeof reviews === 'number' ? reviews.toLocaleString() : reviews} reviews)
              </span>
            )}
          </div>
        )}

        {/* Generic Details List from metadata */}
        {hasDetails && (
          <div style={{
            background: 'rgba(14,27,42,0.02)',
            borderRadius: '8px',
            padding: '8px 10px',
            marginBottom: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            {detailEntries.map(([key, val]) => (
              <div key={key} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', gap: '8px',
              }}>
                <span style={{
                  fontSize: '10px', fontWeight: 600, color: '#64748B',
                  flexShrink: 0, lineHeight: '1.4',
                }}>
                  {formatKeyLabel(key)}
                </span>
                <span style={{
                  fontSize: '10px', color: 'var(--voice-widget-text, #0E1B2A)',
                  fontWeight: 500, textAlign: 'right', lineHeight: '1.4',
                }}>
                  {String(val)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* View full details (Opens safely in new tab) */}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '8px',
              background: primaryColor,
              color: '#FFFFFF',
              fontSize: '11px', fontWeight: 700,
              textDecoration: 'none',
              marginTop: '4px',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1'; }}
          >
            View full details
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
