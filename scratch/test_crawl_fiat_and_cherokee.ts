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

// Realistic HTML for 2026 Fiat 500e (Electric, Tuxedo Black, Black Interior, $29,985 / MSRP $42,985)
const fiatHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>New 2026 Fiat 500e Hatchback | Ottawa St-Laurent Jeep & RAM</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Car",
    "name": "2026 Fiat 500e Hatchback",
    "vehicleModelDate": 2026,
    "brand": { "@type": "Brand", "name": "Fiat" },
    "model": "500e",
    "vehicleConfiguration": "Hatchback",
    "category": "Electric",
    "bodyType": "Hatchback",
    "vehicleIdentificationNumber": "ZFAFEEBT0TT142618",
    "sku": "14261852",
    "color": "Tuxedo Black",
    "driveWheelConfiguration": "FWD",
    "vehicleTransmission": "Single-Speed e-Drive Automatic",
    "vehicleEngine": {
      "@type": "EngineSpecification",
      "name": "Electric Motor (42 kWh Battery, 118 hp)"
    },
    "fuelType": "Electric",
    "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 0, "unitCode": "KMT" },
    "amenityFeature": [
      "42 kWh High-Voltage Lithium-Ion Battery",
      "227 km Total Electric Driving Range",
      "10.25-inch Touchscreen with Wireless Apple CarPlay & Android Auto",
      "Level 2 & DC Fast Charging Capability",
      "Automatic Climate Control"
    ],
    "image": [
      "https://inventory-images.d2cmedia.ca/inventory/14261852/fiat-500e-front.jpg",
      "https://inventory-images.d2cmedia.ca/inventory/14261852/fiat-500e-interior.jpg"
    ],
    "offers": {
      "@type": "Offer",
      "price": 29985,
      "priceCurrency": "CAD",
      "itemCondition": "https://schema.org/NewCondition",
      "availability": "https://schema.org/InStock",
      "priceSpecification": {
        "price": 42985,
        "priceCurrency": "CAD"
      }
    }
  }
  </script>
</head>
<body>
  <h1>2026 Fiat 500e Hatchback</h1>
  <div class="specs-grid">
    <div class="spec-item"><span class="label">Condition:</span> <span class="val">New</span></div>
    <div class="spec-item"><span class="label">Model:</span> <span class="val">500e</span></div>
    <div class="spec-item"><span class="label">Trim Level:</span> <span class="val">Hatchback</span></div>
    <div class="spec-item"><span class="label">Category:</span> <span class="val">Electric</span></div>
    <div class="spec-item"><span class="label">Exterior Colour:</span> <span class="val">Tuxedo Black</span></div>
    <div class="spec-item"><span class="label">Interior Colour:</span> <span class="val">Black Recycled Fabric Seats</span></div>
    <div class="spec-item"><span class="label">Kilometers:</span> <span class="val">0 km</span></div>
    <div class="spec-item"><span class="label">Stock #:</span> <span class="val">14261852</span></div>
    <div class="spec-item"><span class="label">VIN:</span> <span class="val">ZFAFEEBT0TT142618</span></div>
    <div class="spec-item"><span class="label">Drive train:</span> <span class="val">FWD</span></div>
    <div class="spec-item"><span class="label">Transmission:</span> <span class="val">Single-Speed e-Drive</span></div>
    <div class="spec-item"><span class="label">Engine:</span> <span class="val">Electric Motor (42 kWh Battery)</span></div>
    <div class="spec-item"><span class="label">Fuel:</span> <span class="val">Electric</span></div>
    <div class="spec-item"><span class="label">Doors:</span> <span class="val">2</span></div>
    <div class="spec-item"><span class="label">Passengers:</span> <span class="val">4</span></div>
    <div class="spec-item"><span class="label">Price:</span> <span class="val">$29,985</span></div>
    <div class="spec-item"><span class="label">MSRP:</span> <span class="val">$42,985</span></div>
    <div class="spec-item"><span class="label">Fuel efficiency:</span> <span class="val"></span></div>
  </div>
