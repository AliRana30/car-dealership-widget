/**
 * Strict Grounding Layer between Retrieval and LLM
 *
 * Enforces:
 * 1. The LLM is NEVER treated as the source of website facts.
 * 2. If verified data exists, responses use ONLY verified data for factual claims.
 * 3. If requested information is missing, the agent explicitly says it could not find verified information.
 * 4. Zero invention of: prices, offerings, availability, ratings, URLs, images, features, policies.
 * 5. Eliminates the empty-context hallucination path via deterministic grounded fallback.
 * 6. Integrates catalog freshness & hedging for stale/unlisted items.
 * 7. Attaches internal grounding debug metadata (sourceEntityIds, retrievalMethod, freshness, confidence).
 */

import { HybridRetrievalOutput, HybridSearchResult } from './hybridRag';
import { StructuredQueryIntent } from './queryUnderstanding';

// ── Types & Interfaces ─────────────────────────────────────────────────────────

export interface GroundingMetadata {
  sourceEntityIds: string[];
  retrievalMethod: 'exact' | 'partial' | 'vector' | 'keyword' | 'broad_catalog' | 'none';
  freshness: 'fresh' | 'recent' | 'stale_or_unlisted' | 'unknown';
  confidence: 'high' | 'medium' | 'low' | 'unverified';
  grounded: boolean;
  hasHedge: boolean;
  hedgeInstruction?: string;
}

export interface GroundedContextValidation {
  isGrounded: boolean;
  isGreeting: boolean;
  isExplicitNavigation: boolean;
  structuredResults: HybridSearchResult[];
  systemPrompt: string;
  fallbackText?: string;
  groundingMetadata: GroundingMetadata;
  contextSummary: string;
}

// ── Helper Utilities ──────────────────────────────────────────────────────────

const GREETING_REGEX = /^(?:hi|hello|hey|good morning|good afternoon|good evening|greetings|howdy|what's up|sup)(?:[!\s.,]|$)/i;

export function isGreetingQuery(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length === 0) return false;
  return GREETING_REGEX.test(trimmed) && trimmed.split(/\s+/).length <= 4;
}

export function isNavigationQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    /^(?:take me to|navigate me to|navigate to|open|go to|redirect me to|redirect to|bring me to|launch|show me the page for|show me the|open the page for|visit|take me|can you take me to|can you navigate me to|lead me to)\b/i.test(q) ||
    /\b(?:navigate|navigation|redirect|redirecting|open up|open page|open course|open product|open item)\b/i.test(q) ||
    /\b(?:page|url|website|tab|screen)\s*(?:please|now)?$/i.test(q)
  );
}

// ── Main Grounding Validator & Prompt Builder ─────────────────────────────────

/**
 * Validates retrieval output, creates strict anti-hallucination prompts with verified facts,
 * and generates deterministic fallbacks when no verified data exists.
 */
