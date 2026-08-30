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

async function runMigration() {
  console.log('Running migration on vehicles table...');
  await pool.query(`
    ALTER TABLE vehicles 
      ADD COLUMN IF NOT EXISTS category text,
      ADD COLUMN IF NOT EXISTS towing_capacity text,
      ADD COLUMN IF NOT EXISTS towing_capacity_kg numeric;
  `);

  console.log('Columns added successfully.');

  const res = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'vehicles'
    ORDER BY ordinal_position;
  `);
  console.table(res.rows);

  await pool.end();
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
