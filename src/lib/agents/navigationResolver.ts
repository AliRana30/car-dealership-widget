/**
 * Autonomous Page & Entity Navigation Resolver
 *
 * Enforces strict confidence verification, canonical URL extraction,
 * session anaphora/ordinal resolution, and zero-guessing fallback protection.
 *
 * Navigation flow:
 * user request -> resolve exact entity/page -> verify confidence -> obtain canonical source_url -> navigate
 */

import { hybridRetrieve } from '@/lib/retrieval/hybridRag';
import { getSessionContext, DurableSessionContext } from './sessionContext';
import { appendResumeParam, getEntityDetails } from './tools';
import { formatResult, StructuredEntity } from './unifiedTools';

export type NavigationConfidence = 'exact' | 'partial' | 'ambiguous' | 'not_found' | 'invalid_url';

export interface NavigationResolutionResult {
  canNavigate: boolean;
  targetUrl?: string;
  resolvedEntity?: StructuredEntity;
  resolvedPageTitle?: string;
  confidence: NavigationConfidence;
  clarificationMessage?: string;
  candidateOptions?: Array<{ id: string; title: string; url?: string }>;
  failureReason?: string;
}

export interface NavigationResolverOptions {
  sessionId?: string;
  allowAgentNavigation?: boolean;
}

/**
 * Normalizes query string for token comparison.
 */
