/**
 * Dedicated Reranking Layer for Shared Hybrid Retrieval Pipeline
 *
 * Evaluates candidate items against:
 * 1. Exact title & entity name similarity (Levenshtein, Jaccard, token overlap)
 * 2. Semantic vector cosine similarity
 * 3. Entity type & domain alignment (with cross-domain isolation)
 * 4. Explicit user constraints (price bounds, sale status, negative filters, attributes, ratings)
 * 5. Freshness & still-listed status
 * 6. Source authority & specificity hierarchy (Specific Detail > Directory > Homepage/Policy/FAQ)
 * 7. Structured metadata completeness (pricing, media, ratings)
 * 8. User sort directives (price_asc, price_desc, rating_desc, newest)
 *
 * Lightweight and latency-conscious: pure in-memory deterministic evaluation (<1ms).
 */

import { calculateFreshness } from '@/lib/agents/tools';
import { StructuredQueryIntent } from './queryUnderstanding';

// ── Types & Interfaces ─────────────────────────────────────────────────────────

export interface CandidateItem {
  row: any;
  initialScore?: number;
  vectorSimilarity?: number;
  isExact?: boolean;
  isPartial?: boolean;
  isVector?: boolean;
  isKeyword?: boolean;
  matchType?: 'exact' | 'partial' | 'vector' | 'keyword' | 'broad_catalog';
  matchReasons?: string[];
}

export interface RerankerOptions {
  limit?: number;
  minScore?: number;
  includeInformational?: boolean;
}

export interface RerankedResult {
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
  score: number; // Final reranked fused score
  matchType: 'exact' | 'partial' | 'vector' | 'keyword' | 'broad_catalog';
  matchReasons: string[];
  isExact?: boolean;
}

export interface RerankerOutput {
  results: RerankedResult[];
  pinnedEntity?: RerankedResult;
  totalCandidates: number;
  survivingCount: number;
}

// ── Helper Utilities ──────────────────────────────────────────────────────────

function normalize(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str: string): string[] {
  return normalize(str)
    .split(' ')
    .filter(t => t.length > 1);
}

