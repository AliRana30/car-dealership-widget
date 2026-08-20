import { extractEntitiesFromNetworkResponses } from '../src/lib/crawler/networkExtractor';
import { extractPageEntities } from '../src/lib/crawler/extractor';
import { CrawlResult, NetworkResponseLog } from '../src/lib/crawl4ai/client';

async function testFullPipeline() {
  console.log('=== VERIFYING FULL MULTI-TIER EXTRACTION PIPELINE ===\n');

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

  // ── Scenario A: Dealership AJAX API Ingestion (Tier 2) ─────────────────────
  console.log('--- Scenario A: Dealership AJAX Ingestion ---');
  const dealershipNetworkLog: NetworkResponseLog[] = [
    {
      url: 'https://dealer.example.com/en/ajax/DetailsView?vid=1234',
      status: 200,
      contentType: 'application/json',
      body: {
        vehicles: [
          {
            vehicleTitle: '2024 Ford F-150 Lariat 4x4',
            price: 62990,
            vin: '1FTFW1ED8RFA98765',
            mileage: 5400,
            image: 'https://dealer.example.com/images/f150.jpg',
            year: 2024,
            make: 'Ford',
            model: 'F-150',
            trim: 'Lariat 4x4',
          },
        ],
      },
    },
  ];

  const apiEntities = extractEntitiesFromNetworkResponses(dealershipNetworkLog, 'https://dealer.example.com/inventory');
  assert(apiEntities.length === 1, 'Extracted 1 vehicle from AJAX endpoint');
  assert(apiEntities[0].title === '2024 Ford F-150 Lariat 4x4', 'Vehicle title matches');
  assert(apiEntities[0].metadata.discoveryMethod === 'api', 'Discovery method is "api"');
  assert(apiEntities[0].metadata.price === '$62,990', 'Price is correctly formatted');
  assert(apiEntities[0].metadata.vin === '1FTFW1ED8RFA98765', 'VIN is captured');
  assert(apiEntities[0].metadata.apiEndpoint === 'https://dealer.example.com/en/ajax/DetailsView?vid=1234', 'API endpoint recorded');

  // ── Scenario B: JSON-LD Dominates Over Other Signals (Tier 1) ──────────────
  console.log('\n--- Scenario B: JSON-LD Tier 1 Precedence ---');
  const jsonLdHtml = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": "Sony Alpha a7 IV Mirrorless Camera",
            "description": "Full-frame 33MP Exmor R CMOS sensor.",
            "offers": {
              "@type": "Offer",
              "price": "2498.00",
              "priceCurrency": "USD"
            }
          }
        </script>
      </head>
      <body>
        <h1>Sony Camera</h1>
      </body>
    </html>
  `;
  const jsonLdEntities = await extractPageEntities(jsonLdHtml, 'https://camerastore.com/a7iv');
  const camera = jsonLdEntities.find(e => e.title?.includes('Sony Alpha a7 IV'));
  assert(!!camera, 'Found Sony Alpha a7 IV');
  assert(camera?.metadata.discoveryMethod === 'json-ld', 'Discovery method is "json-ld"');

  // ── Scenario C: Static HTML Fallback (Tier 5) ──────────────────────────────
  console.log('\n--- Scenario C: Static HTML Fallback Tier 5 ---');
  const staticHtml = `
    <html>
      <head>
        <title>About Our Law Firm | Legal Experts</title>
        <meta name="description" content="Dedicated legal counsel for corporate and family law." />
      </head>
      <body>
        <h1>About Our Law Firm</h1>
        <p>We provide comprehensive legal representation for clients across North America.</p>
      </body>
    </html>
  `;
  const staticEntities = await extractPageEntities(staticHtml, 'https://lawfirm.example.com/about');
  assert(staticEntities.length === 1, 'Extracted 1 fallback entity');
  assert(staticEntities[0].metadata.discoveryMethod === 'html_fallback', 'Discovery method is "html_fallback"');
  assert(staticEntities[0].title.includes('About Our Law Firm'), 'Captured title');

  // ── Scenario D: Analytics Discarded ────────────────────────────────────────
  console.log('\n--- Scenario D: Analytics Discarded ---');
  const analyticsOnlyLog: NetworkResponseLog[] = [
    { url: 'https://dealer.example.com/gtag/js?id=G-123', status: 200, body: 'function(){}' },
    { url: 'https://dealer.example.com/telemetry/events', status: 200, body: [{ event: 'pageview' }] },
    { url: 'https://dealer.example.com/metrics', status: 200, body: { ram: 50 } },
  ];
  const emptyEntities = extractEntitiesFromNetworkResponses(analyticsOnlyLog, 'https://dealer.example.com/page');
  assert(emptyEntities.length === 0, 'Zero entities from analytics/telemetry traffic');

  console.log(`\n========================================`);
  console.log(`FINAL RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

testFullPipeline().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
