/**
 * Production Gateway Security & Verification Validation Suite
 *
 * Validates /api/agent/tools against all production hardening requirements:
 * 1. Valid Retell AI Tool Call
 * 2. Valid Vapi AI Tool-Calls Batch Format
 * 3. Valid Vapi AI Legacy Function-Call Format
 * 4. Forged / Invalid Retell Signature (Rejected with 401)
 * 5. Forged / Invalid Vapi Server Secret (Rejected with 401)
 * 6. Missing Widget ID (Fails closed with 400)
 * 7. Cross-Widget Parameter Tampering (Rejected with 403)
 * 8. Cross-Agent ID Mismatch (Rejected with 403)
 * 9. Malformed JSON Body (Rejected with 400)
 * 10. Unknown / Non-Allowlisted Tool Name (Rejected)
 * 11. Malformed Tool Arguments / Schema Failure (Rejected)
 * 12. Batch Size Abuse (> 5 tool calls) (Rejected)
 * 13. Rate Limit Enforcement (Burst requests trigger HTTP 429)
 * 14. Zero Secret Leakage Verification in Responses & Metadata
 */

import fs from 'fs';
import path from 'path';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    });
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

const BASE_URL = 'http://localhost:3000';
const LMS_WIDGET_ID = '3d801677-65f4-4495-a9b5-24c39b6ee516';
const NORETMY_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface TestResult {
  num: number;
  testCase: string;
  expectedResult: string;
  actualResult: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  latency: string;
  rootCause?: string;
  details?: any;
}

