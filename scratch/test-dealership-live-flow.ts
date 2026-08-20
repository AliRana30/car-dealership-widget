import { createClient } from '@supabase/supabase-js';
import { extractEntitiesFromNetworkResponses } from '../src/lib/crawler/networkExtractor';
import { executeAgentTool, searchEntities, getEntityDetails } from '../src/lib/agents/tools';
import { NetworkResponseLog } from '../src/lib/crawl4ai/client';

import crypto from 'crypto';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

async function testDealershipFlow() {
  console.log('=== VERIFYING OTTAWA CHRYSLER JEEP DODGE CRAWLER & AGENT WORKFLOW ===\n');

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, desc: string) {
    if (cond) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      failed++;
    }
  }

  const supabase = getSupabase();
  const { data: realWidget } = await supabase.from('widgets').select('id').limit(1).maybeSingle();
  const testWidgetId = realWidget?.id || '00000000-0000-0000-0000-000000000000';
  const baseUrl = 'https://www.ottawachryslerjeepdodge.com';

  console.log('1. Simulating D2C Media Network AJAX Ingestion for Ottawa Chrysler Jeep Dodge...');
  
  const d2cNetworkLogs: NetworkResponseLog[] = [
    {
      url: `${baseUrl}/en/ajax/DetailsView?vid=987123`,
      status: 200,
      contentType: 'application/json',
      body: {
        vehicles: [
          {
            vehicleTitle: '2024 Jeep Grand Cherokee L Limited 4x4',
            price: 64995,
            vin: '1C4RJGBG5RC123456',
            mileage: 12,
            year: 2024,
            make: 'Jeep',
            model: 'Grand Cherokee L',
            trim: 'Limited 4x4',
            engine: '3.6L Pentastar V6',
            transmission: '8-Speed Automatic',
            fuelType: 'Gasoline',
            color: 'Diamond Black Crystal Pearl',
            images: [
              'https://images.d2cmedia.ca/inventory/2024-jeep-grand-cherokee-l-front.jpg',
              'https://images.d2cmedia.ca/inventory/2024-jeep-grand-cherokee-l-side.jpg',
              'https://images.d2cmedia.ca/inventory/2024-jeep-grand-cherokee-l-interior.jpg',
            ],
            url: `${baseUrl}/new-vehicles/2024-jeep-grand-cherokee-l-limited-4x4/`,
            description: 'New 2024 Jeep Grand Cherokee L Limited with Capri leather seats, Uconnect 5 10.1-inch display, adaptive cruise control, and Quadra-Trac I 4WD.',
          },
          {
            vehicleTitle: '2024 Jeep Wrangler 4xe Rubicon',
            price: 77490,
            vin: '1C4JJXR67RW654321',
            mileage: 8,
            year: 2024,
            make: 'Jeep',
            model: 'Wrangler 4xe',
            trim: 'Rubicon',
            engine: '2.0L Turbo I4 PHEV',
            transmission: '8-Speed Automatic',
            fuelType: 'Plug-in Hybrid',
            color: 'Hydro Blue Pearl',
            images: [
              'https://images.d2cmedia.ca/inventory/2024-wrangler-4xe-front.jpg',
              'https://images.d2cmedia.ca/inventory/2024-wrangler-4xe-rear.jpg',
            ],
            url: `${baseUrl}/new-vehicles/2024-jeep-wrangler-4xe-rubicon/`,
            description: 'Plug-in hybrid Jeep Wrangler Rubicon featuring 375 hp, 470 lb-ft torque, Tru-Lok front/rear lockers, and Rock-Trac 4x4.',
          },
          {
            vehicleTitle: '2024 Ram 1500 Big Horn Crew Cab 4x4',
            price: 58995,
            vin: '1C6SRFFT8RN789012',
            mileage: 15,
            year: 2024,
            make: 'Ram',
            model: '1500',
            trim: 'Big Horn Crew Cab 4x4',
            engine: '5.7L HEMI V8 with eTorque',
            transmission: '8-Speed Automatic',
            fuelType: 'Gasoline',
            color: 'Billet Silver Metallic',
            images: [
              'https://images.d2cmedia.ca/inventory/2024-ram-1500-front.jpg',
              'https://images.d2cmedia.ca/inventory/2024-ram-1500-bed.jpg',
            ],
            url: `${baseUrl}/new-vehicles/2024-ram-1500-big-horn/`,
            description: 'New 2024 Ram 1500 with legendary 5.7L HEMI V8 eTorque engine, 12-inch touchscreen, Class IV receiver hitch, and Level 2 equipment group.',
          },
          {
            vehicleTitle: '2024 Dodge Durango R/T AWD',
            price: 71295,
            vin: '1C4SDJCT4RC345678',
            mileage: 20,
            year: 2024,
            make: 'Dodge',
            model: 'Durango',
            trim: 'R/T AWD',
            engine: '5.7L HEMI V8',
            transmission: '8-Speed Automatic',
            fuelType: 'Gasoline',
            color: 'Destroyer Gray',
            images: [
              'https://images.d2cmedia.ca/inventory/2024-durango-rt-front.jpg',
            ],
            url: `${baseUrl}/new-vehicles/2024-dodge-durango-rt/`,
            description: 'High-performance 3-row muscle SUV with 360 hp HEMI V8, performance hood, sport suspension, and towing capacity up to 8,700 lbs.',
          },
        ],
      },
    },
  ];

  // Extract entities using network extractor
  const extractedEntities = extractEntitiesFromNetworkResponses(d2cNetworkLogs, `${baseUrl}/inventory`);
  assert(extractedEntities.length === 4, `Extracted ${extractedEntities.length}/4 dealership vehicles from network API`);

  console.log('\n2. Verifying Vehicle Entity Shapes...');
  const grandCherokee = extractedEntities.find(e => e.title?.includes('Grand Cherokee'));
  assert(!!grandCherokee, 'Found Grand Cherokee entity');
  assert(grandCherokee?.metadata?.discoveryMethod === 'api', 'Discovery method is "api"');
  assert(grandCherokee?.metadata?.price === '$64,995', 'Formatted price is $64,995');
  assert(grandCherokee?.metadata?.vin === '1C4RJGBG5RC123456', 'VIN is 1C4RJGBG5RC123456');
  assert(grandCherokee?.metadata?.mileage === 12, 'Mileage is 12');
  assert(grandCherokee?.metadata?.engine === '3.6L Pentastar V6', 'Engine is 3.6L Pentastar V6');
  assert(grandCherokee?.metadata?.images?.length === 3, 'Captured 3 photo gallery image URLs');
  assert(grandCherokee?.url === `${baseUrl}/new-vehicles/2024-jeep-grand-cherokee-l-limited-4x4/`, 'Correct car details page hyperlink');

  console.log('\n3. Inserting Dealership Records into Knowledge Base for Widget...');
  const rowsToInsert = extractedEntities.map(e => ({
    widget_id: testWidgetId,
    title: e.title,
    content: e.content,
    short_description: (e.metadata?.description as string) || e.content?.substring(0, 300) || '',
    source_url: e.url,
    data_type: 'crawl',
    entity_type: 'product',
    image_urls: e.metadata.images || [],
    metadata: e.metadata,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from('website_data')
    .insert(rowsToInsert)
    .select('id, title, source_url');

  if (insertError) {
    console.error('Failed to insert test rows:', insertError);
    process.exit(1);
  }
  assert(insertedRows?.length === 4, `Successfully seeded ${insertedRows?.length} car records in website_data`);

  console.log('\n4. Testing Voice/Chat Agent Search Query: "Jeep inventory"...');
  const searchToolResult = await executeAgentTool(testWidgetId, 'search_entities', { query: 'Jeep' });
  assert(searchToolResult.success === true, 'search_entities returned success: true');
  assert(searchToolResult.data.results.length >= 2, `search_entities returned ${searchToolResult.data.results.length} Jeep results`);
  
  const topJeep = searchToolResult.data.results[0];
  console.log(`Top match: "${topJeep.title}" - Price: ${topJeep.price} - Link: ${topJeep.sourceUrl}`);
  assert(Boolean(topJeep.sourceUrl && topJeep.sourceUrl.startsWith('https://')), 'Vehicle result contains valid details URL for hyperlink');
  assert(Array.isArray(topJeep.images) && topJeep.images.length > 0, 'Vehicle result contains image thumbnails for car card');

  console.log('\n5. Testing Voice/Chat Agent Detail Inspection: "Ram 1500"...');
  const ramRow = insertedRows?.find(r => r.title.includes('Ram 1500'));
  if (ramRow) {
    const detailResult = await executeAgentTool(testWidgetId, 'get_entity_details', { entityId: ramRow.id });
    assert(detailResult.success === true, 'get_entity_details returned success: true');
    assert(detailResult.data.title.includes('Ram 1500'), 'Retrieved exact Ram 1500 details');
    assert(detailResult.data.metadata.vin === '1C6SRFFT8RN789012', 'Verified Ram VIN');
    assert(detailResult.data.metadata.engine === '5.7L HEMI V8 with eTorque', 'Verified Ram HEMI engine specs');
    assert(detailResult.data.price === '$58,995', 'Verified Ram price $58,995');
  }

  console.log('\n6. Testing Agent Navigation Signal to Car Details Page...');
  const durangoRow = insertedRows?.find(r => r.title.includes('Durango'));
  if (durangoRow) {
    const navResult = await executeAgentTool(
      testWidgetId,
      'navigate_to_entity',
      { entityId: durangoRow.id },
      { sessionId: 'test_session_dealership_123', allowAgentNavigation: true }
    );
    assert(navResult.success === true, 'navigate_to_entity executed successfully');
    assert(navResult.data.url.includes('2024-dodge-durango-rt'), 'Target URL points to Dodge Durango detail page');
    assert(navResult.data.url.includes('widget_resume=test_session_dealership_123'), 'Target URL contains widget_resume session state token for seamless voice persistence');
    console.log(`Navigation Target URL: ${navResult.data.url}`);
  }

  console.log('\n7. Cleaning up test rows...');
  const insertedIds = (insertedRows || []).map(r => r.id);
  if (insertedIds.length > 0) {
    await supabase.from('website_data').delete().in('id', insertedIds);
  }
  console.log('Cleaned up test data.');

  console.log(`\n========================================`);
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
  process.exit(0);
}

testDealershipFlow().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
