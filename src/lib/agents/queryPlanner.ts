/**
 * Bounded Agentic Query Planner
 *
 * Maps user queries to executable plans composed ONLY of registered tools.
 * No LLM is used for planning — everything is deterministic using understandQuery().
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  planQuery(query)  →  QueryPlan  →  executePlan()          │
 * │                                                             │
 * │  Fast paths (no executor overhead):                        │
 * │    • greeting      → short-circuit, no tools               │
 * │    • impossible    → short-circuit, no tools               │
 * │    • exact entity  → get_entity (1 step)                   │
 * │    • simple search → search_knowledge (1 step)             │
 * │                                                             │
 * │  Multi-step plans (bounded, max 4 steps):                  │
 * │    • filtered catalog   → filter_entities                  │
 * │    • comparison         → parallel searches + compare      │
 * │    • media request      → get_entity + get_entity_media    │
 * │    • navigation         → get_entity + navigate_to_entity  │
 * │    • filter+compare+nav → filter + compare + navigate      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * SAFETY GUARANTEES:
 *  1. PLAN_TOOL_WHITELIST — only these 7 tool names can appear in plans
 *  2. MAX_PLAN_STEPS = 4   — hard cap, enforced at plan build time
 *  3. Widget scope is passed unchanged to every executeUnifiedTool call
 *  4. Parallel only when steps have NO data dependency on each other
 */

import { understandQuery, StructuredQueryIntent } from '@/lib/retrieval/queryUnderstanding';
import {
  executeUnifiedTool,
  UnifiedToolResult,
  UnifiedToolContext,
} from './unifiedTools';

// ── Safety Constants ──────────────────────────────────────────────────────────

/** The complete set of allowed tool names. Plans may only reference these. */
export const PLAN_TOOL_WHITELIST = [
  'search_knowledge',
  'get_entity',
  'filter_entities',
  'compare_entities',
  'get_entity_media',
  'get_page',
  'navigate_to_entity',
] as const;

export type AllowedTool = typeof PLAN_TOOL_WHITELIST[number];

/** Hard cap on plan depth to prevent runaway multi-tool chains. */
export const MAX_PLAN_STEPS = 4;

// ── Plan Types ────────────────────────────────────────────────────────────────

export type PlanType =
  | 'greeting'          // Short-circuit — no tools
  | 'impossible'        // Short-circuit — no tools (out-of-scope query)
  | 'direct_entity'     // Fast path — exact name lookup
  | 'knowledge_search'  // Fast path — single search
  | 'page_lookup'       // Fast path — crawled page by URL/slug
  | 'filtered_search'   // filter_entities
  | 'comparison'        // parallel searches + compare
  | 'media_request'     // get_entity + get_entity_media
  | 'navigation'        // get_entity + navigate_to_entity
  | 'filter_compare'    // filter + compare
  | 'filter_compare_nav'; // filter + compare + navigate

export interface ToolStep {
  /** Registered tool name — must be in PLAN_TOOL_WHITELIST */
  tool: AllowedTool;
  /** Args to pass to executeUnifiedTool */
  args: Record<string, any>;
  /**
   * Indices of earlier steps this step depends on.
   * Steps with empty dependsOn may run in parallel with each other.
   */
  dependsOn: number[];
  /**
   * When true, pass results from the dependsOn steps into this step's args.
   * Executor populates entityId / ids / resolvedEntities from prior step output.
   */
  injectPriorResults?: boolean;
  /** Human-readable label for logging / debug API */
  label: string;
}

export interface QueryPlan {
  /** Original raw user query */
  query: string;
  /** Classified plan type */
  planType: PlanType;
  /** Whether this is a single-step or greeting/impossible plan (skips wave executor) */
  fastPath: boolean;
  /** Short-circuit response text (only when steps is empty) */
  shortCircuitResponse?: string;
  /** Ordered list of tool steps (empty for short-circuit) */
  steps: ToolStep[];
  /** Estimated number of execution steps */
  estimatedSteps: number;
  /** Parsed intent from understandQuery — for logging / debug */
  parsedIntent: StructuredQueryIntent;
}

export interface PlanStepResult {
  stepIndex: number;
  tool: AllowedTool;
  label: string;
  result: UnifiedToolResult;
  durationMs: number;
}

