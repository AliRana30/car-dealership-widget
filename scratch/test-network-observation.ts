import {
  extractEntitiesFromNetworkResponses,
  isTrackingOrTelemetryUrl,
  discoverAndFetchPageApis,
} from '../src/lib/crawler/networkExtractor';
import { extractPageEntities } from '../src/lib/crawler/extractor';
import { NetworkResponseLog } from '../src/lib/crawl4ai/client';

async function runTests() {
  console.log('=== RUNNING NETWORK OBSERVATION & API INGESTION TEST SUITE ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // ── Test 1: Tracking & Telemetry Filter ────────────────────────────────────
  console.log('--- Test 1: Tracking & Telemetry URL Filter ---');
  assert(isTrackingOrTelemetryUrl('https://www.google-analytics.com/g/collect?v=2'), 'Identifies Google Analytics');
  assert(isTrackingOrTelemetryUrl('https://o12345.ingest.sentry.io/api/123/envelope/'), 'Identifies Sentry ingest');
  assert(isTrackingOrTelemetryUrl('https://api.segment.io/v1/p'), 'Identifies Segment tracking');
  assert(isTrackingOrTelemetryUrl('https://dealership.com/telemetry/v1'), 'Identifies internal telemetry');
  assert(!isTrackingOrTelemetryUrl('https://dealership.com/en/ajax/DetailsView?vid=101'), 'Allows legitimate AJAX inventory endpoint');
  assert(!isTrackingOrTelemetryUrl('https://store.com/api/products?category=suv'), 'Allows legitimate products API endpoint');

  // ── Test 2: Dealership AJAX Inventory Parsing ──────────────────────────────
  console.log('\n--- Test 2: Dealership AJAX Inventory Response Extraction ---');
  const dealershipNetworkResponses: NetworkResponseLog[] = [
    // 1. Google analytics call (should be ignored)
    {
      url: 'https://www.google-analytics.com/g/collect?v=2',
      status: 200,
      body: { status: 'ok' },
    },
    // 2. Dealership AJAX inventory call
    {
      url: 'https://www.sampledealer.com/en/ajax/DetailsView?vid=90210',
      status: 200,
      contentType: 'application/json',
      body: {
        vehicles: [
          {
            vehicleTitle: '2024 Toyota RAV4 XLE AWD',
            year: 2024,
            make: 'Toyota',
            model: 'RAV4',
            trim: 'XLE AWD',
            vin: '4T3B1RFV5RU123456',
            sku: 'STK-90210',
            price: 34995,
            mileage: 12500,
            image: 'https://www.sampledealer.com/media/rav4-front.jpg',
            images: [
              'https://www.sampledealer.com/media/rav4-front.jpg',
              'https://www.sampledealer.com/media/rav4-interior.jpg',
            ],
            description: 'One owner, clean Carfax, heated seats and sunroof with AWD.',
            url: 'https://www.sampledealer.com/vehicles/2024-toyota-rav4-xle-awd',
          },
          {
            vehicleTitle: '2023 Honda CR-V EX-L',
            year: 2023,
            make: 'Honda',
            model: 'CR-V',
            trim: 'EX-L',
            vin: '7FARW2H85PE654321',
            sku: 'STK-88123',
            price: 31500,
            mileage: 24000,
            image: 'https://www.sampledealer.com/media/crv-front.jpg',
            description: 'Leather interior, Apple CarPlay, excellent condition.',
            url: 'https://www.sampledealer.com/vehicles/2023-honda-crv-ex-l',
          },
        ],
      },
    },
  ];

  const dealershipEntities = extractEntitiesFromNetworkResponses(
    dealershipNetworkResponses,
    'https://www.sampledealer.com/inventory'
  );

  assert(dealershipEntities.length === 2, `Extracted 2 vehicle entities (found ${dealershipEntities.length})`);
  
  const rav4 = dealershipEntities.find(e => e.title?.includes('Toyota RAV4'));
  assert(!!rav4, 'Found Toyota RAV4 entity');
  assert(rav4?.metadata?.discoveryMethod === 'api', 'Discovery method is strictly "api"');
  assert(rav4?.metadata?.vin === '4T3B1RFV5RU123456', 'Captured VIN correctly');
  assert(rav4?.metadata?.price === '$34,995', `Formatted price correctly ($34,995 vs ${rav4?.metadata?.price})`);
  assert(rav4?.metadata?.mileage === 12500, 'Captured mileage');
  assert(Array.isArray(rav4?.metadata?.images) && rav4.metadata.images.length === 2, 'Extracted image array');
  assert(Boolean(rav4?.content.includes('Price: $34,995')), 'Included price in search-indexed content');
  assert(Boolean(rav4?.content.includes('VIN: 4T3B1RFV5RU123456')), 'Included VIN in search-indexed content');

  // ── Test 3: E-Commerce Nested Products Envelope ────────────────────────────
  console.log('\n--- Test 3: Nested Products Envelope Extraction ---');
  const storeNetworkResponses: NetworkResponseLog[] = [
    {
      url: 'https://store.example.com/api/v2/catalog/items',
      status: 200,
      contentType: 'application/json',
      body: {
        results: [
          {
            name: 'Wireless Noise-Cancelling Headphones Pro',
            price: 299.99,
            description: 'Flagship wireless headphones with 40-hour battery life.',
            imageUrl: 'https://store.example.com/images/headphones.jpg',
            sku: 'AUDIO-PRO-99',
            category: 'Electronics',
            rating: 4.8,
            reviews: 142,
          },
        ],
      },
    },
  ];

  const storeEntities = extractEntitiesFromNetworkResponses(
    storeNetworkResponses,
    'https://store.example.com/products'
  );

  assert(storeEntities.length === 1, 'Extracted product from results envelope');
  assert(storeEntities[0].title === 'Wireless Noise-Cancelling Headphones Pro', 'Correct product title');
  assert(storeEntities[0].metadata.discoveryMethod === 'api', 'Discovery method is "api"');
  assert(storeEntities[0].metadata.price === '$299.99', 'Price is $299.99');
  assert(storeEntities[0].metadata.sku === 'AUDIO-PRO-99', 'SKU is AUDIO-PRO-99');

  // ── Test 4: Cross-Origin Filtering ─────────────────────────────────────────
  console.log('\n--- Test 4: Cross-Domain / Third-Party Isolation ---');
  const crossDomainResponses: NetworkResponseLog[] = [
    {
      url: 'https://malicious-or-unrelated.com/api/items',
      status: 200,
      body: [{ name: 'Fake Item', price: 10 }],
    },
  ];
  const crossEntities = extractEntitiesFromNetworkResponses(
    crossDomainResponses,
    'https://mycleanstore.com/shop'
  );
  assert(crossEntities.length === 0, 'Safely discarded non-same-origin API response');

  // ── Test 5: Multi-Tier Extractor Integration ───────────────────────────────
  console.log('\n--- Test 5: Multi-Tier Extractor Integration on Page ---');
  const samplePageHtmlWithJsonLd = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Premium Dealership</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": "2024 Porsche 911 Carrera",
            "description": "Twin-turbo 3.0L boxer 6 engine, 379 hp.",
            "offers": {
              "@type": "Offer",
              "price": "114400",
              "priceCurrency": "USD",
              "availability": "https://schema.org/InStock"
            }
          }
        </script>
      </head>
      <body>
        <h1>Welcome to Porsche Center</h1>
      </body>
    </html>
  `;

  const extracted = await extractPageEntities(samplePageHtmlWithJsonLd, 'https://porsche-dealer.com');
  const porsche = extracted.find(e => e.title?.includes('Porsche 911'));
  assert(!!porsche, 'Extracted Porsche 911 via JSON-LD');
  assert(porsche?.metadata?.discoveryMethod === 'json-ld', 'JSON-LD tagged with discoveryMethod "json-ld"');

  console.log(`\n========================================`);
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