</body>
</html>
`;

// Realistic HTML for 2025 Jeep Grand Cherokee L (Used, 9,557 km, Baltic Grey, Global Black Leather, Towing 2,812kg / 6,200 lbs, $58,888 / MSRP $62,956)
const cherokeeHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Used 2025 Jeep Grand Cherokee L Limited 4x4 | Ottawa St-Laurent Jeep & RAM</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Car",
    "name": "2025 Jeep Grand Cherokee L Limited 4x4",
    "vehicleModelDate": 2025,
    "brand": { "@type": "Brand", "name": "Jeep" },
    "model": "Grand Cherokee L",
    "vehicleConfiguration": "Limited 4x4",
    "category": "SUV",
    "bodyType": "SUV",
    "vehicleIdentificationNumber": "1C4RJKBG5S8140230",
    "sku": "14023046",
    "color": "Baltic Grey Metallic",
    "driveWheelConfiguration": "4x4",
    "vehicleTransmission": "8-Speed Automatic",
    "vehicleEngine": {
      "@type": "EngineSpecification",
      "name": "3.6L Pentastar VVT V6 with Stop/Start"
    },
    "fuelType": "Gasoline",
    "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 9557, "unitCode": "KMT" },
    "fuelEfficiencyCity": 13.0,
    "fuelEfficiencyHighway": 9.2,
    "towingCapacity": "2812kg",
    "amenityFeature": [
      "Capri Leatherette Seating Surfaces with Perforated Inserts",
      "3-Row 7-Passenger Seating",
      "Quadra-Trac I 4x4 System",
      "Heated 1st & 2nd Row Seats",
      "Heated Steering Wheel",
      "10.1-inch Uconnect 5 NAV",
      "Adaptive Cruise Control with Stop and Go"
    ],
    "image": [
      "https://inventory-images.d2cmedia.ca/inventory/14023046/cherokee-l-front.jpg",
      "https://inventory-images.d2cmedia.ca/inventory/14023046/cherokee-l-interior.jpg"
    ],
    "offers": {
      "@type": "Offer",
      "price": 58888,
      "priceCurrency": "CAD",
      "itemCondition": "https://schema.org/UsedCondition",
      "availability": "https://schema.org/InStock",
      "priceSpecification": {
        "price": 62956,
        "priceCurrency": "CAD"
      }
    }
  }
  </script>
</head>
<body>
  <h1>2025 Jeep Grand Cherokee L Limited 4x4</h1>
  <div class="specs-grid">
    <div class="spec-item"><span class="label">Condition:</span> <span class="val">Used</span></div>
    <div class="spec-item"><span class="label">Model:</span> <span class="val">Grand Cherokee L</span></div>
    <div class="spec-item"><span class="label">Trim Level:</span> <span class="val">Limited 4x4</span></div>
    <div class="spec-item"><span class="label">Category:</span> <span class="val">SUV</span></div>
    <div class="spec-item"><span class="label">Exterior Colour:</span> <span class="val">Baltic Grey Metallic</span></div>
    <div class="spec-item"><span class="label">Interior Colour:</span> <span class="val">Global Black Capri Leather</span></div>
    <div class="spec-item"><span class="label">Kilometers:</span> <span class="val">9,557 km</span></div>
    <div class="spec-item"><span class="label">Stock #:</span> <span class="val">14023046</span></div>
    <div class="spec-item"><span class="label">VIN:</span> <span class="val">1C4RJKBG5S8140230</span></div>
    <div class="spec-item"><span class="label">Drive train:</span> <span class="val">4x4</span></div>
    <div class="spec-item"><span class="label">Transmission:</span> <span class="val">8-Speed Automatic</span></div>
    <div class="spec-item"><span class="label">Engine:</span> <span class="val">3.6L Pentastar V6</span></div>
    <div class="spec-item"><span class="label">Towing capacity up to:</span> <span class="val">2812kg</span></div>
    <div class="spec-item"><span class="label">Doors:</span> <span class="val">4</span></div>
    <div class="spec-item"><span class="label">Passengers:</span> <span class="val">7</span></div>
    <div class="spec-item"><span class="label">Price:</span> <span class="val">$58,888</span></div>
    <div class="spec-item"><span class="label">MSRP:</span> <span class="val">$62,956</span></div>
    <div class="spec-item"><span class="label">Fuel efficiency:</span> <span class="val">City: 13.0 L/100km / Highway: 9.2 L/100km</span></div>
  </div>
</body>
</html>
`;

