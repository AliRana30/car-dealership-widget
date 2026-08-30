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

async function main() {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT id, make, model, year, images FROM vehicles WHERE model ILIKE '%Grand Caravan%'`);
    console.log('Caravan Rows:', JSON.stringify(res.rows, null, 2));

    const elantra = await client.query(`SELECT id, make, model, year, images FROM vehicles WHERE model ILIKE '%Elantra%'`);
    console.log('\nElantra Rows:', JSON.stringify(elantra.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
