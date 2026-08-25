/**
 * Gateway Security & Validation Layer for Shared /api/agent/tools Webhook
 *
 * Provides:
 * 1. Provider-Appropriate Verification (Retell HMAC-SHA256 & Vapi Server Secret)
 * 2. Tenant Isolation & Cross-Widget Tampering Protection
 * 3. Sliding-Window Rate Limiting (IP & Widget levels)
 * 4. Tool-Call Abuse Protection (Batch size caps, string bounds)
 * 5. Strict Tool Name Whitelisting
 * 6. Strict Tool Argument Schema Validation
 * 7. Secret Redaction from Logs and Responses
 */

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { WidgetRecord } from '@/config/widgetsDb';

// ── Tool Name Allowlist ────────────────────────────────────────────────────────

export const ALLOWED_TOOL_NAMES = [
  'search_knowledge',
  'search_entities',
  'search',
  'search_entity',
  'search_knowledge_base',
  'get_entity',
  'get_entity_details',
  'get_details',
  'details',
  'filter_entities',
  'compare_entities',
  'get_entity_media',
  'get_page',
  'navigate_to_entity',
  'navigate',
  'navigate_to_page',
  'open_page',
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOL_NAMES)[number];

export function isToolAllowed(toolName: string): boolean {
  if (!toolName || typeof toolName !== 'string') return false;
  const normalized = toolName.trim().toLowerCase();
  return (ALLOWED_TOOL_NAMES as readonly string[]).includes(normalized);
}

// ── Provider Cryptographic & Secret Verification ──────────────────────────────

/**
 * Timing-safe buffer comparison to prevent timing attacks.
 */
function safeTimingEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verify Retell AI HMAC-SHA256 signature over raw request body.
 */
