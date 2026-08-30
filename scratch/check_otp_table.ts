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
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log('Tables in DB:', res.rows.map(r => r.table_name));

    // Check if app_verification_codes exists
    const hasCodes = res.rows.some(r => r.table_name === 'app_verification_codes');
    console.log('Has app_verification_codes table?', hasCodes);

    if (!hasCodes) {
      console.log('Creating app_verification_codes table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS app_verification_codes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL,
          code TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_app_verification_codes_email ON app_verification_codes(email);
      `);
      console.log('✅ Created app_verification_codes table');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
