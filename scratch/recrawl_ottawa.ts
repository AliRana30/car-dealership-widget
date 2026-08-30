/**
 * Live Re-crawl Script: Ottawa Chrysler Jeep Dodge Ram
 * 
 * Target: https://www.ottawachryslerjeepdodge.com
 * ID: 36a4ce28-568e-4709-88e9-b95a18431772
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

import { crawlWebsite } from '@/lib/crawler/index';

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
const TARGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';
const TARGET_URL = 'https://www.ottawachryslerjeepdodge.com';

async function runLiveRecrawl() {
  console.log('================================================================');
  console.log(' LIVE RE-CRAWL: OTTAWA CHRYSLER JEEP DODGE RAM');
  console.log('================================================================\n');

  // Step 0: Confirm row in websites / widgets
  console.log(`[Step 0] Confirming database records for ID: ${TARGET_ID}...`);
  const websiteRes = await pool.query('SELECT * FROM websites WHERE id = $1', [TARGET_ID]);
  const widgetRes = await pool.query('SELECT * FROM widgets WHERE id = $1', [TARGET_ID]);

  console.log(`Websites row found:`, websiteRes.rows);
  console.log(`Widgets row found:`, widgetRes.rows);

  if (websiteRes.rows.length === 0 && widgetRes.rows.length === 0) {
    console.error(`❌ Target ID ${TARGET_ID} not found in websites or widgets table!`);
    await pool.end();
    process.exit(1);
  }

  // Step 1: Read-only count before deletion
  console.log('\n[Step 1] Read-only count before deletion:');
  const countVehiclesBefore = await pool.query('SELECT count(*) FROM vehicles WHERE widget_id = $1', [TARGET_ID]);
  const countWebsiteDataBefore = await pool.query('SELECT count(*) FROM website_data WHERE widget_id = $1', [TARGET_ID]);

  console.log(`SELECT count(*) FROM vehicles WHERE widget_id = '${TARGET_ID}'; ->`, countVehiclesBefore.rows[0].count);
  console.log(`SELECT count(*) FROM website_data WHERE widget_id = '${TARGET_ID}'; ->`, countWebsiteDataBefore.rows[0].count);

  // Step 2: Delete existing rows scoped ONLY to this widget_id
  console.log('\n[Step 2] Deleting existing rows scoped strictly to this widget_id...');
  const delVehicles = await pool.query('DELETE FROM vehicles WHERE widget_id = $1', [TARGET_ID]);
  const delWebsiteData = await pool.query('DELETE FROM website_data WHERE widget_id = $1', [TARGET_ID]);

  console.log(`DELETE FROM vehicles WHERE widget_id = '${TARGET_ID}'; -> Deleted:`, delVehicles.rowCount);
  console.log(`DELETE FROM website_data WHERE widget_id = '${TARGET_ID}'; -> Deleted:`, delWebsiteData.rowCount);

  // Confirm row counts are 0 after deletion
  const countVehiclesAfter = await pool.query('SELECT count(*) FROM vehicles WHERE widget_id = $1', [TARGET_ID]);
  const countWebsiteDataAfter = await pool.query('SELECT count(*) FROM website_data WHERE widget_id = $1', [TARGET_ID]);

  console.log(`Confirmation count: vehicles = ${countVehiclesAfter.rows[0].count}, website_data = ${countWebsiteDataAfter.rows[0].count}`);
  if (parseInt(countVehiclesAfter.rows[0].count, 10) !== 0 || parseInt(countWebsiteDataAfter.rows[0].count, 10) !== 0) {
    console.error('❌ Deletion failed to clear rows completely!');
    await pool.end();
    process.exit(1);
  }

  // Step 3: Run MASTER scan
  console.log(`\n[Step 3] Running MASTER scan against ${TARGET_URL}...`);
  const t0 = Date.now();
  const crawlResult = await crawlWebsite(TARGET_ID, TARGET_URL, 'master');
  const elapsedSec = Math.round((Date.now() - t0) / 1000);

  console.log(`\n[Step 3 Complete] Crawl completed in ${elapsedSec}s. Result summary:`);
  console.log({
    success: crawlResult.success,
    status: crawlResult.status,
    pagesDiscovered: crawlResult.pagesDiscovered,
    pagesFetched: crawlResult.pagesFetched,
    entitiesFound: crawlResult.entitiesFound,
    errorsCount: crawlResult.errors?.length || 0,
    blockedPages: crawlResult.blockedPages || [],
  });

  // Step 4: Database Verification & Detailed Breakdown
  console.log('\n[Step 4] Direct Database Query Breakdown:');

  // Condition breakdown
  const conditionRes = await pool.query(
    `SELECT condition, count(*) as count 
     FROM vehicles 
     WHERE widget_id = $1 
     GROUP BY condition 
     ORDER BY count DESC`,
    [TARGET_ID]
  );
  console.log('\nVehicles inserted by condition:');
  console.table(conditionRes.rows);

  // Total vehicles
  const totalVehiclesRes = await pool.query(
    'SELECT count(*) FROM vehicles WHERE widget_id = $1',
    [TARGET_ID]
  );
  console.log(`Total vehicles in DB: ${totalVehiclesRes.rows[0].count}`);

  // NULL / Empty attribute audit
  const nullPriceRes = await pool.query(
    'SELECT count(*) FROM vehicles WHERE widget_id = $1 AND (price IS NULL OR price = 0)',
    [TARGET_ID]
  );
  const nullVinRes = await pool.query(
    "SELECT count(*) FROM vehicles WHERE widget_id = $1 AND (vin IS NULL OR trim(vin) = '')",
    [TARGET_ID]
  );
  const nullImagesRes = await pool.query(
    "SELECT count(*) FROM vehicles WHERE widget_id = $1 AND (images IS NULL OR images::text = '[]' OR images::text = 'null')",
    [TARGET_ID]
  );

  console.log('\nData Quality & Completeness Audit:');
  console.log(`- Vehicles with NULL/0 price: ${nullPriceRes.rows[0].count}`);
  console.log(`- Vehicles with NULL/empty VIN: ${nullVinRes.rows[0].count}`);
  console.log(`- Vehicles with NULL/empty images: ${nullImagesRes.rows[0].count}`);

  // website_data breakdown
  const websiteDataRes = await pool.query(
    `SELECT entity_type, count(*) as count 
     FROM website_data 
     WHERE widget_id = $1 
     GROUP BY entity_type 
     ORDER BY count DESC`,
    [TARGET_ID]
  );
  console.log('\nwebsite_data rows inserted by entity_type:');
  console.table(websiteDataRes.rows);

  const totalWebsiteDataRes = await pool.query(
    'SELECT count(*) FROM website_data WHERE widget_id = $1',
    [TARGET_ID]
  );
  console.log(`Total website_data rows in DB: ${totalWebsiteDataRes.rows[0].count}`);

  // Dealer Profile & Hours check
  const dealerProfileRes = await pool.query(
    'SELECT * FROM dealer_profiles WHERE website_id = $1',
    [TARGET_ID]
  );
  const dealerHoursRes = await pool.query(
    'SELECT count(*) FROM dealer_hours dh INNER JOIN dealer_profiles dp ON dh.dealer_profile_id = dp.id WHERE dp.website_id = $1',
    [TARGET_ID]
  );
  console.log(`\nDealer profile records in DB: ${dealerProfileRes.rows.length}`);
  if (dealerProfileRes.rows.length > 0) {
    console.log(`Dealer name: ${dealerProfileRes.rows[0].name}, Phone: ${dealerProfileRes.rows[0].phone}, Address: ${dealerProfileRes.rows[0].address}, ${dealerProfileRes.rows[0].city}`);
  }
  console.log(`Dealer hours records in DB: ${dealerHoursRes.rows[0].count}`);

  await pool.end();
  console.log('\n================================================================');
  console.log(' LIVE RE-CRAWL COMPLETE');
  console.log('================================================================');
}

runLiveRecrawl().catch((err) => {
  console.error('Fatal error during live recrawl:', err);
  process.exit(1);
});
