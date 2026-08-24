/**
 * Unified Hybrid RAG Service
 *
 * Combines:
 * 1. Exact entity/title matching (dominant priority +1000)
 * 2. Keyword & specification matching (title, specs, metadata, content)
 * 3. PostgreSQL pgvector cosine semantic similarity (via match_website_data RPC)
 * 4. Entity type & category filtering
 * 5. Metadata attribute filtering (specs, transmission, engine, fuel type, etc.)
 * 6. Freshness verification (fresh, recent, stale_or_unlisted)
 * 7. Structured constraint parsing (price min/max, sorting, negative constraints)
 *
 * Used by Chat, Retell Voice, Vapi Voice, Agent Tools, and Public APIs.
 */

import { getDbClient, getWidget, isValidUuid, searchWebsiteDataVector } from '@/config/widgetsDb';
import { calculateFreshness } from '@/lib/agents/tools';

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
  intent: 'specific_entity' | 'catalog' | 'comparison' | 'about' | 'policy' | 'faq' | 'contact' | 'greeting' | 'general';
  results: HybridSearchResult[];
  count: number;
  contextSummary: string; // Formatted markdown/plain text for LLM prompts
  pinnedEntity?: HybridSearchResult; // Dominant exact/top entity match if any
}

interface ParsedHybridConstraints {
  maxPrice?: number;
  minPrice?: number;
  sortByPrice?: 'asc' | 'desc';
  sortByRating?: boolean;
  isAboutQuery: boolean;
  isPolicyQuery: boolean;
  isFaqQuery: boolean;
  isContactQuery: boolean;
  isCatalogQuery: boolean;
  isComparisonQuery: boolean;
  comparisonQueries?: string[];
  negativeKeywords: string[]; // e.g. ['electric', 'hybrid', 'prerequisite']
  specificKeywords: string[];
}

// ── Helper Functions ──────────────────────────────────────────────────────────

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_-]+/).filter(t => t.length > 0);
}