async function testCrawlFiatAndCherokee() {
  console.log('================================================================');
  console.log(' CRAWL & DATABASE VERIFICATION: FIAT 500E & GRAND CHEROKEE L');
  console.log('================================================================\n');

  const targets = [
    {
      url: 'https://www.ottawachryslerjeepdodge.com/new/inventory/2026-Fiat-500e-id14261852.html',
      html: fiatHtml,
      name: '2026 Fiat 500e',
    },
    {
      url: 'https://www.ottawachryslerjeepdodge.com/used/2025-Jeep-Grand_Cherokee_L-id14023046.html',
      html: cherokeeHtml,
      name: '2025 Jeep Grand Cherokee L',
    },
  ];

  for (const t of targets) {
    console.log(`\nCrawling & extracting: ${t.url}`);
    const entities = await extractPageEntities(t.html, t.url);
    console.log(`Discovered ${entities.length} entity.`);
    const normalized = entities.map((e) => normalizeVehicleRecord(e, WIDGET_ID));
    const veh = normalized[0];

    console.log(`\nExtracted Vehicle Details for [${t.name}]:`);
    console.log(`• Year/Make/Model/Trim: ${veh.year} ${veh.make} ${veh.model} ${veh.trim}`);
    console.log(`• Condition: ${veh.condition}`);
    console.log(`• Category: ${veh.category} (BodyStyle: ${veh.bodyStyle})`);
    console.log(`• Selling Price: $${veh.price} (MSRP: $${veh.msrp})`);
    console.log(`• Mileage: ${veh.mileage} km`);
    console.log(`• Stock #: ${veh.stockNumber}`);
    console.log(`• VIN: ${veh.vin}`);
    console.log(`• Drivetrain: ${veh.drivetrain}`);
    console.log(`• Transmission: ${veh.transmission}`);
    console.log(`• Engine: ${veh.engine}`);
    console.log(`• Fuel: ${veh.fuel}`);
    console.log(`• Exterior Color: ${veh.exteriorColor}`);
    console.log(`• Interior Color: ${veh.interiorColor}`);
    console.log(`• Passengers: ${veh.passengers} | Doors: ${veh.doors}`);
    console.log(`• Towing Capacity: ${veh.towingCapacity} (${veh.towingCapacityKg} kg)`);
    console.log(`• Fuel Efficiency: City ${veh.cityFuelEfficiency} / Hwy ${veh.highwayFuelEfficiency} (${veh.fuelEfficiencyUnit || 'None'})`);
    console.log(`• Images: ${veh.images.length} gallery photos`);

    console.log('Persisting to database...');
    const result = await saveVehiclesBatch(normalized);
    console.log('Batch Save Result:', result);
  }

  console.log('\n================================================================');
  console.log(' DIRECT POSTGRESQL DATABASE CONFIRMATION FOR ALL VEHICLES');
  console.log('================================================================');
  const res = await pool.query(`
    SELECT 
      condition, year, make, model, trim, category, price, msrp, mileage, 
      exterior_color, interior_color, drivetrain, transmission, engine, fuel,
      passengers, doors, towing_capacity, towing_capacity_kg, 
      city_fuel_efficiency, highway_fuel_efficiency, fuel_efficiency_unit,
      jsonb_array_length(to_jsonb(images)) as img_cnt, vin, stock_number
    FROM vehicles 
    WHERE widget_id = $1
    ORDER BY condition ASC, year DESC, price DESC;
  `, [WIDGET_ID]);

  console.table(res.rows);
  await pool.end();
}

testCrawlFiatAndCherokee().catch(console.error);
