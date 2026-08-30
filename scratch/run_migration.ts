import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

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

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });

async function run(client: any, sql: string, label: string) {
  try {
    await client.query(sql);
    console.log(`  [✓] ${label}`);
  } catch (e: any) {
    console.error(`  [✗] ${label}: ${e.message}`);
  }
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n=== STEP 1: Add missing vehicle columns ===');
    await run(client,
      `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS city_fuel_efficiency NUMERIC(5,2)`,
      'city_fuel_efficiency NUMERIC(5,2)'
    );
    await run(client,
      `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS highway_fuel_efficiency NUMERIC(5,2)`,
      'highway_fuel_efficiency NUMERIC(5,2)'
    );
    await run(client,
      `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fuel_efficiency_unit TEXT`,
      'fuel_efficiency_unit TEXT'
    );
    await run(client,
      `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available'`,
      'status TEXT DEFAULT available'
    );
    await run(client,
      `ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS missing_count INTEGER DEFAULT 0`,
      'missing_count INTEGER DEFAULT 0'
    );

    console.log('\n=== STEP 2: Add vehicle indexes ===');
    await run(client,
      `CREATE INDEX IF NOT EXISTS idx_vehicles_body_style ON vehicles (widget_id, body_style)`,
      'idx_vehicles_body_style'
    );
    await run(client,
      `CREATE INDEX IF NOT EXISTS idx_vehicles_mileage ON vehicles (widget_id, mileage)`,
      'idx_vehicles_mileage'
    );
    await run(client,
      `CREATE INDEX IF NOT EXISTS idx_vehicles_availability ON vehicles (widget_id, availability)`,
      'idx_vehicles_availability'
    );
    await run(client,
      `CREATE INDEX IF NOT EXISTS idx_vehicles_condition_make_body ON vehicles (widget_id, condition, make, body_style)`,
      'idx_vehicles_condition_make_body'
    );
    await run(client,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_widget_stock_unique ON vehicles (widget_id, stock_number) WHERE stock_number IS NOT NULL`,
      'PARTIAL UNIQUE idx_vehicles_widget_stock_unique'
    );
    await run(client,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_widget_vdp_unique ON vehicles (widget_id, vdp_url) WHERE vdp_url IS NOT NULL`,
      'PARTIAL UNIQUE idx_vehicles_widget_vdp_unique'
    );

    console.log('\n=== STEP 3: Create dealer_profiles table ===');
    await run(client, `
      CREATE TABLE IF NOT EXISTS dealer_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        website_id UUID REFERENCES websites(id) ON DELETE SET NULL,
        dealer_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        website_url TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        province_state TEXT,
        postal_code TEXT,
        country TEXT DEFAULT 'CA',
        timezone TEXT DEFAULT 'America/Toronto',
        logo_url TEXT,
        description TEXT,
        last_verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `, 'dealer_profiles table');
    await run(client,
      `CREATE INDEX IF NOT EXISTS idx_dealer_profiles_org ON dealer_profiles (organization_id)`,
      'idx_dealer_profiles_org'
    );
    await run(client,
      `CREATE INDEX IF NOT EXISTS idx_dealer_profiles_website ON dealer_profiles (website_id)`,
      'idx_dealer_profiles_website'
    );

    console.log('\n=== STEP 4: Create dealer_hours table ===');
    await run(client, `
      CREATE TABLE IF NOT EXISTS dealer_hours (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dealer_profile_id UUID NOT NULL REFERENCES dealer_profiles(id) ON DELETE CASCADE,
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        open_time TIME,
        close_time TIME,
        is_closed BOOLEAN NOT NULL DEFAULT FALSE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (dealer_profile_id, day_of_week)
      )
    `, 'dealer_hours table');
    await run(client,
      `CREATE INDEX IF NOT EXISTS idx_dealer_hours_profile ON dealer_hours (dealer_profile_id)`,
      'idx_dealer_hours_profile'
    );

    console.log('\n=== STEP 5: Extend organizations table ===');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_url TEXT`, 'organizations.website_url');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone TEXT`, 'organizations.phone');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email TEXT`, 'organizations.email');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT`, 'organizations.address');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city TEXT`, 'organizations.city');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS province_state TEXT`, 'organizations.province_state');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS postal_code TEXT`, 'organizations.postal_code');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'CA'`, 'organizations.country');
    await run(client, `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone TEXT`, 'organizations.timezone');

    console.log('\n=== VERIFICATION: Final schema ===');
    const vCols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'vehicles'
      ORDER BY ordinal_position
    `);
    console.log('\nvehicles columns:');
    vCols.rows.forEach((r: any) => console.log(`  ${r.column_name.padEnd(28)} ${r.data_type.padEnd(20)} default=${r.column_default ?? 'NULL'}`));

    const idxs = await client.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'vehicles' ORDER BY indexname`);
    console.log('\nvehicles indexes:');
    idxs.rows.forEach((r: any) => console.log(`  ${r.indexname}`));

    const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
    console.log('\nAll tables:');
    tables.rows.forEach((r: any) => console.log(`  ${r.table_name}`));

    const orgCols = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='organizations' ORDER BY ordinal_position`);
    console.log('\norganizations columns:');
    orgCols.rows.forEach((r: any) => console.log(`  ${r.column_name}`));

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
