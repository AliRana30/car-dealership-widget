/**
 * Unified Hybrid RAG Service
 *
 * Combines:
 * 1. Deterministic Query-Understanding Layer (understandQuery)
 * 2. Candidate Generation (Exact title, pgvector cosine similarity, keyword/specs, catalog)
 * 3. Dedicated Reranking Stage (rerankCandidates)
 * 4. Grounded Context Summary for LLM / Chat / Voice
 *
 * Used by Chat, Retell Voice, Vapi Voice, Agent Tools, and Public APIs.
 */

import { getDbClient, getWidget, isValidUuid, searchWebsiteDataVector } from '@/config/widgetsDb';
import { understandQuery, StructuredQueryIntent } from './queryUnderstanding';
import { rerankCandidates, CandidateItem, RerankedResult } from './reranker';
import { staticPageCache, retrievalSingleFlight } from './cache';

// ── Types & Interfaces ─────────────────────────────────────────────────────────

export interface StageTimings {
  queryUnderstandingMs: number;
  widgetLookupMs: number;
  dbFetchMs: number;
  vectorSearchMs?: number;
  parallelRetrievalMs: number;
  rerankingMs: number;
  contextSummaryMs: number;
  totalRetrievalMs: number;
  totalMs?: number;
  durationMs?: number;
  cacheHit?: 'static_page' | 'embedding' | 'none';
}

export interface HybridRetrievalOptions {
  limit?: number; // Top-K results to return (default 5)
  minScore?: number; // Minimum relevance score
  entityTypes?: string[]; // Optional entity type filtering (e.g. ['vehicle', 'course', 'product'])
  includeInformational?: boolean; // If true, include About/Policy/FAQ pages
  threshold?: number; // Vector cosine similarity threshold (default 0.25)
  sessionId?: string; // For real-time session dispatch & navigation
}

export type HybridSearchResult = RerankedResult;

export interface HybridRetrievalOutput {
  query: string;
  normalizedQuery: string;
  intent: 'specific_entity' | 'catalog' | 'comparison' | 'navigation' | 'about' | 'policy' | 'faq' | 'contact' | 'greeting' | 'general';
  results: HybridSearchResult[];
  count: number;
  contextSummary: string; // Formatted markdown/plain text for LLM prompts
  pinnedEntity?: HybridSearchResult; // Dominant exact/top entity match if any
  structuredQuery?: StructuredQueryIntent;
  timings?: StageTimings;
}

// ── Helper Utilities ──────────────────────────────────────────────────────────

export function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(str: string): string[] {
  return normalizeString(str)
    .split(' ')
    .filter(t => t.length > 1);
}

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

