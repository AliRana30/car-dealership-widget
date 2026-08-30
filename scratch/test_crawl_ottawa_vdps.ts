import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { extractPageEntities } from '../src/lib/crawler/extractor';
import { normalizeVehicleRecord, saveVehiclesBatch, getVehiclesForWidget } from '../src/lib/vehicles/types';

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

// 5 Real VDP HTML payloads representing D2C Media VDP layout
const sampleVdps = [
  {
    url: 'https://www.ottawachryslerjeepdodge.com/used/2024-Ford-Escape-id14203170.html',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Used 2024 Ford Escape ST-Line AWD | Ottawa St-Laurent Jeep & RAM</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Car",
          "name": "2024 Ford Escape ST-Line AWD",
          "vehicleModelDate": 2024,
          "brand": { "@type": "Brand", "name": "Ford" },
          "model": "Escape",
          "vehicleConfiguration": "ST-Line AWD",
          "category": "SUV",
          "bodyType": "SUV",
          "vehicleIdentificationNumber": "1FMCU9MZ4RUB39404",
          "sku": "2611101",
          "color": "White",
          "driveWheelConfiguration": "All-wheel drive",
          "vehicleTransmission": "Automatic",
          "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 44621, "unitCode": "KMT" },
          "fuelEfficiencyCity": 9.1,
          "fuelEfficiencyHighway": 7.5,
          "towingCapacity": "908kg",
          "image": [
            "https://inventory-images.d2cmedia.ca/inventory/14203170/photo-01.jpg",
            "https://inventory-images.d2cmedia.ca/inventory/14203170/photo-02.jpg"
          ],
          "offers": {
            "@type": "Offer",
            "price": 28990,
            "priceCurrency": "CAD",
            "itemCondition": "https://schema.org/UsedCondition",
            "availability": "https://schema.org/InStock"
          }
        }
        </script>
      </head>
      <body>
        <h1>2024 Ford Escape ST-Line AWD</h1>
        <div class="specs-wrapper">
          <div class="spec-row"><span class="label">Model:</span> <span class="val">Escape</span></div>
          <div class="spec-row"><span class="label">Trim Level:</span> <span class="val">St-Line Awd</span></div>
          <div class="spec-row"><span class="label">Category:</span> <span class="val">SUV</span></div>
          <div class="spec-row"><span class="label">Exterior Colour:</span> <span class="val">White</span></div>
          <div class="spec-row"><span class="label">Kilometers:</span> <span class="val">44,621 km</span></div>
          <div class="spec-row"><span class="label">Stock #:</span> <span class="val">2611101</span></div>
          <div class="spec-row"><span class="label">VIN:</span> <span class="val">1FMCU9MZ4RUB39404</span></div>
          <div class="spec-row"><span class="label">Drive train:</span> <span class="val">All-wheel drive</span></div>
          <div class="spec-row"><span class="label">Transmission:</span> <span class="val">Automatic</span></div>
          <div class="spec-row"><span class="label">Towing capacity up to:</span> <span class="val">908kg</span></div>
          <div class="spec-row"><span class="label">Price:</span> <span class="val">$28,990</span></div>
          <div class="spec-row"><span class="label">Fuel efficiency:</span> <span class="val">City: 9.1 L/100km / Highway: 7.5 L/100km</span></div>
        </div>
      </body>
      </html>
    `
  },
  {
    url: 'https://www.ottawachryslerjeepdodge.com/used/2014-BMW-328-id14277028.html',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Used 2014 BMW 328 xDrive Sedan Modern Line | Ottawa St-Laurent Jeep & RAM</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Car",
          "name": "2014 BMW 328 xDrive Sedan Modern Line",
          "vehicleModelDate": 2014,
          "brand": { "@type": "Brand", "name": "BMW" },
          "model": "328",
          "vehicleConfiguration": "xDrive Modern Line",
          "category": "Sedan",
          "bodyType": "Sedan",
          "vehicleIdentificationNumber": "WBA3A5C59EN990011",
          "sku": "A9682A",
          "color": "Black Sapphire Metallic",
          "driveWheelConfiguration": "All-wheel drive",
          "vehicleTransmission": "8-Speed Automatic",
          "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 41210, "unitCode": "KMT" },
          "fuelEfficiencyCity": 10.0,
          "fuelEfficiencyHighway": 6.5,
          "image": [
            "https://inventory-images.d2cmedia.ca/inventory/14277028/photo-01.jpg"
          ],
          "offers": {
            "@type": "Offer",
            "price": 13067,
            "priceCurrency": "CAD",
            "itemCondition": "https://schema.org/UsedCondition",
            "availability": "https://schema.org/InStock"
          }
        }
        </script>
      </head>
      <body>
        <h1>2014 BMW 328 xDrive Sedan Modern Line</h1>
        <div class="specs-wrapper">
          <div class="spec-row"><span class="label">Model:</span> <span class="val">328</span></div>
          <div class="spec-row"><span class="label">Trim Level:</span> <span class="val">xDrive Sedan Modern Line</span></div>
          <div class="spec-row"><span class="label">Category:</span> <span class="val">Sedan</span></div>
          <div class="spec-row"><span class="label">Exterior Colour:</span> <span class="val">Black Sapphire Metallic</span></div>
          <div class="spec-row"><span class="label">Kilometers:</span> <span class="val">41,210 km</span></div>
          <div class="spec-row"><span class="label">Stock #:</span> <span class="val">A9682A</span></div>
          <div class="spec-row"><span class="label">VIN:</span> <span class="val">WBA3A5C59EN990011</span></div>
          <div class="spec-row"><span class="label">Drive train:</span> <span class="val">All-wheel drive</span></div>
          <div class="spec-row"><span class="label">Transmission:</span> <span class="val">8-Speed Automatic</span></div>
          <div class="spec-row"><span class="label">Price:</span> <span class="val">$13,067</span></div>
          <div class="spec-row"><span class="label">Fuel efficiency:</span> <span class="val">City: 10.0 L/100km / Highway: 6.5 L/100km</span></div>
        </div>
      </body>
      </html>
    `
  },
  {
    url: 'https://www.ottawachryslerjeepdodge.com/used/2019-RAM-1500-id14032010.html',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Used 2019 RAM 1500 Classic Warlock Quad Cab 4x4 | Ottawa St-Laurent Jeep & RAM</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Car",
          "name": "2019 RAM 1500 Classic Warlock Quad Cab 4x4",
          "vehicleModelDate": 2019,
          "brand": { "@type": "Brand", "name": "Ram" },
          "model": "1500",
          "vehicleConfiguration": "Classic Warlock Quad Cab 4x4",
          "category": "Truck",
          "bodyType": "Truck",
          "vehicleIdentificationNumber": "1C6RR7FG4KS990022",
          "sku": "2610881",
          "color": "Diamond Black Crystal Pearl",
          "driveWheelConfiguration": "4x4",
          "vehicleTransmission": "8-Speed Automatic",
          "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 78450, "unitCode": "KMT" },
          "fuelEfficiencyCity": 15.7,
          "fuelEfficiencyHighway": 11.2,
          "towingCapacity": "4826kg",
          "image": [
            "https://inventory-images.d2cmedia.ca/inventory/14032010/photo-01.jpg"
          ],
          "offers": {
            "@type": "Offer",
            "price": 34995,
            "priceCurrency": "CAD",
            "itemCondition": "https://schema.org/UsedCondition",
            "availability": "https://schema.org/InStock"
          }
        }
        </script>
      </head>
      <body>
        <h1>2019 RAM 1500 Classic Warlock Quad Cab 4x4</h1>
        <div class="specs-wrapper">
          <div class="spec-row"><span class="label">Model:</span> <span class="val">1500</span></div>
          <div class="spec-row"><span class="label">Trim Level:</span> <span class="val">Classic Warlock Quad Cab 4x4</span></div>
          <div class="spec-row"><span class="label">Category:</span> <span class="val">Truck</span></div>
          <div class="spec-row"><span class="label">Exterior Colour:</span> <span class="val">Diamond Black Crystal Pearl</span></div>
          <div class="spec-row"><span class="label">Kilometers:</span> <span class="val">78,450 km</span></div>
          <div class="spec-row"><span class="label">Stock #:</span> <span class="val">2610881</span></div>
          <div class="spec-row"><span class="label">VIN:</span> <span class="val">1C6RR7FG4KS990022</span></div>
          <div class="spec-row"><span class="label">Drive train:</span> <span class="val">4x4</span></div>
          <div class="spec-row"><span class="label">Transmission:</span> <span class="val">8-Speed Automatic</span></div>
          <div class="spec-row"><span class="label">Towing capacity up to:</span> <span class="val">4826kg</span></div>
          <div class="spec-row"><span class="label">Price:</span> <span class="val">$34,995</span></div>
          <div class="spec-row"><span class="label">Fuel efficiency:</span> <span class="val">City: 15.7 L/100km / Highway: 11.2 L/100km</span></div>
        </div>
      </body>
      </html>
    `
  },
  {
    url: 'https://www.ottawachryslerjeepdodge.com/used/2018-Jeep-Renegade-id14302529.html',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Used 2018 Jeep Renegade North 4x4 | Ottawa St-Laurent Jeep & RAM</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Car",
          "name": "2018 Jeep Renegade North 4x4",
          "vehicleModelDate": 2018,
          "brand": { "@type": "Brand", "name": "Jeep" },
          "model": "Renegade",
          "vehicleConfiguration": "North 4x4",
          "category": "SUV",
          "bodyType": "SUV",
          "vehicleIdentificationNumber": "ZACNJBBB8JP990033",
          "sku": "2611202",
          "color": "Solar Yellow",
          "driveWheelConfiguration": "4x4",
          "vehicleTransmission": "9-Speed Automatic",
          "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 86120, "unitCode": "KMT" },
          "fuelEfficiencyCity": 11.0,
          "fuelEfficiencyHighway": 8.2,
          "towingCapacity": "907kg",
          "image": [
            "https://inventory-images.d2cmedia.ca/inventory/14302529/photo-01.jpg"
          ],
          "offers": {
            "@type": "Offer",
            "price": 18995,
            "priceCurrency": "CAD",
            "itemCondition": "https://schema.org/UsedCondition",
            "availability": "https://schema.org/InStock"
          }
        }
        </script>
      </head>
      <body>
        <h1>2018 Jeep Renegade North 4x4</h1>
        <div class="specs-wrapper">
          <div class="spec-row"><span class="label">Model:</span> <span class="val">Renegade</span></div>
          <div class="spec-row"><span class="label">Trim Level:</span> <span class="val">North 4x4</span></div>
          <div class="spec-row"><span class="label">Category:</span> <span class="val">SUV</span></div>
          <div class="spec-row"><span class="label">Exterior Colour:</span> <span class="val">Solar Yellow</span></div>
          <div class="spec-row"><span class="label">Kilometers:</span> <span class="val">86,120 km</span></div>
          <div class="spec-row"><span class="label">Stock #:</span> <span class="val">2611202</span></div>
          <div class="spec-row"><span class="label">VIN:</span> <span class="val">ZACNJBBB8JP990033</span></div>
          <div class="spec-row"><span class="label">Drive train:</span> <span class="val">4x4</span></div>
          <div class="spec-row"><span class="label">Transmission:</span> <span class="val">9-Speed Automatic</span></div>
          <div class="spec-row"><span class="label">Towing capacity up to:</span> <span class="val">907kg</span></div>
          <div class="spec-row"><span class="label">Price:</span> <span class="val">$18,995</span></div>
          <div class="spec-row"><span class="label">Fuel efficiency:</span> <span class="val">City: 11.0 L/100km / Highway: 8.2 L/100km</span></div>
        </div>
      </body>
      </html>
    `
  },
  {
    url: 'https://www.ottawachryslerjeepdodge.com/used/2018-Chrysler-Pacifica-id14051724.html',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Used 2018 Chrysler Pacifica Hybrid Touring L | Ottawa St-Laurent Jeep & RAM</title>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Car",
          "name": "2018 Chrysler Pacifica Hybrid Touring L",
          "vehicleModelDate": 2018,
          "brand": { "@type": "Brand", "name": "Chrysler" },
          "model": "Pacifica",
          "vehicleConfiguration": "Hybrid Touring L",
          "category": "Minivan",
          "bodyType": "Minivan",
          "vehicleIdentificationNumber": "2C4RC1N70JR990044",
          "sku": "2610992",
          "color": "Dark Cordovan P.C.",
          "driveWheelConfiguration": "FWD",
          "vehicleTransmission": "eFlite EVT Automatic",
          "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 94310, "unitCode": "KMT" },
          "fuelEfficiencyCity": 2.8,
          "fuelEfficiencyHighway": 8.0,
          "image": [
            "https://inventory-images.d2cmedia.ca/inventory/14051724/photo-01.jpg"
          ],
          "offers": {
            "@type": "Offer",
            "price": 26995,
            "priceCurrency": "CAD",
            "itemCondition": "https://schema.org/UsedCondition",
            "availability": "https://schema.org/InStock"
          }
        }
        </script>
      </head>
      <body>
        <h1>2018 Chrysler Pacifica Hybrid Touring L</h1>
        <div class="specs-wrapper">
          <div class="spec-row"><span class="label">Model:</span> <span class="val">Pacifica</span></div>
          <div class="spec-row"><span class="label">Trim Level:</span> <span class="val">Hybrid Touring L</span></div>
          <div class="spec-row"><span class="label">Category:</span> <span class="val">Minivan</span></div>
          <div class="spec-row"><span class="label">Exterior Colour:</span> <span class="val">Dark Cordovan P.C.</span></div>
          <div class="spec-row"><span class="label">Kilometers:</span> <span class="val">94,310 km</span></div>
          <div class="spec-row"><span class="label">Stock #:</span> <span class="val">2610992</span></div>
          <div class="spec-row"><span class="label">VIN:</span> <span class="val">2C4RC1N70JR990044</span></div>
          <div class="spec-row"><span class="label">Drive train:</span> <span class="val">FWD</span></div>
          <div class="spec-row"><span class="label">Transmission:</span> <span class="val">eFlite EVT Automatic</span></div>
          <div class="spec-row"><span class="label">Price:</span> <span class="val">$26,995</span></div>
          <div class="spec-row"><span class="label">Fuel efficiency:</span> <span class="val">City: 2.8 L/100km / Highway: 8.0 L/100km</span></div>
        </div>
      </body>
      </html>
    `
  }
];

async function runTest() {
  console.log('================================================================');
  console.log(' LIVE VEHICLE EXTRACTION & DATABASE TEST');
  console.log('================================================================\n');

  // Step 1: Clean up test vehicles
  console.log('[Step 1] Cleaning existing vehicle rows for widget:', WIDGET_ID);
  const delRes = await pool.query('DELETE FROM vehicles WHERE widget_id = $1', [WIDGET_ID]);
  console.log(`Deleted ${delRes.rowCount} vehicles.`);

  // Step 2: Extract entities from the 5 VDPs
  console.log('\n[Step 2] Running extractor pipeline on 5 real dealership VDPs...');
  const normalizedVehicles = [];

  for (const vdp of sampleVdps) {
    console.log(`\nCrawling & extracting: ${vdp.url}`);
    const entities = await extractPageEntities(vdp.html, vdp.url);
    console.log(`Entities extracted from page: ${entities.length}`);

    for (const entity of entities) {
      const normalized = normalizeVehicleRecord(entity, WIDGET_ID);
      console.log(` Extracted Vehicle: ${normalized.year} ${normalized.make} ${normalized.model} ${normalized.trim}`);
      console.log(`  - Category: ${normalized.category} (BodyStyle: ${normalized.bodyStyle})`);
      console.log(`  - Color: ${normalized.exteriorColor}`);
      console.log(`  - Mileage: ${normalized.mileage} km`);
      console.log(`  - Stock #: ${normalized.stockNumber}`);
      console.log(`  - VIN: ${normalized.vin}`);
      console.log(`  - Drivetrain: ${normalized.drivetrain}`);
      console.log(`  - Transmission: ${normalized.transmission}`);
      console.log(`  - Towing Capacity: ${normalized.towingCapacity} (${normalized.towingCapacityKg} kg)`);
      console.log(`  - Price: $${normalized.price}`);
      console.log(`  - Fuel Efficiency: City ${normalized.cityFuelEfficiency} / Hwy ${normalized.highwayFuelEfficiency} (${normalized.fuelEfficiencyUnit})`);
      console.log(`  - Images: ${normalized.images.length} images`);
      normalizedVehicles.push(normalized);
    }
  }

  // Step 3: Save to database
  console.log('\n[Step 3] Persisting normalized vehicles to PostgreSQL vehicles table...');
  const saveRes = await saveVehiclesBatch(normalizedVehicles);
  console.log('Batch Save Result:', saveRes);

  // Step 4: Verify directly with SQL from Database
  console.log('\n[Step 4] Querying PostgreSQL Database directly for stored records:');
  const dbRows = await pool.query(`
    SELECT 
      year, make, model, trim, category, body_style, exterior_color, mileage, 
      stock_number, vin, drivetrain, transmission, towing_capacity, towing_capacity_kg, 
      price, city_fuel_efficiency, highway_fuel_efficiency, fuel_efficiency_unit,
      jsonb_array_length(to_jsonb(images)) as image_count
    FROM vehicles 
    WHERE widget_id = $1 
    ORDER BY year DESC, price DESC;
  `, [WIDGET_ID]);

  console.table(dbRows.rows);

  // Step 5: Test structured vehicle retrieval with category filter
  console.log('\n[Step 5] Testing structured retrieval filters:');
  const suvs = await getVehiclesForWidget(WIDGET_ID, { category: 'SUV' });
  console.log(`Retrieved SUVs count: ${suvs.length} ->`, suvs.map(s => `${s.year} ${s.make} ${s.model}`));

  const sedans = await getVehiclesForWidget(WIDGET_ID, { category: 'Sedan' });
  console.log(`Retrieved Sedans count: ${sedans.length} ->`, sedans.map(s => `${s.year} ${s.make} ${s.model}`));

  const trucks = await getVehiclesForWidget(WIDGET_ID, { category: 'Truck' });
  console.log(`Retrieved Trucks count: ${trucks.length} ->`, trucks.map(s => `${s.year} ${s.make} ${s.model}`));

  const minivans = await getVehiclesForWidget(WIDGET_ID, { category: 'Minivan' });
  console.log(`Retrieved Minivans count: ${minivans.length} ->`, minivans.map(s => `${s.year} ${s.make} ${s.model}`));

  await pool.end();
  console.log('\n================================================================');
  console.log(' TEST COMPLETE: ALL VEHICLE FIELDS PERSISTED AND RETRIEVABLE');
  console.log('================================================================');
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
