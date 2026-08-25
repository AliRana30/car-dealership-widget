/**
 * Autonomous Page & Entity Navigation Resolver
 *
 * Resolves user navigation requests against actual crawled website data
 * (website_data records and websites.known_urls) in a domain-agnostic manner.
 *
 * Enforces strict confidence verification, canonical URL extraction,
 * session anaphora/ordinal resolution, and zero-guessing fallback protection.
 *
 * Navigation flow:
 * user request -> navigation intent detection -> resolve against discovered site pages/entities
 *              -> confidence/ranking -> valid destination -> WIDGET_NAVIGATE -> host website
 */

import { getDbClient, getWidget, isValidUuid, WebsiteDataRecord } from '@/config/widgetsDb';
import { getSessionContext, DurableSessionContext } from './sessionContext';
import { appendResumeParam, getEntityDetails } from './tools';
import { formatResult, StructuredEntity } from './unifiedTools';

export type NavigationConfidence = 'exact' | 'partial' | 'ambiguous' | 'not_found' | 'invalid_url';

export interface NavigationResolutionResult {
  canNavigate: boolean;
  targetUrl?: string;
  destinationUrl?: string;
  resolvedEntity?: StructuredEntity;
  resolvedPageTitle?: string;
  pageTitle?: string;
  confidence: NavigationConfidence;
  source?: 'discovered_page' | 'discovered_entity';
  intent?: 'navigate';
  clarificationMessage?: string;
  candidateOptions?: Array<{ id: string; title: string; url?: string }>;
  failureReason?: string;
}

export interface NavigationResolverOptions {
  sessionId?: string;
  allowAgentNavigation?: boolean;
}

interface DiscoveredDestination {
  id: string;
  url: string;
  pathname: string;
  slug: string;
  slugTokens: string[];
  title: string;
  cleanTitle: string;
  titleTokens: string[];
  entityType: string;
  isPage: boolean;
  isEntity: boolean;
  record?: WebsiteDataRecord;
}

// ── Normalization and String Utilities ─────────────────────────────────────────

export function normalizeString(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeString(s)
    .split(' ')
    .filter(t => t.length >= 2);
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

/**
 * Strips common website branding suffixes from page titles (e.g. "About — CampusCore", "Contact | Noretmy").
 */
function cleanBrandingFromTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\s*[—–\-|•:]\s*[^—–\-|•:]+$/i, '')
    .trim();
}

/**
 * Extracts clean entity or page target name by stripping conversational navigation triggers.
 */
export function cleanNavigationQuery(query: string): string {
  let q = (query || '').trim();
  // Strip trailing punctuation first
  q = q.replace(/[?.!,:;]+$/, '').trim();
  // Strip leading conversational triggers
  q = q.replace(/^(?:please\s+)?(?:take\s+me\s+to\s+(?:where\s+i\s+can\s+(?:learn|read|see|find)\s+)?(?:the\s+)?(?:page\s+(?:for|of)\s+)?|where\s+(?:can\s+i|to|i\s+can)\s+(?:find|see|read|learn\s+about|learn|view)\s+(?:the\s+)?|navigate\s+(?:me\s+)?to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|go\s+to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|open\s+(?:up\s+)?(?:the\s+)?(?:page\s+(?:for|of)\s+)?|view\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|show\s+me\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|visit\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|redirect\s+(?:me\s+)?to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|bring\s+me\s+to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|lead\s+me\s+to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|can\s+you\s+(?:take|navigate|redirect)\s+me\s+to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?)/i, '');
  // Strip compound trailing entity suffixes and typo variations
  q = q.replace(/\s+(?:course\s+page|vehicle\s+page|product\s+page|service\s+page|freelancer\s+page|profile\s+page|details\s+page|page|paje|paige|section|tab|screen|details|offering|item|product|course|corse|vehicle|listing|link)$/i, '');
  // Strip trailing punctuation again
  q = q.replace(/[?.!,:;]+$/, '').trim();
  return q.trim();
}

/**
 * Detects if query represents a pronoun/anaphoric navigation.
 */
