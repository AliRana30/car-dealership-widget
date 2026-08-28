import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
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

import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log('[Connected to Supabase PostgreSQL]');

    // Check existing columns
    const existing = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'vehicles'
        AND column_name IN ('passengers', 'doors')
    `);
    console.log('[Existing columns]:', existing.rows);

    const hasDoors = existing.rows.some(r => r.column_name === 'doors');
    const hasPassengers = existing.rows.some(r => r.column_name === 'passengers');

    if (!hasPassengers) {
      await client.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS passengers INTEGER`);
      console.log('[✓] Added column: passengers (INTEGER)');
    } else {
      console.log('[!] Column already exists: passengers');
    }

    if (!hasDoors) {
      await client.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS doors INTEGER`);
      console.log('[✓] Added column: doors (INTEGER)');
    } else {
      console.log('[!] Column already exists: doors');
    }

    // Verify final schema
    const verify = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vehicles'
      ORDER BY ordinal_position
    `);
    console.log('\n[Final vehicles table columns]:');
    for (const row of verify.rows) {
      console.log(`  ${row.column_name.padEnd(22)} ${row.data_type.padEnd(20)} nullable=${row.is_nullable}`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
