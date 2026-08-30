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
const WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

async function listVehicles() {
  const res = await pool.query(`
    SELECT condition, year, make, model, trim, category, price, mileage, vin, towing_capacity, city_fuel_efficiency, highway_fuel_efficiency, fuel_efficiency_unit
    FROM vehicles 
    WHERE widget_id = $1
    ORDER BY condition ASC, year DESC;
  `, [WIDGET_ID]);

  console.log('\n--- CURRENT VEHICLES IN DATABASE ---');
  console.table(res.rows);
  await pool.end();
}

listVehicles().catch(console.error);
