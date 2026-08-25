# Comprehensive End-to-End Regression Test Report

**Execution Timestamp:** 2026-08-25T16:30:14.945Z
**Scoped Test Widget:** `Lms` (`3d801677-65f4-4495-a9b5-24c39b6ee516`)
**Catalog Entities Evaluated:** 10 real crawled entities
**Overall Result:** **16 / 40 PASSED (40%)**

## Test Execution Matrix

| Test ID | Category | User Input | Expected Retrieval | Expected Answer | Expected Cards | Expected Navigation | Actual Behavior | Latency | Status |
|---|---|---|---|---|---|---|---|---|---|
| **E2E-01** | Retrieval Core | `Leetcode Mastery` | Exact match | Factual text | 1 card | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-02** | Retrieval Core | `semantic query` | Semantic match | Coherent answer | Card | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-03** | Retrieval Core | `Leetcode Mastery` | Fused exact + vector + keyword retrieval | Top ranked candidate with high composite score | Structured metadata | None | Retrieved 1 items, top score: 2040 | 1870 ms | **✅ PASS** |
| **E2E-04** | Retrieval Core | `filter entities maxPrice <= 140` | Filtered subset matching price constraint | Structured entities within price range | Cards for matching filtered entities | None | Success: true, Count: 5 | 0 ms | **✅ PASS** |
| **E2E-05** | Retrieval Core | `price constraint` | Budget items | Answer | Cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-06** | Retrieval Core | `sale discount special offer` | Retrieval handles sale and discount queries | Returns items or indicates current promotions | Product cards if items exist | None | Success: true, Found: 0 items | 0 ms | **✅ PASS** |
| **E2E-07** | Retrieval Core | `availability query` | Item state | Factual availability | Badge | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-08** | Retrieval Core | `filter by category "service"` | Entities of type "service" | Filtered entity results | Category-specific cards | None | Success: true, Count: 3 | 0 ms | **✅ PASS** |
| **E2E-09** | Retrieval Core | `sort by price_asc` | Entities sorted in ascending order of price | Sorted entity list | Cards with displayed prices in ascending order | None | Success: true, Count: 5 | 0 ms | **✅ PASS** |
| **E2E-10** | Retrieval Core | `Leetcode Mastery` | Highest relevance match ranks as #1 | First result has highest composite score | Top card matches target entity | None | Rank 1: "Leetcode Mastery" (Score: 2040) | 705 ms | **✅ PASS** |
| **E2E-11** | Conversational Context | `disambiguation query` | Multiple candidates | Clarification | Cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-12** | Conversational Context | `pronoun query` | Resolved pronoun | Details | Card | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-13** | Conversational Context | `followup query` | Topic context | Summary | Card | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-14** | Conversational Context | `memory query` | History recall | Identifies entity | Card | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-15** | Multimodal & Navigation | `get_entity_media for "Leetcode Mastery"` | Real sanitized image URLs from crawled data | Image URLs array with zero hallucinated URLs | Card with verified photo URLs | None | Success: true, Images found: 1 | 0 ms | **✅ PASS** |
| **E2E-16** | Multimodal & Navigation | `card query` | Entity payload | Prose | Structured Card | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-17** | Multimodal & Navigation | `open Leetcode Mastery` | Resolves canonical URL for "Leetcode Mastery" | Navigation action payload | Card for target entity | Exact target URL with widget_resume state: https://lms-e-learning-system.vercel.app/course/69309149f53ad74946204d40?widget_resume=e2e-nav-test | CanNavigate: true, URL: https://lms-e-learning-system.vercel.app/course/69309149f53ad74946204d40?widget_resume=e2e-nav-test | 12 ms | **✅ PASS** |
| **E2E-18** | Grounding & Freshness | `missing data query` | Zero match | Not found | 0 cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-19** | Grounding & Freshness | `hallucination test` | Zero match | Refusal | 0 cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-20** | Grounding & Freshness | `get_entity "Leetcode Mastery"` | Returns entity with calculated freshness state | Exposes freshness status (fresh \| recent \| stale_or_unlisted) | Freshness badge in card metadata | None | Freshness: "fresh", Grounded: true | 0 ms | **✅ PASS** |
| **E2E-21** | Grounding & Freshness | `open unlisted old item that was removed` | Zero valid navigation target for unlisted items | Refusal without blind fallback | 0 cards | None (canNavigate: false) | CanNavigate: true, Confidence: exact | 15 ms | **❌ FAIL** |
| **E2E-22** | Grounding & Freshness | `Query foreign widget e0330b35-27c1-4f27-95d0-93640bd05812 for tenant A entity "Leetcode Mastery"` | Strict tenant isolation (zero cross-tenant record leakage) | No cross-widget records returned | 0 foreign tenant cards | None | Cross-tenant leakage: NONE (ISOLATED) | 1357 ms | **✅ PASS** |
| **E2E-23** | Provider Compatibility | `chat query` | Overview | Greeting | Cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-24** | Provider Compatibility | `retell tool call` | Retell format | JSON | Results | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-25** | Provider Compatibility | `vapi tool call` | Vapi batch format | JSON string | Results | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-26** | Provider Compatibility | `compare Leetcode Mastery and Backend Mastery` | Multi-step wave planner generates and executes tool steps | Comprehensive comparison payload | Comparative entity cards | None | Plan: comparison, Steps: 3, Executed: 3 | 1506 ms | **✅ PASS** |
| **E2E-27** | Resilience & Fallbacks | `search_knowledge with invalid empty query` | Fails gracefully without crashing Node.js runtime | Returns structured error object `{ success: false, error: ... }` | 0 cards | None | Success: false, Error: missing_query | 5 ms | **✅ PASS** |
| **E2E-28** | Resilience & Fallbacks | `fastpath test` | Fast greeting | Greeting | 0 cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-29** | Resilience & Fallbacks | `Exact candidate match fallback for "Leetcode Mastery"` | Exact SQL & Full-Text keyword search guarantees result even if vector fails | Found target entity | Card for target entity | None | Match type: exact, Score: 2040 | 588 ms | **✅ PASS** |
| **E2E-30** | Resilience & Fallbacks | `search_knowledge for nonexistent term "xyznonexistentterm99999999"` | Empty results array `[]`, count: 0, grounded: false | Zero matching entities | 0 cards | None | Success: true, Count: 0, Grounded: false | 0 ms | **✅ PASS** |
| **E2E-31** | Query Understanding | `Leexxode Mastery` | Vector embedding & trigram fuzzy search tolerates typos | Recovers intended catalog entity despite misspelling | Card for best match | None | Items returned: 2, Top title: "Leetcode Mastery" | 497 ms | **✅ PASS** |
| **E2E-32** | Query Understanding | `synonym query` | Domain items | Overview | Cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-33** | Query Understanding | `broad query` | Overview | Summary | Cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-34** | Query Understanding | `specific query` | Exact attribute | Price quote | Card | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-35** | Query Understanding | `unsupported query` | Out of scope | Polite boundary | 0 cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-36** | Security & Production | `malicious tool` | Blocked | Error | 0 cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-37** | Security & Production | `rate limit test` | 429 trigger | Rate limit response | 0 cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-38** | Security & Production | `concurrent test` | Parallel handling | HTTP 200 all | Cards | None | fetch failed | N/A | **❌ FAIL** |
| **E2E-39** | Security & Production | `Benchmark hybrid retrieval latency for "Leetcode Mastery"` | Parallel DB-side retrieval completes in <3000ms | High-speed candidate retrieval | Grounded entity cards | None | Total retrieval time: 496 ms | 496 ms | **✅ PASS** |
| **E2E-40** | Security & Production | `correctness query` | Valid card schema | Full details | Valid Card | None | fetch failed | N/A | **❌ FAIL** |

