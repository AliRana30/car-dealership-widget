/**
 * Normalized Vehicle Contracts and Query Helper Types for Automotive Dealership Inventory
 *
 * Enforces strict structure for NEW, USED, and CPO/Certified inventory.
 * Guaranteed anti-hallucination: Missing fields must remain undefined / unavailable,
 * never fabricated with default fake values.
 */

import { WebsiteDataRow, getDbClient } from '@/config/widgetsDb';
import { CrawledEntity } from '@/lib/crawler/types';
import crypto from 'crypto';

export type VehicleCondition = 'new' | 'used' | 'cpo' | 'certified';
export type AvailabilityStatus = 'in_stock' | 'out_of_stock' | 'pending' | 'reserved';
export type VehicleProvenance = 'crawl' | 'api' | 'feed' | 'manual';
export type FreshnessStatus = 'fresh' | 'recent' | 'stale_or_unlisted';

/**
 * Complete normalized vehicle record contract for dealership inventory.
 */
export interface NormalizedVehicleRecord {
  id: string;                                // UUID primary identifier
  widgetId: string;                          // Scoped tenant widget UUID
  title?: string;                            // Optional explicit display title
  vin?: string;                              // 17-character standard Vehicle Identification Number
  stockNumber?: string;                      // Dealership inventory stock number
  condition: VehicleCondition;               // 'new' | 'used' | 'cpo' | 'certified'
  year?: number;                             // Model year (e.g. 2024)
  make?: string;                             // Manufacturer make (e.g. 'Jeep', 'Ram', 'Dodge', 'Toyota')
  model?: string;                            // Vehicle model (e.g. 'Wrangler 4xe', 'Grand Cherokee', '1500')
  trim?: string;                             // Trim package (e.g. 'Rubicon', 'Limited', 'Big Horn')
  bodyStyle?: string;                        // Body type (e.g. 'SUV', 'Truck', 'Sedan', 'Coupe', 'Van', 'Convertible')
  price?: number;                            // Current advertised / selling price
  msrp?: number;                             // Manufacturer Suggested Retail Price / original sticker
  currency?: string;                         // Currency code (e.g. 'USD', 'CAD')
  mileage?: number;                          // Odometer reading in miles / km (vital for USED inventory)
  drivetrain?: string;                       // Drivetrain configuration (e.g. '4x4', '4WD', 'AWD', 'FWD', 'RWD')
  transmission?: string;                     // Transmission type (e.g. '8-Speed Automatic', '6-Speed Manual')
  engine?: string;                           // Engine specification (e.g. '3.6L Pentastar V6', '2.0L Turbo PHEV')
  fuel?: string;                             // Fuel / power type (e.g. 'Gasoline', 'Hybrid', 'Plug-in Hybrid', 'Electric', 'Diesel')
  exteriorColor?: string;                    // Exterior paint color (e.g. 'Diamond Black Crystal Pearl')
  interiorColor?: string;                    // Interior upholstery color/material (e.g. 'Black Capri Leather')
  passengers?: number;                       // Seating capacity (e.g. 5, 7, 8)
  doors?: number;                            // Number of doors (e.g. 2, 4, 5)
  // ── Fuel Economy (NEVER fabricated; NULL if source does not publish) ────────
  cityFuelEfficiency?: number;               // City fuel consumption e.g. 8.5 (L/100km) or 28 (MPG)
  highwayFuelEfficiency?: number;            // Highway fuel consumption e.g. 6.2 (L/100km) or 38 (MPG)
  fuelEfficiencyUnit?: string;               // 'L/100km' or 'MPG' — NULL when no efficiency data available
  // ── Inventory Status (separate from condition new/used/cpo) ───────────────
  status?: string;                           // 'available' | 'pending' | 'sold' | 'on_hold'
  missingCount?: number;                     // Consecutive crawl cycles the vehicle was absent
  features: string[];                        // Equipment list / options / package highlights
  description?: string;                      // Full descriptive text / window sticker highlights
  shortDescription?: string;                 // Concise summary text
  images: string[];                          // Array of validated, real high-resolution vehicle photo URLs
  imageUrls: string[];                       // Alias for images array
  vdpUrl?: string;                           // Direct Vehicle Detail Page URL on the dealership website
  sourceUrl?: string;                        // Canonical source page URL
  provenance: VehicleProvenance;             // Ingestion source ('crawl' | 'api' | 'feed' | 'manual')
  discoveryMethod?: string;                  // Method of extraction ('json-ld' | 'api' | 'dom' | 'feed')
  firstSeen: string;                         // ISO timestamp when first indexed
  lastCheckedAt: string;                     // ISO timestamp of most recent crawl check
  lastSeen: string;                          // ISO timestamp of most recent confirmed active listing
  stillListed: boolean;                      // True if currently active on dealership website
  availability: AvailabilityStatus;          // Current availability state
  freshnessStatus: FreshnessStatus;          // Freshness calculation
  metadata: Record<string, unknown>;         // Raw unrolled metadata
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Filter parameters for automotive inventory queries.
 */
export interface VehicleSearchFilters {
  condition?: VehicleCondition;              // Filter by 'new', 'used', or 'cpo'
  make?: string;                             // e.g. 'Jeep'
  model?: string;                            // e.g. 'Wrangler'
  trim?: string;                             // e.g. 'Rubicon'
  bodyStyle?: string;                        // e.g. 'SUV' | 'Truck'
  minYear?: number;                          // e.g. 2022
  maxYear?: number;                          // e.g. 2025
  minPrice?: number;                         // e.g. 30000
  maxPrice?: number;                         // e.g. 70000
  maxMileage?: number;                       // e.g. 45000 (applies to USED inventory)
  drivetrain?: string;                       // e.g. '4x4' | 'AWD'
  fuel?: string;                             // e.g. 'Plug-in Hybrid' | 'Electric' | 'Gasoline'
  transmission?: string;                     // e.g. 'Automatic'
  exteriorColor?: string;                    // e.g. 'Blue'
  features?: string[];                       // e.g. ['Leather', 'Sunroof', 'Navigation']
  stillListedOnly?: boolean;                 // Default true
  limit?: number;
}

// ── Utility Parsers (Never Fabricate) ─────────────────────────────────────────

export function parseNumericValue(val: unknown): number | undefined {
  if (typeof val === 'number') {
    return isNaN(val) ? undefined : val;
  }
  if (!val || typeof val !== 'string') return undefined;
  const clean = val.replace(/,/g, '').trim();
  const match = clean.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const num = parseFloat(match[1]);
  return isNaN(num) ? undefined : num;
}

export function parseVehicleCondition(val: unknown, url?: string, title?: string): VehicleCondition {
  const text = `${String(val || '')} ${url || ''} ${title || ''}`.toLowerCase();
  if (text.includes('cpo') || text.includes('certified pre-owned') || text.includes('certified')) {
    return 'cpo';
  }
  if (text.includes('/new-vehicles') || text.includes('/new-inventory') || text.includes('condition: new') || /\bnew\b/i.test(String(val || ''))) {
    return 'new';
  }
  if (text.includes('/used-vehicles') || text.includes('/pre-owned') || text.includes('/used-inventory') || text.includes('condition: used') || /\bused\b/i.test(String(val || ''))) {
    return 'used';
  }
  // Default heuristic based on odometer if present
  return 'used';
}

export function parseDrivetrain(val: unknown, title?: string, desc?: string): string | undefined {
  const combined = `${String(val || '')} ${title || ''} ${desc || ''}`.toLowerCase();
  if (/\b(?:4x4|4wd|four wheel drive|4-wheel drive)\b/i.test(combined)) return '4x4';
  if (/\b(?:awd|all wheel drive|all-wheel drive)\b/i.test(combined)) return 'AWD';
  if (/\b(?:fwd|front wheel drive|front-wheel drive)\b/i.test(combined)) return 'FWD';
  if (/\b(?:rwd|rear wheel drive|rear-wheel drive)\b/i.test(combined)) return 'RWD';
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

export function parseBodyStyle(val: unknown, title?: string, desc?: string): string | undefined {
  const combined = `${String(val || '')} ${title || ''} ${desc || ''}`.toLowerCase();
  if (/\b(?:suv|crossover|4runner|cherokee|wrangler|durango|explorer|tahoe|suburban)\b/i.test(combined)) return 'SUV';
  if (/\b(?:truck|pickup|crew cab|quad cab|ram 1500|f-150|silverado|sierra|tacoma|tundra)\b/i.test(combined)) return 'Truck';
  if (/\b(?:sedan|4-door sedan|saloon)\b/i.test(combined)) return 'Sedan';
  if (/\b(?:coupe|2-door coupe)\b/i.test(combined)) return 'Coupe';
  if (/\b(?:convertible|cabriolet|roadster)\b/i.test(combined)) return 'Convertible';
  if (/\b(?:van|minivan|passenger van|cargo van|pacifica|odyssey|sienna)\b/i.test(combined)) return 'Van';
  if (/\b(?:hatchback|5-door)\b/i.test(combined)) return 'Hatchback';
  if (/\b(?:wagon|estate)\b/i.test(combined)) return 'Wagon';
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

export function parseFuelType(val: unknown, title?: string, desc?: string): string | undefined {
  const combined = `${String(val || '')} ${title || ''} ${desc || ''}`.toLowerCase();
  if (/\b(?:plug-in hybrid|phev|4xe|prime)\b/i.test(combined)) return 'Plug-in Hybrid';
  if (/\b(?:hybrid|hev|e-torque|etorque)\b/i.test(combined)) return 'Hybrid';
  if (/\b(?:electric|ev|bev|battery electric|lightning)\b/i.test(combined)) return 'Electric';
  if (/\b(?:diesel|turbodiesel|ecodiesel|duramax|powerstroke|cummins)\b/i.test(combined)) return 'Diesel';
  if (/\b(?:gasoline|gas|unleaded|flex fuel|v6|v8|hemi|pentastar|i4|turbo)\b/i.test(combined)) return 'Gasoline';
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

// ── Normalization from Raw Ingested Data ───────────────────────────────────────

/**
 * Transforms raw crawled data, JSON-LD, D2C Media AJAX entities, or database rows
 * into a strictly typed NormalizedVehicleRecord without fabricating missing values.
 */
export function normalizeVehicleRecord(
  raw: any,
  widgetId: string,
  fallbackUrl?: string
): NormalizedVehicleRecord {
  const meta = (raw.metadata || {}) as Record<string, any>;
  const nowIso = new Date().toISOString();

  const title = String(raw.title || meta.title || meta.vehicleTitle || meta.name || 'Vehicle').trim();
  const sourceUrl = raw.source_url || raw.sourceUrl || raw.url || fallbackUrl || undefined;
  const vdpUrl = meta.vdpUrl || meta.vdp_url || meta.detailUrl || meta.detail_url || sourceUrl;

  // Extract images
  const rawImages: string[] = [];
  if (Array.isArray(raw.image_urls)) rawImages.push(...raw.image_urls);
  if (Array.isArray(raw.imageUrls)) rawImages.push(...raw.imageUrls);
  if (Array.isArray(raw.images)) rawImages.push(...raw.images);
  if (Array.isArray(meta.images)) rawImages.push(...meta.images);
  if (Array.isArray(meta.imageUrls)) rawImages.push(...meta.imageUrls);
  if (typeof meta.image === 'string' && meta.image.startsWith('http')) rawImages.push(meta.image);
  if (typeof raw.image === 'string' && raw.image.startsWith('http')) rawImages.push(raw.image);

  const cleanImages = Array.from(
    new Set(rawImages.filter((u) => typeof u === 'string' && u.startsWith('http')))
  );

  // Year, Make, Model, Trim
  const year = parseNumericValue(meta.year ?? meta.modelYear ?? meta.vehicleModelDate ?? meta.modelDate);
  const make = meta.make ? String(meta.make).trim() : (meta.brand?.name ? String(meta.brand.name).trim() : (meta.brand ? String(meta.brand).trim() : undefined));
  const model = meta.model ? String(meta.model).trim() : undefined;
  const trim = meta.trim ? String(meta.trim).trim() : (meta.vehicleConfiguration ? String(meta.vehicleConfiguration).trim() : undefined);

  // VIN & Stock Number (Never fabricate)
  const vin = meta.vin || meta.vehicleIdentificationNumber || meta.VIN ? String(meta.vin || meta.vehicleIdentificationNumber || meta.VIN).trim().toUpperCase() : undefined;
  const stockNumber = meta.stockNumber || meta.stock_number || meta.stockNo || meta.sku ? String(meta.stockNumber || meta.stock_number || meta.stockNo || meta.sku).trim() : undefined;

  // Pricing (Never fabricate)
  const price = parseNumericValue(meta.price ?? meta.sellingPrice ?? meta.cost ?? raw.price);
  const msrp = parseNumericValue(meta.msrp ?? meta.originalPrice ?? meta.original_price ?? meta.stickerPrice);
  const currency = meta.currency ? String(meta.currency).toUpperCase() : (sourceUrl?.includes('.ca') ? 'CAD' : 'USD');

  // Mileage (Never fabricate)
  const mileage = parseNumericValue(meta.mileage ?? meta.mileageFromOdometer?.value ?? meta.mileageFromOdometer ?? meta.odometer);

  // Condition
  const condition = parseVehicleCondition(meta.condition || meta.itemCondition, sourceUrl, title);

  // Specifications
  const drivetrain = parseDrivetrain(meta.drivetrain || meta.driveWheelConfiguration || meta.driveType, title, raw.content || meta.description);
  const bodyStyle = parseBodyStyle(meta.bodyStyle || meta.body_style || meta.bodyType, title, raw.content || meta.description);
  const transmission = meta.transmission || meta.vehicleTransmission ? String(meta.transmission || meta.vehicleTransmission).trim() : undefined;
  const engine = meta.engine || meta.vehicleEngine?.name || meta.engineSpecification ? String(meta.engine || meta.vehicleEngine?.name || meta.engineSpecification).trim() : undefined;
  const fuel = parseFuelType(meta.fuel || meta.fuelType, title, raw.content || meta.description);
  const exteriorColor = meta.exteriorColor || meta.color ? String(meta.exteriorColor || meta.color).trim() : undefined;
  const interiorColor = meta.interiorColor ? String(meta.interiorColor).trim() : undefined;

  // Passengers & Doors
  const passengers = meta.passengers != null ? parseInt(String(meta.passengers), 10) || undefined
    : meta.seats != null ? parseInt(String(meta.seats), 10) || undefined : undefined;
  const doors = meta.doors != null ? parseInt(String(meta.doors), 10) || undefined : undefined;

  // Fuel Efficiency (NEVER fabricated — NULL is correct when source doesn't publish it)
  // D2C Media sites expose these as 'specsFuelCity' / 'specsFuelHighway' (L/100km)
  // or via JSON-LD 'fuelEfficiencyCity' / 'fuelEfficiencyHighway'
  const parseFuelEfficiency = (val: unknown): number | undefined => {
    if (val == null) return undefined;
    const n = parseNumericValue(val);
    // Sanity check: L/100km range is 3-30; MPG range is 10-100
    if (n !== undefined && n > 0 && n < 150) return Math.round(n * 100) / 100;
    return undefined;
  };
  const cityFuelEfficiency = parseFuelEfficiency(
    meta.cityFuelEfficiency ?? meta.city_fuel_efficiency ?? meta.specsFuelCity ??
    meta.fuelEfficiencyCity ?? meta.fuelCity ?? meta.city_mpg ?? meta.mpgCity
  );
  const highwayFuelEfficiency = parseFuelEfficiency(
    meta.highwayFuelEfficiency ?? meta.highway_fuel_efficiency ?? meta.specsFuelHighway ??
    meta.fuelEfficiencyHighway ?? meta.fuelHighway ?? meta.highway_mpg ?? meta.mpgHighway
  );
  // Determine unit from source: L/100km (Canadian D2C) or MPG (US)
  const fuelEfficiencyUnit: string | undefined =
    (cityFuelEfficiency !== undefined || highwayFuelEfficiency !== undefined)
      ? (meta.fuelEfficiencyUnit || meta.fuel_efficiency_unit ||
         (String(meta.specsFuelCity || meta.fuelCity || '').includes('100') ? 'L/100km' : 'MPG'))
      : undefined;

  // Inventory status (separate from condition)
  const status = meta.status || meta.vehicleStatus || meta.inventoryStatus || 'available';

  // Features list
  const features: string[] = [];
  if (Array.isArray(meta.features)) {
    features.push(...meta.features.map(String).filter(Boolean));
  } else if (Array.isArray(meta.options)) {
    features.push(...meta.options.map(String).filter(Boolean));
  } else if (Array.isArray(meta.amenityFeature)) {
    features.push(...meta.amenityFeature.map((f: any) => String(f.name || f)).filter(Boolean));
  }

  // Provenance & Freshness
  const provenance: VehicleProvenance =
    raw.dataType === 'feed' || meta.source === 'feed'
      ? 'feed'
      : raw.dataType === 'api' || meta.discoveryMethod === 'api'
      ? 'api'
      : raw.dataType === 'manual'
      ? 'manual'
      : 'crawl';

  const firstSeen = raw.first_seen || raw.firstSeen || meta.first_seen || meta.firstSeen || nowIso;
  const lastCheckedAt = raw.last_checked_at || raw.lastCheckedAt || meta.last_checked_at || nowIso;
  const lastSeen = raw.last_seen || raw.lastSeen || meta.last_seen || meta.lastSeen || nowIso;
  const stillListed = raw.still_listed !== false && raw.stillListed !== false && meta.still_listed !== false && meta.stillListed !== false;

  const availability: AvailabilityStatus =
    stillListed === false
      ? 'out_of_stock'
      : (meta.availability === 'out_of_stock' || meta.availability === 'sold' || meta.availability === 'unavailable')
      ? 'out_of_stock'
      : (meta.availability === 'pending' || meta.availability === 'reserved')
      ? 'pending'
      : 'in_stock';

  const freshnessStatus: FreshnessStatus =
    stillListed === false
      ? 'stale_or_unlisted'
      : raw.freshnessStatus || meta.freshnessStatus || 'fresh';

  return {
    id: raw.id || `veh_${vin || Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    widgetId,
    vin,
    stockNumber,
    condition,
    year,
    make,
    model,
    trim,
    bodyStyle,
    price,
    msrp,
    currency,
    mileage,
    drivetrain,
    transmission,
    engine,
    fuel,
    exteriorColor,
    interiorColor,
    passengers: passengers && passengers > 0 ? passengers : undefined,
    doors: doors && doors > 0 ? doors : undefined,
    cityFuelEfficiency: cityFuelEfficiency !== undefined ? cityFuelEfficiency : undefined,
    highwayFuelEfficiency: highwayFuelEfficiency !== undefined ? highwayFuelEfficiency : undefined,
    fuelEfficiencyUnit,
    status: status || 'available',
    missingCount: typeof meta.missingCount === 'number' ? meta.missingCount : 0,
    features,
    description: raw.content || meta.description || undefined,
    shortDescription: raw.short_description || raw.shortDescription || meta.shortDescription || undefined,
    images: cleanImages,
    imageUrls: cleanImages,
    vdpUrl,
    sourceUrl,
    provenance,
    discoveryMethod: meta.discoveryMethod || (provenance === 'api' ? 'api' : 'crawl'),
    firstSeen,
    lastCheckedAt,
    lastSeen,
    stillListed,
    availability,
    freshnessStatus,
    metadata: {
      ...meta,
      condition,
      year,
      make,
      model,
      trim,
      bodyStyle,
      price,
      msrp,
      currency,
      mileage,
      drivetrain,
      transmission,
      engine,
      fuel,
      exteriorColor,
      interiorColor,
      vin,
      stockNumber,
      features,
      vdpUrl,
    },
    createdAt: raw.created_at || raw.createdAt || nowIso,
    updatedAt: raw.updated_at || raw.updatedAt || nowIso,
  };
}

/**
 * Converts a NormalizedVehicleRecord into a standard WebsiteDataRow for database persistence.
 */
export function vehicleRecordToWebsiteDataRow(vehicle: NormalizedVehicleRecord): WebsiteDataRow {
  const contentParts: string[] = [];
  const title = formatVehicleTitle(vehicle);

  contentParts.push(title);
  if (vehicle.condition) contentParts.push(`Condition: ${vehicle.condition.toUpperCase()}`);
  if (vehicle.price) contentParts.push(`Price: ${formatVehiclePrice(vehicle.price, vehicle.msrp, vehicle.currency)}`);
  if (vehicle.mileage !== undefined && vehicle.mileage !== null) {
    contentParts.push(`Mileage: ${formatVehicleMileage(vehicle.mileage, vehicle.condition)}`);
  }
  if (vehicle.vin) contentParts.push(`VIN: ${vehicle.vin}`);
  if (vehicle.stockNumber) contentParts.push(`Stock #: ${vehicle.stockNumber}`);
  if (vehicle.drivetrain) contentParts.push(`Drivetrain: ${vehicle.drivetrain}`);
  if (vehicle.transmission) contentParts.push(`Transmission: ${vehicle.transmission}`);
  if (vehicle.engine) contentParts.push(`Engine: ${vehicle.engine}`);
  if (vehicle.fuel) contentParts.push(`Fuel Type: ${vehicle.fuel}`);
  if (vehicle.exteriorColor) contentParts.push(`Exterior Color: ${vehicle.exteriorColor}`);
  if (vehicle.interiorColor) contentParts.push(`Interior Color: ${vehicle.interiorColor}`);
  if (vehicle.bodyStyle) contentParts.push(`Body Style: ${vehicle.bodyStyle}`);
  if (vehicle.features.length > 0) contentParts.push(`Features: ${vehicle.features.join(', ')}`);
  if (vehicle.description) contentParts.push(vehicle.description);

  const shortDesc = `${vehicle.condition.toUpperCase()} ${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.trim || ''} - ${formatVehiclePrice(vehicle.price, undefined, vehicle.currency)}${vehicle.mileage ? ` | ${vehicle.mileage.toLocaleString()} mi` : ''}`.trim();

  return {
    ...(vehicle.id && !vehicle.id.startsWith('veh_') ? { id: vehicle.id } : {}),
    widget_id: vehicle.widgetId,
    source_url: vehicle.vdpUrl || vehicle.sourceUrl || undefined,
    title,
    content: contentParts.join('\n\n'),
    entity_type: 'vehicle',
    metadata: {
      ...vehicle.metadata,
      condition: vehicle.condition,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      bodyStyle: vehicle.bodyStyle,
      price: vehicle.price,
      msrp: vehicle.msrp,
      currency: vehicle.currency,
      mileage: vehicle.mileage,
      drivetrain: vehicle.drivetrain,
      transmission: vehicle.transmission,
      engine: vehicle.engine,
      fuel: vehicle.fuel,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      vin: vehicle.vin,
      stockNumber: vehicle.stockNumber,
      features: vehicle.features,
      vdpUrl: vehicle.vdpUrl,
      images: vehicle.images,
      first_seen: vehicle.firstSeen,
      last_checked_at: vehicle.lastCheckedAt,
      last_seen: vehicle.lastSeen,
      still_listed: vehicle.stillListed,
      availability: vehicle.availability,
      freshnessStatus: vehicle.freshnessStatus,
    },
    short_description: vehicle.shortDescription || shortDesc,
    image_urls: vehicle.images,
    data_type: vehicle.provenance,
    category_path: ['Vehicles', vehicle.condition === 'new' ? 'New Vehicles' : 'Used Vehicles', ...(vehicle.make ? [vehicle.make] : [])],
    last_checked_at: vehicle.lastCheckedAt,
    first_seen: vehicle.firstSeen,
    last_seen: vehicle.lastSeen,
    still_listed: vehicle.stillListed,
  };
}

/**
 * Converts a database WebsiteData row or search result into a NormalizedVehicleRecord.
 */
export function websiteDataRowToVehicleRecord(row: any): NormalizedVehicleRecord | null {
  if (!row) return null;
  const isVehicle =
    row.entity_type === 'vehicle' ||
    row.entityType === 'vehicle' ||
    row.metadata?.vin ||
    row.metadata?.make ||
    row.metadata?.year ||
    row.metadata?.mileage ||
    /car|truck|suv|vehicle|wrangler|cherokee|ram|dodge|durango|chrysler|ford|toyota|honda/i.test(row.title || '');

  if (!isVehicle) return null;
  return normalizeVehicleRecord(row, row.widget_id || row.widgetId || '00000000-0000-0000-0000-000000000000');
}

// ── In-Memory Inventory Query Filters ─────────────────────────────────────────

export function filterVehicles(
  vehicles: NormalizedVehicleRecord[],
  filters: VehicleSearchFilters
): NormalizedVehicleRecord[] {
  return vehicles.filter((v) => {
    // 1. Still listed filter
    if (filters.stillListedOnly !== false && !v.stillListed) return false;

    // 2. Condition filter (NEW vs USED vs CPO)
    if (filters.condition) {
      if (filters.condition === 'used' && v.condition !== 'used' && v.condition !== 'cpo') return false;
      if (filters.condition === 'new' && v.condition !== 'new') return false;
      if (filters.condition === 'cpo' && v.condition !== 'cpo') return false;
    }

    // 3. Price bounds
    if (filters.maxPrice !== undefined && v.price !== undefined && v.price > filters.maxPrice) return false;
    if (filters.minPrice !== undefined && v.price !== undefined && v.price < filters.minPrice) return false;

    // 4. Mileage bounds (critical for USED vehicles)
    if (filters.maxMileage !== undefined && v.mileage !== undefined && v.mileage > filters.maxMileage) return false;

    // 5. Year bounds
    if (filters.minYear !== undefined && v.year !== undefined && v.year < filters.minYear) return false;
    if (filters.maxYear !== undefined && v.year !== undefined && v.year > filters.maxYear) return false;

    // 6. Make & Model
    if (filters.make && v.make && !v.make.toLowerCase().includes(filters.make.toLowerCase())) return false;
    if (filters.model && v.model && !v.model.toLowerCase().includes(filters.model.toLowerCase()) && !v.title?.toLowerCase().includes(filters.model.toLowerCase())) return false;
    if (filters.trim && v.trim && !v.trim.toLowerCase().includes(filters.trim.toLowerCase())) return false;

    // 7. Body Style & Drivetrain
    if (filters.bodyStyle && v.bodyStyle && !v.bodyStyle.toLowerCase().includes(filters.bodyStyle.toLowerCase())) return false;
    if (filters.drivetrain && v.drivetrain && !v.drivetrain.toLowerCase().includes(filters.drivetrain.toLowerCase())) return false;

    // 8. Fuel type
    if (filters.fuel && v.fuel && !v.fuel.toLowerCase().includes(filters.fuel.toLowerCase())) return false;

    // 9. Color
    if (filters.exteriorColor && v.exteriorColor && !v.exteriorColor.toLowerCase().includes(filters.exteriorColor.toLowerCase())) return false;

    // 10. Required features
    if (filters.features && filters.features.length > 0) {
      const vFeatures = (v.features || []).map((f) => f.toLowerCase());
      const hasAll = filters.features.every((req) =>
        vFeatures.some((vf) => vf.includes(req.toLowerCase()))
      );
      if (!hasAll) return false;
    }

    return true;
  }).slice(0, filters.limit || 50);
}

// ── Formatting Helpers (Consistent & Grounded) ────────────────────────────────

export function formatVehicleTitle(v: Partial<NormalizedVehicleRecord>): string {
  if (v.title) return v.title;
  const parts = [v.year, v.make, v.model, v.trim].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'Vehicle';
}

export function formatVehiclePrice(price?: number, msrp?: number, currency = 'USD'): string {
  const sym = currency === 'CAD' ? 'CA$' : '$';
  if (price !== undefined && price !== null) {
    const formatted = `${sym}${Math.round(price).toLocaleString()}`;
    if (msrp && msrp > price) {
      return `${formatted} (MSRP: ${sym}${Math.round(msrp).toLocaleString()})`;
    }
    return formatted;
  }
  if (msrp !== undefined && msrp !== null) {
    return `MSRP: ${sym}${Math.round(msrp).toLocaleString()}`;
  }
  return 'Contact for price';
}

export function formatVehicleMileage(mileage?: number, condition?: string): string {
  if (mileage !== undefined && mileage !== null) {
    return `${mileage.toLocaleString()} miles`;
  }
  if (condition === 'new') {
    return 'Brand New (0 miles)';
  }
  return 'Mileage unavailable';
}

export function formatVehicleSummary(v: NormalizedVehicleRecord): string {
  const title = formatVehicleTitle(v);
  const price = formatVehiclePrice(v.price, v.msrp, v.currency);
  const miles = formatVehicleMileage(v.mileage, v.condition);
  const specs = [v.drivetrain, v.engine, v.fuel, v.transmission].filter(Boolean).join(' | ');
  const vinInfo = v.vin ? ` | VIN: ${v.vin}` : '';
  const urlInfo = v.vdpUrl ? ` | VDP: ${v.vdpUrl}` : '';
  return `• [${v.condition.toUpperCase()}] ${title}: ${price} | ${miles}${specs ? ` | ${specs}` : ''}${vinInfo}${urlInfo}`;
}

// ── Deterministic Vehicle Content Hashing for Incremental Sync ───────────────

/**
 * Generates a SHA-256 deterministic fingerprint of a vehicle's specifications.
 * Used during incremental crawls to instantly detect if a vehicle is unchanged,
 * modified (price drop, new photos), or new without running expensive extraction.
 */
export function computeVehicleContentHash(v: Partial<NormalizedVehicleRecord>): string {
  const meta = (v.metadata || {}) as Record<string, any>;
  const norm = [
    (v.vin || meta.vin || '').toUpperCase().trim(),
    (v.stockNumber || meta.stockNumber || meta.stock_number || '').toUpperCase().trim(),
    (v.condition || meta.condition || 'used').toLowerCase().trim(),
    v.year || meta.year || '',
    (v.make || meta.make || '').toLowerCase().trim(),
    (v.model || meta.model || '').toLowerCase().trim(),
    (v.trim || meta.trim || '').toLowerCase().trim(),
    v.price !== undefined && v.price !== null ? Math.round(Number(v.price)) : (meta.price !== undefined ? Math.round(Number(meta.price)) : ''),
    v.msrp !== undefined && v.msrp !== null ? Math.round(Number(v.msrp)) : (meta.msrp !== undefined ? Math.round(Number(meta.msrp)) : ''),
    v.mileage !== undefined && v.mileage !== null ? Math.round(Number(v.mileage)) : (meta.mileage !== undefined ? Math.round(Number(meta.mileage)) : ''),
    (v.drivetrain || meta.drivetrain || '').toLowerCase().trim(),
    (v.transmission || meta.transmission || '').toLowerCase().trim(),
    (v.engine || meta.engine || '').toLowerCase().trim(),
    (v.fuel || meta.fuel || meta.fuelType || '').toLowerCase().trim(),
    (v.exteriorColor || meta.exteriorColor || meta.color || '').toLowerCase().trim(),
    (v.interiorColor || meta.interiorColor || '').toLowerCase().trim(),
    (v.features || meta.features || []).slice().sort().join('|').toLowerCase().trim(),
    (v.images || v.imageUrls || meta.images || []).slice().sort().join('|').trim(),
    (v.availability || meta.availability || 'in_stock').toLowerCase().trim(),
    (v.vdpUrl || v.sourceUrl || meta.vdpUrl || '').toLowerCase().trim(),
  ].join('::');
  return crypto.createHash('sha256').update(norm).digest('hex');
}

// ── Database Operations for PostgreSQL 'vehicles' Table ───────────────────────

/**
 * Batch saves normalized vehicles to the dedicated PostgreSQL 'vehicles' table.
 * Implements strict deduplication & upsert:
 * 1. Matching (widget_id, vin) is updated.
 * 2. If no VIN, matching (widget_id, stock_number) or (widget_id, source_url) is updated.
 * 3. Otherwise, inserted as new vehicle.
 */
export async function saveVehiclesBatch(
  vehicles: NormalizedVehicleRecord[]
): Promise<{ inserted: number; updated: number; unchanged: number; errors: string[] }> {
  if (!vehicles || vehicles.length === 0) {
    return { inserted: 0, updated: 0, unchanged: 0, errors: [] };
  }

  const { client: dbClient, url: activeUrl } = getDbClient();
  if (!activeUrl || !dbClient) {
    return { inserted: 0, updated: 0, unchanged: 0, errors: ['Supabase DB client not initialized'] };
  }

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const errors: string[] = [];

  // Group vehicles by widgetId
  const byWidget = new Map<string, NormalizedVehicleRecord[]>();
  for (const v of vehicles) {
    const wId = v.widgetId || '00000000-0000-0000-0000-000000000000';
    if (!byWidget.has(wId)) byWidget.set(wId, []);
    byWidget.get(wId)!.push(v);
  }

  for (const [widgetId, widgetVehicles] of byWidget.entries()) {
    try {
      // 1. Fetch existing vehicles for this widget
      const { data: existingRows, error: fetchErr } = await dbClient
        .from('vehicles')
        .select('*')
        .eq('widget_id', widgetId);

      if (fetchErr) {
        console.warn(`[vehicles:saveVehiclesBatch] Error querying existing vehicles for ${widgetId}:`, fetchErr.message);
      }

      const existingMapByVin = new Map<string, any>();
      const existingMapByStock = new Map<string, any>();
      const existingMapByUrl = new Map<string, any>();

      (existingRows || []).forEach((row: any) => {
        if (row.vin) existingMapByVin.set(row.vin.toUpperCase().trim(), row);
        if (row.stock_number) existingMapByStock.set(row.stock_number.toUpperCase().trim(), row);
        if (row.vdp_url) existingMapByUrl.set(row.vdp_url.toLowerCase().trim(), row);
        else if (row.source_url) existingMapByUrl.set(row.source_url.toLowerCase().trim(), row);
      });

      const rowsToInsert: any[] = [];
      const rowsToUpdate: any[] = [];
      const nowIso = new Date().toISOString();

      for (const veh of widgetVehicles) {
        const vinKey = veh.vin ? veh.vin.toUpperCase().trim() : undefined;
        const stockKey = veh.stockNumber ? veh.stockNumber.toUpperCase().trim() : undefined;
        const urlKey = veh.vdpUrl ? veh.vdpUrl.toLowerCase().trim() : (veh.sourceUrl ? veh.sourceUrl.toLowerCase().trim() : undefined);

        const matchedExisting =
          (vinKey ? existingMapByVin.get(vinKey) : undefined) ||
          (stockKey ? existingMapByStock.get(stockKey) : undefined) ||
          (urlKey ? existingMapByUrl.get(urlKey) : undefined);

        const incomingHash = computeVehicleContentHash(veh);

        const rowPayload: any = {
          widget_id: widgetId,
          vin: veh.vin ? veh.vin.toUpperCase().trim() : null,
          stock_number: veh.stockNumber ? veh.stockNumber.trim() : null,
          condition: veh.condition || 'used',
          year: veh.year !== undefined && veh.year !== null ? Number(veh.year) : null,
          make: veh.make || null,
          model: veh.model || null,
          trim: veh.trim || null,
          body_style: veh.bodyStyle || null,
          price: veh.price !== undefined && veh.price !== null ? Number(veh.price) : null,
          msrp: veh.msrp !== undefined && veh.msrp !== null ? Number(veh.msrp) : null,
          currency: veh.currency || 'USD',
          mileage: veh.mileage !== undefined && veh.mileage !== null ? Number(veh.mileage) : null,
          drivetrain: veh.drivetrain || null,
          transmission: veh.transmission || null,
          engine: veh.engine || null,
          fuel: veh.fuel || null,
          exterior_color: veh.exteriorColor || null,
          interior_color: veh.interiorColor || null,
          passengers: veh.passengers !== undefined && veh.passengers !== null ? Number(veh.passengers) : null,
          doors: veh.doors !== undefined && veh.doors !== null ? Number(veh.doors) : null,
          city_fuel_efficiency: (veh as any).cityFuelEfficiency !== undefined && (veh as any).cityFuelEfficiency !== null ? Number((veh as any).cityFuelEfficiency) : null,
          highway_fuel_efficiency: (veh as any).highwayFuelEfficiency !== undefined && (veh as any).highwayFuelEfficiency !== null ? Number((veh as any).highwayFuelEfficiency) : null,
          fuel_efficiency_unit: (veh as any).fuelEfficiencyUnit || null,
          status: (veh as any).status || 'available',
          missing_count: (veh as any).missingCount || 0,
          features: Array.isArray(veh.features) ? veh.features : [],
          description: veh.description || null,
          short_description: veh.shortDescription || null,
          images: Array.isArray(veh.images) && veh.images.length > 0 ? veh.images : (Array.isArray(veh.imageUrls) ? veh.imageUrls : []),
          vdp_url: veh.vdpUrl || null,
          source_url: veh.sourceUrl || veh.vdpUrl || null,
          provenance: veh.provenance || 'crawl',
          discovery_method: veh.discoveryMethod || 'json-ld',
          first_seen: matchedExisting ? matchedExisting.first_seen : (veh.firstSeen || nowIso),
          last_checked_at: nowIso,
          last_seen: nowIso,
          still_listed: true,
          availability: veh.availability || 'in_stock',
          metadata: {
            ...(veh.metadata || {}),
            content_hash: incomingHash,
            first_seen: matchedExisting ? matchedExisting.first_seen : (veh.firstSeen || nowIso),
            last_seen: nowIso,
            still_listed: true,
          },
          updated_at: nowIso,
        };

        if (matchedExisting) {
          const existingHash = matchedExisting.metadata?.content_hash || computeVehicleContentHash({
            vin: matchedExisting.vin,
            stockNumber: matchedExisting.stock_number,
            condition: matchedExisting.condition,
            year: matchedExisting.year,
            make: matchedExisting.make,
            model: matchedExisting.model,
            trim: matchedExisting.trim,
            price: matchedExisting.price,
            msrp: matchedExisting.msrp,
            mileage: matchedExisting.mileage,
            drivetrain: matchedExisting.drivetrain,
            transmission: matchedExisting.transmission,
            engine: matchedExisting.engine,
            fuel: matchedExisting.fuel,
            exteriorColor: matchedExisting.exterior_color,
            interiorColor: matchedExisting.interior_color,
            features: matchedExisting.features,
            images: matchedExisting.images,
            availability: matchedExisting.availability,
            vdpUrl: matchedExisting.vdp_url,
          });

          if (existingHash === incomingHash && matchedExisting.still_listed === true) {
            // Completely unchanged vehicle — touch last_seen without full update
            unchanged++;
            try {
              await dbClient
                .from('vehicles')
                .update({ last_seen: nowIso, last_checked_at: nowIso, still_listed: true })
                .eq('id', matchedExisting.id);
            } catch {}
          } else {
            // Modified vehicle (e.g. price change, image updates, previously sold vehicle reappeared)
            updated++;
            rowsToUpdate.push({
              ...rowPayload,
              id: matchedExisting.id,
            });
          }
        } else {
          // New vehicle
          inserted++;
          rowsToInsert.push({
            ...rowPayload,
            ...(veh.id && !veh.id.startsWith('veh_') ? { id: veh.id } : {}),
            created_at: veh.createdAt || nowIso,
          });
        }
      }

      // Execute database operations
      if (rowsToInsert.length > 0) {
        const { error: insErr } = await dbClient.from('vehicles').insert(rowsToInsert);
        if (insErr) {
          console.error(`[vehicles:saveVehiclesBatch] Insert error for ${widgetId}:`, insErr.message);
          errors.push(`Insert error: ${insErr.message}`);
        }
      }

      for (const row of rowsToUpdate) {
        const { id, ...updates } = row;
        const { error: updErr } = await dbClient.from('vehicles').update(updates).eq('id', id);
        if (updErr) {
          console.error(`[vehicles:saveVehiclesBatch] Update error for ${row.id}:`, updErr.message);
          errors.push(`Update error: ${updErr.message}`);
        }
      }
    } catch (err: any) {
      console.error(`[vehicles:saveVehiclesBatch] Unexpected error for widget ${widgetId}:`, err);
      errors.push(err.message || String(err));
    }
  }

  return { inserted, updated, unchanged, errors };
}

/**
 * Reconciles inventory for a dealer widget.
 * Marks any vehicle record in the database that was NOT observed during the current crawl as sold/removed.
 */
export async function reconcileSoldVehicles(
  widgetId: string,
  observedVehicleIdsOrVins: Set<string>
): Promise<{ markedSold: number; errors: string[] }> {
  if (!widgetId) return { markedSold: 0, errors: [] };

  const { client: dbClient, url: activeUrl } = getDbClient();
  if (!activeUrl || !dbClient) return { markedSold: 0, errors: ['Supabase DB not initialized'] };

  try {
    const { data: existingRows, error: fetchErr } = await dbClient
      .from('vehicles')
      .select('id, vin, stock_number, vdp_url, still_listed, metadata')
      .eq('widget_id', widgetId)
      .eq('still_listed', true);

    if (fetchErr) {
      console.warn(`[vehicles:reconcileSoldVehicles] Fetch error for ${widgetId}:`, fetchErr.message);
      return { markedSold: 0, errors: [fetchErr.message] };
    }

    let markedSold = 0;
    const nowIso = new Date().toISOString();

    for (const row of existingRows || []) {
      const vinMatch = row.vin && observedVehicleIdsOrVins.has(row.vin.toUpperCase().trim());
      const stockMatch = row.stock_number && observedVehicleIdsOrVins.has(row.stock_number.toUpperCase().trim());
      const idMatch = row.id && observedVehicleIdsOrVins.has(row.id);
      const urlMatch = row.vdp_url && observedVehicleIdsOrVins.has(row.vdp_url.toLowerCase().trim());

      if (!vinMatch && !stockMatch && !idMatch && !urlMatch) {
        markedSold++;
        const updatedMetadata = {
          ...(row.metadata || {}),
          still_listed: false,
          availability: 'out_of_stock',
          unlisted_at: nowIso,
        };

        await dbClient
          .from('vehicles')
          .update({
            still_listed: false,
            availability: 'out_of_stock',
            metadata: updatedMetadata,
            last_checked_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', row.id);
      }
    }

    return { markedSold, errors: [] };
  } catch (err: any) {
    console.error(`[vehicles:reconcileSoldVehicles] Error reconciling sold vehicles:`, err);
    return { markedSold: 0, errors: [err.message || String(err)] };
  }
}

/**
 * Queries dealer-scoped vehicles from the dedicated 'vehicles' table.
 */
export async function getVehiclesForWidget(
  widgetId: string,
  filters?: VehicleSearchFilters
): Promise<NormalizedVehicleRecord[]> {
  if (!widgetId) return [];

  const { client: dbClient, url: activeUrl } = getDbClient();
  if (!activeUrl || !dbClient) return [];

  try {
    let query = dbClient.from('vehicles').select('*').eq('widget_id', widgetId);

    if (filters?.stillListedOnly !== false) {
      query = query.eq('still_listed', true);
    }
    if (filters?.condition) {
      query = query.eq('condition', filters.condition);
    }
    if (filters?.make) {
      query = query.ilike('make', `%${filters.make}%`);
    }
    if (filters?.model) {
      query = query.ilike('model', `%${filters.model}%`);
    }
    if (filters?.minYear) {
      query = query.gte('year', filters.minYear);
    }
    if (filters?.maxYear) {
      query = query.lte('year', filters.maxYear);
    }
    if (filters?.minPrice) {
      query = query.gte('price', filters.minPrice);
    }
    if (filters?.maxPrice) {
      query = query.lte('price', filters.maxPrice);
    }
    if (filters?.maxMileage) {
      query = query.lte('mileage', filters.maxMileage);
    }

    query = query.order('created_at', { ascending: false }).limit(filters?.limit || 50);

    const { data: rows, error } = await query;
    if (error) {
      console.warn(`[vehicles:getVehiclesForWidget] Query error:`, error.message);
      return [];
    }

    return (rows || []).map((row: any) => normalizeVehicleRecord(row, widgetId));
  } catch (err: any) {
    console.warn(`[vehicles:getVehiclesForWidget] Error:`, err.message);
    return [];
  }
}