function parsePriceNumber(val: any): number | null {
  if (typeof val === 'number') return isNaN(val) ? null : val;
  if (!val) return null;
  const str = String(val).replace(/,/g, '');
  const m = str.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

const STOP_WORDS = new Set([
  'show', 'me', 'the', 'a', 'an', 'what', 'is', 'your', 'tell', 'about',
  'can', 'you', 'give', 'details', 'for', 'of', 'in', 'at', 'with', 'do',
  'have', 'offer', 'available', 'there', 'any', 'how', 'much', 'are', 'i',
  'want', 'to', 'know', 'see', 'find', 'looking', 'get', 'more', 'info',
  'all', 'every', 'list', 'view', 'explore', 'browse',
  'course', 'courses', 'product', 'products', 'service', 'services', 'offering',
  'offerings', 'program', 'programs', 'item', 'items', 'class', 'classes',
  'vehicle', 'vehicles', 'car', 'cars', 'truck', 'trucks', 'suv', 'suvs',
  'auto', 'automobile', 'automotive', 'inventory', 'catalog',
  'family', 'offroad', 'suitable', 'conditions', 'winter', 'driving', 'need', 'something',
  'not', 'no', 'non', 'without', 'excluding', 'except', 'never',
  'under', 'below', 'less', 'than', 'cheaper', 'max', 'maximum', 'above',
  'over', 'more', 'greater', 'min', 'minimum', 'between', 'and', 'or',
  'budget', 'affordable', 'least', 'most', 'expensive', 'cheapest', 'best',
  'top', 'rated', 'popular', 'price', 'pricing', 'cost', 'costs', 'fee', 'fees',
  'tuition', 'dollar', 'dollars', 'bucks'
]);

export function parseHybridConstraints(query: string): ParsedHybridConstraints {
  const lower = query.trim().toLowerCase();

  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  let sortByPrice: 'asc' | 'desc' | undefined;

  const cleanNum = (s: string) => s.replace(/,/g, '');
  const underMatch = lower.match(/(?:under|below|less than|cheaper than|max(?:imum)?|<=?)\s*\$?([0-9,]+(?:\.\d+)?)/i);
  if (underMatch) maxPrice = parseFloat(cleanNum(underMatch[1]));

  const overMatch = lower.match(/(?:above|over|more than|greater than|min(?:imum)?|>=?)\s*\$?([0-9,]+(?:\.\d+)?)/i);
  if (overMatch) minPrice = parseFloat(cleanNum(overMatch[1]));

  const betweenMatch = lower.match(/between\s*\$?([0-9,]+(?:\.\d+)?)\s*(?:and|-|to)\s*\$?([0-9,]+(?:\.\d+)?)/i);
  if (betweenMatch) {
    minPrice = parseFloat(cleanNum(betweenMatch[1]));
    maxPrice = parseFloat(cleanNum(betweenMatch[2]));
  }

  if (/(?:cheapest|lowest price|least expensive|budget friendly|affordable)/i.test(lower)) {
    sortByPrice = 'asc';
  } else if (/(?:most expensive|premium|highest price|luxury)/i.test(lower)) {
    sortByPrice = 'desc';
  }

  const sortByRating = /(?:best rated|top rated|highest rated|top reviews|5 star|best |top |most popular)/i.test(lower);

  const isAboutQuery = /(?:about (?:us|the company|your team|you)|who (?:are you|made you|built you)|company mission|our story|company story|team members|founder)/i.test(lower);
  const isPolicyQuery = /(?:policy|policies|terms|privacy|gdpr|refund|cookie|compliance|legal|disclaimer|security|data protection)/i.test(lower);
  const isFaqQuery = /(?:faq|frequently asked|questions|help center)/i.test(lower);
  const isContactQuery = /(?:contact (?:us|team)|reach out|email address|phone number|office location|support team)/i.test(lower);
  const isCatalogQuery = !isAboutQuery && !isPolicyQuery && !isFaqQuery && !isContactQuery && /(?:course|courses|product|products|service|services|offering|offerings|class|classes|learn|bootcamp|catalog|pricing|price|cost|tier|buy|book|enroll|show|items?|what do you|inventory|listing|stock|menu|vehicle|vehicles|properties|plans|cars?|trucks?|suvs?|automotive|automobiles?)/i.test(lower);

  // Comparison intent detection (e.g., "compare X and Y", "X vs Y")
  let isComparisonQuery = false;
  let comparisonQueries: string[] = [];
  const vsMatch = query.match(/(.+?)\s+(?:vs\.?|versus|compared to|or)\s+(.+)/i);
  const compareMatch = query.match(/(?:compare|difference between)\s+(.+?)\s+(?:and|with|to)\s+(.+)/i);
  if (vsMatch && vsMatch[1] && vsMatch[2]) {
    isComparisonQuery = true;
    comparisonQueries = [vsMatch[1].trim(), vsMatch[2].trim()];
  } else if (compareMatch && compareMatch[1] && compareMatch[2]) {
    isComparisonQuery = true;
    comparisonQueries = [compareMatch[1].trim(), compareMatch[2].trim()];
  }

  // Negative constraint detection (e.g., "not electric", "excluding hybrid", "no prerequisite")
  const negativeKeywords: string[] = [];
  const negRegex = /\b(?:not|non|no|excluding|without|except)\s+([a-z0-9_-]+)/gi;
  let nMatch: RegExpExecArray | null;
  while ((nMatch = negRegex.exec(lower)) !== null) {
    if (nMatch[1] && nMatch[1].length > 2 && !STOP_WORDS.has(nMatch[1])) {
      negativeKeywords.push(nMatch[1].toLowerCase());
    }
  }

  // Differentiating specific keywords
  const negSet = new Set(negativeKeywords);
  const words = lower
    .split(/[^a-z0-9_-]+/)
    .filter(w => w.length > 2 && !/^\d+$/.test(w) && !STOP_WORDS.has(w) && !negSet.has(w));

  return {
    maxPrice,
    minPrice,
    sortByPrice,
    sortByRating,
    isAboutQuery,
    isPolicyQuery,
    isFaqQuery,
    isContactQuery,
    isCatalogQuery,
    isComparisonQuery,
    comparisonQueries,
    negativeKeywords,
    specificKeywords: words,
  };
}

// ── Core Hybrid Retrieval Engine ──────────────────────────────────────────────

/**
 * Unified Hybrid RAG Retrieval Service.
 *
 * Executes multi-channel retrieval across:
 * 1. Exact & Partial Title Match (Guaranteed dominance +1000 for exact entities)
 * 2. Real PostgreSQL pgvector Cosine Similarity Search
 * 3. Structured Keyword & Metadata Attribute Matching
 * 4. Constraint Enforcement (budget, ratings, negative constraints, freshness)
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

  const normQuery = normalizeString(cleanQuery);
  const queryTokens = tokenize(cleanQuery);
  const constraints = parseHybridConstraints(cleanQuery);

  // 1. Detect Intent
  let intent: HybridRetrievalOutput['intent'] = 'general';
  if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|start|help)$/i.test(cleanQuery)) {
    intent = 'greeting';
  } else if (constraints.isComparisonQuery) {
    intent = 'comparison';
  } else if (constraints.isAboutQuery) {
    intent = 'about';
  } else if (constraints.isPolicyQuery) {
    intent = 'policy';
  } else if (constraints.isFaqQuery) {
    intent = 'faq';
  } else if (constraints.isContactQuery) {
    intent = 'contact';
  } else if (constraints.isCatalogQuery) {
    intent = 'catalog';
  }

  if (intent === 'greeting') {
    return {
      query: cleanQuery,
      normalizedQuery: normQuery,
      intent,
      results: [],
      count: 0,
      contextSummary: '',
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
    console.warn(`[hybridRag:SCOPE_ENFORCEMENT] hybridRetrieve: No valid UUIDs for widget '${widgetOrWebsiteId}'. Failing closed.`);
    return {
      query: cleanQuery,
      normalizedQuery: normQuery,
      intent,
      results: [],
      count: 0,
      contextSummary: '',
    };
  }

  const { client } = getDbClient();
  if (!client) {
    return {
      query: cleanQuery,
      normalizedQuery: normQuery,
      intent,
      results: [],
      count: 0,
      contextSummary: '',
    };
  }

  // 3. Multi-Channel Retrieval Execution
  // Channel A & C: Load scoped rows for exact, partial, and keyword matching
  // Channel B: Call pgvector searchWebsiteDataVector in parallel
  const [rowsRes, vectorResults] = await Promise.all([
    client.from('website_data').select('*').in('widget_id', filterIds),
    searchWebsiteDataVector(widget.id, cleanQuery, Math.max(limit, 6), threshold).catch(() => []),
  ]);

  const allRows: any[] = rowsRes.data || [];
  if (allRows.length === 0 && vectorResults.length === 0) {
    return {
      query: cleanQuery,
      normalizedQuery: normQuery,
      intent,
      results: [],
      count: 0,
      contextSummary: '',
    };
  }

  // Map to hold merged candidates: key = row ID
  const candidateMap = new Map<string, {
    row: any;
    score: number;
    matchType: HybridSearchResult['matchType'];
    matchReasons: string[];
    isExact: boolean;
    isPartial: boolean;
    isVector: boolean;
    isKeyword: boolean;
  }>();

  // Populate candidates from allRows
  for (const row of allRows) {
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

  // Ensure vector results are present in candidateMap
  for (const vec of vectorResults) {
    if (vec.id && !candidateMap.has(vec.id)) {
      candidateMap.set(vec.id, {
        row: {
          id: vec.id,
          widget_id: widget.id,
          title: vec.title,
          content: vec.content,
          short_description: vec.shortDescription,
          source_url: vec.sourceUrl,
          image_urls: vec.imageUrls,
          entity_type: vec.entityType,
          metadata: vec.metadata,
        },
        score: 0,
        matchType: 'vector',
        matchReasons: [],
        isExact: false,
        isPartial: false,
        isVector: true,
        isKeyword: false,
      });
    }
  }

  let exactMatchDetected = false;

  // 4. Scoring: Multi-Signal Score Fusion

  // ── Channel A: Exact & Partial Title Match ──
  for (const [id, cand] of candidateMap.entries()) {
    const title = cand.row.title || '';
    if (!title) continue;

    const normTitle = normalizeString(title);
    const titleTokens = tokenize(title);

    // Exact Title Match: Highest Dominant Priority (+1000)
    if (normTitle.length > 0 && normTitle === normQuery) {
      cand.score += 1000;
      cand.matchType = 'exact';
      cand.isExact = true;
      cand.matchReasons.push(`Exact title match '${title}' (+1000)`);
      exactMatchDetected = true;
      continue;
    }

    // High-Confidence Partial / Alias Match
    if (normTitle.length >= 4 && (normQuery.includes(normTitle) || normTitle.includes(normQuery))) {
      cand.score += 600;
      cand.matchType = 'partial';
      cand.isPartial = true;
      cand.matchReasons.push(`High-confidence title partial match '${title}' (+600)`);
      continue;
    }

    // Token Set Overlap
    const significantQueryTokens = queryTokens.filter(t => t.length >= 3 && !STOP_WORDS.has(t));
    if (significantQueryTokens.length > 0) {
      const hitCount = significantQueryTokens.filter(qt => titleTokens.includes(qt)).length;
      if (hitCount === significantQueryTokens.length) {
        cand.score += 400;
        cand.matchType = 'partial';
        cand.isPartial = true;
        cand.matchReasons.push(`All query tokens present in title (+400)`);
      } else if (hitCount >= Math.max(2, Math.ceil(significantQueryTokens.length * 0.7))) {
        cand.score += 200;
        cand.matchType = 'partial';
        cand.isPartial = true;
        cand.matchReasons.push(`Strong token overlap (${hitCount}/${significantQueryTokens.length}) in title (+200)`);
      }
    }

    // Fuzzy Levenshtein match on title tokens (typo tolerance)
    if (queryTokens.length > 0) {
      for (const qt of queryTokens) {
        if (qt.length < 4) continue;
        const maxDist = qt.length <= 5 ? 1 : 2;
        for (const tt of titleTokens) {
          if (tt.length < 4) continue;
          if (Math.abs(qt.length - tt.length) > 1) continue;
          if (levenshtein(qt, tt) <= maxDist) {
            cand.score += 150;
            cand.matchReasons.push(`Fuzzy typo match '${qt}' ≈ '${tt}' (+150)`);
            break;
          }
        }
      }
    }
  }

  // ── Channel B: PostgreSQL pgvector Cosine Similarity ──
  for (const vec of vectorResults) {
    if (vec.id && candidateMap.has(vec.id)) {
      const cand = candidateMap.get(vec.id)!;
      const sim = vec.similarity ?? 0.5;
      const vectorScore = Math.round(sim * 400); // 0.8 sim = +320
      cand.score += vectorScore;
      cand.isVector = true;
      if (!cand.isExact && !cand.isPartial) {
        cand.matchType = 'vector';
      }
      cand.matchReasons.push(`pgvector cosine similarity ${sim.toFixed(4)} (+${vectorScore})`);
    }
  }

  // ── Channel C: Multi-Field Keyword & Attribute Matching ──
  for (const [id, cand] of candidateMap.entries()) {
    const meta = (cand.row.metadata || {}) as Record<string, any>;
    const titleLower = (cand.row.title || '').toLowerCase();
    const contentLower = (cand.row.content || '').toLowerCase();
    const metaStrings = Object.values(meta)
      .filter(v => typeof v === 'string' || typeof v === 'number')
      .join(' ')
      .toLowerCase();

    const isErrorPage = /request rejected|access denied|403 forbidden|404 not found/i.test(titleLower) ||
      (cand.row.still_listed === false && !meta.price && cand.row.entity_type === 'text');
    if (isErrorPage) {
      cand.score = -999;
      continue;
    }

    const itemPrice = parsePriceNumber(meta.price ?? meta.cost ?? meta.estimatedPrice ?? cand.row.price);
    const rating = typeof meta.ratings === 'number' ? meta.ratings : (typeof meta.rating === 'number' ? meta.rating : 0);

    let keywordHits = 0;
    if (constraints.specificKeywords.length > 0) {
      for (const word of constraints.specificKeywords) {
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
      'service', 'services', 'inventory', 'catalog', 'item', 'items'
    ]);
    const trueSpecificKeywords = constraints.specificKeywords.filter(w => !BROAD_WORDS.has(w));

    // Broad catalog queries (e.g. "show me cars", "all offerings", "show me all vehicles")
    if (constraints.isCatalogQuery && trueSpecificKeywords.length === 0) {
      const hasPriceOrMedia = Boolean(itemPrice) || Boolean(cand.row.image_urls?.length) || Boolean(meta.images?.length);
      if (hasPriceOrMedia || ['course', 'product', 'vehicle', 'service'].includes(cand.row.entity_type)) {
        cand.score += 80;
        cand.matchType = 'broad_catalog';
        cand.matchReasons.push(`Broad catalog discovery (+80)`);
      }
    }

    // Multi-signal synergy boost (if an item matched BOTH vector AND keyword/partial)
    const activeChannels = [cand.isExact, cand.isPartial, cand.isVector, cand.isKeyword].filter(Boolean).length;
    if (activeChannels >= 2) {
      cand.score += 50 * (activeChannels - 1);
      cand.matchReasons.push(`Multi-channel synergy boost (${activeChannels} channels) (+${50 * (activeChannels - 1)})`);
    }

    // ── Constraints & Filtering ──

    // Budget constraints
    if (constraints.maxPrice !== undefined) {
      if (itemPrice !== null && itemPrice <= constraints.maxPrice) {
        cand.score += 80;
        cand.matchReasons.push(`Price $${itemPrice} <= maxPrice $${constraints.maxPrice} (+80)`);
      } else if (itemPrice !== null && itemPrice > constraints.maxPrice) {
        cand.score -= 400;
        cand.matchReasons.push(`Price $${itemPrice} exceeds maxPrice $${constraints.maxPrice} (-400)`);
      }
    }

    if (constraints.minPrice !== undefined) {
      if (itemPrice !== null && itemPrice >= constraints.minPrice) {
        cand.score += 80;
        cand.matchReasons.push(`Price $${itemPrice} >= minPrice $${constraints.minPrice} (+80)`);
      } else if (itemPrice !== null && itemPrice < constraints.minPrice) {
        cand.score -= 400;
        cand.matchReasons.push(`Price $${itemPrice} below minPrice $${constraints.minPrice} (-400)`);
      }
    }

    // Rating boost
    if (constraints.sortByRating && rating >= 4) {
      cand.score += Math.round(rating * 15);
      cand.matchReasons.push(`High rating ${rating} boost (+${Math.round(rating * 15)})`);
    }

    // Negative constraints (e.g. "not electric", "excluding hybrid")
    const NEGATIVE_SYNONYMS: Record<string, string[]> = {
      electric: ['electric', 'ev', 'phev', 'hybrid', '4xe', 'bev', 'plug-in'],
      hybrid: ['hybrid', 'phev', '4xe', 'plug-in'],
      gas: ['gas', 'gasoline', 'petrol', 'v6', 'v8', 'hemi'],
      gasoline: ['gas', 'gasoline', 'petrol', 'v6', 'v8', 'hemi'],
      diesel: ['diesel'],
      prerequisite: ['prerequisite', 'prerequisites', 'advanced'],
    };

    if (constraints.negativeKeywords.length > 0) {
      for (const negWord of constraints.negativeKeywords) {
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

    // Generic directory page / policy downranking:
    // If the query targets a specific entity or catalog item, prevent generic pages (/courses, /all, /privacy) from hijacking
    const isDirectoryOrPolicy =
      (cand.row.source_url && /\/(courses|products|services|catalog|inventory|shop|all|privacy|terms|cookie|policy)\/?$/i.test(cand.row.source_url)) ||
      /terms|privacy|policy|cookie|disclaimer/.test(titleLower);

    if (isDirectoryOrPolicy) {
      if (exactMatchDetected || constraints.specificKeywords.length > 0) {
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
    };
  }

  // Sorting
  if (constraints.sortByPrice === 'asc') {
    validCandidates.sort((a, b) => {
      const pA = parsePriceNumber((a.row.metadata || {}).price ?? a.row.price) ?? 999999;
      const pB = parsePriceNumber((b.row.metadata || {}).price ?? b.row.price) ?? 999999;
      return pA - pB;
    });
  } else if (constraints.sortByPrice === 'desc') {
    validCandidates.sort((a, b) => {
      const pA = parsePriceNumber((a.row.metadata || {}).price ?? a.row.price) ?? 0;
      const pB = parsePriceNumber((b.row.metadata || {}).price ?? b.row.price) ?? 0;
      return pB - pA;
    });
  } else if (constraints.sortByRating) {
    validCandidates.sort((a, b) => {
      const rA = (a.row.metadata || {}).rating ?? 0;
      const rB = (b.row.metadata || {}).rating ?? 0;
      return rB - rA;
    });
  } else {
    validCandidates.sort((a, b) => b.score - a.score);
  }

  // Deduplicate by normalized title
  const seenTitles = new Set<string>();
  const dedupedCandidates = validCandidates.filter(c => {
    const t = normalizeString(c.row.title || '');
    if (!t || seenTitles.has(t)) return false;
    seenTitles.add(t);
    return true;
  });

  // If exact match was found, pin it
  const topCandidate = dedupedCandidates[0];
  const maxToReturn = topCandidate?.isExact ? 1 : limit;
  const finalSelected = dedupedCandidates.slice(0, maxToReturn);

  // 6. Map to Full Structured Results
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

  // Assemble clean Grounded Text Context Summary for LLMs
  const contextSummary = formattedResults.map(r => {
    const parts = [`**${r.title}**`];
    if (r.price) parts.push(`Price: ${r.price}`);
    if (r.description) parts.push(r.description);
    if (r.sourceUrl) parts.push(`URL: ${r.sourceUrl}`);
    return parts.join('\n');
  }).join('\n\n');

  return {
    query: cleanQuery,
    normalizedQuery: normQuery,
    intent,
    results: formattedResults,
    count: formattedResults.length,
    contextSummary,
    pinnedEntity: topCandidate?.isExact ? formattedResults[0] : undefined,
  };
}
