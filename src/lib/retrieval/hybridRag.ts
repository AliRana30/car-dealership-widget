/**
 * Unified Hybrid RAG Service
 *
 * Combines:
 * 1. Deterministic Query-Understanding Layer (entityType, price bounds, sale state, rating, availability, attributes, sort)
 * 2. Exact entity/title matching (dominant priority +1000)
 * 3. Keyword & specification matching (title, specs, metadata, content)
 * 4. PostgreSQL pgvector cosine semantic similarity (via match_website_data RPC)
 * 5. Structured metadata attribute filtering (specs, transmission, engine, fuel type, level, etc.)
 * 6. Freshness verification (fresh, recent, stale_or_unlisted)
 * 7. Negative constraint filtering with domain synonym expansion
 *
 * Used by Chat, Retell Voice, Vapi Voice, Agent Tools, and Public APIs.
 */

import { getDbClient, getWidget, isValidUuid, searchWebsiteDataVector } from '@/config/widgetsDb';
import { calculateFreshness } from '@/lib/agents/tools';
import { understandQuery, StructuredQueryIntent } from './queryUnderstanding';

// ── Types & Interfaces ─────────────────────────────────────────────────────────

export interface HybridRetrievalOptions {
  limit?: number; // Top-K results to return (default 5)
  minScore?: number; // Minimum relevance score
  entityTypes?: string[]; // Optional entity type filtering (e.g. ['vehicle', 'course', 'product'])
  includeInformational?: boolean; // If true, include About/Policy/FAQ pages
  threshold?: number; // Vector cosine similarity threshold (default 0.25)
  sessionId?: string; // For real-time session dispatch & navigation
}

export interface HybridSearchResult {
  id: string;
  widgetId: string;
  title: string;
  description: string;
  shortDescription: string;
  content: string;
  entityType: string;
  sourceUrl?: string;
  imageUrls: string[];
  images: string[];
  price?: string | number;
  currency?: string;
  rating?: number;
  reviews?: number;
  availability?: string;
  category?: string;
  level?: string;
  attributes?: Record<string, any>;
  metadata: Record<string, any>;
  firstSeen: string;
  lastSeen: string;
  stillListed: boolean;
  freshnessStatus: 'fresh' | 'recent' | 'stale_or_unlisted';
  score: number; // Final fused ranking score
  matchType: 'exact' | 'partial' | 'vector' | 'keyword' | 'broad_catalog';
  matchReasons: string[]; // Internal debug explanations
}

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
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
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
export function parseHybridConstraints(query: string) {
  const structured = understandQuery(query);
  return {
    maxPrice: structured.maxPrice,
    minPrice: structured.minPrice,
    sortByPrice: structured.sortBy === 'price_asc' ? 'asc' : (structured.sortBy === 'price_desc' ? 'desc' : undefined),
    sortByRating: structured.sortBy === 'rating_desc' || structured.minRating !== undefined,
    isAboutQuery: structured.intent === 'about',
    isPolicyQuery: structured.intent === 'policy',
    isFaqQuery: structured.intent === 'faq',
    isContactQuery: structured.intent === 'contact',
    isCatalogQuery: structured.intent === 'catalog' || Boolean(structured.entityType),
    isComparisonQuery: structured.intent === 'comparison',
    comparisonQueries: structured.comparisonQueries || [],
    negativeKeywords: structured.negativeKeywords,
    specificKeywords: structured.specificKeywords,
  };
}

// ── Core Hybrid Retrieval Engine ──────────────────────────────────────────────

/**
 * Unified Hybrid RAG Retrieval Service.
 *
 * Executes multi-channel retrieval across:
 * 1. Structured Query-Understanding
 * 2. Exact & Partial Title Match (Dominant +1000 for exact entities)
 * 3. Real PostgreSQL pgvector Cosine Similarity Search
 * 4. Structured Keyword & Metadata Attribute Matching
 * 5. Constraint Enforcement (budget, ratings, sale, stock, negative constraints, freshness)
 *
 * Returns structured results with internal score and match reasons.
 */
