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
const TARGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

async function finalReport() {
  console.log('=== DIRECT DATABASE QUERY RESULTS ===\n');

  console.log('1. SELECT count(*) FROM vehicles WHERE widget_id = $1;');
  const vCount = await pool.query('SELECT count(*) FROM vehicles WHERE widget_id = $1', [TARGET_ID]);
  console.log('   Result:', vCount.rows[0].count);

  console.log('\n2. SELECT count(*) FROM website_data WHERE widget_id = $1;');
  const wdCount = await pool.query('SELECT count(*) FROM website_data WHERE widget_id = $1', [TARGET_ID]);
  console.log('   Result:', wdCount.rows[0].count);

  console.log('\n3. SELECT condition, count(*) FROM vehicles WHERE widget_id = $1 GROUP BY condition;');
  const condCount = await pool.query('SELECT condition, count(*) FROM vehicles WHERE widget_id = $1 GROUP BY condition', [TARGET_ID]);
  console.table(condCount.rows);

  console.log('\n4. Quality Audit on vehicles table:');
  const nullPrice = await pool.query('SELECT count(*) FROM vehicles WHERE widget_id = $1 AND (price IS NULL OR price = 0)', [TARGET_ID]);
  const nullVin = await pool.query("SELECT count(*) FROM vehicles WHERE widget_id = $1 AND (vin IS NULL OR trim(vin) = '')", [TARGET_ID]);
  const nullImages = await pool.query("SELECT count(*) FROM vehicles WHERE widget_id = $1 AND (images IS NULL OR images::text = '[]' OR images::text = 'null')", [TARGET_ID]);
  console.log('   - NULL/0 price count:', nullPrice.rows[0].count);
  console.log('   - NULL/empty VIN count:', nullVin.rows[0].count);
  console.log('   - NULL/empty images count:', nullImages.rows[0].count);

  console.log('\n5. SELECT entity_type, count(*) FROM website_data WHERE widget_id = $1 GROUP BY entity_type;');
  const wdEntityCount = await pool.query('SELECT entity_type, count(*) FROM website_data WHERE widget_id = $1 GROUP BY entity_type', [TARGET_ID]);
  console.table(wdEntityCount.rows);

  console.log('\n6. Dealer Profile & Hours in database:');
  const profile = await pool.query('SELECT * FROM dealer_profiles WHERE website_id = $1', [TARGET_ID]);
  const hours = await pool.query('SELECT count(*) FROM dealer_hours dh INNER JOIN dealer_profiles dp ON dh.dealer_profile_id = dp.id WHERE dp.website_id = $1', [TARGET_ID]);
  console.log('   - dealer_profiles count:', profile.rows.length);
  if (profile.rows.length > 0) {
    console.log('   - dealer name:', profile.rows[0].name);
    console.log('   - phone:', profile.rows[0].phone);
    console.log('   - address:', profile.rows[0].address);
    console.log('   - city:', profile.rows[0].city);
  }
  console.log('   - dealer_hours count:', hours.rows[0].count);

  await pool.end();
}

finalReport().catch(console.error);
