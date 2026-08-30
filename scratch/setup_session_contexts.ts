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
    // 1. Create session_contexts table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS session_contexts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id TEXT NOT NULL,
        widget_id TEXT NOT NULL,
        current_entity JSONB,
        last_entities JSONB DEFAULT '[]'::jsonb,
        active_filters JSONB DEFAULT '{}'::jsonb,
        last_navigation_target TEXT,
        last_intent TEXT,
        turn_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(session_id, widget_id)
      )
    `);
    console.log('✅ session_contexts table created / verified');

    // 2. Check vehicles in DB
    const vehs = await client.query(`
      SELECT id, widget_id, vin, make, model, year, condition, price, mileage, city_fuel_efficiency, highway_fuel_efficiency, still_listed, availability
      FROM vehicles
      ORDER BY created_at DESC
    `);
    console.log('\n=== CURRENT VEHICLES IN DB ===');
    vehs.rows.forEach(r => {
      console.log(`  [${r.condition}] ${r.year} ${r.make} ${r.model} - $${r.price} | ${r.mileage}km/mi | Fuel: ${r.city_fuel_efficiency}/${r.highway_fuel_efficiency} | Widget: ${r.widget_id} | listed=${r.still_listed}`);
    });

    // 3. Check website_data in DB
    const wdata = await client.query(`
      SELECT id, widget_id, title, entity_type, still_listed
      FROM website_data
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log('\n=== WEBSITE_DATA (TOP 10) ===');
    wdata.rows.forEach(r => {
      console.log(`  [${r.entity_type}] ${r.title} | Widget: ${r.widget_id} | listed=${r.still_listed}`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
