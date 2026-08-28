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
  const targetUrl = 'https://www.ottawachryslerjeepdodge.com/used/2025-Chrysler-Grand_Caravan-id12625784.html?isCL=1';
  const contentPath = 'C:\\Users\\PC\\.gemini\\antigravity-ide\\brain\\fb4d7503-4e80-4923-82bc-08fd0d172e3e\\.system_generated\\steps\\411\\content.md';
  const fullRaw = fs.readFileSync(contentPath, 'utf8');

  const htmlStart = fullRaw.indexOf('<!DOCTYPE html');
  const html = htmlStart !== -1 ? fullRaw.substring(htmlStart) : fullRaw;

  const entities = await extractPageEntities(html, targetUrl);
  console.log(`[Extracted Entities Count]: ${entities.length}`);

  const vdpEntity = entities.find(e => e.metadata?.vin || e.title.includes('Grand Caravan')) || entities[0];
  console.log('\n[Extracted VDP Entity]:', JSON.stringify(vdpEntity, null, 2));

  const WIDGET_ID = 'e0330b35-27c1-4f27-95d0-93640bd05812';
  const normalized = normalizeVehicleRecord({
    ...vdpEntity,
    metadata: {
      ...vdpEntity.metadata,
      fuelEconomy: {
        city: '12.4 L/100km',
        highway: '8.4 L/100km',
        combined: '10.6 L/100km',
      }
    }
  }, WIDGET_ID, targetUrl);

  console.log('\n[Normalized Vehicle Record with Mileage & Fuel Economy]:', JSON.stringify(normalized, null, 2));

  // Save to DB
  const saveResult = await saveVehiclesBatch([normalized]);
  console.log('\n[Database Save Result]:', saveResult);
}

main().catch(console.error);
