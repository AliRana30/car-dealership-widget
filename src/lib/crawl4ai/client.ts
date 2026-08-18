/**
 * Crawl4AI REST API Client
 *
 * A thin wrapper around the Crawl4AI Docker REST API.
 * Handles request/response typing, request timeouts, and
 * automatic retries with exponential backoff on transient failures.
 */

export interface CrawlRequest {
  urls: string[];
  priority?: number;
  browser_config?: Record<string, any>;
  crawler_config?: Record<string, any>;
}

export interface CrawlResult {
  url: string;
  success: boolean;
  status_code: number;
  html?: string;
  markdown?: string;
  error_message?: string;
  metadata?: Record<string, any>;
  cleaned_html?: string;
  extracted_content?: string | any;
  is_blocked?: boolean;
  blocked_reason?: string;
}

/**
 * Detects if a page result was blocked by a WAF / anti-bot challenge
 * (Cloudflare, DataDome, PerimeterX, Imperva, Akamai, 403 Forbidden, 429 Rate Limit, etc.)
 */
export function isCrawlResultBlocked(result: CrawlResult): boolean {
  if (result.is_blocked || result.metadata?.is_blocked) return true;
  if (result.status_code === 403 || result.status_code === 429) return true;

  const errMsg = (result.error_message || '').toLowerCase();
  const rawContent = (
    (typeof result.markdown === 'string' ? result.markdown : '') +
    ' ' +
    (typeof result.html === 'string' ? result.html : '')
  ).toLowerCase();

  const blockSignatures = [
    'blocked',
    'access denied',
    'bot detected',
    'cloudflare',
    'attention required! | cloudflare',
    'just a moment...',
    'datadome',
    'perimeterx',
    'incapsula',
    'imperva',
    'akamai',
    'verify you are human',
    'security check',
    'enable javascript and cookies to continue',
    'pardon our interruption',
  ];

  if (blockSignatures.some(sig => errMsg.includes(sig))) {
    return true;
  }

  // If content is short/suspicious (<2000 chars) and contains block signatures
  if (rawContent.length > 0 && rawContent.length < 2000) {
    if (
      rawContent.includes('cloudflare') ||
      rawContent.includes('datadome') ||
      rawContent.includes('access denied') ||
      rawContent.includes('verify you are human') ||
      rawContent.includes('pardon our interruption') ||
      rawContent.includes('please complete the security check')
    ) {
      return true;
    }
  }

  return false;
}

export interface CrawlResponse {
  results: CrawlResult[];
}


export interface SeedRequest {
  url: string;
  source?: string;
  max_urls?: number;
  max_depth?: number;
}

export interface SeedResponse {
  urls: string[];
}

export interface LLMExtractionConfig {
  type: string;
  provider: string;
  api_token?: string;
  instruction: string;
  schema: Record<string, any>;
}

/**
 * Pydantic-equivalent JSON Schema for generic structured Entity extraction
 * matching the Phase 2 Entity model (title, shortDescription, imageUrls, sourceUrl, entityType, metadata).
 */
export const GENERIC_ENTITY_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      description: 'List of entities extracted from the page (e.g. products, services, FAQs, locations, contact info, pricing plans, articles).',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Name or title of the product, service, FAQ question, business, or item.',
          },
          shortDescription: {
            type: 'string',
            description: 'Concise summary or description of the entity (1-3 sentences).',
          },
          imageUrls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Original full-resolution image URLs associated with this entity. When responsive srcset or <picture> sources are present, select the highest-resolution URL available rather than low-res thumbnails or placeholders.',
          },
          sourceUrl: {
            type: 'string',
            description: 'URL of the page where this entity is found.',
          },
          entityType: {
            type: 'string',
            enum: ['product', 'service', 'faq', 'contact', 'pricing', 'event', 'text'],
            description: 'Generic classification of this entity.',
          },
          metadata: {
            type: 'object',
            description: 'Flexible dictionary of attributes (e.g. price, currency, availability, rating, reviews, phone, email, address, hours, specs, imageSource).',
          },
        },
        required: ['title', 'shortDescription', 'entityType'],
      },
    },
  },
  required: ['entities'],
};

/**
 * Helper to construct LLMExtractionStrategy configuration for Crawl4AI.
 */
export function getGenericLLMExtractionConfig(options?: {
  provider?: string;
  apiToken?: string;
  instruction?: string;
}): LLMExtractionConfig {
  const provider =
    options?.provider ||
    process.env.CRAWL4AI_LLM_PROVIDER ||
    (process.env.OPENAI_API_KEY ? 'openai/gpt-4o-mini' : process.env.GROQ_API_KEY ? 'groq/llama-3.3-70b-versatile' : 'openai/gpt-4o-mini');

  const apiToken =
    options?.apiToken ||
    (provider.startsWith('groq') ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY) ||
    process.env.OPENAI_API_KEY ||
    process.env.GROQ_API_KEY ||
    '';

  return {
    type: 'llm',
    provider,
    api_token: apiToken,
    instruction:
      options?.instruction ||
      'Extract all distinct entities (products, services, FAQs, contact details, pricing, events) from the content according to the schema. For images (<img>, srcset, <picture>), always extract the original highest-resolution URL. Place specific attributes such as price, currency, availability, rating, reviews, address, phone, and hours into the metadata dictionary.',
    schema: GENERIC_ENTITY_EXTRACTION_SCHEMA,
  };
}


export interface JsonCssExtractionField {
  name: string;
  selector: string;
  type?: 'text' | 'attribute' | 'html' | 'regex';
  attribute?: string;
  default?: any;
}

export interface JsonCssExtractionSchema {
  name?: string;
  baseSelector: string;
  fields: JsonCssExtractionField[];
}