export function parsePriceNumber(val: any): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (!val || typeof val !== 'string') return null;
  const clean = val.replace(/[^0-9.]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

// Backward-compatible export wrapping understandQuery
export function detectQueryIntent(rawQuery: string): {
  intent: HybridRetrievalOutput['intent'];
  normalizedQuery: string;
  keywords: string[];
  entityType?: string;
  maxPrice?: number;
  minPrice?: number;
  priceRange?: [number, number];
  currency?: string;
  sortBy?: 'price_asc' | 'price_desc' | 'rating_desc' | 'newest';
  onSale?: boolean;
  minRating?: number;
  inStock?: boolean;
  attributes: Record<string, any>;
  negativeKeywords: string[];
  quantity?: number;
  exactEntityName?: string;
} {
  const structured = understandQuery(rawQuery);
  return {
    intent: structured.intent as HybridRetrievalOutput['intent'],
    normalizedQuery: structured.normalizedQuery,
    keywords: structured.specificKeywords,
    entityType: structured.entityType,
    maxPrice: structured.maxPrice,
    minPrice: structured.minPrice,
    priceRange: (structured.minPrice !== undefined || structured.maxPrice !== undefined)
      ? [structured.minPrice ?? 0, structured.maxPrice ?? 999999] as [number, number]
      : undefined,
    currency: structured.currency,
    sortBy: structured.sortBy === 'relevance' ? undefined : structured.sortBy,
    onSale: structured.onSale,
    minRating: structured.minRating,
    inStock: structured.inStock,
    attributes: structured.attributes,
    negativeKeywords: structured.negativeKeywords,
    quantity: structured.quantity,
    exactEntityName: structured.exactEntityName,
  };
}

// ── Main Hybrid RAG Retrieval Function ────────────────────────────────────────

/**
 * Core Hybrid Retrieval Engine with Dedicated Reranking Stage & Latency Optimizations
 *
 * Latency Optimizations:
 * 1. Parallel Candidate Generation: Fetches tenant rows and pgvector similarities concurrently via Promise.all().
 * 2. In-Memory LRU Cache for Safe Static Informational Pages (/policy, /about, /faq) (TTL: 2m).
 * 3. In-Memory Query Embedding LRU Cache (<0.1ms on hit) to eliminate repeated OpenAI API round-trips.
 * 4. Request Deduplication via SingleFlight to prevent redundant database load during concurrent queries.
 * 5. Microsecond-Precision Stage Timing Instrumentation (query understanding, widget lookup, parallel retrieval, reranking, context summary).
 */
export async function hybridRetrieve(
  widgetIdentifier: string,
  rawQuery: string,
  options: HybridRetrievalOptions = {}
): Promise<HybridRetrievalOutput> {
  const t0 = performance.now();
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0;
  const threshold = options.threshold ?? 0.25;

  const cleanQuery = (rawQuery || '').trim();
  const normQuery = normalizeString(cleanQuery);

  // 1. Deterministic Query Understanding (<0.5ms)
  const structuredQuery = understandQuery(cleanQuery);
  const intent = structuredQuery.intent as HybridRetrievalOutput['intent'];
  const tUnderstandingEnd = performance.now();

  // Zero-query guard
  if (!cleanQuery) {
    return {
      query: '',
      normalizedQuery: '',
      intent: 'general',
      results: [],
      count: 0,
      contextSummary: '',
      structuredQuery,
      timings: {
        queryUnderstandingMs: Math.round((tUnderstandingEnd - t0) * 100) / 100,
        widgetLookupMs: 0,
        dbFetchMs: 0,
        parallelRetrievalMs: 0,
        rerankingMs: 0,
        contextSummaryMs: 0,
        totalRetrievalMs: Math.round((performance.now() - t0) * 100) / 100,
        cacheHit: 'none',
      },
    };
  }

  // 2. Resolve Widget & Scope Enforcement
  const tWidget0 = performance.now();
  const widget = await getWidget(widgetIdentifier);
  const tWidgetEnd = performance.now();

  if (!widget) {
    console.warn(`[hybridRag:SCOPE_ENFORCEMENT] hybridRetrieve: Widget not found for '${widgetIdentifier}'. Failing closed.`);
    return {
      query: cleanQuery,
      normalizedQuery: normQuery,
      intent,
      results: [],
      count: 0,
      contextSummary: '',
      structuredQuery,
      timings: {
        queryUnderstandingMs: Math.round((tUnderstandingEnd - t0) * 100) / 100,
        widgetLookupMs: Math.round((tWidgetEnd - tWidget0) * 100) / 100,
        dbFetchMs: 0,
        parallelRetrievalMs: 0,
        rerankingMs: 0,
        contextSummaryMs: 0,
        totalRetrievalMs: Math.round((performance.now() - t0) * 100) / 100,
        cacheHit: 'none',
      },
    };
  }

  // Safe Static Page Caching (informational about/policy/faq pages only — never dynamic catalog)
  const isStaticInformational = intent === 'about' || intent === 'policy' || intent === 'faq' || intent === 'contact';
  const staticCacheKey = `${widget.id}:${intent}:${normQuery}`;

  if (isStaticInformational) {
    const cachedOutput = staticPageCache.get(staticCacheKey);
    if (cachedOutput) {
      return {
        ...cachedOutput,
        timings: {
          ...cachedOutput.timings,
          queryUnderstandingMs: Math.round((tUnderstandingEnd - t0) * 100) / 100,
          widgetLookupMs: Math.round((tWidgetEnd - tWidget0) * 100) / 100,
          totalRetrievalMs: Math.round((performance.now() - t0) * 100) / 100,
          cacheHit: 'static_page',
        },
      };
    }
  }

  // Determine if informational site pages (FAQ, Policies, About, Contact) should be included
  const shouldIncludeInfo = Boolean(
    options.includeInformational ||
    structuredQuery.isInformational ||
    ['about', 'policy', 'faq', 'contact'].includes(intent)
  );

  // In-flight deduplication key
  const flightKey = `${widget.id}:${normQuery}:${limit}:${shouldIncludeInfo ? '1' : '0'}`;

  return retrievalSingleFlight.do(flightKey, async () => {
    // Scope filter: widget.id and widget.websiteId
    const filterIds = [widget.id];
    if (widget.websiteId && widget.websiteId !== widget.id) {
      filterIds.push(widget.websiteId);
    }

    const { client: supabase } = getDbClient();

    // 3. PARALLEL CANDIDATE GENERATION: Database fetch + pgvector semantic search simultaneously
    const tParallel0 = performance.now();
    let dbDuration = 0;
    let vectorDuration = 0;

    const [dbResult, vectorMatches] = await Promise.all([
      (async () => {
        const tDb0 = performance.now();
        const res = await supabase
          .from('website_data')
          .select('*')
          .in('widget_id', filterIds);
        dbDuration = performance.now() - tDb0;
        return res;
      })(),
      (async () => {
        const tVec0 = performance.now();
        try {
          const matches = await searchWebsiteDataVector(widget.id, cleanQuery, threshold, 10);
          vectorDuration = performance.now() - tVec0;
          return matches;
        } catch (err: any) {
          console.warn(`[hybridRag] Vector search fallback triggered:`, err?.message || err);
          vectorDuration = performance.now() - tVec0;
          return [];
        }
      })(),
    ]);

    const tParallelEnd = performance.now();
    const allRows = dbResult.data;

    if (dbResult.error || !allRows || allRows.length === 0) {
      return {
        query: cleanQuery,
        normalizedQuery: normQuery,
        intent,
        results: [],
        count: 0,
        contextSummary: '',
        structuredQuery,
        timings: {
          queryUnderstandingMs: Math.round((tUnderstandingEnd - t0) * 100) / 100,
          widgetLookupMs: Math.round((tWidgetEnd - tWidget0) * 100) / 100,
          dbFetchMs: Math.round(dbDuration * 100) / 100,
          vectorSearchMs: Math.round(vectorDuration * 100) / 100,
          parallelRetrievalMs: Math.round((tParallelEnd - tParallel0) * 100) / 100,
          rerankingMs: 0,
          contextSummaryMs: 0,
          totalRetrievalMs: Math.round((performance.now() - t0) * 100) / 100,
          cacheHit: 'none',
        },
      };
    }

    // 4. Candidate Collection Pool
    const candidateMap = new Map<string, CandidateItem>();

    function getOrCreateCandidate(row: any): CandidateItem {
      if (!candidateMap.has(row.id)) {
        candidateMap.set(row.id, {
          row,
          initialScore: 0,
          matchType: 'keyword',
          matchReasons: [],
          isExact: false,
          isPartial: false,
          isVector: false,
          isKeyword: false,
        });
      }
      return candidateMap.get(row.id)!;
    }

    // Populate candidate pool with all tenant rows
    for (const row of allRows) {
      getOrCreateCandidate(row);
    }

    // Attach vector similarities from parallel channel
    if (vectorMatches && vectorMatches.length > 0) {
      for (const vm of vectorMatches) {
        const matchingRow = allRows.find((r: any) => r.id === vm.id);
        if (matchingRow) {
          const cand = getOrCreateCandidate(matchingRow);
          cand.vectorSimilarity = vm.similarity ?? 0;
        }
      }
    }

    // 5. DEDICATED RERANKING STAGE
    const tRerank0 = performance.now();
    const rawCandidates = Array.from(candidateMap.values());
    const rerankerOutput = rerankCandidates(rawCandidates, cleanQuery, structuredQuery, {
      limit,
      minScore,
      includeInformational: shouldIncludeInfo,
    });
    const tRerankEnd = performance.now();

    const formattedResults = rerankerOutput.results;

    // 6. BUILD GROUNDED CONTEXT SUMMARY FOR LLM INJECTION
    const tSummary0 = performance.now();
    const summaryLines: string[] = [];
    if (formattedResults.length > 0) {
      summaryLines.push(`Found ${formattedResults.length} verified item(s) for "${cleanQuery}":`);

      formattedResults.forEach((r, idx) => {
        const priceStr = r.price ? ` | Price: ${typeof r.price === 'number' ? `$${r.price}` : r.price}` : '';
        const ratingStr = r.rating ? ` | Rating: ${r.rating}★` : '';
        const freshnessStr = `[${r.freshnessStatus}]`;
        summaryLines.push(`${idx + 1}. ${freshnessStr} **${r.title}** (${r.entityType}${priceStr}${ratingStr})`);
        if (r.shortDescription) {
          summaryLines.push(`   ${r.shortDescription}`);
        }
        if (r.sourceUrl) {
          summaryLines.push(`   Link: ${r.sourceUrl}`);
        }
      });
    }
    const tSummaryEnd = performance.now();

    const output: HybridRetrievalOutput = {
      query: cleanQuery,
      normalizedQuery: normQuery,
      intent,
      results: formattedResults,
      count: formattedResults.length,
      contextSummary: summaryLines.join('\n'),
      pinnedEntity: rerankerOutput.pinnedEntity,
      structuredQuery,
      timings: {
        queryUnderstandingMs: Math.round((tUnderstandingEnd - t0) * 100) / 100,
        widgetLookupMs: Math.round((tWidgetEnd - tWidget0) * 100) / 100,
        dbFetchMs: Math.round(dbDuration * 100) / 100,
        vectorSearchMs: Math.round(vectorDuration * 100) / 100,
        parallelRetrievalMs: Math.round((tParallelEnd - tParallel0) * 100) / 100,
        rerankingMs: Math.round((tRerankEnd - tRerank0) * 100) / 100,
        contextSummaryMs: Math.round((tSummaryEnd - tSummary0) * 100) / 100,
        totalRetrievalMs: Math.round((performance.now() - t0) * 100) / 100,
        cacheHit: 'none',
      },
    };

    // Cache static informational pages with short 2-minute TTL
    if (isStaticInformational && formattedResults.length > 0) {
      staticPageCache.set(staticCacheKey, output, 2 * 60 * 1000);
    }

    return output;
  });
}
