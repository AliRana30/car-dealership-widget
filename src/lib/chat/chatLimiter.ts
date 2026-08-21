/**
 * src/lib/chat/chatLimiter.ts
 *
 * Comprehensive session-level rate limiting, turn caps, duplicate-message throttling,
 * and input message length constraints (Tasks C.1 & C.4).
 */

export const DEFAULT_MAX_CHAT_TURNS = 30;
export const DEFAULT_CHAT_RATE_LIMIT_PER_MINUTE = 15;
export const DEFAULT_DUPLICATE_REPEAT_THRESHOLD = 2;
export const DEFAULT_MAX_MESSAGE_CHARACTERS = 1000;

export const STATIC_DUPLICATE_THROTTLE_REPLY = "I've already answered that — is there something else I can help with?";
export const STATIC_RATE_LIMIT_REPLY = "You're sending messages too fast. Please wait a moment before trying again.";
export const STATIC_TURN_LIMIT_REPLY = "You have reached the maximum message limit for this chat session. Please contact our team directly for further assistance.";

export interface ChatTurnCheckResult {
  allowed: boolean;
  currentTurn: number;
  maxTurns: number;
  message?: string;
}

export interface ChatRateLimitResult {
  allowed: boolean;
  currentWindowCount: number;
  maxPerMinute: number;
  retryAfterSeconds?: number;
  message?: string;
}

export interface DuplicateCheckResult {
  isDuplicateThrottled: boolean;
  duplicateCount: number;
  message?: string;
}

export interface MessageValidationResult {
  valid: boolean;
  sanitized?: string;
  error?: string;
}

