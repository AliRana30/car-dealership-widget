import { checkDuplicateMessage, DEFAULT_DUPLICATE_REPEAT_THRESHOLD } from '../src/lib/chat/chatLimiter';
import { validateGrounding } from '../src/lib/retrieval/grounding';
import { HybridRetrievalOutput } from '../src/lib/retrieval/hybridRag';

async function testChatLogic() {
  console.log('====================================================');
  console.log('TESTING CHAT RETRIEVAL & RATE/DUPLICATE LIMITERS');
  console.log('====================================================\n');

  const sessionId = 'test_session_' + Date.now();

  // Test 1: Duplicate throttle behavior on catalog queries
  console.log('--- Test 1: Catalog queries should NEVER be duplicate-throttled ---');
  const catalogQuery = 'which courses do you offer';
  for (let i = 1; i <= 5; i++) {
    const res = checkDuplicateMessage(sessionId, catalogQuery);
    console.log(`Attempt ${i} for "${catalogQuery}": throttled=${res.isDuplicateThrottled}, count=${res.duplicateCount}`);
    if (res.isDuplicateThrottled) {
      console.error('❌ FAILED: Catalog query was throttled!');
    }
  }

  // Test 2: Non-catalog identical message throttle behavior
  console.log('\n--- Test 2: Generic non-catalog identical queries throttle after threshold ---');
  const genericQuery = 'blah blah random message';
  for (let i = 1; i <= 4; i++) {
    const res = checkDuplicateMessage(sessionId, genericQuery);
    console.log(`Attempt ${i} for "${genericQuery}": throttled=${res.isDuplicateThrottled}, count=${res.duplicateCount}`);
  }

  // Test 3: Grounding fallback for "which courses do you offer" with mock results
  console.log('\n--- Test 3: Grounding prompt generation with catalog items ---');
  const mockRetrieval: HybridRetrievalOutput = {
    query: 'which courses do you offer',
    normalizedQuery: 'which courses do you offer',
    intent: 'catalog',
    results: [
      {
        id: '1',
        title: 'Leetcode Mastery',
        content: 'Learn data structures and algorithms in Python, Java, C++',
        score: 100,
        dataType: 'course',
        matchType: 'keyword',
        freshnessStatus: 'fresh',
      } as any,
      {
        id: '2',
        title: 'Full Stack Web Development',
        content: 'Master React, Next.js, Node.js and TypeScript',
        score: 95,
        dataType: 'course',
        matchType: 'keyword',
        freshnessStatus: 'fresh',
      } as any,
    ],
    count: 2,
    contextSummary: '- Leetcode Mastery: Learn data structures and algorithms in Python\n- Full Stack Web Development: Master React, Next.js',
  };

  const validation = validateGrounding('which courses do you offer', mockRetrieval, 'Lms');
  console.log('Is grounded:', validation.isGrounded);
  console.log('System prompt contains verified items:', validation.systemPrompt.includes('Leetcode Mastery'));

  // Test 4: Grounding fallback when no items found
  console.log('\n--- Test 4: Grounding fallback when no items found ---');
  const emptyRetrieval: HybridRetrievalOutput = {
    query: 'do you offer python course?',
    normalizedQuery: 'do you offer python course',
    intent: 'specific_entity',
    results: [],
    count: 0,
    contextSummary: '',
  };

  const emptyValidation = validateGrounding('do you offer python course?', emptyRetrieval, 'Lms');
  console.log('Fallback text:', emptyValidation.fallbackText);

  console.log('\n✅ All chat logic unit tests completed successfully.');
}

testChatLogic().catch(console.error);
