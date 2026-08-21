/**
 * src/lib/usage/spendLimiter.ts
 *
 * Per-widget spend & abuse circuit breaker (Task C.3).
 * Tracks daily call and chat starts against configurable thresholds with automatic
 * date-partition rollover and fail-safe operation (fail-open on tracking errors).
 */

export const DEFAULT_MAX_DAILY_CALLS = 100;
export const DEFAULT_MAX_DAILY_CHATS = 500;

export interface DailyUsageRecord {
  widgetId: string;
  date: string; // YYYY-MM-DD (UTC)
  calls: number;
  chats: number;
  isCircuitBreakerTripped: boolean;
  trippedReason?: string;
  trippedAt?: number;
}

export interface UsageCheckResult {
  allowed: boolean;
  currentCount: number;
  maxLimit: number;
  dateStr: string;
  isCircuitBreakerTripped: boolean;
  reason?: string;
}

// In-memory date-partitioned usage bucket registry: key = `${widgetId}:${dateStr}`
const usageStore = new Map<string, DailyUsageRecord>();

export function getUtcDateStr(d = new Date()): string {
  return d.toISOString().split('T')[0];
}

function getBucketKey(widgetId: string, dateStr: string): string {
  const normId = (widgetId || 'default').trim().toLowerCase();
  return `${normId}:${dateStr}`;
}

function getOrCreateBucket(widgetId: string, dateStr = getUtcDateStr()): DailyUsageRecord {
  const key = getBucketKey(widgetId, dateStr);
  let record = usageStore.get(key);
  if (!record) {
    record = {
      widgetId: (widgetId || 'default').trim().toLowerCase(),
      date: dateStr,
      calls: 0,
      chats: 0,
      isCircuitBreakerTripped: false,
    };
    usageStore.set(key, record);
  }
  return record;
}

/**
 * Check if the widget has exceeded its daily call or chat quota, and increment the counter.
 * Fail-safe: Always fails open if an unexpected exception occurs.
 */
export async function checkAndIncrementUsage(
  widgetId: string,
  type: 'call' | 'chat',
  limits?: { maxDailyCalls?: number; maxDailyChats?: number },
  customDateStr?: string
): Promise<UsageCheckResult> {
  const dateStr = customDateStr || getUtcDateStr();
  const maxCalls = limits?.maxDailyCalls ?? DEFAULT_MAX_DAILY_CALLS;
  const maxChats = limits?.maxDailyChats ?? DEFAULT_MAX_DAILY_CHATS;
  const maxLimit = type === 'call' ? maxCalls : maxChats;

  try {
    const bucket = getOrCreateBucket(widgetId, dateStr);

    // If circuit breaker is already tripped or current count reached max limit
    const currentCount = type === 'call' ? bucket.calls : bucket.chats;

    if (bucket.isCircuitBreakerTripped || currentCount >= maxLimit) {
      if (!bucket.isCircuitBreakerTripped) {
        bucket.isCircuitBreakerTripped = true;
        bucket.trippedReason = `Exceeded daily limit of ${maxLimit} ${type}s`;
        bucket.trippedAt = Date.now();
        console.warn(`[SPEND_CIRCUIT_BREAKER] Widget ${widgetId} exceeded daily ${type} limit (${currentCount}/${maxLimit}). Circuit breaker TRIPPED for ${dateStr}.`);
      }

      return {
        allowed: false,
        currentCount,
        maxLimit,
        dateStr,
        isCircuitBreakerTripped: true,
        reason: 'This assistant is temporarily unavailable. Please try again later or contact us directly.',
      };
    }

    // Increment count
    if (type === 'call') {
      bucket.calls += 1;
    } else {
      bucket.chats += 1;
    }

    return {
      allowed: true,
      currentCount: type === 'call' ? bucket.calls : bucket.chats,
      maxLimit,
      dateStr,
      isCircuitBreakerTripped: false,
    };
  } catch (err: any) {
    // Fail-safe: Fail-open on tracking errors so platform availability is preserved
    console.error(`[SPEND_CIRCUIT_BREAKER] Failed to evaluate usage for widget ${widgetId}, failing open:`, err?.message || err);
    return {
      allowed: true,
      currentCount: 0,
      maxLimit,
      dateStr,
      isCircuitBreakerTripped: false,
    };
  }
}

/**
 * Retrieve current usage and circuit breaker status for a widget.
 */
export function getWidgetUsageStatus(
  widgetId: string,
  limits?: { maxDailyCalls?: number; maxDailyChats?: number },
  customDateStr?: string
): DailyUsageRecord & { maxDailyCalls: number; maxDailyChats: number } {
  const dateStr = customDateStr || getUtcDateStr();
  const bucket = getOrCreateBucket(widgetId, dateStr);
  const maxDailyCalls = limits?.maxDailyCalls ?? DEFAULT_MAX_DAILY_CALLS;
  const maxDailyChats = limits?.maxDailyChats ?? DEFAULT_MAX_DAILY_CHATS;

  return {
    ...bucket,
    maxDailyCalls,
    maxDailyChats,
  };
}

/**
 * Reset daily usage for a widget (useful for testing or manual administrative reset).
 */
export function resetWidgetDailyUsage(widgetId: string, customDateStr?: string): void {
  const dateStr = customDateStr || getUtcDateStr();
  const key = getBucketKey(widgetId, dateStr);
  usageStore.delete(key);
}

/**
 * Return all tracked active daily usage records.
 */
export function getAllUsageRecords(): DailyUsageRecord[] {
  return Array.from(usageStore.values());
}