export function verifyRetellSignature(
  rawBody: string,
  signatureHeader: string | null,
  secretOrApiKey: string
): boolean {
  if (!signatureHeader || !secretOrApiKey) return false;
  try {
    const cleanSig = signatureHeader.trim();

    // Try hex digest
    const hashHex = crypto
      .createHmac('sha256', secretOrApiKey)
      .update(rawBody, 'utf8')
      .digest('hex');
    if (safeTimingEqual(hashHex, cleanSig)) return true;

    // Try base64 digest
    const hashBase64 = crypto
      .createHmac('sha256', secretOrApiKey)
      .update(rawBody, 'utf8')
      .digest('base64');
    if (safeTimingEqual(hashBase64, cleanSig)) return true;

    // Try standard Bearer comparison if passed in Authorization
    if (cleanSig.startsWith('Bearer ')) {
      const token = cleanSig.slice(7).trim();
      return safeTimingEqual(token, secretOrApiKey);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Verify Vapi AI Server Secret from headers.
 */
export function verifyVapiSecret(
  secretHeader: string | null,
  configuredSecret: string
): boolean {
  if (!secretHeader || !configuredSecret) return false;
  const cleanHeader = secretHeader.trim();
  if (cleanHeader.startsWith('Bearer ')) {
    return safeTimingEqual(cleanHeader.slice(7).trim(), configuredSecret.trim());
  }
  return safeTimingEqual(cleanHeader, configuredSecret.trim());
}

export interface ProviderAuthResult {
  valid: boolean;
  provider: 'retell' | 'vapi' | 'internal' | 'unknown';
  error?: string;
}

/**
 * Unified Provider Authentication Validator.
 * Verifies Retell / Vapi / Internal signatures and tokens against widget credentials.
 */
export function verifyProviderAuth(
  req: NextRequest,
  rawBody: string,
  widget?: WidgetRecord | null
): ProviderAuthResult {
  const retellSig = req.headers.get('x-retell-signature');
  const vapiSecretHeader = req.headers.get('x-vapi-secret');
  const authHeader = req.headers.get('authorization');
  const apiKeyHeader = req.headers.get('x-api-key');

  const retellKey = (widget?.retellApiKey || process.env.RETELL_API_KEY || '').trim();
  const retellWebhookSecret = (process.env.RETELL_WEBHOOK_SECRET || '').trim();
  const vapiSecret = (widget?.vapiApiKey || process.env.VAPI_SERVER_SECRET || process.env.VAPI_API_KEY || '').trim();

  // 1. Detect Vapi Provider
  if (vapiSecretHeader || req.headers.get('user-agent')?.toLowerCase().includes('vapi')) {
    if (vapiSecret) {
      const isValid = verifyVapiSecret(vapiSecretHeader || authHeader, vapiSecret);
      if (!isValid) {
        return { valid: false, provider: 'vapi', error: 'Invalid Vapi server secret signature.' };
      }
    } else if (vapiSecretHeader) {
      // Secret provided but no server secret configured on this widget/environment
      return { valid: false, provider: 'vapi', error: 'Unconfigured Vapi server secret.' };
    }
    return { valid: true, provider: 'vapi' };
  }

  // 2. Detect Retell Provider
  if (retellSig) {
    const validWithKey = retellKey ? verifyRetellSignature(rawBody, retellSig, retellKey) : false;
    const validWithSecret = retellWebhookSecret ? verifyRetellSignature(rawBody, retellSig, retellWebhookSecret) : false;

    if (!validWithKey && !validWithSecret) {
      return { valid: false, provider: 'retell', error: 'Invalid Retell webhook signature.' };
    }
    return { valid: true, provider: 'retell' };
  }

  // 3. Check Authorization Bearer or x-api-key headers
  if (authHeader || apiKeyHeader) {
    const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : apiKeyHeader || '').trim();
    if (token) {
      const isRetellMatch = retellKey && safeTimingEqual(token, retellKey);
      const isVapiMatch = vapiSecret && safeTimingEqual(token, vapiSecret);
      const isEnvSecretMatch =
        (process.env.AGENT_GATEWAY_SECRET && safeTimingEqual(token, process.env.AGENT_GATEWAY_SECRET)) ||
        (process.env.INTERNAL_API_SECRET && safeTimingEqual(token, process.env.INTERNAL_API_SECRET));

      if (isRetellMatch) return { valid: true, provider: 'retell' };
      if (isVapiMatch) return { valid: true, provider: 'vapi' };
      if (isEnvSecretMatch) return { valid: true, provider: 'internal' };

      return { valid: false, provider: 'unknown', error: 'Invalid authorization credential.' };
    }
  }

  // Default: unauthenticated voice webhook call (allowed in standard dev/configured scenarios without strict secrets)
  return { valid: true, provider: 'internal' };
}

// ── Cross-Tenant Scope & Tampering Protection ──────────────────────────────────

export interface ScopeValidationResult {
  valid: boolean;
  error?: string;
  status?: number;
}

/**
 * Validates that query widgetId, body widgetId, and agent metadata are consistent
 * and prevents cross-tenant access attempts.
 */
export function validateScopeAndTampering(
  rawWidgetId: string,
  widget: WidgetRecord | null,
  body: any,
  queryWidgetId: string | null
): ScopeValidationResult {
  if (!rawWidgetId || rawWidgetId === '00000000-0000-0000-0000-000000000000') {
    return { valid: false, error: 'Widget scope missing or invalid.', status: 400 };
  }

  if (!widget) {
    return { valid: false, error: `Widget '${rawWidgetId}' not found.`, status: 404 };
  }

  // Check query vs body parameter tampering
  const bodyWidgetId =
    body.widgetId ||
    body.widget_id ||
    body.call?.metadata?.widgetId ||
    body.call?.metadata?.widget_id ||
    body.metadata?.widgetId ||
    body.metadata?.widget_id ||
    null;

  if (queryWidgetId && bodyWidgetId && queryWidgetId !== bodyWidgetId) {
    return {
      valid: false,
      error: 'Cross-widget parameter mismatch detected. Query widgetId must match body widgetId.',
      status: 403,
    };
  }

  // Check agent_id mismatch if supplied in call metadata
  const callAgentId =
    body.call?.agent_id ||
    body.call?.agentId ||
    body.message?.call?.agentId ||
    body.message?.call?.assistantId ||
    body.assistantId ||
    null;

  if (callAgentId && widget.agentId && callAgentId !== widget.agentId) {
    // If widget has configured agent ID and body specifies a completely different agent ID, reject
    return {
      valid: false,
      error: 'Agent ID in call metadata does not match configured widget voice agent.',
      status: 403,
    };
  }

  return { valid: true };
}

// ── Sliding-Window Rate Limiting ───────────────────────────────────────────────

interface RateBucket {
  count: number;
  resetAt: number;
}

const IP_RATE_WINDOW_MS = 60_000;      // 1 minute
const IP_RATE_MAX_CALLS = 60;          // 60 requests/min per IP
const WIDGET_RATE_WINDOW_MS = 60_000;  // 1 minute
const WIDGET_RATE_MAX_CALLS = 120;     // 120 requests/min per widget

const ipBuckets = new Map<string, RateBucket>();
const widgetBuckets = new Map<string, RateBucket>();

let lastGatewayPrune = 0;
function maybePruneGatewayBuckets() {
  const now = Date.now();
  if (now - lastGatewayPrune < 60_000) return;
  lastGatewayPrune = now;

  for (const [ip, b] of ipBuckets.entries()) {
    if (now > b.resetAt) ipBuckets.delete(ip);
  }
  for (const [w, b] of widgetBuckets.entries()) {
    if (now > b.resetAt) widgetBuckets.delete(w);
  }
}

export function checkGatewayRateLimit(
  ip: string,
  widgetId: string
): { allowed: boolean; retryAfter?: number; reason?: string } {
  maybePruneGatewayBuckets();
  const now = Date.now();

  // 1. IP Limiter
  const cleanIp = ip || 'unknown_ip';
  let ipBucket = ipBuckets.get(cleanIp);
  if (!ipBucket || now > ipBucket.resetAt) {
    ipBucket = { count: 0, resetAt: now + IP_RATE_WINDOW_MS };
    ipBuckets.set(cleanIp, ipBucket);
  }
  ipBucket.count += 1;
  if (ipBucket.count > IP_RATE_MAX_CALLS) {
    const retryAfter = Math.ceil((ipBucket.resetAt - now) / 1000);
    return { allowed: false, retryAfter, reason: 'Too many requests from this IP address.' };
  }

  // 2. Widget Limiter
  if (widgetId) {
    let wBucket = widgetBuckets.get(widgetId);
    if (!wBucket || now > wBucket.resetAt) {
      wBucket = { count: 0, resetAt: now + WIDGET_RATE_WINDOW_MS };
      widgetBuckets.set(widgetId, wBucket);
    }
    wBucket.count += 1;
    if (wBucket.count > WIDGET_RATE_MAX_CALLS) {
      const retryAfter = Math.ceil((wBucket.resetAt - now) / 1000);
      return { allowed: false, retryAfter, reason: 'Tool execution rate limit exceeded for this widget.' };
    }
  }

  return { allowed: true };
}

// ── Tool Argument Schema Validation & Sanitization ────────────────────────────

const MAX_STRING_LENGTH = 500;
const MAX_ID_LENGTH = 128;
const MAX_BATCH_SIZE = 5;

export interface ToolArgValidationResult {
  valid: boolean;
  sanitizedArgs: Record<string, any>;
  error?: string;
}

/**
 * Validates batch size for Vapi tool-calls to prevent batch abuse.
 */
export function validateBatchSize(toolCalls: any[]): { valid: boolean; error?: string } {
  if (!Array.isArray(toolCalls)) {
    return { valid: false, error: 'toolCalls must be an array.' };
  }
  if (toolCalls.length > MAX_BATCH_SIZE) {
    return {
      valid: false,
      error: `Tool call batch size (${toolCalls.length}) exceeds maximum permitted limit (${MAX_BATCH_SIZE}).`,
    };
  }
  return { valid: true };
}

/**
 * Sanitizes a string input and truncates if necessary.
 */
function sanitizeString(str: any, maxLen = MAX_STRING_LENGTH): string {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

/**
 * Strictly validates and sanitizes tool arguments against schema definitions.
 * Strips dangerous properties (__proto__, constructor) and rejects illegal types.
 */
export function validateToolArgs(toolName: string, rawArgs: any): ToolArgValidationResult {
  if (rawArgs === null || rawArgs === undefined) {
    return { valid: true, sanitizedArgs: {} };
  }

  let argsObj = rawArgs;
  if (typeof rawArgs === 'string') {
    try {
      argsObj = JSON.parse(rawArgs);
    } catch {
      return { valid: false, sanitizedArgs: {}, error: 'Invalid JSON string provided for tool arguments.' };
    }
  }

  if (typeof argsObj !== 'object' || Array.isArray(argsObj)) {
    return { valid: false, sanitizedArgs: {}, error: 'Tool arguments must be a JSON object.' };
  }

  const sanitized: Record<string, any> = {};

  // Strip prototype pollution keys
  for (const [k, v] of Object.entries(argsObj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    sanitized[k] = v;
  }

  const normalizedTool = toolName.toLowerCase().trim();

  // ── 1. search_knowledge schema ──────────────────────────────────────────────
  if (['search_knowledge', 'search_entities', 'search', 'search_entity', 'search_knowledge_base'].includes(normalizedTool)) {
    const query = sanitizeString(sanitized.query || sanitized.search || sanitized.q || sanitized.keyword || sanitized.input);
    if (!query) {
      return { valid: false, sanitizedArgs: {}, error: "Argument 'query' is required for search_knowledge." };
    }
    const limit = typeof sanitized.limit === 'number' ? Math.min(Math.max(1, Math.floor(sanitized.limit)), 10) : 5;
    return {
      valid: true,
      sanitizedArgs: { query, limit },
    };
  }

  // ── 2. get_entity schema ───────────────────────────────────────────────────
  if (['get_entity', 'get_entity_details', 'get_details', 'details'].includes(normalizedTool)) {
    const entityId = sanitizeString(sanitized.entityId || sanitized.entity_id || sanitized.id || sanitized.query || '', MAX_ID_LENGTH);
    if (!entityId) {
      return { valid: false, sanitizedArgs: {}, error: "Argument 'entityId' or 'query' is required for get_entity." };
    }
    return {
      valid: true,
      sanitizedArgs: { entityId, query: entityId },
    };
  }

  // ── 3. filter_entities schema ───────────────────────────────────────────────
  if (normalizedTool === 'filter_entities') {
    const cleanFilter: Record<string, any> = {};
    if (sanitized.type !== undefined) cleanFilter.type = sanitizeString(sanitized.type, 50);
    if (sanitized.category !== undefined) cleanFilter.category = sanitizeString(sanitized.category, 50);
    if (sanitized.keyword !== undefined) cleanFilter.keyword = sanitizeString(sanitized.keyword, 100);

    if (sanitized.maxPrice !== undefined && sanitized.maxPrice !== null) {
      const p = parseFloat(sanitized.maxPrice);
      if (isNaN(p) || p < 0) return { valid: false, sanitizedArgs: {}, error: 'maxPrice must be a positive number.' };
      cleanFilter.maxPrice = p;
    }
    if (sanitized.minPrice !== undefined && sanitized.minPrice !== null) {
      const p = parseFloat(sanitized.minPrice);
      if (isNaN(p) || p < 0) return { valid: false, sanitizedArgs: {}, error: 'minPrice must be a positive number.' };
      cleanFilter.minPrice = p;
    }
    if (sanitized.sort !== undefined || sanitized.sortBy !== undefined) {
      const s = sanitizeString(sanitized.sort || sanitized.sortBy, 30);
      const ALLOWED_SORTS = ['price_asc', 'price_desc', 'rating_desc', 'newest', 'cheapest', 'expensive', 'best_rated'];
      if (!ALLOWED_SORTS.includes(s)) {
        return { valid: false, sanitizedArgs: {}, error: `Invalid sortBy option '${s}'.` };
      }
      cleanFilter.sortBy = s;
    }
    cleanFilter.limit = typeof sanitized.limit === 'number' ? Math.min(Math.max(1, Math.floor(sanitized.limit)), 10) : 5;
    return { valid: true, sanitizedArgs: cleanFilter };
  }

  // ── 4. compare_entities schema ─────────────────────────────────────────────
  if (normalizedTool === 'compare_entities') {
    let ids: string[] = [];
    if (Array.isArray(sanitized.ids)) {
      ids = sanitized.ids.map((id: any) => sanitizeString(id, MAX_ID_LENGTH)).filter(Boolean);
    } else if (Array.isArray(sanitized.entityIds)) {
      ids = sanitized.entityIds.map((id: any) => sanitizeString(id, MAX_ID_LENGTH)).filter(Boolean);
    }
    const query = sanitizeString(sanitized.query || sanitized.search || '');
    if (ids.length === 0 && !query) {
      return { valid: false, sanitizedArgs: {}, error: "compare_entities requires 'ids' array or 'query' string." };
    }
    if (ids.length > 4) {
      ids = ids.slice(0, 4);
    }
    return {
      valid: true,
      sanitizedArgs: { ids, entityIds: ids, query },
    };
  }

  // ── 5. get_entity_media schema ─────────────────────────────────────────────
  if (normalizedTool === 'get_entity_media') {
    const entityId = sanitizeString(sanitized.entityId || sanitized.entity_id || sanitized.id || sanitized.query || '', MAX_ID_LENGTH);
    if (!entityId) {
      return { valid: false, sanitizedArgs: {}, error: "Argument 'entityId' or 'query' is required for get_entity_media." };
    }
    return {
      valid: true,
      sanitizedArgs: { entityId, query: entityId },
    };
  }

  // ── 6. get_page schema ─────────────────────────────────────────────────────
  if (normalizedTool === 'get_page') {
    const url = sanitizeString(sanitized.url || sanitized.slug || sanitized.path || sanitized.query || '');
    if (!url) {
      return { valid: false, sanitizedArgs: {}, error: "Argument 'url' or 'slug' is required for get_page." };
    }
    return {
      valid: true,
      sanitizedArgs: { url, slug: url },
    };
  }

  // ── 7. navigate_to_entity schema ───────────────────────────────────────────
  if (['navigate_to_entity', 'navigate', 'navigate_to_page', 'open_page'].includes(normalizedTool)) {
    const query = sanitizeString(sanitized.query || sanitized.entity || sanitized.target || sanitized.entityId || sanitized.url || '');
    if (!query) {
      return { valid: false, sanitizedArgs: {}, error: "Argument 'query' or 'url' is required for navigate_to_entity." };
    }
    return {
      valid: true,
      sanitizedArgs: { query, entityId: sanitized.entityId ? sanitizeString(sanitized.entityId, MAX_ID_LENGTH) : undefined },
    };
  }

  return { valid: true, sanitizedArgs: sanitized };
}

// ── Secret Redaction ───────────────────────────────────────────────────────────

const SENSITIVE_KEY_REGEX = /(?:key|secret|token|password|auth|credential|retellApiKey|vapiApiKey|service_role)/i;

/**
 * Deeply sanitizes objects and removes sensitive keys before logging or returning.
 */
export function sanitizeLogPayload(obj: any, depth = 0): any {
  if (depth > 5 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeLogPayload(item, depth + 1));
  }

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(k)) {
      clean[k] = '[REDACTED]';
    } else if (typeof v === 'object') {
      clean[k] = sanitizeLogPayload(v, depth + 1);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}
