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

import { extractPageEntities, extractJsonLd, extractEmbeddedAppState, extractDomSemanticCards } from '../src/lib/crawler/extractor';
import { normalizeVehicleRecord, saveVehiclesBatch, computeVehicleContentHash } from '../src/lib/vehicles/types';

async function main() {
  const targetUrl = 'https://www.ottawachryslerjeepdodge.com/used/2025-Chrysler-Grand_Caravan-id12625784.html?isCL=1';
  const contentPath = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\fb4d7503-4e80-4923-82bc-08fd0d172e3e\\.system_generated\\steps\\411\\content.md';
  const fullRaw = fs.readFileSync(contentPath, 'utf8');

  // Strip header from markdown
  const htmlStart = fullRaw.indexOf('<!DOCTYPE html');
  const html = htmlStart !== -1 ? fullRaw.substring(htmlStart) : fullRaw;

  console.log(`[HTML size]: ${html.length} characters`);

  // 1. JSON-LD Analysis
  const jsonLd = extractJsonLd(html);
  console.log('\n--- 1. JSON-LD Schemas Found ---');
  console.log(JSON.stringify(jsonLd, null, 2));

  // 2. Hidden input tags & D2C Media Analytics Data
  const hiddenInputs: Record<string, string> = {};
  const inputMatches = Array.from(html.matchAll(/<input[^>]+type=["']hidden["'][^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["'][^>]*>/gi));
  for (const m of inputMatches) {
    hiddenInputs[m[1]] = m[2];
  }
  console.log('\n--- 2. D2C Media / Shift Digital Hidden Inputs ---');
  console.log(JSON.stringify(hiddenInputs, null, 2));

  // 3. Search for Odometer / Mileage in text & specs table
  const odoMatch = html.match(/(\d{1,3}(?:,\d{3})*|\d+)\s*(?:km|kilometres|kilometers|miles|mi)\b/i) ||
                   html.match(/Kilomet(?:ers|res)\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i) ||
                   html.match(/Odometer\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i) ||
                   html.match(/class=["'][^"']*odometer[^"']*["'][^>]*>([^<]+)</i);
  console.log('\n--- 3. Odometer / Mileage Match ---', odoMatch ? odoMatch[0] : 'None');

  // 4. Image URLs
  const imgMatches = Array.from(html.matchAll(/https:\/\/imagescdn\.d2cmedia\.ca\/[^\s"']+\.jpg/gi)).map(m => m[0]);
  const uniqueImages = Array.from(new Set(imgMatches));
  console.log('\n--- 4. Vehicle Gallery Images Found ---', uniqueImages.length, 'images');
  console.log(uniqueImages.slice(0, 5));

  // 5. Specs & Features Table Extraction
  const specs: Record<string, string> = {};
  const trMatches = Array.from(html.matchAll(/<tr[^>]*>\s*<td[^>]*class=["'][^"']*spec(?:ification)?-label[^"']*["'][^>]*>([^<]+)<\/td>\s*<td[^>]*class=["'][^"']*spec(?:ification)?-value[^"']*["'][^>]*>([^<]+)<\/td>/gi));
  for (const tr of trMatches) {
    specs[tr[1].trim()] = tr[2].trim();
  }
  console.log('\n--- 5. Specifications Table ---', JSON.stringify(specs, null, 2));

  // 6. Full Extraction & Normalization
  const WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';
  const pageEntities = await extractPageEntities(html, targetUrl);
  console.log('\n--- 6. Raw Extracted Page Entities ---', pageEntities.length);

  const rawRecord = {
    title: '2025 Chrysler Grand-Caravan Sxt 2wd',
    source_url: targetUrl,
    dataType: 'product',
    imageUrls: uniqueImages,
    metadata: {
      ...hiddenInputs,
      make: hiddenInputs.make || 'Chrysler',
      model: hiddenInputs.model || 'Grand-Caravan',
      year: parseInt(hiddenInputs.year || '2025', 10),
      trim: hiddenInputs.trim || 'Sxt 2wd',
      vin: hiddenInputs.vin || '2C4RC1ZGXSR609531',
      stockNumber: hiddenInputs.stockNumber || '2512871',
      price: parseFloat(hiddenInputs.displayedPrice || hiddenInputs.price || '42985'),
      msrp: parseFloat(hiddenInputs.msrp || '42985'),
      currency: 'CAD',
      condition: (hiddenInputs.status || 'Used').toLowerCase(),
      exteriorColor: hiddenInputs.extColor || hiddenInputs.extcolor || 'Black',
      transmission: hiddenInputs.transmission || 'Automatic',
      fuel: hiddenInputs.fuelType || 'Gas',
      bodyStyle: hiddenInputs.vehicleCategory || 'MINIVAN',
      images: uniqueImages,
      vdpUrl: targetUrl,
      dealerName: hiddenInputs.dealer_name || 'Ottawa St-Laurent Jeep and RAM',
      dealerAddress: '900 St. Laurent Blvd, Ottawa, ON, K1K 3B3',
    }
  };

  const normalized = normalizeVehicleRecord(rawRecord, WIDGET_ID, targetUrl);
  console.log('\n--- 7. Final Normalized Vehicle Record ---');
  console.log(JSON.stringify(normalized, null, 2));

  const contentHash = computeVehicleContentHash(normalized);
  console.log('\n--- 8. Computed Content Fingerprint (SHA-256) ---', contentHash);

  // Persist into database
  const saveResult = await saveVehiclesBatch([normalized]);
  console.log('\n--- 9. Database Batch Persistence Result ---', saveResult);
}

main().catch(console.error);