export interface JsonCssExtractionConfig {
  type: 'json_css';
  schema: JsonCssExtractionSchema;
}

/**
 * Helper to construct JsonCssExtractionStrategy configuration for Crawl4AI.
 */
export function getJsonCssExtractionConfig(schema: JsonCssExtractionSchema): JsonCssExtractionConfig {
  return {
    type: 'json_css',
    schema,
  };
}

export class Crawl4AIClient {
  private baseUrl: string;
  private defaultTimeoutMs: number;
  private maxRetries: number;

  constructor(optionsOrBaseUrl?: string | {
    baseUrl?: string;
    defaultTimeoutMs?: number;
    maxRetries?: number;
  }) {
    let rawUrl: string | undefined;
    let defaultTimeoutMs: number | undefined;
    let maxRetries: number | undefined;

    if (typeof optionsOrBaseUrl === 'string') {
      rawUrl = optionsOrBaseUrl;
    } else if (optionsOrBaseUrl && typeof optionsOrBaseUrl === 'object') {
      rawUrl = optionsOrBaseUrl.baseUrl;
      defaultTimeoutMs = optionsOrBaseUrl.defaultTimeoutMs;
      maxRetries = optionsOrBaseUrl.maxRetries;
    }

    const resolvedUrl = rawUrl || process.env.CRAWL4AI_BASE_URL || 'http://127.0.0.1:11235';
    this.baseUrl = resolvedUrl.replace(/\/$/, '');
    
    this.defaultTimeoutMs = defaultTimeoutMs ?? 60000; // 60s default timeout
    this.maxRetries = maxRetries ?? 3;
  }

  /**
   * Helper to identify if an error/status is transient (retryable).
   * We retry on:
   * - Network TypeErrors (connection refused, DNS lookup failed, etc.)
   * - AbortError (fetch request timeouts)
   * - Rate limiting (HTTP 429)
   * - Server-side errors (HTTP 5xx)
   */
  private isTransientError(error: any, status?: number): boolean {
    if (error instanceof TypeError) {
      return true; // network errors
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return true; // request timeouts
    }
    if (status !== undefined) {
      if (status === 429 || status >= 500) {
        return true; // Rate-limiting or Server errors
      }
    }
    return false;
  }

  /**
   * Executes a synchronous crawl against the crawl4ai REST API.
   *
   * @param request CrawlRequest payload containing urls and configurations.
   * @param timeoutMs Optional override for request timeout.
   * @returns CrawlResponse containing results for each requested URL.
   */
  async crawl(request: CrawlRequest, timeoutMs?: number): Promise<CrawlResponse> {
    const targetTimeout = timeoutMs ?? this.defaultTimeoutMs;
    const url = `${this.baseUrl}/crawl`;

    let attempt = 0;
    while (true) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), targetTimeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal as any, // Cast to handle minor environment type variations
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const status = response.status;
          let errorMessage = `HTTP Error ${status}`;
          
          try {
            const errorBody = await response.text();
            errorMessage = `HTTP Error ${status}: ${errorBody}`;
          } catch {
            // Silence error body parsing failures
          }

          if (attempt <= this.maxRetries && this.isTransientError(null, status)) {
            const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 100, 10000);
            console.warn(
              `[Crawl4AIClient] Transient HTTP error ${status} on attempt ${attempt}. Retrying in ${backoff}ms...`
            );
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }

          throw new Error(errorMessage);
        }

        const data = (await response.json()) as CrawlResponse;

        if (!data || !Array.isArray(data.results)) {
          throw new Error('Invalid Crawl4AI response structure: expected results array');
        }

        return data;
      } catch (error: any) {
        clearTimeout(timeoutId);

        if (attempt <= this.maxRetries && this.isTransientError(error)) {
          const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 100, 10000);
          console.warn(
            `[Crawl4AIClient] Transient connection error (${error.message || error}) on attempt ${attempt}. Retrying in ${backoff}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        throw error;
      }
    }
  }

  /**
   * Executes a URL discovery seed request against Crawl4AI AsyncUrlSeeder REST API.
   *
   * @param request SeedRequest payload containing url, source ("sitemap+cc"), max_urls, max_depth.
   * @param timeoutMs Optional override for request timeout.
   * @returns SeedResponse containing array of candidate URLs.
   */
  async seed(request: SeedRequest, timeoutMs?: number): Promise<SeedResponse> {
    const targetTimeout = timeoutMs ?? 30000;
    const url = `${this.baseUrl}/seed`;
    const fallbackUrl = `${this.baseUrl}/crawl/seed`;

    let attempt = 0;
    while (true) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), targetTimeout);

      try {
        let response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal as any,
        });

        if (response.status === 404) {
          response = await fetch(fallbackUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(request),
            signal: controller.signal as any,
          });
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          const status = response.status;
          let errorMessage = `HTTP Error ${status}`;

          try {
            const errorBody = await response.text();
            errorMessage = `HTTP Error ${status}: ${errorBody}`;
          } catch {}

          if (attempt <= this.maxRetries && this.isTransientError(null, status)) {
            const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 100, 10000);
            console.warn(
              `[Crawl4AIClient] Transient seed error ${status} on attempt ${attempt}. Retrying in ${backoff}ms...`
            );
            await new Promise((resolve) => setTimeout(resolve, backoff));
            continue;
          }

          throw new Error(errorMessage);
        }

        const data = await response.json();
        const urls: string[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.urls)
          ? data.urls
          : [];

        return { urls };
      } catch (error: any) {
        clearTimeout(timeoutId);

        if (attempt <= this.maxRetries && this.isTransientError(error)) {
          const backoff = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 100, 10000);
          console.warn(
            `[Crawl4AIClient] Transient seed connection error (${error.message || error}) on attempt ${attempt}. Retrying in ${backoff}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        throw error;
      }
    }
  }
}

