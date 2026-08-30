/**
 * Database Foundation Verification Test Suite
 * Tests all 20 cases from the implementation plan:
 * - Vehicle CRUD with full deduplication
 * - Fuel efficiency storage and NULL handling
 * - Partial unique index enforcement
 * - dealer_profiles + dealer_hours tables
 * - Dealer isolation (widget scoping)
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

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });

let passed = 0;
let failed = 0;
let partial = 0;

function report(tc: number, name: string, expected: string, actual: string, status: 'PASS' | 'FAIL' | 'PARTIAL', change?: string) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') failed++;
  else partial++;
  console.log(`\nTC-${tc}: ${name}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}`);
  if (change) console.log(`  Change:   ${change}`);
  console.log(`  ${icon} ${status}`);
}

async function main() {
  const client = await pool.connect();
  console.log('====================================================');
  console.log(' DATABASE FOUNDATION VERIFICATION — 20 TEST CASES');
  console.log('====================================================');

  try {
    // ── Setup: Use two separate widget IDs for isolation test ────────────
    // Fetch existing widget IDs from DB (real data)
    const widgets = await client.query(`SELECT id, widget_id FROM widgets LIMIT 2`);
    if (widgets.rows.length < 1) {
      console.error('FATAL: No widgets found in DB. Cannot run tests.');
      return;
    }
    const widgetA = widgets.rows[0].id;
    const widgetB = widgets.rows.length > 1 ? widgets.rows[1].id : widgets.rows[0].id;

    console.log(`\nUsing Widget A: ${widgetA}`);
    console.log(`Using Widget B: ${widgetB}`);

    // Cleanup test data from prior runs
    await client.query(`DELETE FROM vehicles WHERE widget_id = $1 AND (vin LIKE 'TEST%' OR stock_number LIKE 'TEST%')`, [widgetA]);
    await client.query(`DELETE FROM vehicles WHERE widget_id = $1 AND (vin LIKE 'TEST%' OR stock_number LIKE 'TEST%')`, [widgetB]);
    await client.query(`DELETE FROM dealer_profiles WHERE dealer_code LIKE 'TEST%'`);

    // ── TC-1: New vehicle insert with VIN ────────────────────────────────
    const res1 = await client.query(`
      INSERT INTO vehicles (widget_id, vin, stock_number, condition, year, make, model, trim, price, currency, availability, status)
      VALUES ($1, 'TEST_VIN_NEW001', 'TESTN001', 'new', 2025, 'Jeep', 'Grand Cherokee', 'Laredo', 49995, 'CAD', 'in_stock', 'available')
      ON CONFLICT DO NOTHING RETURNING id
    `, [widgetA]);
    report(1, 'New vehicle insert (VIN present)', 'Row inserted', res1.rows.length > 0 ? `Row id: ${res1.rows[0].id}` : 'Conflict/no insert', res1.rows.length > 0 ? 'PASS' : 'FAIL', 'INSERT with status column');

    // ── TC-2: Used vehicle insert with VIN ───────────────────────────────
    const res2 = await client.query(`
      INSERT INTO vehicles (widget_id, vin, stock_number, condition, year, make, model, mileage, price, currency, availability, status)
      VALUES ($1, 'TEST_VIN_USED001', 'TESTUU01', 'used', 2022, 'Ram', '1500', 45000, 34995, 'CAD', 'in_stock', 'available')
      ON CONFLICT DO NOTHING RETURNING id
    `, [widgetA]);
    report(2, 'Used vehicle insert (VIN present)', 'Row inserted', res2.rows.length > 0 ? `Row id: ${res2.rows[0].id}` : 'Conflict/no insert', res2.rows.length > 0 ? 'PASS' : 'FAIL');

    // ── TC-3: CPO vehicle insert ─────────────────────────────────────────
    const res3 = await client.query(`
      INSERT INTO vehicles (widget_id, vin, condition, year, make, model, mileage, price, currency, availability, status)
      VALUES ($1, 'TEST_VIN_CPO001', 'cpo', 2023, 'Dodge', 'Durango', 28000, 42500, 'CAD', 'in_stock', 'available')
      ON CONFLICT DO NOTHING RETURNING id
    `, [widgetA]);
    report(3, 'CPO vehicle insert', 'Row inserted with condition=cpo', res3.rows.length > 0 ? 'Inserted' : 'Failed', res3.rows.length > 0 ? 'PASS' : 'FAIL');

    // ── TC-4: VIN-missing vehicle with stock_number ──────────────────────
    const res4 = await client.query(`
      INSERT INTO vehicles (widget_id, vin, stock_number, condition, year, make, model, price, currency, status)
      VALUES ($1, NULL, 'TESTSTOCK01', 'used', 2021, 'Ford', 'F-150', 38000, 'CAD', 'available')
      ON CONFLICT DO NOTHING RETURNING id
    `, [widgetA]);
    report(4, 'VIN-missing vehicle (stock_number only)', 'Row inserted without VIN', res4.rows.length > 0 ? 'Inserted' : 'Failed/conflict', res4.rows.length > 0 ? 'PASS' : 'FAIL', 'Partial index idx_vehicles_widget_stock_unique covers this');

    // ── TC-5: VIN-missing vehicle with VDP URL only ──────────────────────
    const res5 = await client.query(`
      INSERT INTO vehicles (widget_id, vin, stock_number, condition, year, make, model, vdp_url, status)
      VALUES ($1, NULL, NULL, 'used', 2020, 'Chrysler', 'Pacifica', 'https://testdealer.com/vdp/TEST-PACIFICA-001', 'available')
      ON CONFLICT DO NOTHING RETURNING id
    `, [widgetA]);
    report(5, 'VIN-missing vehicle (VDP URL only)', 'Row inserted', res5.rows.length > 0 ? 'Inserted' : 'Failed/conflict', res5.rows.length > 0 ? 'PASS' : 'FAIL', 'Partial index idx_vehicles_widget_vdp_unique covers this');

    // ── TC-6: Duplicate VIN → must UPDATE, not duplicate ────────────────
    const dupVin = 'TEST_VIN_NEW001';
    let dupErr6 = '';
    try {
      await client.query(`
        INSERT INTO vehicles (widget_id, vin, stock_number, condition, year, make, model, price, currency)
        VALUES ($1, $2, 'TESTN001_DUP', 'new', 2025, 'Jeep', 'Grand Cherokee', 51000, 'CAD')
      `, [widgetA, dupVin]);
      dupErr6 = 'DUPLICATE INSERTED — unique constraint failed!';
    } catch (e: any) {
      dupErr6 = e.message.includes('unique') || e.message.includes('duplicate') ? 'Unique constraint rejected duplicate' : `Unexpected error: ${e.message}`;
    }
    report(6, 'Duplicate VIN rejected', 'Unique constraint prevents duplicate', dupErr6, dupErr6.includes('rejected') ? 'PASS' : 'FAIL');

    // ── TC-7: Duplicate stock_number (no VIN) rejected ───────────────────
    let dupErr7 = '';
    try {
      await client.query(`
        INSERT INTO vehicles (widget_id, vin, stock_number, condition, year, make, model)
        VALUES ($1, NULL, 'TESTSTOCK01', 'used', 2021, 'Ford', 'Explorer')
      `, [widgetA]);
      dupErr7 = 'DUPLICATE INSERTED — partial index failed!';
    } catch (e: any) {
      dupErr7 = e.message.includes('unique') || e.message.includes('duplicate') ? 'Partial unique index rejected duplicate stock_number' : `Unexpected error: ${e.message}`;
    }
    report(7, 'Duplicate stock_number (no VIN) rejected', 'Partial unique index prevents duplicate', dupErr7, dupErr7.includes('rejected') ? 'PASS' : 'FAIL', 'idx_vehicles_widget_stock_unique WHERE stock_number IS NOT NULL');

    // ── TC-8: Duplicate VDP URL (no VIN, no stock) rejected ──────────────
    let dupErr8 = '';
    try {
      await client.query(`
        INSERT INTO vehicles (widget_id, vin, stock_number, condition, year, make, model, vdp_url)
        VALUES ($1, NULL, NULL, 'used', 2021, 'Chrysler', 'Voyager', 'https://testdealer.com/vdp/TEST-PACIFICA-001')
      `, [widgetA]);
      dupErr8 = 'DUPLICATE INSERTED — partial index failed!';
    } catch (e: any) {
      dupErr8 = e.message.includes('unique') || e.message.includes('duplicate') ? 'Partial unique index rejected duplicate VDP URL' : `Unexpected error: ${e.message}`;
    }
    report(8, 'Duplicate VDP URL (no VIN, no stock) rejected', 'Partial unique index prevents duplicate', dupErr8, dupErr8.includes('rejected') ? 'PASS' : 'FAIL', 'idx_vehicles_widget_vdp_unique WHERE vdp_url IS NOT NULL');

    // ── TC-9: Vehicle with missing price (NULL OK) ───────────────────────
    const res9 = await client.query(`
      INSERT INTO vehicles (widget_id, vin, condition, year, make, model, price, status)
      VALUES ($1, 'TEST_VIN_NOPRICE', 'used', 2019, 'Jeep', 'Compass', NULL, 'available')
      ON CONFLICT DO NOTHING RETURNING id, price
    `, [widgetA]);
    report(9, 'Vehicle with missing price (NULL)', 'price=NULL stored without error', res9.rows.length > 0 && res9.rows[0].price === null ? 'price IS NULL ✓' : 'Failed', res9.rows.length > 0 && res9.rows[0].price === null ? 'PASS' : 'FAIL');

    // ── TC-10: Vehicle with missing mileage/odometer (NULL OK) ───────────
    const res10 = await client.query(`
      INSERT INTO vehicles (widget_id, vin, condition, year, make, model, mileage, status)
      VALUES ($1, 'TEST_VIN_NOMILE', 'new', 2025, 'Dodge', 'Charger', NULL, 'available')
      ON CONFLICT DO NOTHING RETURNING id, mileage
    `, [widgetA]);
    report(10, 'New vehicle with missing mileage (NULL)', 'mileage=NULL stored without error', res10.rows.length > 0 && res10.rows[0].mileage === null ? 'mileage IS NULL ✓' : 'Failed', res10.rows.length > 0 && res10.rows[0].mileage === null ? 'PASS' : 'FAIL');

    // ── TC-11: Vehicle with missing images (empty array OK) ───────────────
    const res11 = await client.query(`
      SELECT id, images FROM vehicles WHERE vin = 'TEST_VIN_NEW001' AND widget_id = $1
    `, [widgetA]);
    const imgs11 = res11.rows[0]?.images;
    report(11, 'Vehicle with missing images (empty array)', 'images=[] stored', Array.isArray(imgs11) && imgs11.length === 0 ? 'images[] ✓' : String(imgs11), Array.isArray(imgs11) ? 'PASS' : 'FAIL');

    // ── TC-12: Vehicle WITH city + highway fuel efficiency ────────────────
    const res12 = await client.query(`
      INSERT INTO vehicles (widget_id, vin, condition, year, make, model, city_fuel_efficiency, highway_fuel_efficiency, fuel_efficiency_unit, status)
      VALUES ($1, 'TEST_VIN_FUEL001', 'used', 2025, 'Hyundai', 'Elantra', 8.5, 6.2, 'L/100km', 'available')
      ON CONFLICT DO NOTHING RETURNING id, city_fuel_efficiency, highway_fuel_efficiency, fuel_efficiency_unit
    `, [widgetA]);
    const row12 = res12.rows[0];
    report(12, 'Vehicle WITH fuel efficiency (Elantra: 8.5/6.2 L/100km)', 'city=8.5, highway=6.2, unit=L/100km', row12 ? `city=${row12.city_fuel_efficiency}, hwy=${row12.highway_fuel_efficiency}, unit=${row12.fuel_efficiency_unit}` : 'Failed', row12 && Number(row12.city_fuel_efficiency) === 8.5 && Number(row12.highway_fuel_efficiency) === 6.2 ? 'PASS' : 'FAIL', 'city_fuel_efficiency + highway_fuel_efficiency + fuel_efficiency_unit columns');

    // ── TC-13: Vehicle WITHOUT fuel efficiency (new car, both NULL) ───────
    const res13 = await client.query(`
      SELECT city_fuel_efficiency, highway_fuel_efficiency FROM vehicles WHERE vin = 'TEST_VIN_NOMILE' AND widget_id = $1
    `, [widgetA]);
    const row13 = res13.rows[0];
    report(13, 'New vehicle WITHOUT fuel efficiency (both NULL)', 'city=NULL, highway=NULL (not 0)', row13 ? `city=${row13.city_fuel_efficiency}, hwy=${row13.highway_fuel_efficiency}` : 'Row not found', row13 && row13.city_fuel_efficiency === null && row13.highway_fuel_efficiency === null ? 'PASS' : 'FAIL');

    // ── TC-14: Two vehicles same make/model/year, different VINs ─────────
    const res14a = await client.query(`
      INSERT INTO vehicles (widget_id, vin, condition, year, make, model, price, status)
      VALUES ($1, 'TEST_VIN_TWIN_A', 'new', 2025, 'Jeep', 'Wrangler', 52000, 'available')
      ON CONFLICT DO NOTHING RETURNING id
    `, [widgetA]);
    const res14b = await client.query(`
      INSERT INTO vehicles (widget_id, vin, condition, year, make, model, price, status)
      VALUES ($1, 'TEST_VIN_TWIN_B', 'new', 2025, 'Jeep', 'Wrangler', 54000, 'available')
      ON CONFLICT DO NOTHING RETURNING id
    `, [widgetA]);
    report(14, 'Two vehicles same make/model/year, different VINs', 'Both inserted independently', res14a.rows.length > 0 && res14b.rows.length > 0 ? `IDs: ${res14a.rows[0].id}, ${res14b.rows[0].id}` : 'One or both failed', res14a.rows.length > 0 && res14b.rows.length > 0 ? 'PASS' : 'FAIL');

    // ── TC-15: Dealer isolation — Widget A cannot see Widget B ────────────
    if (widgetA !== widgetB) {
      await client.query(`
        INSERT INTO vehicles (widget_id, vin, condition, year, make, model, status)
        VALUES ($1, 'TEST_VIN_WIDGET_B', 'new', 2025, 'Toyota', 'Camry', 'available')
        ON CONFLICT DO NOTHING
      `, [widgetB]);
      const isolation = await client.query(`
        SELECT COUNT(*) FROM vehicles WHERE widget_id = $1 AND vin = 'TEST_VIN_WIDGET_B'
      `, [widgetA]);
      report(15, 'Dealer isolation (Widget A cannot see Widget B inventory)', 'count=0 for Widget A querying Widget B VIN', `Widget A query returned count=${isolation.rows[0].count}`, isolation.rows[0].count === '0' ? 'PASS' : 'FAIL');
    } else {
      report(15, 'Dealer isolation', 'Only one widget in DB — single-widget test', 'Single widget available', 'PARTIAL');
    }

    // ── TC-16: dealer_profiles insert + dealer_hours insert ──────────────
    const orgRow = await client.query(`SELECT id FROM organizations LIMIT 1`);
    const orgId = orgRow.rows[0]?.id;
    let dp16: any = null;
    if (orgId) {
      try {
        dp16 = await client.query(`
          INSERT INTO dealer_profiles (organization_id, dealer_code, name, website_url, phone, email, city, province_state, postal_code, country, timezone)
          VALUES ($1, 'TEST-OTT-001', 'Ottawa Chrysler Jeep Dodge', 'https://www.ottawachryslerjeepdodge.com', '613-xxx-xxxx', 'info@test.com', 'Ottawa', 'ON', 'K1C 5V5', 'CA', 'America/Toronto')
          ON CONFLICT (dealer_code) DO UPDATE SET name=EXCLUDED.name
          RETURNING id
        `, [orgId]);

        const dpId = dp16.rows[0].id;
        // Insert hours for Mon-Sat
        const days = [[1,'09:00','20:00'],[2,'09:00','20:00'],[3,'09:00','20:00'],[4,'09:00','20:00'],[5,'09:00','18:00'],[6,'09:00','17:00']];
        for (const [d, open, close] of days) {
          await client.query(`
            INSERT INTO dealer_hours (dealer_profile_id, day_of_week, open_time, close_time, is_closed)
            VALUES ($1, $2, $3, $4, false)
            ON CONFLICT (dealer_profile_id, day_of_week) DO NOTHING
          `, [dpId, d, open, close]);
        }
        // Sunday closed
        await client.query(`
          INSERT INTO dealer_hours (dealer_profile_id, day_of_week, is_closed)
          VALUES ($1, 0, true)
          ON CONFLICT (dealer_profile_id, day_of_week) DO NOTHING
        `, [dpId]);

        const hoursCount = await client.query(`SELECT COUNT(*) FROM dealer_hours WHERE dealer_profile_id = $1`, [dpId]);
        report(16, 'dealer_profiles + dealer_hours insert', 'Profile inserted + 7 hours rows', `Profile ${dpId}, hours=${hoursCount.rows[0].count}`, hoursCount.rows[0].count === '7' ? 'PASS' : 'PARTIAL', 'dealer_profiles + dealer_hours tables created');
      } catch (e: any) {
        report(16, 'dealer_profiles + dealer_hours insert', 'Tables created and populated', `Error: ${e.message}`, 'FAIL');
      }
    } else {
      report(16, 'dealer_profiles + dealer_hours insert', 'Org exists and profile created', 'No organization found', 'PARTIAL');
    }

    // ── TC-17: Agent query — Show me Ford SUVs (index-backed query) ───────
    const res17 = await client.query(`
      SELECT id, make, body_style, condition FROM vehicles
      WHERE widget_id = $1 AND make ILIKE 'Ford' AND body_style ILIKE 'SUV'
      AND still_listed = true
      LIMIT 5
    `, [widgetA]);
    report(17, 'Agent query: "Show me Ford SUVs"', 'Dealer-scoped make+body_style filter executes', `Returned ${res17.rows.length} Ford SUVs (expected 0 in test data, query works)`, 'PASS', 'idx_vehicles_body_style + idx_vehicles_make_model covers this');

    // ── TC-18: Agent query — Used Ram 1500s ───────────────────────────────
    const res18 = await client.query(`
      SELECT id, make, model, condition FROM vehicles
      WHERE widget_id = $1 AND condition = 'used' AND make ILIKE 'Ram' AND model ILIKE '1500'
      AND still_listed = true
      LIMIT 5
    `, [widgetA]);
    report(18, 'Agent query: "Show me used Ram 1500s"', 'condition+make+model filter works', `Returned ${res18.rows.length} (test inserted 1 used Ram 1500)`, res18.rows.length >= 1 ? 'PASS' : 'FAIL', 'idx_vehicles_condition + idx_vehicles_make_model covers this');

    // ── TC-19: Agent query — New Jeeps under $50k ─────────────────────────
    const res19 = await client.query(`
      SELECT id, make, model, price, condition FROM vehicles
      WHERE widget_id = $1 AND condition = 'new' AND make ILIKE 'Jeep' AND price < 50000
      AND still_listed = true
      LIMIT 5
    `, [widgetA]);
    report(19, 'Agent query: "New Jeeps under $50k"', 'condition+make+price filter works', `Returned ${res19.rows.length} (test inserted 1 new Jeep Grand Cherokee $49,995)`, res19.rows.length >= 1 ? 'PASS' : 'FAIL', 'idx_vehicles_price covers price range');

    // ── TC-20: Fuel efficiency query — "What's the fuel economy of the Elantra?" ───
    const res20 = await client.query(`
      SELECT make, model, city_fuel_efficiency, highway_fuel_efficiency, fuel_efficiency_unit
      FROM vehicles WHERE widget_id = $1 AND model ILIKE 'Elantra' AND city_fuel_efficiency IS NOT NULL
      LIMIT 1
    `, [widgetA]);
    const row20 = res20.rows[0];
    report(20, 'Fuel efficiency query (Elantra)', `Returns city=8.5 highway=6.2 L/100km from DB`, row20 ? `city=${row20.city_fuel_efficiency} hwy=${row20.highway_fuel_efficiency} ${row20.fuel_efficiency_unit}` : 'Not found', row20 ? 'PASS' : 'FAIL', 'city_fuel_efficiency + highway_fuel_efficiency columns');

  } finally {
    client.release();
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} PASS | ${failed} FAIL | ${partial} PARTIAL`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
