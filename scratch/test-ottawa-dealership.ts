import { crawlWebsite } from '../src/lib/crawler';
import { safeFetch, extractPageEntities, extractJsonLd, extractSameDomainLinks } from '../src/lib/crawler/extractor';
import { discoverAndFetchPageApis, extractEntitiesFromNetworkResponses } from '../src/lib/crawler/networkExtractor';
import { detectPlatform } from '../src/lib/crawler/platform-detect';
import { searchEntities } from '../src/lib/agents/tools';

async function probeOttawaDealership() {
  const url = 'https://www.ottawachryslerjeepdodge.com/';
  console.log(`=== STEP 1: PROBING OTTAWA CHRYSLER JEEP DODGE (${url}) ===\n`);

  // 1. Detect platform
  const platform = await detectPlatform(url);
  console.log(`Detected Platform: ${platform}`);

  // 2. Fetch homepage
  console.log('\nFetching homepage HTML...');
  const res = await safeFetch(url);
  const html = res?.html || '';
  console.log(`Homepage Fetch Status: ${res?.status}`);
  console.log(`HTML Length: ${html.length} chars`);

  // Check firewall or block signatures
  const isBlocked = /d2c media's firewall|cf-browser-verification|challenge-platform|access denied|request rejected/i.test(html);
  console.log(`Firewall / WAF Blocked: ${isBlocked ? 'YES' : 'NO'}`);

  // 3. Check JSON-LD
  const jsonLd = extractJsonLd(html);
  console.log(`JSON-LD Records Found on Homepage: ${jsonLd.length}`);
  if (jsonLd.length > 0) {
    console.log('JSON-LD sample:', JSON.stringify(jsonLd.slice(0, 2), null, 2));
  }

  // 4. Check links on homepage
  const links = extractSameDomainLinks(html, url);
  console.log(`Discovered ${links.length} same-domain links on homepage:`);
  const inventoryLinks = links.filter(l => /inventory|new|used|vehicles|cars|suvs|trucks|dodge|jeep|ram|chrysler/i.test(l));
  console.log(`Inventory candidate links (${inventoryLinks.length}):`, inventoryLinks.slice(0, 15));

  // 5. Test dynamic AJAX/API discovery
  console.log('\n--- Checking dynamic AJAX/API endpoints in page HTML ---');
  const apiEntities = await discoverAndFetchPageApis(html, url);
  console.log(`Dynamic API entities found: ${apiEntities.length}`);

  // 6. Test inventory page fetch if found
  const sampleInventoryUrl = inventoryLinks.find(l => l.includes('new') || l.includes('used') || l.includes('inventory')) || `${url}new-vehicles/`;
  console.log(`\nFetching sample inventory page: ${sampleInventoryUrl}`);
  const invRes = await safeFetch(sampleInventoryUrl);
  const invHtml = invRes?.html || '';
  console.log(`Inventory Page Status: ${invRes?.status}, HTML Length: ${invHtml.length}`);

  const invJsonLd = extractJsonLd(invHtml);
  console.log(`Inventory Page JSON-LD count: ${invJsonLd.length}`);

  const invApis = await discoverAndFetchPageApis(invHtml, sampleInventoryUrl);
  console.log(`Inventory Page Dynamic APIs found: ${invApis.length}`);

  // 7. Full extraction on inventory page
  const pageEntities = await extractPageEntities(invHtml, sampleInventoryUrl);
  console.log(`Extracted ${pageEntities.length} entities from inventory page`);
  if (pageEntities.length > 0) {
    console.log('\nSample Extracted Vehicle Entity:');
    console.log(JSON.stringify(pageEntities[0], null, 2));
  }
}

probeOttawaDealership().catch(err => {
  console.error('Probe failed:', err);
});