export interface PlanResult {
  /** The plan that was executed */
  plan: QueryPlan;
  /** Results from each executed step, in execution order */
  stepResults: PlanStepResult[];
  /**
   * The "primary" result — used by the chat route for grounding + LLM prompt.
   * Set to the last successful grounded step; falls back to the last step.
   */
  primary: UnifiedToolResult;
  /** Whether any step produced grounded results */
  grounded: boolean;
  /** Total wall-clock time across all steps */
  totalDurationMs: number;
  /** True when the plan was short-circuited (no tools ran) */
  shortCircuited: boolean;
}

// ── Intent Classifiers (pure regex, no I/O) ───────────────────────────────────

function isNavigationQuery(q: string): boolean {
  return /\b(?:take me to|navigate (?:me )?to|open (?:the |that |this )?(?:page|link|one|product|course|item|tab)?|go to|redirect me to|lead me to|visit|launch)\b/i.test(q);
}

function isMediaQuery(q: string): boolean {
  return /\b(?:show me (?:the |a )?(?:pictures?|photos?|images?|media|gallery)|(?:pictures?|photos?|images?|gallery|media) (?:of|for))\b/i.test(q);
}

function isComparisonQuery(q: string): boolean {
  return /\b(?:compare|vs\.?|versus|difference between|which (?:is|are) (?:better|cheaper|best)|side.by.side)\b/i.test(q);
}

function isFilterThenCompare(q: string): boolean {
  return (
    isComparisonQuery(q) &&
    /\b(?:cheapest|least expensive|most expensive|highest rated|under|below|over|above|\$)\b/i.test(q)
  );
}

function isCompareAndNavigate(q: string): boolean {
  return isComparisonQuery(q) && (isNavigationQuery(q) || /\b(?:open|launch|navigate|go to|take me)\b/i.test(q));
}

function isImpossibleQuery(q: string): boolean {
  return /\b(?:predict (?:the )?future|weather (?:in|at|for)|stock (?:price|market)|bitcoin|cryptocurrency|latest news|sports score|lottery|horoscope)\b/i.test(q);
}

function looksLikeExactEntity(q: string, intent: StructuredQueryIntent): boolean {
  const words = q.trim().split(/\s+/);
  if (words.length > 8) return false;
  if (intent.maxPrice !== undefined || intent.minPrice !== undefined) return false;
  if (intent.sortBy) return false;
  if (intent.intent === 'specific_entity') return true;
  return /\b(?:price of|cost of|details? (?:of|for|about)|tell me about|what is|info (?:on|about))\s+\S/i.test(q);
}

function hasFilterConstraints(intent: StructuredQueryIntent): boolean {
  return (
    intent.maxPrice !== undefined ||
    intent.minPrice !== undefined ||
    intent.sortBy !== undefined ||
    intent.onSale !== undefined ||
    intent.inStock !== undefined ||
    (intent.attributes && Object.keys(intent.attributes).length > 0) ||
    (intent.negativeKeywords && intent.negativeKeywords.length > 0)
  );
}

// ── Filter Arg Builder ────────────────────────────────────────────────────────

function buildFilterArgs(intent: StructuredQueryIntent, rawQuery: string): Record<string, any> {
  const args: Record<string, any> = { query: rawQuery };
  const kw = intent.specificKeywords.join(' ');
  if (kw) args.keyword = kw;
  if (intent.entityType) args.type = intent.entityType;
  if (intent.maxPrice !== undefined) args.maxPrice = intent.maxPrice;
  if (intent.minPrice !== undefined) args.minPrice = intent.minPrice;
  if (intent.sortBy) args.sort = intent.sortBy;
  if (intent.negativeKeywords && intent.negativeKeywords.length > 0) args.exclude = intent.negativeKeywords.join(' ');
  if (intent.attributes && Object.keys(intent.attributes).length > 0) args.attributes = intent.attributes;
  return args;
}

function describeFilters(intent: StructuredQueryIntent): string {
  const parts: string[] = [];
  if (intent.entityType) parts.push(intent.entityType);
  if (intent.maxPrice !== undefined) parts.push(`under $${intent.maxPrice}`);
  if (intent.minPrice !== undefined) parts.push(`over $${intent.minPrice}`);
  if (intent.sortBy) parts.push(intent.sortBy);
  if (intent.onSale) parts.push('on sale');
  if (intent.inStock) parts.push('in stock');
  return parts.join(', ') || 'default filters';
}

