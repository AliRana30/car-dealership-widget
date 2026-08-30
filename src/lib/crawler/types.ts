// ─── Crawler Types ────────────────────────────────────────────────────────────

export * from '@/lib/vehicles/types';

export type ScanMode = 'quick' | 'master';

export const QUICK_SCAN_PAGE_CAP = 15;
export const MASTER_SCAN_PAGE_CAP = 150;
export const BLOCKED_THRESHOLD_RATIO = 0.5;

export interface Entity {
  id: string;
  widgetId: string;
  title: string;
  shortDescription?: string;
  imageUrls: string[];
  sourceUrl?: string;
  entityType: string;          // "vehicle" | "product" | "service" | "text"
  metadata: Record<string, unknown>;
  dataType: 'crawl' | 'shopify' | 'woocommerce' | 'feed' | 'manual';
  categoryPath?: string[];
  embedding?: number[];
  contentHash?: string;
  lastCheckedAt?: string;
  firstSeen?: string;
  lastSeen?: string;
  stillListed?: boolean;
  freshnessStatus?: 'fresh' | 'recent' | 'stale_or_unlisted';
  createdAt: string;
  updatedAt: string;
}

export interface CrawledEntity {
  url: string;
  title?: string;
  content: string;
  dataType: 'product' | 'service' | 'text' | 'faq' | 'contact' | 'pricing' | 'event' | 'vehicle';
  imageUrls?: string[];
  contentHash?: string;
  lastCheckedAt?: string;
  metadata: {
    description?: string;
    images?: string[];
    image?: string;
    price?: string | number;
    msrp?: string | number;
    currency?: string;
    availability?: string;
    condition?: 'new' | 'used' | 'cpo' | 'certified';
    vin?: string;
    stockNumber?: string;
    stock_number?: string;
    year?: number | string;
    make?: string;
    model?: string;
    trim?: string;
    bodyStyle?: string;
    body_style?: string;
    mileage?: number | string;
    drivetrain?: string;
    transmission?: string;
    engine?: string;
    fuel?: string;
    fuelType?: string;
    color?: string;
    exteriorColor?: string;
    interiorColor?: string;
    features?: string[];
    options?: string[];
    vdpUrl?: string;
    vdp_url?: string;
    rating?: number;
    reviews?: number;
    attributes?: Record<string, string | number | boolean>;
    brand?: string;
    category?: string;
    sku?: string;
    phone?: string;
    email?: string;
    address?: string;
    hours?: string;
    discoveryMethod?: 'vdp_spec_extractor' | 'json-ld' | 'embedded_state' | 'api' | 'dom' | 'css' | 'llm' | 'spa_chunk' | 'html_fallback' | 'shopify' | 'woocommerce';
    apiEndpoint?: string;
    [key: string]: unknown;
  };
}

export interface CrawlResult {
  websiteId: string;
  startUrl: string;
  pagesVisited: number;
  pagesProcessed?: number;
  pagesSkipped?: number;
  entitiesFound: number;
  blockedPages: number;
  isBlocked: boolean;
  qualityStatus?: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  entities: CrawledEntity[];
  discoveredUrls?: string[];
  diagnostics?: any[];
  coverageReport?: import('./completeness').CrawlCoverageReport;
  errors: string[];
  durationMs: number;
}

export interface CrawlJobStatus {
  id: string;
  websiteId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  startUrl: string;
  pagesVisited: number;
  pagesProcessed?: number;
  pagesSkipped?: number;
  entitiesFound: number;
  blockedPages: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}