async function runGatewaySecuritySuite() {
  console.log('\n========================================================================');
  console.log('  STARTING PRODUCTION GATEWAY SECURITY VALIDATION SUITE');
  console.log('========================================================================\n');

  const testResults: TestResult[] = [];

  // ---------------------------------------------------------------------------
  // TEST 1: Valid Retell AI Tool Call
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'search_entities',
        args: { query: 'Backend Mastery', limit: 2 },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass =
      res.status === 200 &&
      data.success === true &&
      Array.isArray(data.results) &&
      data.results.length > 0;

    testResults.push({
      num: 1,
      testCase: 'Valid Retell AI Tool Call',
      expectedResult: 'HTTP 200, success=true, returns structured results array',
      actualResult: `Status: ${res.status}, success: ${data.success}, count: ${data.count}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: { topTitle: data.results?.[0]?.title, freshness: data.freshness },
    });
  } catch (err: any) {
    testResults.push({
      num: 1,
      testCase: 'Valid Retell AI Tool Call',
      expectedResult: 'HTTP 200, success=true',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Valid Vapi AI Tool-Calls Batch Format
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Vapi/1.0',
      },
      body: JSON.stringify({
        message: {
          type: 'tool-calls',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'search_knowledge',
                arguments: { query: 'Backend Mastery', limit: 1 },
              },
            },
          ],
        },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const parsedResult = data.results?.[0]?.result ? JSON.parse(data.results[0].result) : null;
    const pass =
      res.status === 200 &&
      Array.isArray(data.results) &&
      data.results[0]?.toolCallId === 'call_1' &&
      parsedResult?.count >= 1;

    testResults.push({
      num: 2,
      testCase: 'Valid Vapi AI Tool-Calls Batch Format',
      expectedResult: 'HTTP 200, returns { results: [{ toolCallId, result }] }',
      actualResult: `Status: ${res.status}, toolCallId: ${data.results?.[0]?.toolCallId}, parsedCount: ${parsedResult?.count}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: { parsedResultSnippet: parsedResult?.results?.[0]?.title },
    });
  } catch (err: any) {
    testResults.push({
      num: 2,
      testCase: 'Valid Vapi AI Tool-Calls Batch Format',
      expectedResult: 'HTTP 200, Vapi batch format',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Valid Vapi AI Legacy Function-Call Format
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Vapi/1.0',
      },
      body: JSON.stringify({
        message: {
          type: 'function-call',
          functionCall: {
            name: 'get_entity',
            parameters: { query: 'Backend Mastery' },
          },
        },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const parsedResult = data.result ? JSON.parse(data.result) : null;
    const pass =
      res.status === 200 &&
      parsedResult?.title?.toLowerCase().includes('backend mastery');

    testResults.push({
      num: 3,
      testCase: 'Valid Vapi AI Legacy Function-Call Format',
      expectedResult: 'HTTP 200, returns { result: stringified_data }',
      actualResult: `Status: ${res.status}, title: ${parsedResult?.title}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: { parsedResult },
    });
  } catch (err: any) {
    testResults.push({
      num: 3,
      testCase: 'Valid Vapi AI Legacy Function-Call Format',
      expectedResult: 'HTTP 200, Legacy function format',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Forged / Invalid Retell Signature (Rejected with 401)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-retell-signature': 'forged_hmac_sha256_signature_hex_1234567890abcdef',
      },
      body: JSON.stringify({
        name: 'search_entities',
        args: { query: 'Backend Mastery' },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = res.status === 401 && data.error === 'unauthorized';

    testResults.push({
      num: 4,
      testCase: 'Forged / Invalid Retell Signature Rejection',
      expectedResult: 'HTTP 401 Unauthorized, error="unauthorized"',
      actualResult: `Status: ${res.status}, error: ${data.error}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 4,
      testCase: 'Forged Retell Signature Rejection',
      expectedResult: 'HTTP 401',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Forged / Invalid Vapi Server Secret (Rejected with 401)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-vapi-secret': 'invalid_secret_token_abcdef123456',
        'User-Agent': 'Vapi/1.0',
      },
      body: JSON.stringify({
        name: 'search_entities',
        args: { query: 'Backend Mastery' },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = res.status === 401 && data.error === 'unauthorized';

    testResults.push({
      num: 5,
      testCase: 'Forged / Invalid Vapi Server Secret Rejection',
      expectedResult: 'HTTP 401 Unauthorized, error="unauthorized"',
      actualResult: `Status: ${res.status}, error: ${data.error}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 5,
      testCase: 'Forged Vapi Secret Rejection',
      expectedResult: 'HTTP 401',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Missing Widget ID Scope Enforcement
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'search_entities',
        args: { query: 'Backend Mastery' },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = res.status === 400 && (data.error === 'widget_not_found' || data.success === false);

    testResults.push({
      num: 6,
      testCase: 'Missing Widget ID Scope Enforcement',
      expectedResult: 'HTTP 400 Bad Request, fails closed on missing tenant scope',
      actualResult: `Status: ${res.status}, error: ${data.error}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 6,
      testCase: 'Missing Widget ID Scope Enforcement',
      expectedResult: 'Fails closed',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Cross-Widget Parameter Tampering (Rejected with 403)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgetId: NORETMY_WIDGET_ID, // Mismatched body widgetId
        name: 'search_entities',
        args: { query: 'Backend Mastery' },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = res.status === 403 && data.error === 'forbidden';

    testResults.push({
      num: 7,
      testCase: 'Cross-Widget Parameter Tampering Rejection',
      expectedResult: 'HTTP 403 Forbidden, prevents parameter tampering across widgets',
      actualResult: `Status: ${res.status}, error: ${data.error}, msg: ${data.message}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 7,
      testCase: 'Cross-Widget Parameter Tampering',
      expectedResult: 'HTTP 403',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Cross-Agent ID Mismatch Protection (Rejected with 403)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: {
          agent_id: 'forged_agent_id_not_belonging_to_lms',
        },
        name: 'search_entities',
        args: { query: 'Backend Mastery' },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = res.status === 403 && data.error === 'forbidden';

    testResults.push({
      num: 8,
      testCase: 'Cross-Agent ID Mismatch Protection',
      expectedResult: 'HTTP 403 Forbidden, rejects calls from unauthorized voice agent IDs',
      actualResult: `Status: ${res.status}, error: ${data.error}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 8,
      testCase: 'Cross-Agent ID Mismatch',
      expectedResult: 'HTTP 403',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Malformed JSON Request Body (Rejected with 400)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid_json_syntax: true, ',
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = res.status === 400 && data.error === 'malformed_json';

    testResults.push({
      num: 9,
      testCase: 'Malformed JSON Request Body Rejection',
      expectedResult: 'HTTP 400 Bad Request, error="malformed_json"',
      actualResult: `Status: ${res.status}, error: ${data.error}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 9,
      testCase: 'Malformed JSON Rejection',
      expectedResult: 'HTTP 400',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Unknown / Non-Allowlisted Tool Name (Rejected)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'execute_arbitrary_database_sql',
        args: { sql: 'SELECT * FROM users;' },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = data.success === false && data.error === 'unknown_tool';

    testResults.push({
      num: 10,
      testCase: 'Unknown / Non-Allowlisted Tool Name Rejection',
      expectedResult: 'success=false, error="unknown_tool", rejects arbitrary SQL/tools',
      actualResult: `success: ${data.success}, error: ${data.error}, msg: ${data.message}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 10,
      testCase: 'Unknown Tool Name Rejection',
      expectedResult: 'Rejects unknown tool',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Malformed Tool Arguments / Schema Failure
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'filter_entities',
        args: { maxPrice: -500, sortBy: 'invalid_sort_syntax_hack' },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = data.success === false && data.error === 'invalid_arguments';

    testResults.push({
      num: 11,
      testCase: 'Malformed Tool Arguments / Schema Failure',
      expectedResult: 'success=false, error="invalid_arguments", rejects invalid types/bounds',
      actualResult: `success: ${data.success}, error: ${data.error}, msg: ${data.message}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 11,
      testCase: 'Malformed Tool Arguments Rejection',
      expectedResult: 'Rejects malformed args',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 12: Tool-Call Batch Abuse Protection (> 5 calls in one request)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const excessiveCalls = Array.from({ length: 10 }, (_, i) => ({
      id: `call_${i}`,
      type: 'function',
      function: { name: 'search_knowledge', arguments: { query: 'test' } },
    }));

    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Vapi/1.0',
      },
      body: JSON.stringify({
        message: {
          type: 'tool-calls',
          toolCalls: excessiveCalls,
        },
      }),
    });
    const data = await res.json();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const pass = res.status === 400 && data.error === 'batch_limit_exceeded';

    testResults.push({
      num: 12,
      testCase: 'Tool-Call Batch Abuse Protection (>5 calls)',
      expectedResult: 'HTTP 400 Bad Request, error="batch_limit_exceeded"',
      actualResult: `Status: ${res.status}, error: ${data.error}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: data,
    });
  } catch (err: any) {
    testResults.push({
      num: 12,
      testCase: 'Batch Abuse Protection',
      expectedResult: 'HTTP 400',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 13: Sliding-Window Rate Limit Enforcement (Burst Requests Trigger 429)
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    // Send rapid burst of 65 concurrent requests to exceed 60 req/min threshold
    const burstPromises = Array.from({ length: 65 }, () =>
      fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.42', // isolated test IP
        },
        body: JSON.stringify({
          name: 'search_entities',
          args: { query: 'Backend Mastery' },
        }),
      })
    );

    const responses = await Promise.all(burstPromises);
    const hit429 = responses.some(r => r.status === 429);
    const count429 = responses.filter(r => r.status === 429).length;
    const latency = `${Math.round(performance.now() - t0)} ms`;

    testResults.push({
      num: 13,
      testCase: 'Sliding-Window Rate Limit Enforcement',
      expectedResult: 'HTTP 429 Too Many Requests when burst exceeds 60 req/min threshold',
      actualResult: `Rate limit triggered: ${hit429}, 429 responses count: ${count429} / 65`,
      status: hit429 ? 'PASS' : 'FAIL',
      latency,
      details: { hit429, count429 },
    });
  } catch (err: any) {
    testResults.push({
      num: 13,
      testCase: 'Rate Limit Enforcement',
      expectedResult: 'HTTP 429 triggered',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // TEST 14: Zero Secret Leakage Verification in Responses & Metadata
  // ---------------------------------------------------------------------------
  try {
    const t0 = performance.now();
    const res = await fetch(`${BASE_URL}/api/agent/tools?widgetId=${LMS_WIDGET_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'get_entity',
        args: { query: 'Backend Mastery' },
      }),
    });
    const rawText = await res.text();
    const latency = `${Math.round(performance.now() - t0)} ms`;

    const containsRetellKey = process.env.RETELL_API_KEY && rawText.includes(process.env.RETELL_API_KEY);
    const containsSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY && rawText.includes(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const containsVapiKey = process.env.VAPI_API_KEY && rawText.includes(process.env.VAPI_API_KEY);
    const hasSecretLeak = containsRetellKey || containsSupabaseKey || containsVapiKey;

    const pass = res.status === 200 && !hasSecretLeak;

    testResults.push({
      num: 14,
      testCase: 'Zero Secret Leakage Verification',
      expectedResult: 'Responses and logs never expose API keys, database secrets, or credentials',
      actualResult: `Status: ${res.status}, Secrets leaked: ${hasSecretLeak ? 'YES (FAIL)' : 'NO (SAFE)'}`,
      status: pass ? 'PASS' : 'FAIL',
      latency,
      details: { containsRetellKey, containsSupabaseKey, containsVapiKey },
    });
  } catch (err: any) {
    testResults.push({
      num: 14,
      testCase: 'Zero Secret Leakage Verification',
      expectedResult: 'No secrets leaked',
      actualResult: err.message,
      status: 'FAIL',
      latency: 'N/A',
      rootCause: err.stack,
    });
  }

  // ---------------------------------------------------------------------------
  // Print Summary Report
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log('  PRODUCTION GATEWAY SECURITY TEST REPORT');
  console.log('========================================================================\n');

  let passCount = 0;
  let failCount = 0;
  let partialCount = 0;

  for (const r of testResults) {
    const icon = r.status === 'PASS' ? '✅' : (r.status === 'FAIL' ? '❌' : '⚠️');
    console.log(`${icon} [TEST ${r.num}] [${r.status}] ${r.testCase} (${r.latency})`);
    console.log(`   Expected: ${r.expectedResult}`);
    console.log(`   Actual:   ${r.actualResult}`);
    if (r.rootCause) {
      console.log(`   Root Cause: ${r.rootCause}`);
    }
    if (r.details) {
      console.log(`   Details:  ${JSON.stringify(r.details)}`);
    }
    console.log('');

    if (r.status === 'PASS') passCount++;
    else if (r.status === 'FAIL') failCount++;
    else partialCount++;
  }

  console.log('========================================================================');
  console.log('  TEST SUMMARY');
  console.log('========================================================================');
  console.log(`Total Tests:   ${testResults.length}`);
  console.log(`Passed:        ${passCount} ✅`);
  console.log(`Failed:        ${failCount} ❌`);
  console.log(`Partial:       ${partialCount} ⚠️`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runGatewaySecuritySuite().catch(console.error);
