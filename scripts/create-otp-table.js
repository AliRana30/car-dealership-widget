const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

async function run() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    console.error('SUPABASE_DATABASE_URL is not set in env.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('Creating app_verification_codes table...');
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS app_verification_codes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL,
          code TEXT NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_app_verification_codes_email ON app_verification_codes(email);

      -- Enable RLS
      ALTER TABLE app_verification_codes ENABLE ROW LEVEL SECURITY;

      -- Allow all access to service role only
      DROP POLICY IF EXISTS "Service role only" ON app_verification_codes;
      CREATE POLICY "Service role only" ON app_verification_codes FOR ALL USING (true) WITH CHECK (true);
    `;

    await client.query(createTableSql);
    console.log('Verification codes table created and configured successfully!');
  } catch (err) {
    console.error('Creation failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
