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

async function listAll() {
  console.log('--- WEBSITES ---');
  const websites = await pool.query('SELECT * FROM websites');
  console.table(websites.rows);

  console.log('--- WIDGETS ---');
  const widgets = await pool.query('SELECT id, website_id, name, created_at FROM widgets');
  console.table(widgets.rows);

  console.log('--- VEHICLES DISTINCT WIDGET_IDS ---');
  const vehWidgets = await pool.query('SELECT widget_id, count(*) FROM vehicles GROUP BY widget_id');
  console.table(vehWidgets.rows);

  console.log('--- WEBSITE_DATA DISTINCT WIDGET_IDS ---');
  const dataWidgets = await pool.query('SELECT widget_id, count(*) FROM website_data GROUP BY widget_id');
  console.table(dataWidgets.rows);

  await pool.end();
}

listAll().catch(console.error);