interface SessionActivityRecord {
  turnCount: number;
  createdAt: number;
  lastActivityAt: number;
  // Sliding window timestamps for rate limiting (last 60s)
  messageTimestamps: number[];
  // Duplicate message detection
  lastMessageText: string;
  duplicateCount: number;
  lastMessageTime: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const chatSessionStore = new Map<string, SessionActivityRecord>();

// Cleanup stale sessions periodically
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 mins
let cleanupTimer: NodeJS.Timeout | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of chatSessionStore.entries()) {
      if (now - record.lastActivityAt > SESSION_TTL_MS) {
        chatSessionStore.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

function getOrCreateSessionRecord(sessionKey: string): SessionActivityRecord {
  ensureCleanupTimer();
  const normalizedKey = (sessionKey || 'default').trim().toLowerCase();
  const now = Date.now();
  let record = chatSessionStore.get(normalizedKey);

  if (!record || (now - record.lastActivityAt > SESSION_TTL_MS)) {
    record = {
      turnCount: 0,
      createdAt: now,
      lastActivityAt: now,
      messageTimestamps: [],
      lastMessageText: '',
      duplicateCount: 0,
      lastMessageTime: 0,
    };
    chatSessionStore.set(normalizedKey, record);
  }

  record.lastActivityAt = now;
  return record;
}

/**
 * 1. Validate and sanitize single message input length.
 */
export function validateMessageLength(
  messageText: string,
  maxCharacters = DEFAULT_MAX_MESSAGE_CHARACTERS
): MessageValidationResult {
  if (!messageText || typeof messageText !== 'string' || messageText.trim() === '') {
    return { valid: false, error: 'Message cannot be empty.' };
  }

  const trimmed = messageText.trim();
  if (trimmed.length > maxCharacters) {
    return {
      valid: false,
      error: `Your message exceeds the maximum allowed length (${maxCharacters.toLocaleString()} characters). Please shorten your question.`,
    };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * 2. Session-Scoped Sliding Window Rate Limiter (Task C.4).
 * Enforces max N messages per minute per session, independent of IP limits.
 */
export function checkSessionChatRateLimit(
  sessionKey: string,
  maxPerMinute = DEFAULT_CHAT_RATE_LIMIT_PER_MINUTE
): ChatRateLimitResult {
  const normalizedKey = (sessionKey || '').trim().toLowerCase();
  if (!normalizedKey) {
    return { allowed: true, currentWindowCount: 1, maxPerMinute };
  }

  const record = getOrCreateSessionRecord(normalizedKey);
  const now = Date.now();
  const windowStart = now - 60_000;

  // Prune timestamps older than 60s
  record.messageTimestamps = record.messageTimestamps.filter((t) => t > windowStart);

  if (record.messageTimestamps.length >= maxPerMinute) {
    const oldest = record.messageTimestamps[0] || windowStart;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));

    console.warn(`[CHAT_SESSION_RATE_LIMIT] Session ${normalizedKey} exceeded rate limit (${record.messageTimestamps.length}/${maxPerMinute} msg/min). Throttling.`);

    return {
      allowed: false,
      currentWindowCount: record.messageTimestamps.length,
      maxPerMinute,
      retryAfterSeconds,
      message: STATIC_RATE_LIMIT_REPLY,
    };
  }

  // Record this message timestamp
  record.messageTimestamps.push(now);

  return {
    allowed: true,
    currentWindowCount: record.messageTimestamps.length,
    maxPerMinute,
  };
}

/**
 * 3. Duplicate-Message Throttling (Task C.4).
 * If a session sends the same message text repeatedly in quick succession,
 * skips generating a new LLM response after threshold repeats and returns static reply.
 */
export function checkDuplicateMessage(
  sessionKey: string,
  messageText: string,
  repeatThreshold = DEFAULT_DUPLICATE_REPEAT_THRESHOLD
): DuplicateCheckResult {
  const normalizedKey = (sessionKey || '').trim().toLowerCase();
  if (!normalizedKey || !messageText) {
    return { isDuplicateThrottled: false, duplicateCount: 1 };
  }

  const record = getOrCreateSessionRecord(normalizedKey);
  const now = Date.now();
  const normalizedText = messageText.trim().toLowerCase();

  // If identical text within 2 minutes of previous message
  if (record.lastMessageText === normalizedText && (now - record.lastMessageTime < 120_000)) {
    record.duplicateCount += 1;
    record.lastMessageTime = now;

    if (record.duplicateCount >= repeatThreshold) {
      console.log(`[CHAT_DUPLICATE_THROTTLE] Session ${normalizedKey} sent duplicate message (${record.duplicateCount} repeats). Returning static throttle reply with zero LLM execution.`);
      return {
        isDuplicateThrottled: true,
        duplicateCount: record.duplicateCount,
        message: STATIC_DUPLICATE_THROTTLE_REPLY,
      };
    }
  } else {
    // New distinct message text
    record.lastMessageText = normalizedText;
    record.duplicateCount = 1;
    record.lastMessageTime = now;
  }

  return {
    isDuplicateThrottled: false,
    duplicateCount: record.duplicateCount,
  };
}

/**
 * 4. Hard Session Turn Cap Checker & Incrementer (Task C.1).
 */
export function checkAndIncrementChatTurns(
  sessionKey: string,
  maxTurns = DEFAULT_MAX_CHAT_TURNS
): ChatTurnCheckResult {
  const normalizedKey = (sessionKey || '').trim().toLowerCase();
  if (!normalizedKey) {
    return { allowed: true, currentTurn: 1, maxTurns };
  }

  const record = getOrCreateSessionRecord(normalizedKey);

  // If already at or above limit, disallow further LLM generation
  if (record.turnCount >= maxTurns) {
    return {
      allowed: false,
      currentTurn: record.turnCount,
      maxTurns,
      message: STATIC_TURN_LIMIT_REPLY,
    };
  }

  // Increment turn count
  record.turnCount += 1;

  return {
    allowed: true,
    currentTurn: record.turnCount,
    maxTurns,
  };
}

/**
 * Reset all trackers for a given session (useful for testing or manual reset).
 */
export function resetChatTurns(sessionKey: string): void {
  const normalizedKey = (sessionKey || '').trim().toLowerCase();
  chatSessionStore.delete(normalizedKey);
}

/**
 * Get current turn count for a session (for testing/diagnostics).
 */
export function getChatTurnCount(sessionKey: string): number {
  const normalizedKey = (sessionKey || '').trim().toLowerCase();
  return chatSessionStore.get(normalizedKey)?.turnCount ?? 0;
}
