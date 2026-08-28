import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
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

import { extractPageEntities } from '../src/lib/crawler/extractor';
import { normalizeVehicleRecord, saveVehiclesBatch, computeVehicleContentHash } from '../src/lib/vehicles/types';

async function main() {
  const targetUrl = 'https://www.ottawachryslerjeepdodge.com/used/2025-Hyundai-Elantra-id14056790.html?seny_resume=92adc58b-7c7f-4a09-9e7c-c4574064a952';
  const WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';

  // Read already-fetched HTML (same approach as Grand Caravan)
  const contentPath = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\fb4d7503-4e80-4923-82bc-08fd0d172e3e\\.system_generated\\steps\\511\\content.md';
  const fullRaw = fs.readFileSync(contentPath, 'utf8');
  const htmlStart = fullRaw.indexOf('<!DOCTYPE html');
  const html = htmlStart !== -1 ? fullRaw.substring(htmlStart) : fullRaw;

  console.log(`[HTML size]: ${html.length} chars`);

  // --- Extract hidden D2C Media inputs (like Grand Caravan) ---
  const hiddenInputs: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]+type=["']hidden["'][^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["'][^>]*>/gi)) {
    hiddenInputs[m[1]] = m[2];
  }
  console.log('\n[D2C Hidden Inputs]:', JSON.stringify({
    make: hiddenInputs.make,
    model: hiddenInputs.model,
    year: hiddenInputs.year,
    vin: hiddenInputs.vin,
    trim: hiddenInputs.trim,
    displayedPrice: hiddenInputs.displayedPrice,
    status: hiddenInputs.status,
    extColor: hiddenInputs.extColor,
    intColor: hiddenInputs.intColor,
    transmission: hiddenInputs.transmission,
    fuelType: hiddenInputs.fuelType,
    driveTrain: hiddenInputs.driveTrain,
    engine: hiddenInputs.engine,
    vehicleCategory: hiddenInputs.vehicleCategory,
    dealer_name: hiddenInputs.dealer_name,
  }, null, 2));

  // --- Extract window.__vdpJSON ---
  const vdpMatch = html.match(/window\.__vdpJSON\s*=\s*(\{[\s\S]*?)\s*;\s*(?:}catch|\/\/|<\/script>)/i)
    || html.match(/window\.__vdpJSON\s*=\s*(\{[\s\S]*?\})\s*;/i);
  let vdpJson: any = null;
  if (vdpMatch) {
    try {
      vdpJson = JSON.parse(vdpMatch[1]);
      console.log('\n[window.__vdpJSON found ✓]:', {
        id: vdpJson.id,
        sn: vdpJson.sn,
        niv: vdpJson.niv,
        make: vdpJson.make?.basic,
        model: vdpJson.model?.basic,
        year: vdpJson.year,
        trim: vdpJson.version?.full,
        km: vdpJson.km,
        miles: vdpJson.miles,
        price: vdpJson.prices?.price,
        avgPrice: vdpJson.prices?.avgPrice,
        extColor: vdpJson.color?.exteriorOrig,
        intColor: vdpJson.color?.interiorOrig,
        engine: vdpJson.engine,
        transmission: vdpJson.transmission,
        fuel: vdpJson.fueltype,
        drivetrain: vdpJson.drivetrain,
        bodytype: vdpJson.bodytype,
        optionRaw: vdpJson.optionRaw,
        calcWeekly: vdpJson.calculator?.amount,
        calcRate: vdpJson.calculator?.interestRate,
      });
    } catch { console.log('[!] Failed to parse window.__vdpJSON'); }
  } else {
    console.log('[!] window.__vdpJSON not found - checking specs block...');
  }

  // --- Extract image gallery URLs ---
  const imgMatches = Array.from(html.matchAll(/https:\/\/imagescdn\.d2cmedia\.ca\/[^\s"']+\.jpg/gi)).map(m => m[0]);
  const uniqueImages = Array.from(new Set(imgMatches));
  console.log(`\n[Gallery Images]: ${uniqueImages.length} found`);
  console.log(uniqueImages.slice(0, 5));

  // --- Extract specs block fields ---
  const specsFields: Record<string, string> = {};
  for (const [field, regex] of [
    ['specsKM', /"specsKM":\["([^"]+)"/],
    ['specsExtColor', /"specsExtColor":\["([^"]+)"/],
    ['specsVin', /"specsVin":\["([^"]+)"/],
    ['specsNoStock', /"specsNoStock":\["([^"]+)"/],
    ['specsTransmission', /"specsTransmission":\["([^"]+)"/],
    ['specsFuel', /"specsFuel":\["([^"]+)"/],
    ['specsPrice', /"specsPrice":\["([^"]+)"/],
    ['specsBodyType', /"specsBodyType":\["([^"]+)"/],
    ['specsVersion', /"specsVersion":\["([^"]+)"/],
    ['specsModel', /"specsModel":\["([^"]+)"/],
  ] as [string, RegExp][]) {
    const m = html.match(regex);
    if (m) specsFields[field] = m[1];
  }
  console.log('\n[Specs Block Fields]:', specsFields);

  // --- Run project extractor pipeline (same as Grand Caravan) ---
  console.log('\n[Running project extractor pipeline...]');
  const entities = await extractPageEntities(html, targetUrl);
  console.log(`[Entities found]: ${entities.length}`);

  const vehicleEntity = entities.find(e =>
    e.metadata?.vin || e.title?.toLowerCase().includes('elantra') || e.title?.toLowerCase().includes('hyundai')
  ) || entities[0];

  if (!vehicleEntity) { console.log('[ERROR] No entity found'); return; }

  // Merge all extracted data
  const rawRecord = {
    ...vehicleEntity,
    imageUrls: uniqueImages,
    metadata: {
      ...vehicleEntity.metadata,
      ...hiddenInputs,
      vin: vdpJson?.niv || hiddenInputs.vin || vehicleEntity.metadata?.vin,
      stockNumber: vdpJson?.sn || hiddenInputs.popupstocknumber || specsFields.specsNoStock,
      make: vdpJson?.make?.basic || hiddenInputs.make,
      model: vdpJson?.model?.basic || hiddenInputs.model,
      year: parseInt(vdpJson?.year || hiddenInputs.year || '2025', 10),
      trim: vdpJson?.version?.full || hiddenInputs.trim,
      price: parseFloat(vdpJson?.prices?.priceInteger || hiddenInputs.displayedPrice || '27495'),
      msrp: parseFloat(vdpJson?.prices?.avgPrice?.replace(/[^0-9.]/g, '') || '0') || undefined,
      currency: 'CAD',
      condition: 'used',
      exteriorColor: vdpJson?.color?.exteriorOrig || hiddenInputs.extColor || specsFields.specsExtColor,
      interiorColor: vdpJson?.color?.interiorOrig || hiddenInputs.intColor || '',
      transmission: vdpJson?.transmission || hiddenInputs.transmission || specsFields.specsTransmission,
      fuel: vdpJson?.fueltype || hiddenInputs.fuelType || specsFields.specsFuel,
      bodyStyle: vdpJson?.bodytype || hiddenInputs.vehicleCategory || specsFields.specsBodyType,
      drivetrain: vdpJson?.drivetrain || hiddenInputs.driveTrain || '',
      engine: (vdpJson?.engine && vdpJson.engine !== 'N.A.') ? vdpJson.engine : undefined,
      images: uniqueImages,
      vdpUrl: targetUrl,
      dealerName: hiddenInputs.dealer_name || 'Ottawa St-Laurent Jeep and RAM',
      dealerAddress: '900 St. Laurent Blvd, Ottawa, ON, K1K 3B3',
      optionRaw: vdpJson?.optionRaw,
      financing: vdpJson?.calculator ? {
        weeklyPayment: vdpJson.calculator.amount,
        frequency: vdpJson.calculator.frequency,
        interestRate: vdpJson.calculator.interestRate,
        term: vdpJson.calculator.currentTerm,
      } : undefined,
      averageMarketPrice: vdpJson?.prices?.avgPrice,
    }
  };

  const normalized = normalizeVehicleRecord(rawRecord, WIDGET_ID, targetUrl);

  console.log('\n[=== FINAL NORMALIZED VEHICLE ===]');
  console.log(JSON.stringify(normalized, null, 2));
  console.log('\n[Content Hash]:', computeVehicleContentHash(normalized));

  console.log('\n[Saving to Supabase...]');
  const saveResult = await saveVehiclesBatch([normalized]);
  console.log('[Save Result]:', saveResult);
}

main().catch(console.error);
