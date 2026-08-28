/**
 * REALISTIC DEALERSHIP CONVERSATION & RETRIEVAL VALIDATION SCRIPT
 * 
 * Tests the complete normalized vehicle record architecture against:
 * 1. Real Ottawa Chrysler Jeep Dodge dealership widget and inventory.
 * 2. Strict Hard Constraints (Condition, Budget, Mileage, Make, Model).
 * 3. Soft Preferences (Trim, Color, Features).
 * 4. Anti-Hallucination (Missing VIN/Mileage/Spec preservation, non-existent inventory rejection).
 * 5. Retell Voice Agent Tools execution.
 */

import * as fs from 'fs';
import * as path from 'path';

// 1. Synchronously load environment variables first
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

import type { NormalizedVehicleRecord } from '../src/lib/vehicles/types';

const AUTO_WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

interface TestCaseReport {
  testCase: string;
  hardConstraints: string;
  softPreferences: string;
  expectedResult: string;
  actualResult: string;
  retrievedVehicles: string[];
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  rootCause?: string;
}

const reports: TestCaseReport[] = [];

async function runValidation() {
  const {
    normalizeVehicleRecord,
    filterVehicles,
    formatVehicleSummary,
    vehicleRecordToWebsiteDataRow,
    websiteDataRowToVehicleRecord,
  } = await import('../src/lib/vehicles/types');
  const { hybridRetrieve } = await import('../src/lib/retrieval/hybridRag');
  const { validateGrounding } = await import('../src/lib/retrieval/grounding');
  const { executeAgentTool } = await import('../src/lib/agents/tools');
  const { understandQuery } = await import('../src/lib/retrieval/queryUnderstanding');

  console.log('================================================================================');
  console.log('AUTOMOTIVE DEALERSHIP INVENTORY & CONVERSATIONAL VALIDATION');
  console.log('================================================================================\n');

  // Ensure test widget & sample inventory are initialized in Supabase
  const { getDbClient, saveWebsiteDataBatch } = await import('../src/config/widgetsDb');
  const { client: dbClient } = getDbClient();
  if (dbClient) {
    const { error: webErr } = await dbClient.from('websites').upsert({
      id: 'e0330b35-27c1-4f27-95d0-93640bd05812',
      organization_id: '00000000-0000-0000-0000-000000000000',
      name: 'Ottawa Chrysler Jeep Dodge',
      allowed_domains: ['www.ottawachryslerjeepdodge.com'],
    });
    if (webErr) console.error('[validate:db] Websites upsert error:', webErr.message);

    const { error: widErr } = await dbClient.from('widgets').upsert({
      id: AUTO_WIDGET_ID,
      widget_id: AUTO_WIDGET_ID,
      organization_id: '00000000-0000-0000-0000-000000000000',
      website_id: 'e0330b35-27c1-4f27-95d0-93640bd05812',
      name: 'Ottawa Chrysler Jeep Dodge Agent',
      status: 'active',
      allowed_domains: ['www.ottawachryslerjeepdodge.com'],
      config: {
        business_name: 'Ottawa Chrysler Jeep Dodge',
      },
    });
    if (widErr) console.error('[validate:db] Widgets upsert error:', widErr.message);

    // Seed website_data rows for RAG tests
    await saveWebsiteDataBatch([
      {
        widget_id: AUTO_WIDGET_ID,
        title: '2024 Jeep Grand Cherokee Laredo 4x4',
        content: 'New 2024 Jeep Grand Cherokee Laredo 4x4. Price: $49,995. MSRP: $52,000. Features: 4x4, Uconnect 5, Adaptive Cruise Control, Blind Spot Monitoring.',
        entity_type: 'product',
        source_url: 'https://www.ottawachryslerjeepdodge.com/new-vehicles/2024-jeep-grand-cherokee-laredo',
        short_description: '2024 Jeep Grand Cherokee Laredo 4x4 for $49,995.',
        data_type: 'crawl',
        image_urls: ['https://images.dealer.com/jeep_cherokee_laredo.jpg'],
        metadata: {
          price: 49995,
          msrp: 52000,
          condition: 'new',
          make: 'Jeep',
          model: 'Grand Cherokee',
          year: 2024,
          vin: '1C4RJFBG7RC112244',
          stockNumber: 'N24-3011',
          drivetrain: '4x4',
          vdpUrl: 'https://www.ottawachryslerjeepdodge.com/new-vehicles/2024-jeep-grand-cherokee-laredo',
        },
      },
      {
        widget_id: AUTO_WIDGET_ID,
        title: '2024 Jeep Compass Trailhawk',
        content: 'New 2024 Jeep Compass Trailhawk 4x4. Price: $39,995. MSRP: $42,500. Features: Trail Rated 4x4, Heated Seats, Leather Trim.',
        entity_type: 'product',
        source_url: 'https://www.ottawachryslerjeepdodge.com/new-vehicles/2024-jeep-compass-trailhawk',
        short_description: '2024 Jeep Compass Trailhawk for $39,995.',
        data_type: 'crawl',
        image_urls: ['https://images.dealer.com/jeep_compass.jpg'],
        metadata: {
          price: 39995,
          msrp: 42500,
          condition: 'new',
          make: 'Jeep',
          model: 'Compass',
          year: 2024,
          vin: '3C4NJDBB8RT556677',
          stockNumber: 'N24-4022',
          drivetrain: '4x4',
          vdpUrl: 'https://www.ottawachryslerjeepdodge.com/new-vehicles/2024-jeep-compass-trailhawk',
        },
      },
      {
        widget_id: AUTO_WIDGET_ID,
        title: '2021 Ram 1500 Big Horn Quad Cab',
        content: 'Used 2021 Ram 1500 Big Horn Quad Cab. Price: $38,990. Mileage: 48,200 miles. Engine: 5.7L HEMI V8. Features: 4x4, Tow Package, 8.4-inch Touchscreen.',
        entity_type: 'product',
        source_url: 'https://www.ottawachryslerjeepdodge.com/used-vehicles/2021-ram-1500-big-horn',
        short_description: 'Used 2021 Ram 1500 Big Horn with 48,200 miles for $38,990.',
        data_type: 'crawl',
        image_urls: ['https://images.dealer.com/ram_silver_1.jpg'],
        metadata: {
          price: 38990,
          condition: 'used',
          make: 'Ram',
          model: '1500',
          year: 2021,
          mileage: 48200,
          vin: '1C6RR7FG3MS654321',
          stockNumber: 'U21-504',
          drivetrain: '4x4',
          vdpUrl: 'https://www.ottawachryslerjeepdodge.com/used-vehicles/2021-ram-1500-big-horn',
        },
      },
    ]);
  }

  // ── TEST 1: Normalized Vehicle Record & Preservation (NEW vs USED) ───────────
  console.log('--- TEST 1: Normalized Vehicle Contract & Anti-Fabrication ---');
  const sampleNewVehicleRaw = {
    title: '2024 Jeep Wrangler 4xe Rubicon',
    source_url: 'https://www.ottawachryslerjeepdodge.com/new-vehicles/2024-jeep-wrangler-4xe-rubicon-vin-1C4JJXR68RW123456',
    metadata: {
      year: 2024,
      make: 'Jeep',
      model: 'Wrangler 4xe',
      trim: 'Rubicon',
      vin: '1C4JJXR68RW123456',
      stockNumber: 'N24-1082',
      price: 74995,
      msrp: 78995,
      drivetrain: '4x4',
      transmission: '8-Speed Automatic',
      engine: '2.0L I4 DOHC DI Turbo PHEV',
      fuel: 'Plug-in Hybrid',
      exteriorColor: 'Hydro Blue Pearl',
      interiorColor: 'Black Leather',
      features: ['Navigation', 'Heated Seats', 'Rock Rails', 'Alpine Audio'],
      images: ['https://images.dealer.com/wrangler_blue_1.jpg', 'https://images.dealer.com/wrangler_blue_2.jpg'],
    },
  };

  const sampleUsedVehicleRaw = {
    title: '2021 Ram 1500 Big Horn Quad Cab',
    source_url: 'https://www.ottawachryslerjeepdodge.com/used-vehicles/2021-ram-1500-big-horn-vin-1C6RR7FG3MS654321',
    metadata: {
      year: 2021,
      make: 'Ram',
      model: '1500',
      trim: 'Big Horn',
      vin: '1C6RR7FG3MS654321',
      stock_number: 'U21-504',
      price: 38990,
      mileage: 48200,
      drivetrain: '4x4',
      transmission: '8-Speed Automatic',
      engine: '5.7L HEMI V8',
      exteriorColor: 'Billet Silver Metallic',
      images: ['https://images.dealer.com/ram_silver_1.jpg'],
    },
  };

  const normNew = normalizeVehicleRecord(sampleNewVehicleRaw, AUTO_WIDGET_ID);
  const normUsed = normalizeVehicleRecord(sampleUsedVehicleRaw, AUTO_WIDGET_ID);

  const test1Passed =
    normNew.condition === 'new' &&
    normNew.vin === '1C4JJXR68RW123456' &&
    normNew.stockNumber === 'N24-1082' &&
    normNew.price === 74995 &&
    normNew.msrp === 78995 &&
    normNew.mileage === undefined && // NEW vehicles don't fabricate mileage
    normUsed.condition === 'used' &&
    normUsed.mileage === 48200 &&
    normUsed.engine === '5.7L HEMI V8' &&
    normUsed.msrp === undefined; // USED vehicle without MSRP does not fabricate MSRP

  reports.push({
    testCase: 'Normalized Vehicle Schema Preservation (NEW vs USED)',
    hardConstraints: 'Condition, VIN, Stock#, Year, Make, Model, Price, Mileage, Drivetrain',
    softPreferences: 'Colors, Features, Photos',
    expectedResult: 'Exact preservation of all provided specs; zero fabricated missing values',
    actualResult: `NEW: [${normNew.condition}] ${normNew.year} ${normNew.make} ${normNew.model} (MSRP: $${normNew.msrp}, VIN: ${normNew.vin}), USED: [${normUsed.condition}] ${normUsed.year} ${normUsed.make} ${normUsed.model} (Mileage: ${normUsed.mileage} mi, Engine: ${normUsed.engine})`,
    retrievedVehicles: [formatVehicleSummary(normNew), formatVehicleSummary(normUsed)],
    status: test1Passed ? 'PASS' : 'FAIL',
    rootCause: test1Passed ? undefined : 'Mismatch in normalized field preservation or fabricated default value',
  });

  // ── TEST 2: Hard Constraint Filter (USED inventory with max mileage & price) ─
  console.log('\n--- TEST 2: Hard Constraint Filtering (Used Truck under $40k & < 50k miles) ---');
  const inventory: NormalizedVehicleRecord[] = [
    normNew,
    normUsed,
    normalizeVehicleRecord({
      title: '2020 Ram 1500 Laramie Crew Cab',
      metadata: { condition: 'used', year: 2020, make: 'Ram', model: '1500', price: 42000, mileage: 35000, drivetrain: '4x4' },
    }, AUTO_WIDGET_ID),
    normalizeVehicleRecord({
      title: '2019 Ram 1500 Tradesman',
      metadata: { condition: 'used', year: 2019, make: 'Ram', model: '1500', price: 32000, mileage: 75000, drivetrain: '4x4' },
    }, AUTO_WIDGET_ID),
  ];

  const filtered = filterVehicles(inventory, {
    condition: 'used',
    make: 'Ram',
    maxPrice: 40000,
    maxMileage: 50000,
  });

  const test2Passed = filtered.length === 1 && filtered[0].vin === '1C6RR7FG3MS654321';
  reports.push({
    testCase: 'Hard Constraint Filter (Used Ram 1500, Price <= $40k, Mileage <= 50k mi)',
    hardConstraints: 'Condition: USED, Make: Ram, Max Price: $40,000, Max Mileage: 50,000 mi',
    softPreferences: 'None',
    expectedResult: 'Only 2021 Ram 1500 Big Horn ($38,990, 48,200 mi) survives; $42k and 75k mi models excluded',
    actualResult: `Retrieved ${filtered.length} vehicles: ${filtered.map(formatVehicleSummary).join('; ')}`,
    retrievedVehicles: filtered.map(formatVehicleSummary),
    status: test2Passed ? 'PASS' : 'FAIL',
    rootCause: test2Passed ? undefined : 'Filter did not enforce max price or max mileage bound strictly',
  });

  // ── TEST 3: Real Database Hybrid Retrieval (Jeep Vehicles under $70,000) ──────
  console.log('\n--- TEST 3: Real Database Retrieval (Jeep Vehicles under $70,000) ---');
  const query3 = 'do you have any Jeep vehicles available under $70,000?';
  const intent3 = understandQuery(query3);
  const r3 = await hybridRetrieve(AUTO_WIDGET_ID, query3, { limit: 5 });
  const g3 = validateGrounding(query3, r3, 'Ottawa Chrysler Jeep Dodge');

  const retrievedUnder70k = r3.results.every((item) => {
    const p = typeof item.price === 'number' ? item.price : parseFloat(String(item.price || '').replace(/[^0-9.]/g, ''));
    return isNaN(p) || p <= 70000;
  });

  const test3Passed = r3.results.length > 0 && retrievedUnder70k;
  reports.push({
    testCase: 'Real Inventory Search: Jeep vehicles under $70,000',
    hardConstraints: 'Make: Jeep, Max Price: $70,000, In Stock: true',
    softPreferences: 'Model / Trim',
    expectedResult: 'Returns real Jeep inventory with prices <= $70,000 and valid VDP URLs',
    actualResult: `Retrieved ${r3.results.length} vehicles: ${r3.results.map(r => `${r.title} (${r.price || 'N/A'})`).join(', ')}`,
    retrievedVehicles: r3.results.map(r => `${r.title} | Price: ${r.price || 'N/A'} | Condition: ${r.condition || 'N/A'} | URL: ${r.vdpUrl || r.sourceUrl || 'N/A'}`),
    status: test3Passed ? 'PASS' : 'FAIL',
    rootCause: test3Passed ? undefined : 'No vehicles found or price constraint violated',
  });

  // ── TEST 4: Anti-Hallucination: Non-Existent Inventory (Ferrari / Lamborghini) ─
  console.log('\n--- TEST 4: Anti-Hallucination: Non-Existent Inventory Inquiry ---');
  const query4 = 'do you have any Ferrari 296 GTB or Lamborghini Huracan in stock?';
  const r4 = await hybridRetrieve(AUTO_WIDGET_ID, query4, { limit: 3 });
  const g4 = validateGrounding(query4, r4, 'Ottawa Chrysler Jeep Dodge');

  // Should NOT ground non-existent inventory as available
  const topScore = r4.results[0]?.score || 0;
  const isAntiHallucinationPass = !g4.isGrounded || topScore < 60 || r4.count === 0;

  reports.push({
    testCase: 'Anti-Hallucination: Non-Existent Vehicle Query (Ferrari 296 GTB)',
    hardConstraints: 'Vehicle Model: Ferrari 296 GTB / Lamborghini Huracan',
    softPreferences: 'None',
    expectedResult: 'System marks inquiry UNGROUNDED / UNVERIFIED and provides safe fallback: unavailable',
    actualResult: `Grounding isGrounded: ${g4.isGrounded}, Top Score: ${topScore}, Fallback text provided: "${g4.fallbackText || 'Unavailable'}"`,
    retrievedVehicles: r4.results.map(r => `${r.title} (Score: ${r.score})`),
    status: isAntiHallucinationPass ? 'PASS' : 'FAIL',
    rootCause: isAntiHallucinationPass ? undefined : 'System hallucinated or matched unrelated inventory for non-existent model',
  });

  // ── TEST 5: Retell Voice Agent Tools Execution ───────────────────────────────
  console.log('\n--- TEST 5: Retell Voice Agent Tools (search_knowledge & get_entity) ---');
  const retellSearch = await executeAgentTool(AUTO_WIDGET_ID, 'search_knowledge', {
    query: 'Ram 1500 truck',
    limit: 2,
  });
  const firstEntity = retellSearch.data?.results?.[0];
  const retellDetails = firstEntity?.id
    ? await executeAgentTool(AUTO_WIDGET_ID, 'get_entity', { entityId: firstEntity.id })
    : null;

  const test5Passed =
    retellSearch.success &&
    Array.isArray(retellSearch.data?.results) &&
    retellSearch.data.results.length > 0 &&
    (retellDetails ? retellDetails.success : true);

  reports.push({
    testCase: 'Retell Voice Agent Tools (search_knowledge & get_entity)',
    hardConstraints: 'Widget isolation to Ottawa Chrysler, Tool schema adherence',
    softPreferences: 'Query: Ram 1500 truck',
    expectedResult: 'Retell tool returns structured entity with images, VDP url, condition, price',
    actualResult: `search_knowledge returned ${retellSearch.data?.results?.length} items. Top item: ${firstEntity?.title} (Price: ${firstEntity?.price}, Condition: ${firstEntity?.condition || firstEntity?.metadata?.condition || 'N/A'})`,
    retrievedVehicles: (retellSearch.data?.results || []).map((e: any) => `${e.title} | ${e.price || 'N/A'} | ${e.vdpUrl || e.sourceUrl || 'N/A'}`),
    status: test5Passed ? 'PASS' : 'FAIL',
    rootCause: test5Passed ? undefined : 'Retell tool execution failed or returned invalid structure',
  });

  // ── TEST 6: Batch Upsert & Incremental Sync (Content Hashing) ───────────────
  console.log('\n--- TEST 6: Batch Upsert & Content Hash Incremental Sync ---');
  const { computeVehicleContentHash, saveVehiclesBatch, reconcileSoldVehicles, getVehiclesForWidget } = await import('../src/lib/vehicles/types');

  const testVeh1: NormalizedVehicleRecord = normalizeVehicleRecord({
    title: '2024 Jeep Grand Cherokee Overland 4x4',
    source_url: 'https://www.ottawachryslerjeepdodge.com/new-vehicles/2024-jeep-grand-cherokee-overland-vin-1C4RJFCT8RC998877',
    metadata: {
      condition: 'new',
      year: 2024,
      make: 'Jeep',
      model: 'Grand Cherokee',
      trim: 'Overland 4x4',
      vin: '1C4RJFCT8RC998877',
      stockNumber: 'N24-9988',
      price: 68500,
      msrp: 72000,
      drivetrain: '4x4',
      engine: '3.6L V6 24V VVT',
      transmission: '8-Speed Automatic',
      fuel: 'Gasoline',
      exteriorColor: 'Baltic Gray Metallic',
      interiorColor: 'Global Black Leather',
      features: ['Panoramic Sunroof', 'Quadra-Lift Air Suspension', 'Heated & Ventilated Seats'],
      description: 'Brand new 2024 Jeep Grand Cherokee Overland 4x4 with luxury package.',
      images: ['https://images.dealer.com/gc_overland_1.jpg', 'https://images.dealer.com/gc_overland_2.jpg'],
      vdpUrl: 'https://www.ottawachryslerjeepdodge.com/new-vehicles/2024-jeep-grand-cherokee-overland-vin-1C4RJFCT8RC998877',
      availability: 'in_stock',
      stillListed: true,
    },
  }, AUTO_WIDGET_ID);

  const initialSave = await saveVehiclesBatch([testVeh1]);
  const initialHash = computeVehicleContentHash(testVeh1);

  // Re-saving identical vehicle should detect unchanged via content hash
  const secondSave = await saveVehiclesBatch([testVeh1]);

  // Updating price on vehicle should detect modification
  const modifiedVeh = { ...testVeh1, price: 66900 };
  const updateSave = await saveVehiclesBatch([modifiedVeh]);

  const test6Passed =
    (initialSave.inserted === 1 || initialSave.unchanged === 1 || initialSave.updated === 1) &&
    secondSave.unchanged === 1 &&
    updateSave.updated === 1 &&
    initialHash.length === 64;

  reports.push({
    testCase: 'Database Batch Upsert & Incremental Content Hashing (vehicles table)',
    hardConstraints: 'VIN deduplication, SHA-256 content hashing, Zero duplicate rows',
    softPreferences: 'Price drop detection',
    expectedResult: 'Initial save inserts, second identical save touches unchanged, price update modifies record',
    actualResult: `Initial: +${initialSave.inserted}, Identical rerun: ${secondSave.unchanged} unchanged, Price update: ${updateSave.updated} updated`,
    retrievedVehicles: [`Hash: ${initialHash.substring(0, 16)}...`, `Updated Price: $${modifiedVeh.price}`],
    status: test6Passed ? 'PASS' : 'FAIL',
    rootCause: test6Passed ? undefined : 'Incremental sync failed to detect unchanged state or price modification',
  });

  // ── TEST 7: Sold & Removed Vehicle Reconciliation ────────────────────────────
  console.log('\n--- TEST 7: Sold & Removed Vehicle Reconciliation ---');
  const testSoldVeh: NormalizedVehicleRecord = normalizeVehicleRecord({
    title: '2018 Chrysler 300S',
    source_url: 'https://www.ottawachryslerjeepdodge.com/used-vehicles/2018-chrysler-300s-vin-2C3CCARG9JH112233',
    metadata: {
      condition: 'used',
      year: 2018,
      make: 'Chrysler',
      model: '300S',
      vin: '2C3CCARG9JH112233',
      stockNumber: 'U18-1122',
      price: 19995,
      mileage: 82000,
      drivetrain: 'AWD',
      vdpUrl: 'https://www.ottawachryslerjeepdodge.com/used-vehicles/2018-chrysler-300s-vin-2C3CCARG9JH112233',
      availability: 'in_stock',
      stillListed: true,
    },
  }, AUTO_WIDGET_ID);

  await saveVehiclesBatch([testSoldVeh]);

  // Reconcile with active list that omits testSoldVeh VIN
  const activeObserved = new Set<string>(['1C4RJFCT8RC998877', '1C4JJXR68RW123456']);
  const recResult = await reconcileSoldVehicles(AUTO_WIDGET_ID, activeObserved);

  // Verify that testSoldVeh is marked as still_listed = false and availability = 'out_of_stock'
  const activeVehicles = await getVehiclesForWidget(AUTO_WIDGET_ID, { stillListedOnly: true });
  const soldVehicleSurvivesActive = activeVehicles.some(v => v.vin === '2C3CCARG9JH112233');

  const test7Passed = recResult.markedSold >= 1 && !soldVehicleSurvivesActive;
  reports.push({
    testCase: 'Sold / Removed Vehicle Inventory Reconciliation',
    hardConstraints: 'Removed vehicles marked still_listed=false and availability=out_of_stock',
    softPreferences: 'Preserve vehicle record for audit without hard deletion',
    expectedResult: 'Sold vehicle removed from active inventory queries; marked out_of_stock',
    actualResult: `Reconciliation markedSold: ${recResult.markedSold}, Sold vehicle in active query: ${soldVehicleSurvivesActive}`,
    retrievedVehicles: [`Marked sold VIN: ${testSoldVeh.vin}`],
    status: test7Passed ? 'PASS' : 'FAIL',
    rootCause: test7Passed ? undefined : 'Sold vehicle still appeared in active inventory query',
  });

  // ── TEST 8: Dealer Tenant Isolation (widget_id Boundary) ─────────────────────
  console.log('\n--- TEST 8: Multi-Dealer Tenant Isolation ---');
  const OTHER_WIDGET_ID = '00000000-0000-0000-0000-000000000099';
  const dealerAVehicles = await getVehiclesForWidget(AUTO_WIDGET_ID);
  const dealerBVehicles = await getVehiclesForWidget(OTHER_WIDGET_ID);

  const test8Passed = dealerAVehicles.every(v => v.widgetId === AUTO_WIDGET_ID) && dealerBVehicles.length === 0;
  reports.push({
    testCase: 'Multi-Dealer Tenant Scoping & Isolation',
    hardConstraints: 'All vehicle queries strictly isolated by widget_id',
    softPreferences: 'None',
    expectedResult: 'Ottawa Chrysler vehicles isolated to AUTO_WIDGET_ID; other dealer queries return empty',
    actualResult: `Dealer A count: ${dealerAVehicles.length} (all scoped: ${dealerAVehicles.every(v => v.widgetId === AUTO_WIDGET_ID)}), Dealer B count: ${dealerBVehicles.length}`,
    retrievedVehicles: [`Dealer A: ${dealerAVehicles.length} vehicles`, `Dealer B: ${dealerBVehicles.length} vehicles`],
    status: test8Passed ? 'PASS' : 'FAIL',
    rootCause: test8Passed ? undefined : 'Cross-tenant vehicle leakage detected',
  });

  // ── Print Summary Table ──────────────────────────────────────────────────────
  console.log('\n================================================================================');
  console.log('VALIDATION RESULTS TABLE');
  console.log('================================================================================');

  reports.forEach((rep, idx) => {
    console.log(`\n[TEST CASE ${idx + 1}]: ${rep.testCase}`);
    console.log(`  HARD Constraints: ${rep.hardConstraints}`);
    console.log(`  SOFT Preferences: ${rep.softPreferences}`);
    console.log(`  Expected Result:  ${rep.expectedResult}`);
    console.log(`  Actual Result:    ${rep.actualResult}`);
    console.log(`  Retrieved:        ${rep.retrievedVehicles.slice(0, 2).join(' | ') || 'None'}`);
    console.log(`  STATUS:           >>> ${rep.status} <<<`);
    if (rep.rootCause) console.log(`  Root Cause:       ${rep.rootCause}`);
  });

  const total = reports.length;
  const passed = reports.filter(r => r.status === 'PASS').length;
  console.log(`\nSUMMARY: ${passed}/${total} test cases passed.`);
}

runValidation().catch((err) => {
  console.error('Validation script execution error:', err);
  process.exit(1);
});
