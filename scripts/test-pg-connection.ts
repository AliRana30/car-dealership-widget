import { Client } from 'pg';
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

async function testDb() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  console.log('Testing connection to:', connectionString ? connectionString.replace(/:[^:@]+@/, ':****@') : 'NONE');
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log('Successfully connected to PostgreSQL via pg!');
    const res = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Tables found in public schema:', res.rows.map(r => r.table_name));

    // If tables are missing or we need to ensure schema is applied:
    if (res.rows.length === 0) {
      console.log('Running supabase_schema.sql...');
      const schemaSql = fs.readFileSync(path.join(__dirname, '../supabase_schema.sql'), 'utf8');
      await client.query(schemaSql);
      console.log('✓ supabase_schema.sql applied!');
    }

    await client.end();
  } catch (err) {
    console.error('Error connecting to database:', err);
  }
}

testDb();
