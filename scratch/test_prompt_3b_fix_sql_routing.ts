/**
 * Prompt 3B-FIX Verification Suite: Route Vehicle Queries Through Structured SQL
 * 
 * Verifies that vehicle queries execute via hard SQL filters on the `vehicles` table
 * and strictly prevent false-positive / semantic leakage from RAG backfills.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  });
}

import { understandQuery } from '@/lib/retrieval/queryUnderstanding';
import { getVehiclesForWidget, saveVehiclesBatch, normalizeVehicleRecord } from '@/lib/vehicles/types';
import { executeUnifiedTool } from '@/lib/agents/unifiedTools';

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });

async function runPrompt3BFixTests() {
  const widgetId = 'e0330b35-27c1-4f27-95d0-93640bd05812';
  console.log('================================================================');
  console.log(' PROMPT 3B-FIX: STRUCTURED SQL ROUTING & ANTI-RAG-LEAKAGE SUITE');
  console.log('================================================================\n');

  // 1. Ensure representative inventory exists in `vehicles` table
  const testVehicles = [
    {
      title: '2024 Jeep Grand Cherokee Laredo 4x4',
      make: 'Jeep',
      model: 'Grand Cherokee',
      year: 2024,
      condition: 'new',
      bodyStyle: 'SUV',
      price: 52995,
      mileage: 15,
      vin: '1C4RJFBG7RC990001',
      stockNumber: 'NEW-GC-001',
    },
    {
      title: '2021 Jeep Cherokee Trailhawk 4x4',
      make: 'Jeep',
      model: 'Cherokee',
      year: 2021,
      condition: 'used',
      bodyStyle: 'SUV',
      price: 34995,
      mileage: 48000,
      vin: '1C4PJMBB3MD990002',
      stockNumber: 'USED-CHK-002',
    },
    {
      title: '2022 Ram 1500 Big Horn Quad Cab',
      make: 'Ram',
      model: '1500',
      year: 2022,
      condition: 'used',
      bodyStyle: 'Truck',
      price: 43995,
      mileage: 52000,
      vin: '1C6RR7FG8NN990003',
      stockNumber: 'USED-RAM-003',
    },
    {
      title: '2024 Ford Mustang Mach-E Premium AWD',
      make: 'Ford',
      model: 'Mustang Mach-E',
      year: 2024,
      condition: 'new',
      bodyStyle: 'SUV',
      price: 61995,
      mileage: 10,
      vin: '3FMTK3SU8RMA90004',
      stockNumber: 'NEW-MACHE-004',
    },
    {
      title: '2024 Ford F-150 XLT SuperCrew 4x4',
      make: 'Ford',
      model: 'F-150',
      year: 2024,
      condition: 'new',
      bodyStyle: 'Truck',
      price: 64995,
      mileage: 20,
      vin: '1FTFW1ED6RFA90005',
      stockNumber: 'NEW-F150-005',
    },
    {
      title: '2025 Hyundai Elantra Luxury IVT',
      make: 'Hyundai',
      model: 'Elantra',
      year: 2025,
      condition: 'new',
      bodyStyle: 'Sedan',
      price: 27995,
      mileage: 5,
      vin: 'KMHD84LF7SU990006',
      stockNumber: 'NEW-ELAN-006',
    },
  ];

  const normalized = testVehicles.map(v => normalizeVehicleRecord(v, widgetId));
  await saveVehiclesBatch(normalized);
  console.log(`[Seed] Ingested ${normalized.length} representative test vehicles.\n`);

  interface TestCase {
    name: string;
    query: string;
    expectedBehavior: string;
    validator: (structuredQuery: any, results: any[], toolOutput: any) => { pass: boolean; reason: string };
  }

  const testCases: TestCase[] = [
    // ── Test 1: Explicit make+model with NO exact match (Jeep Wrangler) ─────
    {
      name: '1. Exact Make+Model Not in Inventory ("Do you have a 2024 Jeep Wrangler?")',
      query: 'Do you have a 2024 Jeep Wrangler?',
      expectedBehavior: 'Must return 0 rows, must NOT backfill with Grand Cherokee, agent states no match',
      validator: (sq, res, toolOut) => {
        const hasGrandCherokee = res.some((r: any) => r.title?.includes('Grand Cherokee'));
        const hasWrangler = res.some((r: any) => r.title?.includes('Wrangler'));
        if (hasGrandCherokee) {
          return { pass: false, reason: 'LEAKAGE DETECTED: Returned Grand Cherokee for Wrangler request!' };
        }
        if (res.length === 0 && !toolOut.grounded) {
          return { pass: true, reason: 'Correctly returned 0 rows and ungrounded refusal (no false positive)' };
        }
        return { pass: false, reason: `Unexpected results: ${res.length} rows` };
      },
    },

    // ── Test 2: Condition + BodyStyle ("Show me used trucks.") ──────────────
    {
      name: '2. Condition + BodyStyle ("Show me used trucks.")',
      query: 'Show me used trucks.',
      expectedBehavior: 'Only condition=used AND body_style=Truck rows. Mustang Mach-E must not appear.',
      validator: (sq, res, toolOut) => {
        const nonTruckOrNonUsed = res.filter((r: any) => r.condition !== 'used' || r.bodyStyle !== 'Truck');
        if (nonTruckOrNonUsed.length > 0) {
          return {
            pass: false,
            reason: `Invalid items returned: ${nonTruckOrNonUsed.map((r: any) => `${r.title} (Cond: ${r.condition}, Body: ${r.bodyStyle})`).join(', ')}`,
          };
        }
        if (res.length > 0 && res.every((r: any) => r.condition === 'used' && r.bodyStyle === 'Truck')) {
          return { pass: true, reason: `Returned ${res.length} used truck(s): ${res.map((r: any) => r.title).join(', ')}` };
        }
        return { pass: false, reason: 'No matching used trucks found' };
      },
    },

    // ── Test 3: Make + BodyStyle ("Show me Ford SUVs.") ──────────────────────
    {
      name: '3. Make + BodyStyle ("Show me Ford SUVs.")',
      query: 'Show me Ford SUVs.',
      expectedBehavior: 'make=Ford AND body_style=SUV only (e.g. Mustang Mach-E)',
      validator: (sq, res, toolOut) => {
        const nonFordSuv = res.filter((r: any) => r.make !== 'Ford' || r.bodyStyle !== 'SUV');
        if (nonFordSuv.length > 0) {
          return {
            pass: false,
            reason: `Non-Ford-SUV returned: ${nonFordSuv.map((r: any) => `${r.title} (${r.make} ${r.bodyStyle})`).join(', ')}`,
          };
        }
        if (res.length > 0 && res.every((r: any) => r.make === 'Ford' && r.bodyStyle === 'SUV')) {
          return { pass: true, reason: `Returned ${res.length} Ford SUV(s): ${res.map((r: any) => r.title).join(', ')}` };
        }
        return { pass: false, reason: 'Expected Ford SUV results' };
      },
    },

    // ── Test 4: Year + Make + Model Exact ("Show me a 2024 Ford F-150.") ───
    {
      name: '4. Year + Make + Model Exact ("Show me a 2024 Ford F-150.")',
      query: 'Show me a 2024 Ford F-150.',
      expectedBehavior: 'year=2024, make=Ford, model=F-150 exact row',
      validator: (sq, res, toolOut) => {
        const nonMatch = res.filter((r: any) => r.year !== 2024 || r.make !== 'Ford' || r.model !== 'F-150');
        if (nonMatch.length > 0) {
          return { pass: false, reason: `Non-matching vehicle returned: ${nonMatch.map((r: any) => r.title).join(', ')}` };
        }
        if (res.length === 1 && res[0].model === 'F-150' && res[0].year === 2024) {
          return { pass: true, reason: `Exact match returned: ${res[0].title}` };
        }
        return { pass: false, reason: `Expected exactly 1 2024 F-150, got ${res.length}` };
      },
    },

    // ── Test 5: Condition + Make + BodyStyle + MaxPrice ─────────────────────
    {
      name: '5. Multi-Attribute Compound ("I\'m looking for a used Jeep SUV under $40k.")',
      query: "I'm looking for a used Jeep SUV under $40k.",
      expectedBehavior: 'condition=used, make=Jeep, bodyStyle=SUV, price <= 40000 (2021 Cherokee, NOT 2024 Grand Cherokee $52k)',
      validator: (sq, res, toolOut) => {
        const violates = res.filter((r: any) => r.condition !== 'used' || r.make !== 'Jeep' || r.bodyStyle !== 'SUV' || Number(r.price) > 40000);
        if (violates.length > 0) {
          return {
            pass: false,
            reason: `Violating vehicles returned: ${violates.map((r: any) => `${r.title} ($${r.price}, ${r.condition}, ${r.bodyStyle})`).join(', ')}`,
          };
        }
        if (res.length > 0 && res.every((r: any) => r.condition === 'used' && r.make === 'Jeep' && r.bodyStyle === 'SUV' && Number(r.price) <= 40000)) {
          return { pass: true, reason: `Returned ${res.length} matching vehicle(s): ${res.map((r: any) => `${r.title} ($${r.price})`).join(', ')}` };
        }
        return { pass: false, reason: 'Expected used Jeep SUV under $40k' };
      },
    },

    // ── Test 6: Query with No Vehicle Constraints ("what do you have?") ──────
    {
      name: '6. Broad Browsing / No Constraints ("what do you have?")',
      query: 'what do you have?',
      expectedBehavior: 'Falls through to broad catalog retrieval, not an empty hard-filtered set',
      validator: (sq, res, toolOut) => {
        if (res.length > 0) {
          return { pass: true, reason: `Broad browsing returned ${res.length} catalog record(s)` };
        }
        return { pass: false, reason: 'Expected broader browsing results' };
      },
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    console.log('----------------------------------------------------------------');
    console.log(`TEST: ${tc.name}`);
    console.log(`Query: "${tc.query}"`);

    const structuredQuery = understandQuery(tc.query);
    console.log(`Structured Query Extracted:`, JSON.stringify({
      entityType: structuredQuery.entityType,
      make: structuredQuery.make,
      model: structuredQuery.model,
      bodyStyle: structuredQuery.bodyStyle,
      year: structuredQuery.year,
      condition: structuredQuery.condition,
      minPrice: structuredQuery.minPrice,
      maxPrice: structuredQuery.maxPrice,
      maxMileage: structuredQuery.maxMileage,
    }, null, 2));

    const sqlFilters = {
      condition: structuredQuery.condition,
      make: structuredQuery.make,
      model: structuredQuery.model,
      bodyStyle: structuredQuery.bodyStyle,
      minYear: structuredQuery.minYear ?? structuredQuery.year,
      maxYear: structuredQuery.maxYear ?? structuredQuery.year,
      minPrice: structuredQuery.minPrice,
      maxPrice: structuredQuery.maxPrice,
      maxMileage: structuredQuery.maxMileage,
    };
    console.log(`SQL Filters Built:`, JSON.stringify(sqlFilters, null, 2));

    const toolResult = await executeUnifiedTool(widgetId, 'search_knowledge', { query: tc.query });
    console.log(`Tool Result: count=${toolResult.count}, grounded=${toolResult.grounded}`);
    console.log(`Actual Rows Returned:`, toolResult.results.map((r: any) => ({
      title: r.title,
      make: r.make,
      model: r.model,
      bodyStyle: r.bodyStyle,
      condition: r.condition,
      price: r.price,
      year: r.year,
    })));

    const result = tc.validator(structuredQuery, toolResult.results, toolResult);
    if (result.pass) {
      console.log(`STATUS: ✅ PASS — ${result.reason}\n`);
      passed++;
    } else {
      console.log(`STATUS: ❌ FAIL — ${result.reason}\n`);
      failed++;
    }
  }

  await pool.end();

  console.log('================================================================');
  console.log(`PROMPT 3B-FIX SUMMARY: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPrompt3BFixTests().catch((err) => {
  console.error('Fatal error running Prompt 3B-FIX tests:', err);
  process.exit(1);
});