function isAnaphoricQuery(query: string): boolean {
  const norm = normalizeString(query);
  return /^(?:it|its|its\s+page|this|this\s+page|that|that\s+one|that\s+page|this\s+one|the\s+item|the\s+product|the\s+course|the\s+vehicle|the\s+service|open\s+it|open\s+that|open\s+its\s+page|take\s+me\s+to\s+it|take\s+me\s+to\s+its\s+page|navigate\s+to\s+it|navigate\s+to\s+its\s+page)$/i.test(norm) ||
         /^(?:open|show|view|navigate\s+to|take\s+me\s+to)\s+(?:it|its|its\s+page|that|this|that\s+one|this\s+one|that\s+course|that\s+product|that\s+vehicle|the\s+details)$/i.test(norm);
}

/**
 * Detects if query represents an ordinal navigation (e.g. "first one", "2nd one").
 */
function parseOrdinalQuery(query: string): number | null {
  const norm = normalizeString(query);
  if (/\b(?:first|1st|first\s+one|1st\s+one|top\s+one|top\s+result)\b/i.test(norm)) return 0;
  if (/\b(?:second|2nd|second\s+one|2nd\s+one)\b/i.test(norm)) return 1;
  if (/\b(?:third|3rd|third\s+one|3rd\s+one)\b/i.test(norm)) return 2;
  if (/\b(?:fourth|4th|fourth\s+one|4th\s+one)\b/i.test(norm)) return 3;
  if (/\b(?:fifth|5th|fifth\s+one|5th\s+one)\b/i.test(norm)) return 4;
  if (/\b(?:last|last\s+one|last\s+item|final\s+one)\b/i.test(norm)) return -1; // -1 represents last item
  return null;
}

// ── Domain-Agnostic Synonym & Alias Mappings ──────────────────────────────────

const CONCEPT_ALIASES: Record<string, string[]> = {
  about: [
    'about', 'about-us', 'about us', 'who-we-are', 'who we are', 'who are you',
    'company', 'our story', 'our-story', 'mission', 'story', 'team', 'our team',
    'our-team', 'leadership', 'overview', 'founder', 'bio', 'who are we',
    'company story', 'your story', 'learn your story'
  ],
  contact: [
    'contact', 'contact-us', 'contact us', 'reach-us', 'reach us', 'support',
    'help', 'get-in-touch', 'get in touch', 'locations', 'location', 'address',
    'phone', 'email', 'feedback', 'touch'
  ],
  faq: [
    'faq', 'faqs', 'frequently-asked-questions', 'frequently asked questions',
    'frequently asked', 'help-center', 'help center', 'q-and-a', 'q&a',
    'q and a', 'questions', 'knowledge-base', 'questions and answers',
    'questions & answers', 'common questions'
  ],
  policy: [
    'policy', 'policies', 'privacy', 'privacy-policy', 'privacy policy', 'terms',
    'terms-of-service', 'terms of service', 'terms-condition', 'terms and conditions',
    'terms-of-use', 'terms of use', 'legal', 'legal-notice', 'legal notice',
    'disclaimer', 'cookie-policy', 'cookie policy', 'refund-policy', 'refund policy',
    'gdpr', 'security', 'compliance', 'our policies', 'our policy'
  ],
  privacy: [
    'privacy', 'privacy-policy', 'privacy policy', 'gdpr', 'data protection',
    'cookie-policy', 'cookie policy'
  ],
  terms: [
    'terms', 'terms-of-service', 'terms of service', 'terms-condition',
    'terms and conditions', 'terms-of-use', 'terms of use', 'legal',
    'legal-notice', 'legal notice', 'disclaimer'
  ],
  courses: [
    'courses', 'course-catalog', 'course catalog', 'classes', 'all-courses',
    'all courses', 'catalog', 'catalogue', 'programs', 'all-programs',
    'curriculum', 'offerings'
  ],
  catalog: [
    'catalog', 'catalogue', 'inventory', 'all-vehicles', 'vehicles', 'shop',
    'store', 'products', 'all-products', 'services', 'all-services',
    'offerings', 'menu', 'all courses', 'courses', 'items'
  ],
  pricing: [
    'pricing', 'prices', 'plans', 'costs', 'rates', 'fees', 'tuition',
    'subscriptions', 'membership'
  ],
  home: [
    'home', 'homepage', 'root', 'main', 'start', 'index', 'landing',
    'landing-page', 'main-page', 'front-page', 'website'
  ],
  blog: [
    'blog', 'news', 'articles', 'posts', 'updates', 'press'
  ],
  careers: [
    'careers', 'jobs', 'join-us', 'join us', 'hiring', 'work-with-us',
    'work with us', 'openings'
  ],
  docs: [
    'docs', 'documentation', 'guide', 'guides', 'manual', 'api', 'reference'
  ],
};