function levenshteinDistance(a: string, b: string): number {
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

function parsePriceNumber(val: any): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (!val || typeof val !== 'string') return null;
  const clean = val.replace(/[^0-9.]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

const BROAD_WORDS = new Set([
  'all', 'any', 'every', 'list', 'show', 'view', 'get', 'see', 'find', 'explore', 'available', 'browse',
  'vehicle', 'vehicles', 'car', 'cars', 'truck', 'trucks', 'suv', 'suvs', 'auto', 'automobile', 'automotive',
  'offering', 'offerings', 'program', 'programs', 'course', 'courses', 'product', 'products',
  'service', 'services', 'inventory', 'catalog', 'item', 'items', 'stock', 'availability',
  'discount', 'discounts', 'discounted', 'sale', 'sales', 'regular', 'priced', 'deal', 'deals', 'promo',
  'tell', 'details', 'information', 'about', 'what'
]);

const NEGATIVE_SYNONYMS: Record<string, string[]> = {
  electric: ['electric', 'ev', 'phev', 'hybrid', '4xe', 'bev', 'plug-in'],
  hybrid: ['hybrid', 'phev', '4xe', 'plug-in'],
  gas: ['gas', 'gasoline', 'petrol', 'v6', 'v8', 'hemi'],
  gasoline: ['gas', 'gasoline', 'petrol', 'v6', 'v8', 'hemi'],
  diesel: ['diesel'],
  prerequisite: ['prerequisite', 'prerequisites', 'advanced'],
};

// ── Main Reranker Engine ──────────────────────────────────────────────────────

/**
 * Dedicated Reranking Stage
 * Evaluates, scores, filters, deduplicates, and sorts raw retrieval candidates.
 */
export function rerankCandidates(
  candidates: CandidateItem[],
  rawQuery: string,
  structuredQuery: StructuredQueryIntent,
  options: RerankerOptions = {}
): RerankerOutput {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 0;
  const normQuery = normalize(rawQuery);
  const queryTokens = tokenize(rawQuery);
  const trueSpecificKeywords = structuredQuery.specificKeywords.filter(w => !BROAD_WORDS.has(w));
  const isSpecificEntityQuery = structuredQuery.intent === 'specific_entity' || trueSpecificKeywords.length > 0;
  const isCatalogQuery = structuredQuery.intent === 'catalog' || Boolean(structuredQuery.entityType);

  interface ScoredCandidate {
    cand: CandidateItem;
    score: number;
    isExact: boolean;
    isPartial: boolean;
    isVector: boolean;
    isKeyword: boolean;
    matchType: 'exact' | 'partial' | 'vector' | 'keyword' | 'broad_catalog';
    matchReasons: string[];
    isDetailPage: boolean;
    isDirectoryPage: boolean;
    isInformationalPage: boolean;
  }

  const scoredList: ScoredCandidate[] = [];

  for (const cand of candidates) {
    const row = cand.row;
    const meta = (row.metadata || {}) as Record<string, any>;
    const normTitle = normalize(row.title || '');
    const titleLower = (row.title || '').toLowerCase();
    const titleTokens = tokenize(row.title || '');
    const contentLower = (row.content || '').toLowerCase();
    const shortDescLower = (row.short_description || '').toLowerCase();
    const sourceUrlLower = (row.source_url || '').toLowerCase();
    const metaStrings = JSON.stringify(meta).toLowerCase();

    let score = cand.initialScore ?? 0;
    let isExact = Boolean(cand.isExact);
    let isPartial = Boolean(cand.isPartial);
    let isVector = Boolean(cand.isVector);
    let isKeyword = Boolean(cand.isKeyword);
    let matchType = cand.matchType || 'keyword';
    const matchReasons: string[] = [...(cand.matchReasons || [])];

    // ── 1. EXACT TITLE & ENTITY NAME SIMILARITY ──
    if (normTitle && normQuery) {
      if (normTitle === normQuery) {
        score += 1000;
        isExact = true;
        matchType = 'exact';
        matchReasons.push(`Exact full title match (+1000)`);
      } else if (normTitle.length >= 4 && normQuery.includes(normTitle)) {
        score += 550;
        isPartial = true;
        matchReasons.push(`Query contains exact entity title (+550)`);
      } else if (normQuery.length >= 4 && normTitle.includes(normQuery)) {
        score += 500;
        isPartial = true;
        matchReasons.push(`Entity title contains full query (+500)`);
      }
    }

    // Token overlap & bounded Levenshtein typo tolerance
    if (queryTokens.length > 0 && titleTokens.length > 0) {
      let matchedTokens = 0;
      let fuzzyMatchedTokens = 0;

      for (const qToken of queryTokens) {
        if (titleTokens.some(t => t === qToken || t.includes(qToken) || qToken.includes(t))) {
          matchedTokens++;
        } else if (qToken.length >= 4) {
          const maxDist = qToken.length >= 6 ? 2 : 1;
          const hasFuzzyToken = titleTokens.some(
            t => Math.abs(t.length - qToken.length) <= maxDist && levenshteinDistance(t, qToken) <= maxDist
          );
          if (hasFuzzyToken) {
            matchedTokens++;
            fuzzyMatchedTokens++;
          }
        }
      }

      const overlapRatio = matchedTokens / queryTokens.length;
      if (overlapRatio >= 0.75) {
        score += Math.round(overlapRatio * 400);
        isPartial = true;
        matchReasons.push(`High token overlap (${Math.round(overlapRatio * 100)}%) (+${Math.round(overlapRatio * 400)})`);
      } else if (overlapRatio >= 0.5) {
        score += Math.round(overlapRatio * 250);
        isPartial = true;
        matchReasons.push(`Moderate token overlap (${Math.round(overlapRatio * 100)}%) (+${Math.round(overlapRatio * 250)})`);
      }

      if (fuzzyMatchedTokens > 0) {
        score += fuzzyMatchedTokens * 150;
        isPartial = true;
        matchReasons.push(`Token fuzzy typo tolerance (${fuzzyMatchedTokens} tokens) (+${fuzzyMatchedTokens * 150})`);
      }
    }

    // Full title Levenshtein distance <= 2
    if (normTitle.length >= 5 && normQuery.length >= 5) {
      const dist = levenshteinDistance(normTitle, normQuery);
      if (dist <= 2) {
        score += 150;
        isPartial = true;
        matchReasons.push(`Fuzzy title match (Levenshtein dist ${dist}) (+150)`);
      }
    }

    // ── 2. SEMANTIC SIMILARITY INTEGRATION ──
    if (cand.vectorSimilarity !== undefined) {
      const sim = cand.vectorSimilarity;
      if (sim >= 0.40 || isExact || isPartial || isKeyword || isCatalogQuery) {
        const vectorBoost = Math.round(sim * 400);
        score += vectorBoost;
        isVector = true;
        matchReasons.push(`pgvector cosine similarity ${sim.toFixed(3)} (+${vectorBoost})`);
      }
    }

    // Keyword hit detection
    let keywordHits = 0;
    let titleKeywordHits = 0;
    for (const word of structuredQuery.specificKeywords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordRegex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (wordRegex.test(titleLower)) {
        score += 60;
        keywordHits++;
        titleKeywordHits++;
        isKeyword = true;
        matchReasons.push(`Keyword match '${word}' in title (+60)`);
      } else if (wordRegex.test(metaStrings)) {
        score += 35;
        keywordHits++;
        isKeyword = true;
        matchReasons.push(`Keyword match '${word}' in metadata (+35)`);
      } else if (wordRegex.test(contentLower)) {
        score += 15;
        keywordHits++;
        if (keywordHits >= 2 || structuredQuery.specificKeywords.length === 1) {
          isKeyword = true;
        }
        matchReasons.push(`Keyword match '${word}' in content (+15)`);
      }
    }

    // Specific Keyword Constraint enforcement:
    // If the query specified distinct keywords (e.g. "backend", "wrangler", "16th", "president"),
    // items with 0 keyword matches and no exact/partial title match must be rejected.
    if (trueSpecificKeywords.length > 0 && keywordHits === 0 && !isExact && !isPartial) {
      score -= 800;
      isKeyword = false;
      matchReasons.push(`No match for specific required keywords [${trueSpecificKeywords.join(', ')}] (-800)`);
    } else if (trueSpecificKeywords.length >= 2 && keywordHits < 2 && titleKeywordHits === 0 && !isExact && !isPartial) {
      // Multiple required keywords but only 1 spurious body hit (e.g. "president of united states")
      score -= 800;
      isKeyword = false;
      matchReasons.push(`Insufficient keyword coverage (${keywordHits}/${trueSpecificKeywords.length} keywords) (-800)`);
    }

    // Broad catalog discovery
    const itemPrice = parsePriceNumber(meta.price ?? meta.cost ?? meta.estimatedPrice ?? row.price);
    if (isCatalogQuery && trueSpecificKeywords.length === 0) {
      const hasPriceOrMedia = Boolean(itemPrice) || Boolean(row.image_urls?.length) || Boolean(meta.images?.length);
      if (hasPriceOrMedia || ['course', 'product', 'vehicle', 'service'].includes(row.entity_type)) {
        score += 80;
        matchType = 'broad_catalog';
        matchReasons.push(`Broad catalog discovery (+80)`);
      }
    }

    // Multi-signal synergy boost
    const activeChannels = [isExact, isPartial, isVector, isKeyword].filter(Boolean).length;
    if (activeChannels >= 2) {
      score += 50 * (activeChannels - 1);
      matchReasons.push(`Multi-channel synergy boost (${activeChannels} channels) (+${50 * (activeChannels - 1)})`);
    }

    // ── 3. ENTITY TYPE & DOMAIN CONFLICT ISOLATION ──
    const rowType = (row.entity_type || 'product').toLowerCase();
    const isVehicleRow =
      rowType === 'vehicle' ||
      Boolean(
        meta.vin ||
          meta.make ||
          meta.model ||
          meta.year ||
          meta.mileage ||
          /\b(?:jeep|dodge|ram|chrysler|truck|suv|sedan|dealer|dealership|coupe|hatchback|convertible)\b/i.test(
            titleLower + ' ' + metaStrings
          )
      );
    const isCourseRow =
      (rowType === 'course' ||
        Boolean(
          meta.curriculum ||
            meta.syllabus ||
            meta.instructor ||
            meta.lessons ||
            /\b(?:course|courses|tutorial|tutorials|mastery|curriculum|bootcamp|lesson|lessons)\b/i.test(
              titleLower + ' ' + contentLower
            )
        )) &&
      !isVehicleRow;

    if (structuredQuery.entityType) {
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
        score += 80;
        matchReasons.push(`Entity type match: ${structuredQuery.entityType} (+80)`);
      } else if (isConflictingType) {
        score -= 500;
        matchReasons.push(`Entity type mismatch: expected ${structuredQuery.entityType}, got conflicting domain row (-500)`);
      }
    }

    // ── 4. EXPLICIT USER CONSTRAINTS ──

    // A. Budget Constraints
    if (structuredQuery.maxPrice !== undefined) {
      if (itemPrice !== null && itemPrice <= structuredQuery.maxPrice) {
        score += 80;
        matchReasons.push(`Price $${itemPrice} <= maxPrice $${structuredQuery.maxPrice} (+80)`);
      } else if (itemPrice !== null && itemPrice > structuredQuery.maxPrice) {
        score -= 500;
        matchReasons.push(`Price $${itemPrice} exceeds maxPrice $${structuredQuery.maxPrice} (-500)`);
      }
    }

    if (structuredQuery.minPrice !== undefined) {
      if (itemPrice !== null && itemPrice >= structuredQuery.minPrice) {
        score += 80;
        matchReasons.push(`Price $${itemPrice} >= minPrice $${structuredQuery.minPrice} (+80)`);
      } else if (itemPrice !== null && itemPrice < structuredQuery.minPrice) {
        score -= 500;
        matchReasons.push(`Price $${itemPrice} below minPrice $${structuredQuery.minPrice} (-500)`);
      }
    }

    // B. Sale / Discount State Filter
    const isItemOnSale = Boolean(
      meta.sale ||
        meta.onSale ||
        meta.discount ||
        meta.isDiscounted ||
        (meta.originalPrice &&
          meta.price &&
          parsePriceNumber(meta.originalPrice) &&
          parsePriceNumber(meta.price) &&
          parsePriceNumber(meta.originalPrice)! > parsePriceNumber(meta.price)!)
    );

    if (structuredQuery.onSale !== undefined) {
      if (structuredQuery.onSale === true) {
        if (isItemOnSale) {
          score += 100;
          matchReasons.push(`Item on sale / discounted (+100)`);
        } else {
          score -= 400;
          matchReasons.push(`Item not on sale / no discount (-400)`);
        }
      } else if (structuredQuery.onSale === false) {
        if (!isItemOnSale) {
          score += 60;
          matchReasons.push(`Item is regular-priced / non-discounted (+60)`);
        } else {
          score -= 400;
          matchReasons.push(`Item is on sale / excluded by no-discount filter (-400)`);
        }
      }
    }

    // C. Rating Minimum & Rating Boost
    const rating = typeof meta.ratings === 'number' ? meta.ratings : typeof meta.rating === 'number' ? meta.rating : 0;
    if (structuredQuery.minRating !== undefined) {
      if (rating >= structuredQuery.minRating) {
        score += 80;
        matchReasons.push(`Rating ${rating} >= minRating ${structuredQuery.minRating} (+80)`);
      } else if (rating > 0 && rating < structuredQuery.minRating) {
        score -= 400;
        matchReasons.push(`Rating ${rating} < minRating ${structuredQuery.minRating} (-400)`);
      }
    } else if (structuredQuery.sortBy === 'rating_desc' && rating >= 4) {
      score += Math.round(rating * 15);
      matchReasons.push(`High rating ${rating} boost (+${Math.round(rating * 15)})`);
    }

    // D. Availability / In-Stock
    if (structuredQuery.inStock !== undefined) {
      const isAvailable = row.still_listed !== false && meta.availability !== 'out of stock' && meta.availability !== 'sold out';
      if (structuredQuery.inStock === true) {
        if (isAvailable) {
          score += 60;
          matchReasons.push(`Item available / in stock (+60)`);
        } else {
          score -= 500;
          matchReasons.push(`Item unavailable / out of stock (-500)`);
        }
      }
    }

    // E. Attributes Matching
    if (Object.keys(structuredQuery.attributes).length > 0) {
      for (const [k, v] of Object.entries(structuredQuery.attributes)) {
        const valLower = String(v).toLowerCase();
        if (metaStrings.includes(valLower) || titleLower.includes(valLower) || contentLower.includes(valLower)) {
          score += 60;
          matchReasons.push(`Attribute match ${k}=${v} (+60)`);
        }
      }
    }

    // F. Negative Constraints
    if (structuredQuery.negativeKeywords.length > 0) {
      for (const negWord of structuredQuery.negativeKeywords) {
        const wordsToCheck = NEGATIVE_SYNONYMS[negWord] || [negWord];
        for (const w of wordsToCheck) {
          const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const negRegex = new RegExp(`\\b${escaped}\\b`, 'i');
          if (negRegex.test(titleLower) || negRegex.test(metaStrings) || negRegex.test(contentLower)) {
            score -= 600;
            matchReasons.push(`Violates negative constraint '${negWord}' via '${w}' (-600)`);
            break;
          }
        }
      }
    }

    // ── 5. SOURCE AUTHORITY & SPECIFICITY HIERARCHY ──
    // Specific Detail Page: specific slug (e.g. /courses/mern-stack-development-course, /inventory/2024-jeep...) or specific specs
    const isInformationalPage =
      (sourceUrlLower && /\/(about|privacy|terms|cookie|policy|faq|help|contact)\/?$/i.test(sourceUrlLower)) ||
      /terms|privacy|policy|cookie|disclaimer|faq|frequently asked/.test(titleLower);

    const isDirectoryPage =
      (sourceUrlLower && /\/(courses|products|services|catalog|inventory|shop|all)\/?$/i.test(sourceUrlLower)) ||
      (!isInformationalPage && /courses\s*catalog|all\s*courses|vehicle\s*inventory|all\s*inventory/i.test(titleLower));

    const isDetailPage = !isInformationalPage && !isDirectoryPage && (Boolean(itemPrice) || isCourseRow || isVehicleRow || isExact);

    if (isDetailPage) {
      score += 150;
      matchReasons.push(`Specific entity detail page authority boost (+150)`);
    } else if (isDirectoryPage) {
      if (isSpecificEntityQuery) {
        score -= 250;
        matchReasons.push(`Directory page downranked on specific entity query (-250)`);
      }
    } else if (isInformationalPage) {
      if (isSpecificEntityQuery) {
        score -= 500;
        matchReasons.push(`Informational/policy page excluded on specific entity query (-500)`);
      }
    }

    // ── 6. FRESHNESS & ACTIVE LISTING STATUS ──
    const freshness = calculateFreshness(row.last_seen || row.updated_at, row.still_listed !== false);
    if (row.still_listed === false) {
      score -= 400;
      matchReasons.push(`Item is unlisted / removed (-400)`);
    } else {
      score += 40;
      matchReasons.push(`Item is currently active & listed (+40)`);
    }

    if (freshness.freshnessStatus === 'fresh') {
      score += 30;
      matchReasons.push(`Data is fresh (<7 days) (+30)`);
    } else if (freshness.freshnessStatus === 'recent') {
      score += 10;
      matchReasons.push(`Data is recent (7-30 days) (+10)`);
    } else {
      score -= 60;
      matchReasons.push(`Data is stale (>30 days) (-60)`);
    }

    // ── 7. STRUCTURED METADATA COMPLETENESS ──
    if (itemPrice !== null) {
      score += 30;
    }
    if ((row.image_urls && row.image_urls.length > 0) || (meta.images && meta.images.length > 0)) {
      score += 30;
    }
    if (rating > 0) {
      score += 20;
    }

    // ── RELEVANCE GATE: Discard candidates with zero match signals on non-catalog queries ──
    const hasRelevanceSignal = isExact || isPartial || isKeyword || (isVector && (cand.vectorSimilarity ?? 0) >= 0.35);
    if (!isCatalogQuery && !hasRelevanceSignal) {
      score = -9999;
      matchReasons.push(`No relevance match signals found for query (-9999)`);
    }

    scoredList.push({
      cand,
      score,
      isExact,
      isPartial,
      isVector,
      isKeyword,
      matchType,
      matchReasons,
      isDetailPage,
      isDirectoryPage,
      isInformationalPage,
    });
  }

  // ── 8. FILTER VALID SURVIVING CANDIDATES ──
  const valid = scoredList.filter(s => s.score > minScore);

  if (valid.length === 0) {
    return {
      results: [],
      pinnedEntity: undefined,
      totalCandidates: candidates.length,
      survivingCount: 0,
    };
  }

  // ── 9. APPLY USER SORT DIRECTIVES ──
  if (structuredQuery.sortBy === 'price_asc') {
    valid.sort((a, b) => {
      const pA = parsePriceNumber((a.cand.row.metadata || {}).price ?? a.cand.row.price) ?? 999999;
      const pB = parsePriceNumber((b.cand.row.metadata || {}).price ?? b.cand.row.price) ?? 999999;
      return pA - pB;
    });
  } else if (structuredQuery.sortBy === 'price_desc') {
    valid.sort((a, b) => {
      const pA = parsePriceNumber((a.cand.row.metadata || {}).price ?? a.cand.row.price) ?? 0;
      const pB = parsePriceNumber((b.cand.row.metadata || {}).price ?? b.cand.row.price) ?? 0;
      return pB - pA;
    });
  } else if (structuredQuery.sortBy === 'rating_desc') {
    valid.sort((a, b) => {
      const rA = (a.cand.row.metadata || {}).rating ?? (a.cand.row.metadata || {}).ratings ?? 0;
      const rB = (b.cand.row.metadata || {}).rating ?? (b.cand.row.metadata || {}).ratings ?? 0;
      return rB - rA;
    });
  } else if (structuredQuery.sortBy === 'newest') {
    valid.sort((a, b) => {
      const tA = new Date(a.cand.row.created_at || a.cand.row.first_seen || 0).getTime();
      const tB = new Date(b.cand.row.created_at || b.cand.row.first_seen || 0).getTime();
      return tB - tA;
    });
  } else {
    // Default: Sort by reranked score descending
    valid.sort((a, b) => b.score - a.score);
  }

  // ── 10. DEDUPLICATE BY NORMALIZED TITLE & SELECT TOP-K ──
  const seenTitles = new Set<string>();
  const deduped = valid.filter(s => {
    const t = normalize(s.cand.row.title || '');
    if (!t || seenTitles.has(t)) return false;
    seenTitles.add(t);
    return true;
  });

  const topScored = deduped[0];
  const maxToReturn = topScored?.isExact
    ? 1
    : structuredQuery.quantity
    ? Math.min(limit, structuredQuery.quantity)
    : limit;

  const finalSelected = deduped.slice(0, maxToReturn);

  // ── 11. MAP TO FORMATTED RERANKED RESULTS ──
  const results: RerankedResult[] = finalSelected.map(s => {
    const row = s.cand.row;
    const meta = (row.metadata || {}) as Record<string, any>;

    const collectedImages: string[] = [];
    if (Array.isArray(row.image_urls)) {
      collectedImages.push(...row.image_urls.filter((u: any) => typeof u === 'string' && u.startsWith('http')));
    }
    if (Array.isArray(meta.images)) {
      collectedImages.push(...meta.images.filter((u: any) => typeof u === 'string' && u.startsWith('http')));
    }

    const priceVal = meta.price ?? meta.cost ?? meta.estimatedPrice ?? row.price;
    const ratingVal = typeof meta.ratings === 'number' ? meta.ratings : typeof meta.rating === 'number' ? meta.rating : undefined;
    const reviewsVal = typeof meta.reviews === 'number' ? meta.reviews : typeof meta.review_count === 'number' ? meta.review_count : undefined;
    const freshness = calculateFreshness(row.last_seen || row.updated_at, row.still_listed !== false);

    return {
      id: row.id,
      widgetId: row.widget_id || row.website_id || '',
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
        score: s.score,
        matchType: s.matchType,
        matchReasons: s.matchReasons,
        freshnessStatus: freshness.freshnessStatus,
        lastSeenHuman: freshness.lastSeenHuman,
        ...(freshness.hedgeInstruction ? { hedgeInstruction: freshness.hedgeInstruction } : {}),
      },
      firstSeen: row.first_seen || row.created_at || new Date().toISOString(),
      lastSeen: row.last_seen || row.updated_at || new Date().toISOString(),
      stillListed: row.still_listed !== false,
      freshnessStatus: freshness.freshnessStatus,
      score: s.score,
      matchType: s.matchType,
      matchReasons: s.matchReasons,
      isExact: s.isExact,
    };
  });

  return {
    results,
    pinnedEntity: topScored?.isExact ? results[0] : undefined,
    totalCandidates: candidates.length,
    survivingCount: deduped.length,
  };
}
