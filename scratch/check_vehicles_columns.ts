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

async function checkColumns() {
  const res = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'vehicles'
    ORDER BY ordinal_position;
  `);
  console.log('--- VEHICLES TABLE COLUMNS ---');
  console.table(res.rows);
  await pool.end();
}

checkColumns().catch(console.error);