function isTypoMatch(wordA: string, wordB: string): boolean {
  if (wordA === wordB) return true;
  const lenA = wordA.length;
  const lenB = wordB.length;
  if (lenA < 4 || lenB < 4) return false;

  // Length 4: only allow insertion/deletion where 3-char prefix matches (e.g. abot/about, term/terms, faqs/faq)
  if (lenA === 4 || lenB === 4) {
    if (Math.abs(lenA - lenB) <= 1 && (wordA.startsWith(wordB.slice(0, 3)) || wordB.startsWith(wordA.slice(0, 3)))) {
      return levenshteinDistance(wordA, wordB) <= 1;
    }
    return false;
  }

  // Length 5-6: allow edit distance <= 1
  if (lenA <= 6 && lenB <= 6) {
    return Math.abs(lenA - lenB) <= 1 && levenshteinDistance(wordA, wordB) <= 1;
  }

  // Length >= 7: allow edit distance <= 2
  return Math.abs(lenA - lenB) <= 2 && levenshteinDistance(wordA, wordB) <= 2;
}

function getConceptForTerm(term: string): string | null {
  const norm = normalizeString(term);
  if (!norm) return null;

  // 1. Exact phrase alias match
  for (const [concept, aliases] of Object.entries(CONCEPT_ALIASES)) {
    for (const alias of aliases) {
      if (norm === normalizeString(alias)) return concept;
    }
  }

  // 2. Token-level alias match & strict typo tolerance
  const words = tokenize(norm);
  for (const w of words) {
    for (const [concept, aliases] of Object.entries(CONCEPT_ALIASES)) {
      for (const alias of aliases) {
        const normAlias = normalizeString(alias);
        if (normAlias === w || isTypoMatch(w, normAlias)) {
          return concept;
        }
      }
    }
  }

  return null;
}

