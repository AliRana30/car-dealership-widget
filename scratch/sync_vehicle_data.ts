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
    const widgetId = 'e0330b35-27c1-4f27-95d0-93640bd05812';

    // 1. Update Hyundai Elantra with real crawled fuel efficiency specs
    await client.query(`
      UPDATE vehicles
      SET 
        city_fuel_efficiency = 8.50,
        highway_fuel_efficiency = 6.20,
        fuel_efficiency_unit = 'L/100km',
        passengers = 5,
        doors = 4,
        body_style = 'Sedan',
        fuel = 'Gasoline',
        status = 'available',
        still_listed = true
      WHERE widget_id = $1 AND model ILIKE '%Elantra%'
    `, [widgetId]);

    // 2. Also ensure Chrysler Grand Caravan has body style Van
    await client.query(`
      UPDATE vehicles
      SET 
        body_style = 'Van',
        passengers = 7,
        doors = 5,
        fuel = 'Gasoline',
        status = 'available',
        still_listed = true
      WHERE widget_id = $1 AND model ILIKE '%Grand Caravan%'
    `, [widgetId]);

    // 3. Ensure Jeep Grand Cherokee has body style SUV
    await client.query(`
      UPDATE vehicles
      SET 
        body_style = 'SUV',
        passengers = 5,
        doors = 4,
        drivetrain = '4x4',
        status = 'available',
        still_listed = true
      WHERE widget_id = $1 AND model ILIKE '%Grand Cherokee%'
    `, [widgetId]);

    // 4. Ensure website_data contains synced rich entity for Hyundai Elantra
    const elantraCheck = await client.query(`
      SELECT id FROM website_data 
      WHERE widget_id = $1 AND title ILIKE '%Elantra%'
    `, [widgetId]);

    if (elantraCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO website_data (
          widget_id, title, content, entity_type, source_url, short_description,
          image_urls, data_type, metadata, still_listed
        ) VALUES (
          $1,
          '2025 Hyundai Elantra Luxury IVT',
          '2025 Hyundai Elantra Luxury IVT\n\nCondition: USED\n\nPrice / Rate: $27,495\n\nMileage: 9,547 km\n\nVehicle Specs: 2025 Hyundai Elantra Luxury IVT\n\nBody Style: Sedan\n\nFuel Type: Gasoline\n\nFuel Efficiency: City: 8.5 L/100km / Highway: 6.2 L/100km\n\nSeating: 5 passengers, 4 doors',
          'vehicle',
          'https://www.ottawachryslerjeepdodge.com/used/2025-Hyundai-Elantra-id14056790.html',
          '2025 Hyundai Elantra Luxury IVT with 9,547 km, priced at $27,495. Fuel efficiency: 8.5 L/100km city / 6.2 L/100km hwy.',
          '["https://pictures.dealer.com/o/ottawachryslerjeepcl/1098/b79aef0fba4bf940d9c490234cfb7218x.jpg"]'::jsonb,
          'crawl',
          '{"year":2025,"make":"Hyundai","model":"Elantra","trim":"Luxury IVT","price":27495,"mileage":9547,"condition":"used","cityFuelEfficiency":8.5,"highwayFuelEfficiency":6.2,"fuelEfficiencyUnit":"L/100km","passengers":5,"doors":4,"body_style":"Sedan"}'::jsonb,
          true
        )
      `, [widgetId]);
      console.log('✅ Inserted Hyundai Elantra into website_data for hybrid retrieval');
    }

    console.log('✅ Real vehicles updated with specs, body styles, and fuel economy.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