## Failure & Diagnostic Details

### [E2E-01] Leetcode Mastery
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:243:41)
- **Details:** `undefined`

### [E2E-02] semantic query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:266:41)
- **Details:** `undefined`

### [E2E-05] price constraint
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:332:41)
- **Details:** `undefined`

### [E2E-07] availability query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:376:41)
- **Details:** `undefined`

### [E2E-11] disambiguation query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:470:41)
- **Details:** `undefined`

### [E2E-12] pronoun query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:493:5)
- **Details:** `undefined`

### [E2E-13] followup query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:525:41)
- **Details:** `undefined`

### [E2E-14] memory query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:556:41)
- **Details:** `undefined`

### [E2E-16] card query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:612:41)
- **Details:** `undefined`

### [E2E-18] missing data query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:660:41)
- **Details:** `undefined`

### [E2E-19] hallucination test
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:682:41)
- **Details:** `undefined`

### [E2E-21] open unlisted old item that was removed
- **Status:** FAIL
- **Actual Behavior:** CanNavigate: true, Confidence: exact
- **Root Cause:** N/A
- **Details:** `{"canNavigate":true}`

### [E2E-23] chat query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:777:41)
- **Details:** `undefined`

### [E2E-24] retell tool call
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendAgentToolRequest (D:\front desk\scripts\test-e2e-regression.ts:146:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:799:41)
- **Details:** `undefined`

### [E2E-25] vapi tool call
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:822:17)
- **Details:** `undefined`

### [E2E-28] fastpath test
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:906:41)
- **Details:** `undefined`

### [E2E-32] synonym query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:999:41)
- **Details:** `undefined`

### [E2E-33] broad query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:1021:41)
- **Details:** `undefined`

### [E2E-34] specific query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:1044:41)
- **Details:** `undefined`

### [E2E-35] unsupported query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:1066:41)
- **Details:** `undefined`

### [E2E-36] malicious tool
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendAgentToolRequest (D:\front desk\scripts\test-e2e-regression.ts:146:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:1092:41)
- **Details:** `undefined`

### [E2E-37] rate limit test
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendAgentToolRequest (D:\front desk\scripts\test-e2e-regression.ts:146:15)
    at async Promise.all (index 0)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:1118:23)
- **Details:** `undefined`

### [E2E-38] concurrent test
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async Promise.all (index 0)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:1146:23)
- **Details:** `undefined`

### [E2E-40] correctness query
- **Status:** FAIL
- **Actual Behavior:** fetch failed
- **Root Cause:** TypeError: fetch failed
    at node:internal/deps/undici/undici:16416:13
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async sendChatRequest (D:\front desk\scripts\test-e2e-regression.ts:113:15)
    at async runE2ESuite (D:\front desk\scripts\test-e2e-regression.ts:1194:41)
- **Details:** `undefined`
