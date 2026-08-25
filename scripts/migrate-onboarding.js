const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment variables manually from .env
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

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('Adding customizer_onboarding_status to app_users if not exists...');
    await client.query(`
      ALTER TABLE app_users 
      ADD COLUMN IF NOT EXISTS customizer_onboarding_status TEXT DEFAULT 'pending';
    `);
    console.log('Column customizer_onboarding_status successfully ensured.');

    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'app_users';
    `);
    console.log('Columns in app_users:', res.rows.map(r => `${r.column_name} (${r.data_type})`));
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await client.end();
  }
}

run();
