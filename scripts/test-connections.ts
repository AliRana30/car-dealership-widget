import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env manually
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

async function testConnections() {
  console.log('--- Testing Supabase REST API Client ---');
  const supabaseUrl = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { data, error } = await supabase.from('widgets').select('*').limit(1);
    console.log('Supabase widgets query:', { data, error });
  } catch (e: any) {
    console.log('Supabase REST error:', e.message);
  }

  console.log('\n--- Testing Direct Postgres Connection ---');
  const directUrl = 'postgresql://postgres:AliRana28!%40@db.xkysuvmckhhcktgrmwxn.supabase.co:5432/postgres';
  const client = new Client({ connectionString: directUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('✓ Successfully connected to direct PostgreSQL!');
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
    `);
    console.log('Tables in public schema:', res.rows.map(r => r.table_name));
    await client.end();
  } catch (err: any) {
    console.log('Direct Postgres error:', err.message);
  }
}

testConnections();