function normalizeString(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts clean entity target name by stripping navigation phrases.
 */
export function cleanNavigationQuery(query: string): string {
  let q = query.trim();
  // Strip leading navigation triggers
  q = q.replace(/^(?:please\s+)?(?:take\s+me\s+to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|navigate\s+(?:me\s+)?to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|go\s+to\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|open\s+(?:up\s+)?(?:the\s+)?(?:page\s+(?:for|of)\s+)?|view\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|show\s+me\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?|visit\s+(?:the\s+)?(?:page\s+(?:for|of)\s+)?)/i, '');
  // Strip trailing "page" or "details"
  q = q.replace(/\s+(?:page|details|offering|item|product|course|vehicle|listing)$/i, '');
  return q.trim();
}

/**
 * Detects if query represents a pronoun/anaphoric navigation.
 */
function isAnaphoricQuery(query: string): boolean {
  const norm = normalizeString(query);
  return /^(?:it|this|that|that\s+one|this\s+one|the\s+item|the\s+product|the\s+course|the\s+vehicle|the\s+service|open\s+it|open\s+that|take\s+me\s+to\s+it|navigate\s+to\s+it)$/i.test(norm) ||
         /^(?:open|show|view|navigate\s+to)\s+(?:it|that|this|that\s+one|this\s+one|that\s+course|that\s+product|that\s+vehicle|the\s+details)$/i.test(norm);
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

/**
 * Detects if query represents a general informational/page navigation.
 */
function detectPageIntent(query: string): { isPage: boolean; pageSlug?: string; pageKeyword?: string } {
  const norm = normalizeString(query);
  const pagePatterns: Array<{ regex: RegExp; slug: string; keyword: string }> = [
    { regex: /\b(?:pricing|pricing\s+page|prices|costs|rates)\b/i, slug: 'pricing', keyword: 'pricing' },
    { regex: /\b(?:contact|contact\s+us|contact\s+page|support|location|locations|address|phone)\b/i, slug: 'contact', keyword: 'contact' },
    { regex: /\b(?:policy|policies|terms|terms\s+of\s+service|privacy|refund|returns)\b/i, slug: 'policy', keyword: 'policy' },
    { regex: /\b(?:faq|faqs|frequently\s+asked\s+questions|help|q\s*&\s*a)\b/i, slug: 'faq', keyword: 'faq' },
    { regex: /\b(?:about|about\s+us|who\s+we\s+are|mission|story|company)\b/i, slug: 'about', keyword: 'about' },
    { regex: /\b(?:catalog|courses|all\s+courses|inventory|all\s+vehicles|shop|store|all\s+products)\b/i, slug: 'courses', keyword: 'courses' },
  ];

  for (const p of pagePatterns) {
    if (p.regex.test(norm)) {
      return { isPage: true, pageSlug: p.slug, pageKeyword: p.keyword };
    }
  }

  return { isPage: false };
}

/**
 * Resolves the authoritative navigation target for a user query.
 * Fails closed on ambiguity, nonexistent entities, or low confidence.
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

  const query = rawQuery.trim();
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
        resolvedEntity: formatted,
        confidence: 'exact',
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
    const finalUrl = appendResumeParam(query, sessionId);
    return {
      canNavigate: true,
      targetUrl: finalUrl,
      confidence: 'exact',
    };
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
        resolvedEntity: formatResult(session.currentEntity),
        confidence: 'exact',
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
          resolvedEntity: formatResult(singleItem),
          confidence: 'exact',
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
          resolvedEntity: formatResult(item),
          confidence: 'exact',
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
  // 4. Informational Page Navigation ("take me to pricing page", "contact page")
  // ───────────────────────────────────────────────────────────────────────────
  const pageIntent = detectPageIntent(query);
  if (pageIntent.isPage && pageIntent.pageKeyword) {
    const pageRetrieval = await hybridRetrieve(widgetId, pageIntent.pageKeyword, {
      limit: 5,
      includeInformational: true,
    });

    const candidatePages = pageRetrieval.results.filter(r => {
      const url = (r.sourceUrl || '').toLowerCase();
      const title = (r.title || '').toLowerCase();
      const kw = pageIntent.pageKeyword!.toLowerCase();
      const slug = (pageIntent.pageSlug || '').toLowerCase();

      return url.includes(`/${slug}`) || url.includes(kw) || title.includes(kw) || title.includes(slug);
    });

    if (candidatePages.length > 0) {
      const bestPage = candidatePages[0];
      if (bestPage.sourceUrl && bestPage.sourceUrl.trim()) {
        const finalUrl = appendResumeParam(bestPage.sourceUrl, sessionId);
        return {
          canNavigate: true,
          targetUrl: finalUrl,
          resolvedPageTitle: bestPage.title,
          confidence: 'exact',
        };
      }
    }

    // Fails closed if the site does not have this page — NEVER navigate to a random course/car!
    return {
      canNavigate: false,
      confidence: 'not_found',
      failureReason: `Could not find a verified "${pageIntent.pageKeyword}" page for this website.`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Named Entity Navigation ("open Backend Mastery", "2024 Jeep Wrangler")
  // ───────────────────────────────────────────────────────────────────────────
  const cleanTarget = cleanNavigationQuery(query);
  if (!cleanTarget) {
    return {
      canNavigate: false,
      confidence: 'not_found',
      failureReason: 'Could not extract a valid offering name to navigate to.',
    };
  }

  const retrieved = await hybridRetrieve(widgetId, cleanTarget, {
    limit: 5,
    includeInformational: false,
  });

  if (retrieved.results.length === 0) {
    return {
      canNavigate: false,
      confidence: 'not_found',
      failureReason: `Could not find any offering matching "${cleanTarget}" on this website.`,
    };
  }

  const normTarget = normalizeString(cleanTarget);
  const targetTokens = normTarget.split(' ').filter(t => t.length >= 2);

  // Score candidate matches
  const candidatesWithMetrics = retrieved.results.map(r => {
    const normTitle = normalizeString(r.title);
    const titleTokens = normTitle.split(' ').filter(t => t.length >= 2);

    const isExactFullTitle = normTitle === normTarget;
    const overlapTokens = targetTokens.filter(t => titleTokens.includes(t));
    const tokenOverlapRatio = targetTokens.length > 0 ? overlapTokens.length / targetTokens.length : 0;

    return {
      record: r,
      isExactFullTitle,
      tokenOverlapRatio,
      score: (r as any).score || 0,
      matchType: r.matchType,
    };
  });

  // Check for ambiguity on single-word/generic category queries (e.g. "jeep", "course", "car")
  if (targetTokens.length <= 1) {
    const matchingCategory = candidatesWithMetrics.filter(c => c.tokenOverlapRatio >= 0.9);
    if (matchingCategory.length > 1 && !matchingCategory[0].isExactFullTitle) {
      const candidateList = matchingCategory.slice(0, 4).map(c => ({
        id: c.record.id,
        title: c.record.title,
        url: c.record.sourceUrl,
      }));
      return {
        canNavigate: false,
        confidence: 'ambiguous',
        clarificationMessage: `Multiple matching offerings were found for "${cleanTarget}". Which one would you like to view: ${candidateList.map(c => c.title).join(', ')}?`,
        candidateOptions: candidateList,
      };
    }
  }

  // Sort by match strength
  candidatesWithMetrics.sort((a, b) => {
    if (a.isExactFullTitle && !b.isExactFullTitle) return -1;
    if (!a.isExactFullTitle && b.isExactFullTitle) return 1;
    if (a.tokenOverlapRatio !== b.tokenOverlapRatio) return b.tokenOverlapRatio - a.tokenOverlapRatio;
    return b.score - a.score;
  });

  const top = candidatesWithMetrics[0];

  // Condition 1: Full Exact Match (Title strictly equals query)
  if (top.isExactFullTitle || (top.tokenOverlapRatio >= 0.85 && candidatesWithMetrics.length === 1)) {
    if (!top.record.sourceUrl || !top.record.sourceUrl.trim()) {
      return {
        canNavigate: false,
        confidence: 'invalid_url',
        failureReason: `Offering "${top.record.title}" does not have a valid web page URL.`,
      };
    }
    const finalUrl = appendResumeParam(top.record.sourceUrl, sessionId);
    const formatted = formatResult(top.record);
    return {
      canNavigate: true,
      targetUrl: finalUrl,
      resolvedEntity: formatted,
      confidence: 'exact',
    };
  }

  // Condition 2: Ambiguous Match (Multiple candidates with close token overlap and score)
  const strongCandidates = candidatesWithMetrics.filter(c => c.tokenOverlapRatio >= 0.5 || c.score >= 400);
  if (strongCandidates.length > 1) {
    const margin = strongCandidates[0].score - strongCandidates[1].score;
    // If top 2 candidates have close scores and top is not a full exact match -> Ambiguous
    if (margin < 150 && !top.isExactFullTitle) {
      const candidateList = strongCandidates.slice(0, 4).map(c => ({
        id: c.record.id,
        title: c.record.title,
        url: c.record.sourceUrl,
      }));
      return {
        canNavigate: false,
        confidence: 'ambiguous',
        clarificationMessage: `Multiple matching offerings were found for "${cleanTarget}". Which one would you like to view: ${candidateList.map(c => c.title).join(', ')}?`,
        candidateOptions: candidateList,
      };
    }
  }

  // Condition 3: Partial Match with high confidence and clear separation
  if (top.tokenOverlapRatio >= 0.6 || top.score >= 400) {
    if (!top.record.sourceUrl || !top.record.sourceUrl.trim()) {
      return {
        canNavigate: false,
        confidence: 'invalid_url',
        failureReason: `Offering "${top.record.title}" does not have a valid web page URL.`,
      };
    }
    const finalUrl = appendResumeParam(top.record.sourceUrl, sessionId);
    const formatted = formatResult(top.record);
    return {
      canNavigate: true,
      targetUrl: finalUrl,
      resolvedEntity: formatted,
      confidence: 'partial',
    };
  }

  // Condition 4: Low confidence / No strong match -> NEVER fallback to first record!
  return {
    canNavigate: false,
    confidence: 'not_found',
    failureReason: `I could not find a verified offering matching "${cleanTarget}" on this website.`,
  };
}