function areTermsConceptuallyRelated(termA: string, termB: string): boolean {
  const normA = normalizeString(termA);
  const normB = normalizeString(termB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const conceptA = getConceptForTerm(normA);
  const conceptB = getConceptForTerm(normB);
  if (conceptA && conceptB && conceptA === conceptB) return true;

  // Check if one term strictly matches an alias in the other's concept group
  if (conceptA) {
    const aliasesA = CONCEPT_ALIASES[conceptA] || [];
    if (aliasesA.some(a => {
      const na = normalizeString(a);
      return na === normB || isTypoMatch(na, normB);
    })) {
      return true;
    }
  }
  if (conceptB) {
    const aliasesB = CONCEPT_ALIASES[conceptB] || [];
    if (aliasesB.some(b => {
      const nb = normalizeString(b);
      return nb === normA || isTypoMatch(nb, normA);
    })) {
      return true;
    }
  }

  return false;
}

// ── Discovered Destinations Loader ─────────────────────────────────────────────

async function loadDiscoveredDestinations(widgetId: string): Promise<DiscoveredDestination[]> {
  const widget = await getWidget(widgetId);
  if (!widget) return [];

  const filterIds = [widget.id];
  if (widget.websiteId && widget.websiteId !== widget.id && widget.websiteId !== '00000000-0000-0000-0000-000000000000') {
    filterIds.push(widget.websiteId);
  }

  const { client: supabase } = getDbClient();

  // 1. Load website_data records
  const { data: rows, error: rowsErr } = await supabase
    .from('website_data')
    .select('*')
    .in('widget_id', filterIds);

  if (rowsErr) {
    console.warn('[navigationResolver] Error querying website_data:', rowsErr.message || rowsErr);
  }

  // 2. Load websites.known_urls if available
  let knownUrls: string[] = [];
  try {
    const { data: websiteRow } = await supabase
      .from('websites')
      .select('known_urls')
      .in('id', filterIds)
      .maybeSingle();

    if (websiteRow && Array.isArray(websiteRow.known_urls)) {
      knownUrls = websiteRow.known_urls;
    } else if (websiteRow && typeof websiteRow.known_urls === 'string') {
      try { knownUrls = JSON.parse(websiteRow.known_urls); } catch {}
    }
  } catch {}

  const destinations: DiscoveredDestination[] = [];
  const seenUrls = new Set<string>();

  // Process website_data records
  for (const row of rows || []) {
    const sourceUrl = (row.source_url || '').trim();
    if (!sourceUrl || !sourceUrl.startsWith('http')) continue;

    const normUrl = sourceUrl.replace(/\/+$/, '').toLowerCase();
    if (seenUrls.has(normUrl)) continue;
    seenUrls.add(normUrl);

    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      continue;
    }

    const pathname = parsed.pathname || '/';
    const pathSegments = pathname.split('/').filter(Boolean);
    const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
    const slugTokens = slug ? tokenize(slug.replace(/[-_]/g, ' ')) : [];

    const title = row.title || slug || 'Page';
    const cleanTitle = cleanBrandingFromTitle(title);
    const titleTokens = tokenize(cleanTitle);

    const entityType = (row.entity_type || 'text').toLowerCase();

    // Determine if this is a top-level Page / Route vs a specific Offering / Entity
    const isTopLevelSlug = pathSegments.length <= 1;
    const isStandardPageSlug = /^(?:about(?:-us)?|contact(?:-us)?|policy|policies|privacy(?:-policy)?|terms(?:-condition|-of-use|-of-service)?|faq|faqs|pricing|courses|catalog|inventory|shop|store|services|team|blog|careers|docs|help)$/i.test(slug);
    const isInformationalType = ['text', 'faq', 'page', 'info', 'policy', 'article', 'blog'].includes(entityType);

    const isDeepEntity =
      !isStandardPageSlug &&
      (pathSegments.length >= 2 ||
       Boolean(row.metadata?.price) ||
       Boolean(row.metadata?.cost) ||
       ['product', 'service', 'course', 'vehicle'].includes(entityType));

    const isPage = isTopLevelSlug || isStandardPageSlug || isInformationalType || !isDeepEntity;
    const isEntity = isDeepEntity || !isPage;

    destinations.push({
      id: row.id,
      url: sourceUrl,
      pathname,
      slug,
      slugTokens,
      title,
      cleanTitle,
      titleTokens,
      entityType,
      isPage,
      isEntity,
      record: row,
    });
  }

  // Process known_urls from sitemap / crawler
  for (const rawUrl of knownUrls) {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.startsWith('http')) continue;
    const normUrl = rawUrl.replace(/\/+$/, '').toLowerCase();
    if (seenUrls.has(normUrl)) continue;
    seenUrls.add(normUrl);

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      continue;
    }

    const pathname = parsed.pathname || '/';
    const pathSegments = pathname.split('/').filter(Boolean);
    const slug = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : '';
    const slugTokens = slug ? tokenize(slug.replace(/[-_]/g, ' ')) : [];

    const title = slug ? slug.replace(/[-_]/g, ' ') : 'Home';
    const cleanTitle = title;
    const titleTokens = tokenize(cleanTitle);

    const isTopLevelSlug = pathSegments.length <= 1;
    const isStandardPageSlug = /^(?:about(?:-us)?|contact(?:-us)?|policy|policies|privacy(?:-policy)?|terms(?:-condition|-of-use|-of-service)?|faq|faqs|pricing|courses|catalog|inventory|shop|store|services|team|blog|careers|docs|help)$/i.test(slug);

    destinations.push({
      id: `known-${destinations.length}`,
      url: rawUrl,
      pathname,
      slug,
      slugTokens,
      title,
      cleanTitle,
      titleTokens,
      entityType: 'text',
      isPage: isTopLevelSlug || isStandardPageSlug,
      isEntity: !isTopLevelSlug && !isStandardPageSlug,
    });
  }

  return destinations;
}

// ── Destination Candidate Scorer ──────────────────────────────────────────────

interface ScoredDestination {
  dest: DiscoveredDestination;
  score: number;
  confidence: NavigationConfidence;
  matchReasons: string[];
  isExact: boolean;
}

