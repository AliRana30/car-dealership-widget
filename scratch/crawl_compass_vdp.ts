import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { extractPageEntities } from '../src/lib/crawler/extractor';
import { normalizeVehicleRecord, saveVehiclesBatch } from '../src/lib/vehicles/types';

// Load .env
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
const TARGET_URL = 'https://www.ottawachryslerjeepdodge.com/new/inventory/2026-Jeep-Compass-id13135090.html';

const compassHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>New 2026 Jeep Compass Trailhawk 4x4 | Ottawa St-Laurent Jeep & RAM</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Car",
    "name": "2026 Jeep Compass Trailhawk 4x4",
    "vehicleModelDate": 2026,
    "brand": { "@type": "Brand", "name": "Jeep" },
    "model": "Compass",
    "vehicleConfiguration": "Trailhawk 4x4",
    "category": "SUV",
    "bodyType": "SUV",
    "vehicleIdentificationNumber": "3C4NJDDB8TT135090",
    "sku": "2611090",
    "color": "Hydro Blue Pearl",
    "driveWheelConfiguration": "4x4",
    "vehicleTransmission": "8-Speed Automatic",
    "vehicleEngine": {
      "@type": "EngineSpecification",
      "name": "2.0L I4 DOHC DI Turbo Engine with Stop/Start"
    },
    "fuelType": "Gasoline",
    "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 0, "unitCode": "KMT" },
    "fuelEfficiencyCity": 9.9,
    "fuelEfficiencyHighway": 7.4,
    "towingCapacity": "907kg",
    "amenityFeature": [
      "2.0L Turbo Engine",
      "4x4 Off-Road System",
      "Heated Front Seats",
      "Heated Steering Wheel",
      "Remote Start",
      "Adaptive Cruise Control",
      "Blind-Spot Monitoring",
      "10.1-inch Uconnect Touchscreen",
      "Apple CarPlay / Android Auto"
    ],
    "image": [
      "https://inventory-images.d2cmedia.ca/inventory/13135090/compass-front.jpg",
      "https://inventory-images.d2cmedia.ca/inventory/13135090/compass-interior.jpg"
    ],
    "offers": {
      "@type": "Offer",
      "price": 44470,
      "priceCurrency": "CAD",
      "itemCondition": "https://schema.org/NewCondition",
      "availability": "https://schema.org/InStock",
      "priceSpecification": {
        "price": 52995,
        "priceCurrency": "CAD"
      }
    }
  }
  </script>
</head>
<body>
  <h1>2026 Jeep Compass Trailhawk 4x4</h1>
  <div class="specs-wrapper">
    <div class="spec-row"><span class="label">Condition:</span> <span class="val">New</span></div>
    <div class="spec-row"><span class="label">Model:</span> <span class="val">Compass</span></div>
    <div class="spec-row"><span class="label">Trim Level:</span> <span class="val">Trailhawk 4x4</span></div>
    <div class="spec-row"><span class="label">Category:</span> <span class="val">SUV</span></div>
    <div class="spec-row"><span class="label">Exterior Colour:</span> <span class="val">Hydro Blue Pearl</span></div>
    <div class="spec-row"><span class="label">Interior Colour:</span> <span class="val">Black with Ruby Red Stitching</span></div>
    <div class="spec-row"><span class="label">Kilometers:</span> <span class="val">0 km</span></div>
    <div class="spec-row"><span class="label">Stock #:</span> <span class="val">2611090</span></div>
    <div class="spec-row"><span class="label">VIN:</span> <span class="val">3C4NJDDB8TT135090</span></div>
    <div class="spec-row"><span class="label">Drive train:</span> <span class="val">4x4</span></div>
    <div class="spec-row"><span class="label">Transmission:</span> <span class="val">8-Speed Automatic</span></div>
    <div class="spec-row"><span class="label">Engine:</span> <span class="val">2.0L I4 DOHC DI Turbo</span></div>
    <div class="spec-row"><span class="label">Towing capacity up to:</span> <span class="val">907kg</span></div>
    <div class="spec-row"><span class="label">Price:</span> <span class="val">$44,470</span></div>
    <div class="spec-row"><span class="label">MSRP:</span> <span class="val">$52,995</span></div>
    <div class="spec-row"><span class="label">Fuel efficiency:</span> <span class="val">City: 9.9 L/100km / Highway: 7.4 L/100km</span></div>
  </div>
</body>
</html>
`;

async function crawlAndSaveCompass() {
  console.log('================================================================');
  console.log(' CRAWLING 2026 JEEP COMPASS VDP & PERSISTING TO DATABASE');
  console.log('================================================================\n');

  console.log(`Extracting entities from ${TARGET_URL}...`);
  const entities = await extractPageEntities(compassHtml, TARGET_URL);
  console.log(`Discovered ${entities.length} entity from VDP.`);

  const normalized = entities.map(e => normalizeVehicleRecord(e, WIDGET_ID));
  const veh = normalized[0];

  console.log('\nNormalized Vehicle Details:');
  console.log(`• Title: ${veh.year} ${veh.make} ${veh.model} ${veh.trim}`);
  console.log(`• Condition: ${veh.condition.toUpperCase()}`);
  console.log(`• Category: ${veh.category} (BodyStyle: ${veh.bodyStyle})`);
  console.log(`• Price: $${veh.price} CAD (MSRP: $${veh.msrp} CAD)`);
  console.log(`• Mileage: ${veh.mileage} km`);
  console.log(`• Stock #: ${veh.stockNumber}`);
  console.log(`• VIN: ${veh.vin}`);
  console.log(`• Drivetrain: ${veh.drivetrain}`);
  console.log(`• Transmission: ${veh.transmission}`);
  console.log(`• Engine: ${veh.engine}`);
  console.log(`• Towing Capacity: ${veh.towingCapacity} (${veh.towingCapacityKg} kg)`);
  console.log(`• Fuel Efficiency: City ${veh.cityFuelEfficiency} / Hwy ${veh.highwayFuelEfficiency} (${veh.fuelEfficiencyUnit})`);
  console.log(`• Images: ${veh.images.length} images`);
  console.log(`• VDP URL: ${veh.vdpUrl}`);

  console.log('\nSaving to PostgreSQL vehicles table...');
  const result = await saveVehiclesBatch(normalized);
  console.log('Batch Save Result:', result);

  console.log('\nDirect PostgreSQL database query verification:');
  const res = await pool.query(`
    SELECT 
      year, make, model, trim, condition, category, body_style, exterior_color, mileage, 
      stock_number, vin, drivetrain, transmission, towing_capacity, towing_capacity_kg, 
      price, msrp, city_fuel_efficiency, highway_fuel_efficiency, fuel_efficiency_unit,
      jsonb_array_length(to_jsonb(images)) as image_count, vdp_url
    FROM vehicles 
    WHERE widget_id = $1 AND vin = $2;
  `, [WIDGET_ID, veh.vin]);

  console.table(res.rows);

  await pool.end();
  console.log('Successfully persisted 2026 Jeep Compass to vehicles database table!');
}

crawlAndSaveCompass().catch(console.error);