export async function hybridRetrieve(
  widgetOrWebsiteId: string,
  query: string,
  options: HybridRetrievalOptions = {}
): Promise<HybridRetrievalOutput> {
  const limit = options.limit ?? 5;
  const threshold = options.threshold ?? 0.25;

  if (!widgetOrWebsiteId || typeof widgetOrWebsiteId !== 'string' || !widgetOrWebsiteId.trim()) {
    console.warn('[hybridRag:SCOPE_ENFORCEMENT] hybridRetrieve called with empty widgetId. Failing closed.');
    return {
      query,
      normalizedQuery: '',
      intent: 'general',
      results: [],
      count: 0,
      contextSummary: '',
    };
  }

  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return {
      query: '',
      normalizedQuery: '',
      intent: 'general',
      results: [],
      count: 0,
      contextSummary: '',
    };
  }

  // 1. Structured Query Understanding Layer
  const structuredQuery = understandQuery(cleanQuery);
  const normQuery = structuredQuery.normalizedQuery;
  const queryTokens = tokenize(cleanQuery);
  const intent = structuredQuery.intent;

  if (intent === 'greeting') {
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

  // 2. Resolve Widget Scope strictly
  const widget = await getWidget(widgetOrWebsiteId.trim());
  if (!widget) {
    console.warn(`[hybridRag:SCOPE_ENFORCEMENT] hybridRetrieve: Widget not found for '${widgetOrWebsiteId}'. Failing closed.`);
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

  const allowedIds = new Set<string>();
  if (widget.id && isValidUuid(widget.id)) allowedIds.add(widget.id);
  if (widget.websiteId && isValidUuid(widget.websiteId)) allowedIds.add(widget.websiteId);
  if (widget.widgetId && isValidUuid(widget.widgetId)) allowedIds.add(widget.widgetId);

  const filterIds = Array.from(allowedIds).filter(
    id => id !== '00000000-0000-0000-0000-000000000000'
  );

  if (filterIds.length === 0) {
    console.warn(`[hybridRag:SCOPE_ENFORCEMENT] No valid UUIDs for widget '${widgetOrWebsiteId}'. Failing closed.`);
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

  const { client: supabase } = getDbClient();

  // 3. Fetch All Tenant Records for Deterministic Hybrid Matching
  let dbQuery = supabase
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

  // Track scoring and match channels
  interface CandidateMatch {
    row: any;
    score: number;
    matchType: HybridSearchResult['matchType'];
    matchReasons: string[];
    isExact: boolean;
    isPartial: boolean;
    isVector: boolean;
    isKeyword: boolean;
  }

  const candidateMap = new Map<string, CandidateMatch>();

  function getOrCreateCandidate(row: any): CandidateMatch {
    if (!candidateMap.has(row.id)) {
      candidateMap.set(row.id, {
        row,
        score: 0,
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

  // ── CHANNEL A: Exact & Partial Entity/Title Matching ─────────────────────────
  let exactMatchDetected = false;

  for (const row of allRows) {
    const rowTitle = (row.title || '').trim();
    if (!rowTitle) continue;

    const normTitle = normalizeString(rowTitle);
    const titleTokens = tokenize(rowTitle);
    const cand = getOrCreateCandidate(row);

    // Exact full normalized string match
    if (normTitle === normQuery) {
      cand.score += 1000;
      cand.isExact = true;
      cand.matchType = 'exact';
      cand.matchReasons.push(`Exact full normalized title match (+1000)`);
      exactMatchDetected = true;
      continue;
    }

    // Substring contains exact query phrase
    if (normTitle.includes(normQuery) && normQuery.length >= 4) {
      cand.score += 600;
      cand.isPartial = true;
      cand.matchType = 'partial';
      cand.matchReasons.push(`Title contains exact query phrase (+600)`);
    } else if (normQuery.includes(normTitle) && normTitle.length >= 4) {
      cand.score += 550;
      cand.isPartial = true;
      cand.matchType = 'partial';
      cand.matchReasons.push(`Query contains exact entity title (+550)`);
    }

    // Token overlap & token-level fuzzy match
    if (queryTokens.length > 0 && titleTokens.length > 0) {
      let matchedTokens = 0;
      let fuzzyMatchedTokens = 0;

      for (const qToken of queryTokens) {
        if (titleTokens.some(t => t === qToken || t.includes(qToken) || qToken.includes(t))) {
          matchedTokens++;
        } else if (qToken.length >= 4) {
          const maxDist = qToken.length >= 6 ? 2 : 1;
          const hasFuzzyToken = titleTokens.some(t => Math.abs(t.length - qToken.length) <= maxDist && levenshteinDistance(t, qToken) <= maxDist);
          if (hasFuzzyToken) {
            matchedTokens++;
            fuzzyMatchedTokens++;
          }
        }
      }

      const overlapRatio = matchedTokens / queryTokens.length;
      if (overlapRatio >= 0.75) {
        cand.score += Math.round(overlapRatio * 400);
        cand.isPartial = true;
        cand.matchReasons.push(`High token overlap (${Math.round(overlapRatio * 100)}%) (+${Math.round(overlapRatio * 400)})`);
      } else if (overlapRatio >= 0.5) {
        cand.score += Math.round(overlapRatio * 250);
        cand.isPartial = true;
        cand.matchReasons.push(`Moderate token overlap (${Math.round(overlapRatio * 100)}%) (+${Math.round(overlapRatio * 250)})`);
      }

      if (fuzzyMatchedTokens > 0) {
        cand.score += fuzzyMatchedTokens * 150;
        cand.isPartial = true;
        cand.matchReasons.push(`Token fuzzy typo tolerance (${fuzzyMatchedTokens} tokens) (+${fuzzyMatchedTokens * 150})`);
      }
    }

    // Full title Levenshtein distance <= 2
    if (normTitle.length >= 5 && normQuery.length >= 5) {
      const dist = levenshteinDistance(normTitle, normQuery);
      if (dist <= 2) {
        cand.score += 150;
        cand.isPartial = true;
        cand.matchReasons.push(`Fuzzy title match (Levenshtein distance ${dist}) (+150)`);
      }
    }
  }

  // ── CHANNEL B: Vector Semantic Similarity (pgvector) ────────────────────────
  try {
    const vectorMatches = await searchWebsiteDataVector(widget.id, cleanQuery, threshold, 10);

    if (vectorMatches && vectorMatches.length > 0) {
      for (const vm of vectorMatches) {
        const matchingRow = allRows.find((r: any) => r.id === vm.id);
        if (matchingRow) {
          const cand = getOrCreateCandidate(matchingRow);
          const similarity = vm.similarity ?? 0;
          if (similarity >= 0.40 || cand.isExact || cand.isPartial || cand.isKeyword) {
            const vectorBoost = Math.round(similarity * 400);
            cand.score += vectorBoost;
            cand.isVector = true;
            if (!cand.isExact && !cand.isPartial) {
              cand.matchType = 'vector';
            }
            cand.matchReasons.push(`pgvector cosine similarity ${similarity.toFixed(3)} (+${vectorBoost})`);
          }
        }
      }
    }
  } catch (err: any) {
    console.warn(`[hybridRag] Vector search fallback triggered:`, err?.message || err);
  }

  // ── CHANNEL C: Keyword, Specification, Metadata & Constraint Filtering ──────
  for (const [id, cand] of candidateMap.entries()) {
    const meta = (cand.row.metadata || {}) as Record<string, any>;
    const titleLower = (cand.row.title || '').toLowerCase();
    const contentLower = (cand.row.content || '').toLowerCase();
    const metaStrings = Object.values(meta)
      .filter(v => typeof v === 'string' || typeof v === 'number')
      .join(' ')
      .toLowerCase();

    // Noise and crawl error page elimination
    const isErrorPage = /request rejected|access denied|403 forbidden|404 not found/i.test(titleLower) ||
      (cand.row.still_listed === false && !meta.price && cand.row.entity_type === 'text');
    if (isErrorPage) {
      cand.score = -999;
      continue;
    }

    const itemPrice = parsePriceNumber(meta.price ?? meta.cost ?? meta.estimatedPrice ?? cand.row.price);
    const rating = typeof meta.ratings === 'number' ? meta.ratings : (typeof meta.rating === 'number' ? meta.rating : 0);

    // Multi-field keyword match
    let keywordHits = 0;
    if (structuredQuery.specificKeywords.length > 0) {
      for (const word of structuredQuery.specificKeywords) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');

        if (wordRegex.test(titleLower) || wordRegex.test(metaStrings)) {
          cand.score += 80;
          keywordHits++;
          cand.matchReasons.push(`Keyword match '${word}' in title/metadata (+80)`);
        } else if (wordRegex.test(contentLower)) {
          cand.score += 25;
          keywordHits++;
          cand.matchReasons.push(`Keyword match '${word}' in content (+25)`);
        }
      }
      if (keywordHits > 0) {
        cand.isKeyword = true;
      }
    }

    const BROAD_WORDS = new Set([
      'all', 'any', 'every', 'list', 'show', 'view', 'get', 'see', 'find', 'explore', 'available', 'browse',
      'vehicle', 'vehicles', 'car', 'cars', 'truck', 'trucks', 'suv', 'suvs', 'auto', 'automobile', 'automotive',
      'offering', 'offerings', 'program', 'programs', 'course', 'courses', 'product', 'products',
      'service', 'services', 'inventory', 'catalog', 'item', 'items', 'stock', 'availability',
      'discount', 'discounts', 'discounted', 'sale', 'sales', 'regular', 'priced', 'deal', 'deals', 'promo'
    ]);
    const trueSpecificKeywords = structuredQuery.specificKeywords.filter(w => !BROAD_WORDS.has(w));

    // Broad catalog discovery
    const isCatalogQuery = structuredQuery.intent === 'catalog' || Boolean(structuredQuery.entityType);
    if (isCatalogQuery && trueSpecificKeywords.length === 0) {
      const hasPriceOrMedia = Boolean(itemPrice) || Boolean(cand.row.image_urls?.length) || Boolean(meta.images?.length);
      if (hasPriceOrMedia || ['course', 'product', 'vehicle', 'service'].includes(cand.row.entity_type)) {
        cand.score += 80;
        cand.matchType = 'broad_catalog';
        cand.matchReasons.push(`Broad catalog discovery (+80)`);
      }
    }

    // Multi-signal synergy boost
    const activeChannels = [cand.isExact, cand.isPartial, cand.isVector, cand.isKeyword].filter(Boolean).length;
    if (activeChannels >= 2) {
      cand.score += 50 * (activeChannels - 1);
      cand.matchReasons.push(`Multi-channel synergy boost (${activeChannels} channels) (+${50 * (activeChannels - 1)})`);
    }

    // ── STRUCTURED CONSTRAINT & PRE-RANKING FILTERS ──

    // Specific Keyword Constraint enforcement:
    // If the query specified distinct keywords (e.g. "backend", "wrangler"),
    // items with 0 keyword matches and no exact/partial title match should not be returned.
    if (trueSpecificKeywords.length > 0 && keywordHits === 0 && !cand.isExact && !cand.isPartial) {
      cand.score -= 500;
      cand.matchReasons.push(`No match for specific required keywords [${trueSpecificKeywords.join(', ')}] (-500)`);
    }

    // 1. Entity Type Constraint
    if (structuredQuery.entityType) {
      const rowType = (cand.row.entity_type || 'product').toLowerCase();
      const isVehicleRow = rowType === 'vehicle' || Boolean(meta.vin || meta.make || meta.model || meta.year || meta.mileage || /\b(?:jeep|dodge|ram|chrysler|truck|suv|sedan|dealer|dealership|coupe|hatchback|convertible)\b/i.test(titleLower + ' ' + metaStrings));
      const isCourseRow = (rowType === 'course' || Boolean(meta.curriculum || meta.syllabus || meta.instructor || meta.lessons || /\b(?:course|courses|tutorial|tutorials|mastery|curriculum|bootcamp|lesson|lessons)\b/i.test(titleLower + ' ' + contentLower))) && !isVehicleRow;

      let isMatchingType = false;
      let isConflictingType = false;

      if (structuredQuery.entityType === 'vehicle') {
        if (isVehicleRow) isMatchingType = true;
        else isConflictingType = true;
      } else if (structuredQuery.entityType === 'course') {
        if (isCourseRow) isMatchingType = true;
        else isConflictingType = true;
      } else if (structuredQuery.entityType === 'product') {
        isMatchingType = true;
      } else if (structuredQuery.entityType === 'service') {
        isMatchingType = rowType === 'service' || !isVehicleRow;
      }

      if (isMatchingType) {
        cand.score += 80;
        cand.matchReasons.push(`Entity type match: ${structuredQuery.entityType} (+80)`);
      } else if (isConflictingType) {
        cand.score -= 500;
        cand.matchReasons.push(`Entity type mismatch: expected ${structuredQuery.entityType}, got conflicting domain row (-500)`);
      }
    }

    // 2. Budget Constraints (minPrice / maxPrice)
    if (structuredQuery.maxPrice !== undefined) {
      if (itemPrice !== null && itemPrice <= structuredQuery.maxPrice) {
        cand.score += 80;
        cand.matchReasons.push(`Price $${itemPrice} <= maxPrice $${structuredQuery.maxPrice} (+80)`);
      } else if (itemPrice !== null && itemPrice > structuredQuery.maxPrice) {
        cand.score -= 400;
        cand.matchReasons.push(`Price $${itemPrice} exceeds maxPrice $${structuredQuery.maxPrice} (-400)`);
      }
    }

    if (structuredQuery.minPrice !== undefined) {
      if (itemPrice !== null && itemPrice >= structuredQuery.minPrice) {
        cand.score += 80;
        cand.matchReasons.push(`Price $${itemPrice} >= minPrice $${structuredQuery.minPrice} (+80)`);
      } else if (itemPrice !== null && itemPrice < structuredQuery.minPrice) {
        cand.score -= 400;
        cand.matchReasons.push(`Price $${itemPrice} below minPrice $${structuredQuery.minPrice} (-400)`);
      }
    }

    // 3. Sale / Discount State Filter
    if (structuredQuery.onSale !== undefined) {
      const isItemOnSale = Boolean(
        meta.sale || meta.onSale || meta.discount || meta.isDiscounted ||
        (meta.originalPrice && meta.price && parsePriceNumber(meta.originalPrice) && parsePriceNumber(meta.price) && parsePriceNumber(meta.originalPrice)! > parsePriceNumber(meta.price)!)
      );

      if (structuredQuery.onSale === true) {
        if (isItemOnSale) {
          cand.score += 100;
          cand.matchReasons.push(`Item on sale / discounted (+100)`);
        } else {
          cand.score -= 400;
          cand.matchReasons.push(`Item not on sale / no discount (-400)`);
        }
      } else if (structuredQuery.onSale === false) {
        if (!isItemOnSale) {
          cand.score += 60;
          cand.matchReasons.push(`Regular priced item / no discount (+60)`);
        } else {
          cand.score -= 400;
          cand.matchReasons.push(`Item is on sale / excluded by no-discount filter (-400)`);
        }
      }
    }

    // 4. Rating Minimum & Boost
    if (structuredQuery.minRating !== undefined) {
      if (rating >= structuredQuery.minRating) {
        cand.score += 80;
        cand.matchReasons.push(`Rating ${rating} >= minRating ${structuredQuery.minRating} (+80)`);
      } else if (rating > 0 && rating < structuredQuery.minRating) {
        cand.score -= 400;
        cand.matchReasons.push(`Rating ${rating} < minRating ${structuredQuery.minRating} (-400)`);
      }
    } else if (structuredQuery.sortBy === 'rating_desc' && rating >= 4) {
      cand.score += Math.round(rating * 15);
      cand.matchReasons.push(`High rating ${rating} boost (+${Math.round(rating * 15)})`);
    }

    // 5. Availability / In-Stock
    if (structuredQuery.inStock !== undefined) {
      const isAvailable = cand.row.still_listed !== false && meta.availability !== 'out of stock' && meta.availability !== 'sold out';
      if (structuredQuery.inStock === true) {
        if (isAvailable) {
          cand.score += 60;
          cand.matchReasons.push(`Item available / in stock (+60)`);
        } else {
          cand.score -= 500;
          cand.matchReasons.push(`Item unavailable / out of stock (-500)`);
        }
      }
    }

    // 6. Attributes Matching (transmission, fuelType, drivetrain, level, format)
    if (Object.keys(structuredQuery.attributes).length > 0) {
      for (const [k, v] of Object.entries(structuredQuery.attributes)) {
        const valLower = String(v).toLowerCase();
        if (metaStrings.includes(valLower) || titleLower.includes(valLower) || contentLower.includes(valLower)) {
          cand.score += 60;
          cand.matchReasons.push(`Attribute match ${k}=${v} (+60)`);
        }
      }
    }

    // 7. Negative Constraints (e.g. "not electric", "excluding hybrid")
    const NEGATIVE_SYNONYMS: Record<string, string[]> = {
      electric: ['electric', 'ev', 'phev', 'hybrid', '4xe', 'bev', 'plug-in'],
      hybrid: ['hybrid', 'phev', '4xe', 'plug-in'],
      gas: ['gas', 'gasoline', 'petrol', 'v6', 'v8', 'hemi'],
      gasoline: ['gas', 'gasoline', 'petrol', 'v6', 'v8', 'hemi'],
      diesel: ['diesel'],
      prerequisite: ['prerequisite', 'prerequisites', 'advanced'],
    };

    if (structuredQuery.negativeKeywords.length > 0) {
      for (const negWord of structuredQuery.negativeKeywords) {
        const wordsToCheck = NEGATIVE_SYNONYMS[negWord] || [negWord];
        for (const w of wordsToCheck) {
          const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const negRegex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (negRegex.test(titleLower) || negRegex.test(metaStrings) || negRegex.test(contentLower)) {
            cand.score -= 600;
            cand.matchReasons.push(`Violates negative constraint '${negWord}' via '${w}' (-600)`);
            break;
          }
        }
      }
    }

    // 8. Generic Directory / Policy Downranking
    const isDirectoryOrPolicy =
      (cand.row.source_url && /\/(courses|products|services|catalog|inventory|shop|all|privacy|terms|cookie|policy)\/?$/i.test(cand.row.source_url)) ||
      /terms|privacy|policy|cookie|disclaimer/.test(titleLower);

    if (isDirectoryOrPolicy) {
      if (exactMatchDetected || structuredQuery.specificKeywords.length > 0) {
        cand.score -= 300;
        cand.matchReasons.push(`Generic directory/policy downranked on specific entity search (-300)`);
      }
    }
  }

  // 5. Filter & Rank Candidates
  const validCandidates = Array.from(candidateMap.values()).filter(c => c.score > 0);

  if (validCandidates.length === 0) {
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

  // 6. Apply Sorter
  if (structuredQuery.sortBy === 'price_asc') {
    validCandidates.sort((a, b) => {
      const pA = parsePriceNumber((a.row.metadata || {}).price ?? a.row.price) ?? 999999;
      const pB = parsePriceNumber((b.row.metadata || {}).price ?? b.row.price) ?? 999999;
      return pA - pB;
    });
  } else if (structuredQuery.sortBy === 'price_desc') {
    validCandidates.sort((a, b) => {
      const pA = parsePriceNumber((a.row.metadata || {}).price ?? a.row.price) ?? 0;
      const pB = parsePriceNumber((b.row.metadata || {}).price ?? b.row.price) ?? 0;
      return pB - pA;
    });
  } else if (structuredQuery.sortBy === 'rating_desc') {
    validCandidates.sort((a, b) => {
      const rA = (a.row.metadata || {}).rating ?? (a.row.metadata || {}).ratings ?? 0;
      const rB = (b.row.metadata || {}).rating ?? (b.row.metadata || {}).ratings ?? 0;
      return rB - rA;
    });
  } else if (structuredQuery.sortBy === 'newest') {
    validCandidates.sort((a, b) => {
      const tA = new Date(a.row.created_at || a.row.first_seen || 0).getTime();
      const tB = new Date(b.row.created_at || b.row.first_seen || 0).getTime();
      return tB - tA;
    });
  } else {
    validCandidates.sort((a, b) => b.score - a.score);
  }

  // 7. Deduplicate by Normalized Title
  const seenTitles = new Set<string>();
  const dedupedCandidates = validCandidates.filter(c => {
    const t = normalizeString(c.row.title || '');
    if (!t || seenTitles.has(t)) return false;
    seenTitles.add(t);
    return true;
  });

  // If exact match was found, pin it
  const topCandidate = dedupedCandidates[0];
  const maxToReturn = topCandidate?.isExact ? 1 : (structuredQuery.quantity ? Math.min(limit, structuredQuery.quantity) : limit);
  const finalSelected = dedupedCandidates.slice(0, maxToReturn);

  // 8. Map to Structured Results
  const formattedResults: HybridSearchResult[] = finalSelected.map(c => {
    const row = c.row;
    const meta = (row.metadata || {}) as Record<string, any>;

    const collectedImages: string[] = [];
    if (Array.isArray(row.image_urls)) {
      collectedImages.push(...row.image_urls.filter((u: any) => typeof u === 'string' && u.startsWith('http')));
    }
    if (Array.isArray(meta.images)) {
      collectedImages.push(...meta.images.filter((u: any) => typeof u === 'string' && u.startsWith('http')));
    }

    const priceVal = meta.price ?? meta.cost ?? meta.estimatedPrice ?? row.price;
    const ratingVal = typeof meta.ratings === 'number' ? meta.ratings : (typeof meta.rating === 'number' ? meta.rating : undefined);
    const reviewsVal = typeof meta.reviews === 'number' ? meta.reviews : (typeof meta.review_count === 'number' ? meta.review_count : undefined);

    const freshness = calculateFreshness(row.last_seen || row.updated_at, row.still_listed !== false);

    return {
      id: row.id,
      widgetId: widget.id,
      title: row.title || 'Untitled',
      description: row.short_description || row.content || '',
      shortDescription: row.short_description || '',
      content: row.content || '',
      entityType: row.entity_type || 'product',
      sourceUrl: row.source_url,
      imageUrls: collectedImages,
      images: collectedImages,
      price: priceVal,
      currency: meta.currency,
      rating: ratingVal,
      reviews: reviewsVal,
      availability: meta.availability,
      category: meta.category,
      level: meta.level,
      attributes: meta.attributes || meta.specs,
      metadata: {
        ...meta,
        score: c.score,
        matchType: c.matchType,
        matchReasons: c.matchReasons,
        freshnessStatus: freshness.freshnessStatus,
        lastSeenHuman: freshness.lastSeenHuman,
        ...(freshness.hedgeInstruction ? { hedgeInstruction: freshness.hedgeInstruction } : {}),
      },
      firstSeen: row.first_seen || row.created_at || new Date().toISOString(),
      lastSeen: row.last_seen || row.updated_at || new Date().toISOString(),
      stillListed: row.still_listed !== false,
      freshnessStatus: freshness.freshnessStatus,
      score: c.score,
      matchType: c.matchType,
      matchReasons: c.matchReasons,
    };
  });

  // Build grounded context summary for LLM injection
  const summaryLines: string[] = [];
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

  return {
    query: cleanQuery,
    normalizedQuery: normQuery,
    intent,
    results: formattedResults,
    count: formattedResults.length,
    contextSummary: summaryLines.join('\n'),
    pinnedEntity: topCandidate?.isExact ? formattedResults[0] : undefined,
    structuredQuery,
  };
}