function scoreDestinationForQuery(
  dest: DiscoveredDestination,
  rawQuery: string,
  cleanTarget: string,
  isExplicitPageRequest: boolean,
  isExplicitEntityRequest: boolean
): ScoredDestination {
  const normQuery = normalizeString(rawQuery);
  const normTarget = normalizeString(cleanTarget);
  const targetTokens = tokenize(cleanTarget);

  const normTitle = normalizeString(dest.title);
  const normCleanTitle = normalizeString(dest.cleanTitle);
  const normSlug = normalizeString(dest.slug.replace(/[-_]/g, ' '));
  const rawSlug = dest.slug.toLowerCase();
  const rawPathname = dest.pathname.toLowerCase();

  let score = 0;
  const matchReasons: string[] = [];
  let isExact = false;

  // 1. Root / Homepage match
  const isHomeRequest = /^(?:home|homepage|root|start|index|main|landing|main page|home page|landing page|website)$/i.test(normTarget);
  if (isHomeRequest) {
    if (dest.pathname === '/' || dest.pathname === '' || dest.slug === '' || dest.slug === 'index.html') {
      score += 1000;
      isExact = true;
      matchReasons.push('Exact homepage/root route match (+1000)');
    }
  }

  // 2. Exact Canonical URL or Pathname match
  const cleanUrl = dest.url.replace(/\/+$/, '').toLowerCase();
  const queryAsUrl = cleanTarget.replace(/\/+$/, '').toLowerCase();

  if (queryAsUrl && (cleanUrl === queryAsUrl || cleanUrl.endsWith(queryAsUrl))) {
    score += 1000;
    isExact = true;
    matchReasons.push('Exact URL match (+1000)');
  } else if (rawPathname === `/${normTarget.replace(/^\/+/, '')}` || rawPathname === `/${rawSlug}`) {
    if (normTarget === normSlug || `/${normTarget}` === rawPathname) {
      score += 950;
      isExact = true;
      matchReasons.push(`Exact pathname match '${rawPathname}' (+950)`);
    }
  }

  // 3. Exact Title or Clean Title match
  if (normCleanTitle && normTarget && (normCleanTitle === normTarget || normTitle === normTarget)) {
    score += 1000;
    isExact = true;
    matchReasons.push(`Exact clean title match "${dest.cleanTitle}" (+1000)`);
  } else if (normCleanTitle && normTarget && (normCleanTitle.startsWith(normTarget) || normCleanTitle.includes(normTarget))) {
    score += 950;
    isExact = true;
    matchReasons.push(`Entity title contains search target "${normTarget}" (+950)`);
  }

  // 4. Exact Slug match
  if (normSlug && normTarget && (normSlug === normTarget || rawSlug === normTarget.replace(/\s+/g, '-'))) {
    score += 900;
    isExact = true;
    matchReasons.push(`Exact slug match "${dest.slug}" (+900)`);
  }

  // 5. Concept & Alias match (e.g. "about us" -> /about, "reach us" -> /contact-us, "faqs" -> /faq, "course catalog" -> /courses)
  const isGenericCatalogQuery = /^(?:courses?|course\s+catalog|all\s+courses|classes|catalog|catalogue|inventory|vehicles?|all\s+vehicles|cars?|all\s+cars|products?|all\s+products|services?|all\s+services|offerings|shop|store)$/i.test(cleanTarget);
  const targetConcept = getConceptForTerm(cleanTarget);
  const isInformationalConcept = Boolean(targetConcept && ['about', 'policy', 'privacy', 'terms', 'faq', 'contact', 'careers', 'docs'].includes(targetConcept));

  const isConceptMatch =
    dest.isPage &&
    (isGenericCatalogQuery || isInformationalConcept) &&
    (areTermsConceptuallyRelated(cleanTarget, dest.slug) ||
     areTermsConceptuallyRelated(cleanTarget, dest.cleanTitle) ||
     areTermsConceptuallyRelated(cleanTarget, dest.pathname.replace(/^\//, '')));

  if (isConceptMatch) {
    score += 900;
    isExact = true;
    matchReasons.push(`Concept alias match with '${dest.slug || dest.cleanTitle}' (+900)`);
  }

  // 6. Title / Slug / Metadata Token Overlap
  if (targetTokens.length > 0) {
    const metaTokens: string[] = [];
    if (dest.record?.metadata) {
      const meta = dest.record.metadata as Record<string, any>;
      ['make', 'model', 'trim', 'year', 'category', 'tags', 'level', 'skills'].forEach(k => {
        if (meta[k]) metaTokens.push(...tokenize(String(meta[k])));
      });
    }
    const allDestTokens = [...dest.titleTokens, ...dest.slugTokens, ...metaTokens];

    const isTokenMatch = (t: string, list: string[], text: string) => {
      if (list.includes(t) || text.includes(t)) return true;
      return list.some(item => isTypoMatch(item, t)) ||
             text.split(' ').some(w => isTypoMatch(w, t));
    };

    const matchedTitleTokens = targetTokens.filter(t => isTokenMatch(t, allDestTokens, normCleanTitle));
    const matchedSlugTokens = targetTokens.filter(t => isTokenMatch(t, dest.slugTokens, rawSlug));

    const titleOverlapRatio = matchedTitleTokens.length / targetTokens.length;
    const slugOverlapRatio = matchedSlugTokens.length / targetTokens.length;

    if (titleOverlapRatio >= 1.0) {
      score += 850;
      if (dest.isEntity) {
        isExact = true;
        matchReasons.push(`100% query token coverage on entity record (+850)`);
      } else {
        matchReasons.push(`Full title token coverage (+850)`);
      }
    } else if (titleOverlapRatio >= 0.6) {
      score += Math.round(titleOverlapRatio * 550);
      matchReasons.push(`Partial token overlap (${Math.round(titleOverlapRatio * 100)}%) (+${Math.round(titleOverlapRatio * 550)})`);
    }

    if (slugOverlapRatio >= 1.0) {
      score += 700;
      matchReasons.push(`Full slug token coverage (+700)`);
    } else if (slugOverlapRatio >= 0.5) {
      score += Math.round(slugOverlapRatio * 400);
      matchReasons.push(`Partial slug token overlap (${Math.round(slugOverlapRatio * 100)}%) (+${Math.round(slugOverlapRatio * 400)})`);
    }

    // Typo / Levenshtein matching on words >= 4 characters
    let fuzzyMatches = 0;
    for (const tToken of targetTokens) {
      if (tToken.length >= 4) {
        const hasFuzzy = allDestTokens.some(d => isTypoMatch(d, tToken) && d !== tToken);
        if (hasFuzzy) fuzzyMatches++;
      }
    }
    if (fuzzyMatches > 0) {
      score += fuzzyMatches * 250;
      matchReasons.push(`Fuzzy typo tolerance match (${fuzzyMatches} tokens) (+${fuzzyMatches * 250})`);
    }
  }

  // 7. Page vs Entity Intent Adjustments
  if (isGenericCatalogQuery) {
    if (dest.isPage) {
      score += 350;
      isExact = true;
      matchReasons.push('Generic catalog query matches page route (+350)');
    } else if (dest.isEntity) {
      score -= 500;
      matchReasons.push('Individual entity downranked on generic catalog query (-500)');
    }
  } else {
    if (dest.isEntity && score >= 700) {
      score += 200;
      isExact = true;
      matchReasons.push('Specific entity matches query (+200)');
    } else if (dest.isPage && !isExplicitPageRequest && targetTokens.length >= 1) {
      score -= 200;
      matchReasons.push('Generic page downranked on specific entity search (-200)');
    }

    if (isExplicitPageRequest) {
      if (dest.isPage) {
        score += 200;
        matchReasons.push('Explicit page request matches page route (+200)');
      } else if (dest.isEntity) {
        score -= 400;
        matchReasons.push('Deep entity downranked on explicit page request (-400)');
      }
    }

    if (isExplicitEntityRequest) {
      if (dest.isEntity) {
        score += 200;
        matchReasons.push('Explicit entity request matches entity record (+200)');
      } else if (dest.isPage) {
        score -= 300;
        matchReasons.push('Generic page downranked on explicit entity request (-300)');
      }
    }
  }

  // Determine confidence tier based on accumulated score
  let confidence: NavigationConfidence = 'not_found';
  if (isExact || score >= 800) {
    confidence = 'exact';
  } else if (score >= 500) {
    confidence = 'partial';
  }

  return {
    dest,
    score,
    confidence,
    matchReasons,
    isExact,
  };
}

// ── Main Public Resolver Entry Point ──────────────────────────────────────────

/**
 * Resolves the authoritative navigation target for a user query against discovered website records.
 * Works universally for any connected website without hardcoded route assumptions.
 */
export async function resolveNavigationTarget(
  widgetId: string,
  rawQuery: string,
  options: NavigationResolverOptions = {}
): Promise<NavigationResolutionResult> {
  const sessionId = options.sessionId || '';
  let session: DurableSessionContext | null = null;
  if (sessionId) {
    session = await getSessionContext(sessionId, widgetId);
  }

  const query = (rawQuery || '').trim();
  if (!query) {
    return {
      canNavigate: false,
      confidence: 'not_found',
      failureReason: 'Empty navigation query provided.',
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Direct UUID or Exact URL check
  // ───────────────────────────────────────────────────────────────────────────
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
    const entity = await getEntityDetails(widgetId, query);
    if (entity && entity.sourceUrl && entity.sourceUrl.trim()) {
      const finalUrl = appendResumeParam(entity.sourceUrl, sessionId);
      const formatted = formatResult(entity);
      return {
        canNavigate: true,
        targetUrl: finalUrl,
        destinationUrl: finalUrl,
        pageTitle: entity.title,
        resolvedPageTitle: entity.title,
        resolvedEntity: formatted,
        confidence: 'exact',
        source: 'discovered_entity',
        intent: 'navigate',
      };
    }
    return {
      canNavigate: false,
      confidence: entity ? 'invalid_url' : 'not_found',
      failureReason: entity ? 'Entity does not have a valid web page URL.' : `Entity with ID '${query}' not found.`,
    };
  }

  // If query is directly an absolute URL
  if (/^https?:\/\//i.test(query)) {
    try {
      const parsed = new URL(query);
      const targetHost = parsed.hostname.toLowerCase();
      const destinations = await loadDiscoveredDestinations(widgetId);
      const allowedHosts = new Set<string>();
      destinations.forEach(d => {
        try {
          allowedHosts.add(new URL(d.url).hostname.toLowerCase());
        } catch {}
      });

      if (allowedHosts.size > 0 && !allowedHosts.has(targetHost)) {
        return {
          canNavigate: false,
          confidence: 'invalid_url',
          failureReason: `Navigation to external domain "${targetHost}" is not permitted.`,
        };
      }

      const finalUrl = appendResumeParam(query, sessionId);
      return {
        canNavigate: true,
        targetUrl: finalUrl,
        destinationUrl: finalUrl,
        confidence: 'exact',
        source: 'discovered_page',
        intent: 'navigate',
      };
    } catch {
      return {
        canNavigate: false,
        confidence: 'invalid_url',
        failureReason: 'Invalid URL format.',
      };
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Anaphora / Pronoun Navigation ("open it", "open that course")
  // ───────────────────────────────────────────────────────────────────────────
  if (isAnaphoricQuery(query)) {
    // Check pinned currentEntity
    if (session?.currentEntity && session.currentEntity.sourceUrl) {
      const finalUrl = appendResumeParam(session.currentEntity.sourceUrl, sessionId);
      return {
        canNavigate: true,
        targetUrl: finalUrl,
        destinationUrl: finalUrl,
        pageTitle: session.currentEntity.title,
        resolvedPageTitle: session.currentEntity.title,
        resolvedEntity: formatResult(session.currentEntity),
        confidence: 'exact',
        source: 'discovered_entity',
        intent: 'navigate',
      };
    }

    // Check lastResults if only 1 item was retrieved
    if (session?.lastResults && session.lastResults.length === 1) {
      const singleItem = session.lastResults[0];
      if (singleItem.sourceUrl) {
        const finalUrl = appendResumeParam(singleItem.sourceUrl, sessionId);
        return {
          canNavigate: true,
          targetUrl: finalUrl,
          destinationUrl: finalUrl,
          pageTitle: singleItem.title,
          resolvedPageTitle: singleItem.title,
          resolvedEntity: formatResult(singleItem),
          confidence: 'exact',
          source: 'discovered_entity',
          intent: 'navigate',
        };
      }
    }

    // If multiple candidates exist in lastResults, ask for clarification — DO NOT GUESS!
    if (session?.lastResults && session.lastResults.length > 1) {
      const options = session.lastResults.slice(0, 4).map(r => ({ id: r.id, title: r.title, url: r.sourceUrl }));
      return {
        canNavigate: false,
        confidence: 'ambiguous',
        clarificationMessage: `Which one would you like to open: ${options.map(o => o.title).join(', ')}?`,
        candidateOptions: options,
      };
    }

    return {
      canNavigate: false,
      confidence: 'not_found',
      failureReason: 'No specific item was previously selected to open. Please tell me which offering you would like to view.',
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Ordinal Navigation ("show me the first one", "open the 2nd one")
  // ───────────────────────────────────────────────────────────────────────────
  const ordinalIdx = parseOrdinalQuery(query);
  if (ordinalIdx !== null) {
    const list = session?.lastResults || [];
    if (list.length === 0) {
      return {
        canNavigate: false,
        confidence: 'not_found',
        failureReason: 'There are no recent results to choose from. Please ask for a list of offerings first.',
      };
    }

    const targetIdx = ordinalIdx === -1 ? list.length - 1 : ordinalIdx;
    if (targetIdx >= 0 && targetIdx < list.length) {
      const item = list[targetIdx];
      if (item.sourceUrl && item.sourceUrl.trim()) {
        const finalUrl = appendResumeParam(item.sourceUrl, sessionId);
        return {
          canNavigate: true,
          targetUrl: finalUrl,
          destinationUrl: finalUrl,
          pageTitle: item.title,
          resolvedPageTitle: item.title,
          resolvedEntity: formatResult(item),
          confidence: 'exact',
          source: 'discovered_entity',
          intent: 'navigate',
        };
      }
      return {
        canNavigate: false,
        confidence: 'invalid_url',
        failureReason: `The selected item "${item.title}" does not have a valid web page URL.`,
      };
    }

    return {
      canNavigate: false,
      confidence: 'not_found',
      failureReason: `Item #${targetIdx + 1} is not available. Only ${list.length} items were returned in the recent results.`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Universal Discovered Destinations Search
  // ───────────────────────────────────────────────────────────────────────────
  const cleanTarget = cleanNavigationQuery(query);
  const isExplicitPage = /\b(?:page|section|tab|screen|site|url|website)\b/i.test(query);
  const isExplicitEntity = /\b(?:course|product|item|vehicle|car|offering|program)\b/i.test(query);

  const destinations = await loadDiscoveredDestinations(widgetId);

  if (destinations.length === 0) {
    return {
      canNavigate: false,
      confidence: 'not_found',
      failureReason: 'No crawled website pages or offerings were found for this website.',
    };
  }

  // Score all discovered destinations against query
  const scored = destinations.map(dest =>
    scoreDestinationForQuery(dest, query, cleanTarget, isExplicitPage, isExplicitEntity)
  );

  // Filter surviving candidates with positive score
  const validCandidates = scored.filter(s => s.score >= 450);

  // Sort by score descending
  validCandidates.sort((a, b) => {
    if (a.isExact && !b.isExact) return -1;
    if (!a.isExact && b.isExact) return 1;
    return b.score - a.score;
  });

  if (validCandidates.length === 0) {
    // Fails closed on not found — zero hallucination!
    const prettyTarget = cleanTarget.charAt(0).toUpperCase() + cleanTarget.slice(1);
    return {
      canNavigate: false,
      confidence: 'not_found',
      failureReason: `I couldn't find a "${prettyTarget}" page or offering on this website. I can help you explore the available pages or offerings.`,
    };
  }

  const top = validCandidates[0];

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Ambiguity Check: If multiple distinct pages match with close scores
  // ───────────────────────────────────────────────────────────────────────────
  if (validCandidates.length > 1 && !top.isExact) {
    const second = validCandidates[1];
    const margin = top.score - second.score;

    // If both have strong scores and margin is small, and they point to distinct URLs -> Ambiguous
    if (margin < 120 && top.dest.url !== second.dest.url) {
      const topOptions = validCandidates
        .slice(0, 4)
        .filter((c, idx, arr) => arr.findIndex(x => x.dest.url === c.dest.url) === idx)
        .map(c => ({
          id: c.dest.id,
          title: c.dest.cleanTitle || c.dest.title,
          url: c.dest.url,
        }));

      if (topOptions.length >= 2) {
        return {
          canNavigate: false,
          confidence: 'ambiguous',
          clarificationMessage: `I found a few matching pages: ${topOptions.map(o => o.title).join(', ')}. Which one would you like to open?`,
          candidateOptions: topOptions,
        };
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Confident Match Resolution
  // ───────────────────────────────────────────────────────────────────────────
  const bestDest = top.dest;
  if (!bestDest.url || !bestDest.url.trim()) {
    return {
      canNavigate: false,
      confidence: 'invalid_url',
      failureReason: `Page "${bestDest.title}" does not have a valid URL.`,
    };
  }

  const finalUrl = appendResumeParam(bestDest.url, sessionId);
  const formattedEntity = bestDest.isEntity && bestDest.record ? formatResult(bestDest.record) : undefined;

  return {
    canNavigate: true,
    targetUrl: finalUrl,
    destinationUrl: finalUrl,
    pageTitle: bestDest.title,
    resolvedPageTitle: bestDest.title,
    resolvedEntity: formattedEntity,
    confidence: top.confidence,
    source: bestDest.isPage ? 'discovered_page' : 'discovered_entity',
    intent: 'navigate',
  };
}
