export interface ChatTurnCheckResult {
  allowed: boolean;
  currentTurn: number;
  maxTurns: number;
  message?: string;
}

interface SessionTurnRecord {
  turnCount: number;
  createdAt: number;
  lastActivityAt: number;
}

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const chatSessionTurns = new Map<string, SessionTurnRecord>();

// Cleanup stale sessions periodically
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 mins
let cleanupTimer: NodeJS.Timeout | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of chatSessionTurns.entries()) {
      if (now - record.lastActivityAt > SESSION_TTL_MS) {
        chatSessionTurns.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (typeof cleanupTimer.unref === 'function') {
    cleanupTimer.unref();
  }
}

/**
 * Check if the chat session has exceeded its maximum turns and increment turn count.
 * If exceeded, returns allowed: false and the fixed contact message.
 */
export function checkAndIncrementChatTurns(
  sessionKey: string,
  maxTurns = 30
): ChatTurnCheckResult {
  ensureCleanupTimer();
  const normalizedKey = (sessionKey || '').trim().toLowerCase();
  if (!normalizedKey) {
    return { allowed: true, currentTurn: 1, maxTurns };
  }

  const now = Date.now();
  let record = chatSessionTurns.get(normalizedKey);

  if (!record || (now - record.lastActivityAt > SESSION_TTL_MS)) {
    record = {
      turnCount: 0,
      createdAt: now,
      lastActivityAt: now,
    };
    chatSessionTurns.set(normalizedKey, record);
  }

  record.lastActivityAt = now;

  // If already at or above limit, disallow further LLM generation
  if (record.turnCount >= maxTurns) {
    return {
      allowed: false,
      currentTurn: record.turnCount,
      maxTurns,
      message: 'You have reached the maximum message limit for this chat session. Please contact our team directly for further assistance.',
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
 * Reset turn count for a given session (useful for testing or manual reset).
 */
export function resetChatTurns(sessionKey: string): void {
  const normalizedKey = (sessionKey || '').trim().toLowerCase();
  chatSessionTurns.delete(normalizedKey);
}

/**
 * Get current turn count for a session (for testing/diagnostics).
 */
export function getChatTurnCount(sessionKey: string): number {
  const normalizedKey = (sessionKey || '').trim().toLowerCase();
  return chatSessionTurns.get(normalizedKey)?.turnCount ?? 0;
}
