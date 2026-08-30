import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

// Load .env
const envPath = path.join(process.cwd(), '.env');
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

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // All tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('\n=== PUBLIC TABLES ===');
    tables.rows.forEach(r => console.log(' ', r.table_name));

    // vehicles columns
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'vehicles'
      ORDER BY ordinal_position
    `);
    console.log('\n=== vehicles COLUMNS ===');
    cols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(24)} ${r.data_type.padEnd(20)} nullable=${r.is_nullable}`));

    // vehicles indexes
    const idxs = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'vehicles'
    `);
    console.log('\n=== vehicles INDEXES ===');
    idxs.rows.forEach(r => console.log(`  [${r.indexname}]\n    ${r.indexdef}\n`));

    // widgets columns
    const wcols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'widgets'
      ORDER BY ordinal_position
    `);
    console.log('\n=== widgets COLUMNS ===');
    wcols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(24)} ${r.data_type}`));

    // organizations columns
    const ocols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'organizations'
      ORDER BY ordinal_position
    `);
    console.log('\n=== organizations COLUMNS ===');
    ocols.rows.forEach(r => console.log(`  ${r.column_name.padEnd(24)} ${r.data_type}`));

    // sample vehicle
    const sample = await client.query(`SELECT * FROM vehicles LIMIT 1`);
    if (sample.rows.length > 0) {
      console.log('\n=== SAMPLE VEHICLE ROW ===');
      const row = sample.rows[0];
      Object.entries(row).forEach(([k, v]) => {
        const display = Array.isArray(v) ? `[${v.length} items]` : (typeof v === 'object' && v !== null ? '{...}' : String(v ?? 'NULL'));
        console.log(`  ${k.padEnd(24)} ${display}`);
      });
    }

    // check dealership/dealer_profile tables
    const dealerTables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name ILIKE '%dealer%'
    `);
    console.log('\n=== DEALER-RELATED TABLES ===');
    dealerTables.rows.forEach(r => console.log(' ', r.table_name));

    // check hours tables
    const hoursTables = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name ILIKE '%hour%' OR table_name ILIKE '%schedule%' OR table_name ILIKE '%business%')
    `);
    console.log('\n=== HOURS/SCHEDULE TABLES ===');
    hoursTables.rows.forEach(r => console.log(' ', r.table_name));

    // vehicle count
    const count = await client.query(`SELECT condition, COUNT(*) FROM vehicles GROUP BY condition`);
    console.log('\n=== VEHICLE COUNTS BY CONDITION ===');
    count.rows.forEach(r => console.log(`  ${r.condition}: ${r.count}`));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