// ── Plan Builder (Pure, Sync, < 1ms) ─────────────────────────────────────────

/**
 * Build a QueryPlan from a user query. No I/O, no LLM, deterministic.
 */
export function planQuery(
  query: string,
  options: { allowNavigation?: boolean; sessionId?: string } = {}
): QueryPlan {
  const rawQuery = (query || '').trim();
  const intent = understandQuery(rawQuery);

  // ── Greeting ───────────────────────────────────────────────────────────────
  if (intent.intent === 'greeting') {
    return makeShortCircuit(rawQuery, 'greeting', 'Hello! How can I help you today?', intent);
  }

  // ── Impossible / out-of-scope ──────────────────────────────────────────────
  if (isImpossibleQuery(rawQuery)) {
    return makeShortCircuit(
      rawQuery,
      'impossible',
      "I can only answer questions about this business's offerings, products, and services.",
      intent
    );
  }

  // ── Page / informational lookup ────────────────────────────────────────────
  if (intent.isInformational && intent.intent !== 'comparison') {
    return makePlan(rawQuery, 'page_lookup', true, [
      {
        tool: 'get_page',
        args: { slug: intent.navigationTarget || rawQuery, query: rawQuery },
        dependsOn: [],
        label: `Fetch page: "${intent.navigationTarget || rawQuery}"`,
      },
    ], intent);
  }

  const isNav = isNavigationQuery(rawQuery) || intent.intent === 'navigation';
  const isMedia = isMediaQuery(rawQuery);
  const isComparison = isComparisonQuery(rawQuery) || intent.intent === 'comparison';
  const hasFilters = hasFilterConstraints(intent);
  const entityName = intent.exactEntityName || rawQuery;

  // ── Media request ──────────────────────────────────────────────────────────
  if (isMedia && !isComparison) {
    const entityTarget = rawQuery
      .replace(/show me (?:the |a )?(?:pictures?|photos?|images?|media|gallery) (?:of|for)?/i, '')
      .replace(/(?:pictures?|photos?|images?|gallery|media) (?:of|for)/i, '')
      .trim() || rawQuery;
    return makePlan(rawQuery, 'media_request', false, [
      { tool: 'get_entity', args: { query: entityTarget }, dependsOn: [], label: `Lookup: "${entityTarget}"` },
      { tool: 'get_entity_media', args: { query: entityTarget }, dependsOn: [0], injectPriorResults: true, label: 'Fetch media' },
    ], intent);
  }

  // ── Filter + Compare + Navigate (multi-step query) ─────────────────────────
  if (isCompareAndNavigate(rawQuery) && (hasFilters || isFilterThenCompare(rawQuery)) && options.allowNavigation) {
    const filterArgs = buildFilterArgs(intent, rawQuery);
    return makePlan(rawQuery, 'filter_compare_nav', false, [
      { tool: 'filter_entities', args: { ...filterArgs, limit: 4 }, dependsOn: [], label: `Filter: ${describeFilters(intent)}` },
      { tool: 'compare_entities', args: { ids: [] }, dependsOn: [0], injectPriorResults: true, label: 'Compare filtered' },
      { tool: 'navigate_to_entity', args: { query: rawQuery }, dependsOn: [1], injectPriorResults: true, label: 'Navigate to best' },
    ], intent);
  }

  // ── Named comparison: two entities, parallel search → compare ─────────────
  if (isComparison && intent.comparisonQueries && intent.comparisonQueries.length >= 2) {
    const searchSteps: ToolStep[] = intent.comparisonQueries.slice(0, 2).map((q, i) => ({
      tool: 'search_knowledge' as AllowedTool,
      args: { query: q, limit: 1 },
      dependsOn: [] as number[],
      label: `Search: "${q}"`,
    }));
    return makePlan(rawQuery, 'comparison', false, [
      ...searchSteps,
      { tool: 'compare_entities', args: { ids: [] }, dependsOn: searchSteps.map((_, i) => i), injectPriorResults: true, label: 'Compare' },
    ], intent);
  }

  // ── Filter + Compare ───────────────────────────────────────────────────────
  if (isFilterThenCompare(rawQuery) || (isComparison && hasFilters)) {
    const filterArgs = buildFilterArgs(intent, rawQuery);
    return makePlan(rawQuery, 'filter_compare', false, [
      { tool: 'filter_entities', args: { ...filterArgs, limit: 4 }, dependsOn: [], label: `Filter: ${describeFilters(intent)}` },
      { tool: 'compare_entities', args: { ids: [] }, dependsOn: [0], injectPriorResults: true, label: 'Compare filtered' },
    ], intent);
  }

  // ── Generic comparison (no named entities) ────────────────────────────────
  if (isComparison) {
    return makePlan(rawQuery, 'comparison', false, [
      { tool: 'search_knowledge', args: { query: rawQuery, limit: 4 }, dependsOn: [], label: `Search candidates: "${rawQuery}"` },
      { tool: 'compare_entities', args: { ids: [] }, dependsOn: [0], injectPriorResults: true, label: 'Compare top results' },
    ], intent);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  if (isNav && options.allowNavigation) {
    const navTarget = intent.navigationTarget || entityName;
    return makePlan(rawQuery, 'navigation', false, [
      { tool: 'get_entity', args: { query: navTarget }, dependsOn: [], label: `Lookup: "${navTarget}"` },
      { tool: 'navigate_to_entity', args: { query: navTarget }, dependsOn: [0], injectPriorResults: true, label: `Navigate to "${navTarget}"` },
    ], intent);
  }

  // ── Exact entity lookup ────────────────────────────────────────────────────
  if (looksLikeExactEntity(rawQuery, intent)) {
    return makePlan(rawQuery, 'direct_entity', true, [
      { tool: 'get_entity', args: { query: entityName }, dependsOn: [], label: `Lookup: "${entityName}"` },
    ], intent);
  }

  // ── Filtered catalog (only when actual filter constraints are present) ────
  if (hasFilters) {
    const filterArgs = buildFilterArgs(intent, rawQuery);
    return makePlan(rawQuery, 'filtered_search', false, [
      { tool: 'filter_entities', args: { ...filterArgs, limit: 6 }, dependsOn: [], label: `Filter: ${describeFilters(intent)}` },
    ], intent);
  }

  // ── Default: knowledge search (Fast path) ──────────────────────────────────
  return makePlan(rawQuery, 'knowledge_search', true, [
    { tool: 'search_knowledge', args: { query: rawQuery, limit: 6 }, dependsOn: [], label: `Search: "${rawQuery}"` },
  ], intent);
}

// ── Plan Factory Helpers ──────────────────────────────────────────────────────

function makeShortCircuit(
  query: string, planType: PlanType, response: string, intent: StructuredQueryIntent
): QueryPlan {
  return { query, planType, fastPath: true, shortCircuitResponse: response, steps: [], estimatedSteps: 0, parsedIntent: intent };
}

function makePlan(
  query: string, planType: PlanType, fastPath: boolean, rawSteps: ToolStep[], intent: StructuredQueryIntent
): QueryPlan {
  const steps = rawSteps.slice(0, MAX_PLAN_STEPS);
  return { query, planType, fastPath, steps, estimatedSteps: steps.length, parsedIntent: intent };
}

// ── Plan Executor ─────────────────────────────────────────────────────────────

/**
 * Execute a QueryPlan using executeUnifiedTool for every step.
 *
 * Wave-based parallel execution:
 *   • Steps with empty dependsOn run in parallel (Promise.all per wave)
 *   • Steps with dependsOn wait for all dependencies to complete first
 *   • injectPriorResults=true copies prior step output into the step's args
 */
export async function executePlan(
  plan: QueryPlan,
  widgetId: string,
  context: UnifiedToolContext = {}
): Promise<PlanResult> {
  const t0 = Date.now();

  // Short-circuit: no tools needed
  if (plan.steps.length === 0) {
    const sc: UnifiedToolResult = {
      success: true,
      tool: 'none' as any,
      widgetId,
      results: [],
      sources: [],
      count: 0,
      freshness: 'unknown',
      confidence: 'unverified',
      grounded: false,
      hedged: false,
      fallbackText: plan.shortCircuitResponse,
    };
    return { plan, stepResults: [], primary: sc, grounded: false, totalDurationMs: Date.now() - t0, shortCircuited: true };
  }

  // Enforce whitelist
  for (const step of plan.steps) {
    if (!(PLAN_TOOL_WHITELIST as readonly string[]).includes(step.tool)) {
      throw new Error(`[queryPlanner] Rejected non-whitelisted tool: '${step.tool}'`);
    }
  }

  // Fast path: direct single-step execution (avoids wave scheduler overhead)
  if (plan.fastPath && plan.steps.length === 1) {
    const step = plan.steps[0];
    const stepT0 = Date.now();
    const result = await executeUnifiedTool(widgetId, step.tool, step.args, context);
    const durationMs = Date.now() - stepT0;
    const stepResult: PlanStepResult = {
      stepIndex: 0,
      tool: step.tool,
      label: step.label,
      result,
      durationMs,
    };
    return {
      plan,
      stepResults: [stepResult],
      primary: result,
      grounded: result.grounded,
      totalDurationMs: Date.now() - t0,
      shortCircuited: false,
    };
  }

  // Wave-based execution
  const stepResults: PlanStepResult[] = [];
  const completedResults = new Map<number, UnifiedToolResult>();
  let remaining = plan.steps.map((s, i) => ({ ...s, index: i }));

  while (remaining.length > 0) {
    const ready = remaining.filter(s => s.dependsOn.every(d => completedResults.has(d)));

    if (ready.length === 0) {
      console.error('[queryPlanner] Dependency deadlock — aborting remaining steps:', remaining.map(s => s.label));
      break;
    }

    const waveResults = await Promise.all(
      ready.map(async step => {
        const stepT0 = Date.now();
        const args = { ...step.args };

        // Inject prior step outputs when requested
        if (step.injectPriorResults && step.dependsOn.length > 0) {
          const priorEntities = step.dependsOn.flatMap(d => completedResults.get(d)?.results ?? []);

          if (step.tool === 'compare_entities') {
            const ids = priorEntities.map(e => e.id).filter(Boolean).slice(0, 4);
            if (ids.length >= 2) { args.ids = ids; args.entityIds = ids; }
          }

          if (step.tool === 'navigate_to_entity') {
            const top = priorEntities[0];
            if (top?.id) args.entityId = top.id;
            if (top?.sourceUrl) args.url = top.sourceUrl;
          }

          if (step.tool === 'get_entity_media') {
            const top = priorEntities[0];
            if (top?.id) args.entityId = top.id;
          }

          args.resolvedEntities = priorEntities;
        }

        const result = await executeUnifiedTool(widgetId, step.tool, args, context);
        return { stepIndex: step.index, tool: step.tool, label: step.label, result, durationMs: Date.now() - stepT0 };
      })
    );

    for (const sr of waveResults) {
      stepResults.push(sr);
      completedResults.set(sr.stepIndex, sr.result);
    }
    const doneIndices = new Set(ready.map(s => s.index));
    remaining = remaining.filter(s => !doneIndices.has(s.index));
  }

  stepResults.sort((a, b) => a.stepIndex - b.stepIndex);

  const groundedResults = stepResults.filter(r => r.result.success && r.result.grounded);
  const primary =
    groundedResults[groundedResults.length - 1]?.result ??
    stepResults[stepResults.length - 1]?.result ??
    _fallbackResult(widgetId, plan.query);

  return {
    plan,
    stepResults,
    primary,
    grounded: stepResults.some(r => r.result.grounded),
    totalDurationMs: Date.now() - t0,
    shortCircuited: false,
  };
}

// ── Convenience wrapper ───────────────────────────────────────────────────────

/**
 * One-shot: plan then execute.
 * Entry point called by the chat route and any other consumer.
 */
export async function planAndExecute(
  query: string,
  widgetId: string,
  context: UnifiedToolContext & { allowNavigation?: boolean } = {}
): Promise<PlanResult> {
  const plan = planQuery(query, {
    allowNavigation: context.allowNavigation ?? false,
    sessionId: context.sessionId,
  });

  console.log(
    `[queryPlanner] plan=${plan.planType} steps=${plan.estimatedSteps} fastPath=${plan.fastPath} query="${query.slice(0, 80)}"`
  );

  return executePlan(plan, widgetId, context);
}

// ── Private Helpers ───────────────────────────────────────────────────────────

function _fallbackResult(widgetId: string, query: string): UnifiedToolResult {
  return {
    success: true,
    tool: 'search_knowledge',
    widgetId,
    results: [],
    sources: [],
    count: 0,
    freshness: 'unknown',
    confidence: 'unverified',
    grounded: false,
    hedged: false,
    fallbackText: `I couldn't find verified information matching "${query}". Please try rephrasing or ask about our available offerings.`,
  };
}
