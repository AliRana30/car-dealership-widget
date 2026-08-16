// ─── Crawler Types ────────────────────────────────────────────────────────────

export interface CrawledEntity {
  url: string;
  title?: string;
  content: string;
  dataType: 'product' | 'service' | 'text' | 'faq' | 'contact' | 'pricing' | 'event';
  metadata: {
    description?: string;
    images?: string[];
    image?: string;
    price?: string | number;
    currency?: string;
    availability?: string;
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
    [key: string]: unknown;
  };
}

export interface CrawlResult {
  websiteId: string;
  startUrl: string;
  pagesVisited: number;
  entitiesFound: number;
  entities: CrawledEntity[];
  errors: string[];
  durationMs: number;
}

export interface CrawlJobStatus {
  id: string;
  websiteId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startUrl: string;
  pagesVisited: number;
  entitiesFound: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}
