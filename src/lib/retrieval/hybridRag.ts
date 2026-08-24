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

// ── Types & Interfaces ─────────────────────────────────────────────────────────

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
 * Core Hybrid Retrieval Engine with Dedicated Reranking Stage
 *
 * Flow:
 * 1. Deterministic Query Understanding
 * 2. Scope Enforcement & DB Candidate Fetch
 * 3. Multi-Channel Candidate Retrieval (pgvector, Exact/Partial Title, Keywords, Catalog)
 * 4. Dedicated Reranking Layer (rerankCandidates)
 * 5. Grounded Context Summary Generation
 */
export async function hybridRetrieve(
  widgetIdentifier: string,
  rawQuery: string,
  options: HybridRetrievalOptions = {}
): Promise<HybridRetrievalOutput> {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0;
  const threshold = options.threshold ?? 0.25;

  const cleanQuery = (rawQuery || '').trim();
  const normQuery = normalizeString(cleanQuery);

  // 1. Deterministic Query Understanding
  const structuredQuery = understandQuery(cleanQuery);
  const intent = structuredQuery.intent as HybridRetrievalOutput['intent'];

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
    };
  }

  // 2. Resolve Widget & Scope Enforcement
  const widget = await getWidget(widgetIdentifier);
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
    };
  }

  // Scope filter: widget.id and widget.websiteId
  const filterIds = [widget.id];
  if (widget.websiteId && widget.websiteId !== widget.id) {
    filterIds.push(widget.websiteId);
  }

  const { client: supabase } = getDbClient();

  // 3. Fetch All Tenant Records for Candidate Generation
  const dbQuery = supabase
    .from('website_data')
    .select('*')
    .in('widget_id', filterIds);

  const { data: allRows, error: dbError } = await dbQuery;
  if (dbError || !allRows || allRows.length === 0) {
    return {
      query: cleanQuery,
      normalizedQuery: normQuery,
      intent,
      results: [],
      count: 0,
      contextSummary: '',
      structuredQuery,
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

  // ── CHANNEL B: Vector Semantic Similarity (pgvector) ────────────────────────
  try {
    const vectorMatches = await searchWebsiteDataVector(widget.id, cleanQuery, threshold, 10);

    if (vectorMatches && vectorMatches.length > 0) {
      for (const vm of vectorMatches) {
        const matchingRow = allRows.find((r: any) => r.id === vm.id);
        if (matchingRow) {
          const cand = getOrCreateCandidate(matchingRow);
          cand.vectorSimilarity = vm.similarity ?? 0;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[hybridRag] Vector search fallback triggered:`, err?.message || err);
  }

  // ── 5. DEDICATED RERANKING STAGE ────────────────────────────────────────────
  const rawCandidates = Array.from(candidateMap.values());
  const rerankerOutput = rerankCandidates(rawCandidates, cleanQuery, structuredQuery, {
    limit,
    minScore,
    includeInformational: options.includeInformational,
  });

  const formattedResults = rerankerOutput.results;

  // ── 6. BUILD GROUNDED CONTEXT SUMMARY FOR LLM INJECTION ──────────────────────
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

  return {
    query: cleanQuery,
    normalizedQuery: normQuery,
    intent,
    results: formattedResults,
    count: formattedResults.length,
    contextSummary: summaryLines.join('\n'),
    pinnedEntity: rerankerOutput.pinnedEntity,
    structuredQuery,
  };
}