export function validateGrounding(
  rawQuery: string,
  retrieval: HybridRetrievalOutput,
  businessName = 'this business'
): GroundedContextValidation {
  const cleanQuery = (rawQuery || '').trim();
  const isGreeting = isGreetingQuery(cleanQuery);
  const isExplicitNavigation = isNavigationQuery(cleanQuery);
  const results = retrieval.results || [];
  const isGrounded = results.length > 0;

  // 1. Determine Freshness & Hedging
  let freshness: GroundingMetadata['freshness'] = 'unknown';
  let hasHedge = false;
  let hedgeInstruction: string | undefined;

  if (isGrounded) {
    const top = results[0];
    freshness = top.freshnessStatus || 'unknown';

    const hasStaleOrUnlisted = results.some(
      r => r.freshnessStatus === 'stale_or_unlisted' || r.stillListed === false
    );

    if (hasStaleOrUnlisted) {
      hasHedge = true;
      hedgeInstruction =
        'HEDGING REQUIRED: Some or all listed items were verified from an earlier catalog check or are currently unlisted. You MUST clearly state that current availability and pricing cannot be guaranteed, and advise the customer to confirm directly with staff.';
    } else if (results.some(r => r.freshnessStatus === 'recent')) {
      hasHedge = true;
      hedgeInstruction =
        'LIGHT HEDGING: Information was updated within the past 24 hours. Use light conversational phrasing (e.g. "As of our latest check...").';
    }
  }

  // 2. Determine Retrieval Method & Confidence
  let retrievalMethod: GroundingMetadata['retrievalMethod'] = 'none';
  let confidence: GroundingMetadata['confidence'] = 'unverified';

  if (isGrounded) {
    const top = results[0];
    retrievalMethod = top.matchType || 'keyword';

    if (top.isExact || top.score >= 1000) {
      confidence = 'high';
    } else if (top.score >= 400 || top.matchType === 'vector' || top.matchType === 'partial') {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  }

  const groundingMetadata: GroundingMetadata = {
    sourceEntityIds: results.map(r => r.id),
    retrievalMethod,
    freshness,
    confidence,
    grounded: isGrounded,
    hasHedge,
    hedgeInstruction,
  };

  // 3. Build Strict Grounding System Prompt
  const promptLines: string[] = [
    `You are a helpful, professional, and knowledgeable AI assistant representing ${businessName}.`,
    '',
    '=== STRICT GROUNDING RULES (MANDATORY) ===',
    '1. You are NOT the source of facts. You MUST base your factual answers ONLY on the verified records below.',
    '2. NEVER invent or assume prices, products, courses, vehicles, specifications, availability, ratings, images, policies, or URLs.',
    '3. If the user asks about an item, feature, or price that is NOT explicitly present in the verified records below, clearly state: "I couldn\'t find verified information for that in our current website records."',
    '4. Transform verified facts into natural, professional language. Do NOT output raw JSON, database IDs, or code blocks.',
    '5. When mentioning items with available links, use standard markdown links: [Item Title](sourceUrl).',
  ];

  if (hasHedge && hedgeInstruction) {
    promptLines.push('');
    promptLines.push('=== CATALOG FRESHNESS & HEDGING DIRECTIVE ===');
    promptLines.push(hedgeInstruction);
    promptLines.push('Do NOT claim current availability as a 100% guarantee.');
  } else if (isGrounded && freshness === 'fresh') {
    promptLines.push('');
    promptLines.push('=== CATALOG FRESHNESS DIRECTIVE ===');
    promptLines.push('Verified fresh live data. You may state current availability and pricing confidently.');
  }

  promptLines.push('');
  promptLines.push('=== VERIFIED WEBSITE RECORDS ===');
  if (isGrounded) {
    promptLines.push(retrieval.contextSummary);
  } else {
    promptLines.push('[NO VERIFIED RECORDS FOUND FOR THIS INQUIRY]');
  }
  promptLines.push('=== END VERIFIED RECORDS ===');

  const systemPrompt = promptLines.join('\n');

  // 4. Generate Deterministic Fallback if not grounded
  let fallbackText: string | undefined;

  if (!isGrounded) {
    if (isGreeting) {
      fallbackText = `Hello! I am the AI assistant for ${businessName}. How can I assist you with our services, offerings, or pricing today?`;
    } else {
      // Extract search terms from user question
      const stopWords = new Set([
        'what', 'is', 'the', 'how', 'much', 'does', 'cost', 'are', 'there', 'any', 'do', 'you',
        'have', 'offer', 'available', 'tell', 'me', 'about', 'can', 'i', 'get', 'show', 'pricing',
        'price', 'info', 'information', 'details', 'website', 'page'
      ]);
      const words = cleanQuery
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !stopWords.has(w));

      const queryTerm = words.slice(0, 3).join(' ');

      if (queryTerm) {
        fallbackText = `I couldn't find verified information for "${queryTerm}" in the available website records for ${businessName}. Would you like to explore our general catalog or ask about another topic?`;
      } else {
        fallbackText = `I couldn't find verified information for that inquiry in the available website records for ${businessName}. Feel free to ask about our available offerings, services, or pricing!`;
      }
    }
  }

  return {
    isGrounded,
    isGreeting,
    isExplicitNavigation,
    structuredResults: results,
    systemPrompt,
    fallbackText,
    groundingMetadata,
    contextSummary: retrieval.contextSummary || '',
  };
}
