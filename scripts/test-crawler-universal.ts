import { extractSameDomainLinks, extractNextJsRoutes, parseRobotsTxt, fetchAllSitemapUrls, safeFetch } from '../src/lib/crawler/extractor';

async function testUniversalDiscovery() {
  console.log('====================================================');
  console.log('UNIVERSAL CRAWLER DISCOVERY VALIDATION');
  console.log('====================================================\n');

  const targets = [
    {
      name: 'Noretmy (SPA Marketplace)',
      url: 'https://noretmy.vercel.app/',
      expectedSections: ['services', 'freelancers', 'about', 'contact', 'login', 'signup'],
    },
    {
      name: 'LMS (E-Learning System)',
      url: 'https://lms-e-learning-system.vercel.app/',
      expectedSections: ['courses', 'about', 'contact', 'login', 'register'],
    },
    {
      name: 'Next.js Docs (Documentation site)',
      url: 'https://nextjs.org/docs',
      expectedSections: ['getting-started', 'app', 'pages'],
    }
  ];

  for (const target of targets) {
    console.log(`\n----------------------------------------------------`);
    console.log(`TARGET: ${target.name} (${target.url})`);
    console.log(`----------------------------------------------------`);

    const t0 = Date.now();
    const homeData = await safeFetch(target.url);
    if (!homeData?.html) {
      console.log(`❌ Failed to fetch homepage for ${target.name}`);
      continue;
    }

    console.log(`Homepage fetched: ${homeData.html.length} bytes (HTTP ${homeData.status})`);

    // 1. Robots.txt
    const origin = new URL(target.url).origin;
    const robots = await parseRobotsTxt(origin);
    console.log(`Robots.txt: ${robots.sitemapUrls.length} sitemaps, ${robots.hintPaths.length} hint paths`);

    // 2. Sitemaps
    const sitemapUrls = await fetchAllSitemapUrls(origin, target.url, 2);
    console.log(`Sitemaps discovered: ${sitemapUrls.length} URLs`);

    // 3. Homepage links
    const homeLinks = extractSameDomainLinks(homeData.html, target.url);
    console.log(`Homepage links discovered: ${homeLinks.length} URLs`);

    // 4. Next.js routes
    const nextRoutes = await extractNextJsRoutes(homeData.html, target.url);
    console.log(`Next.js routes discovered: ${nextRoutes.length} URLs`);

    // Combined unique discovered routes
    const allDiscovered = Array.from(new Set([
      ...homeLinks,
      ...nextRoutes,
      ...sitemapUrls,
      ...robots.hintPaths.map(p => `${origin}${p}`)
    ]));

    console.log(`\nTotal Discovered URLs (${allDiscovered.length}):`);
    allDiscovered.slice(0, 20).forEach(u => console.log(`  - ${u}`));
    if (allDiscovered.length > 20) {
      console.log(`  ... and ${allDiscovered.length - 20} more`);
    }

    // Check expected sections
    console.log(`\nRoute Verification:`);
    let matchedCount = 0;
    for (const expected of target.expectedSections) {
      const found = allDiscovered.some(u => u.toLowerCase().includes(expected));
      if (found) {
        console.log(`  ✅ Found section: "${expected}"`);
        matchedCount++;
      } else {
        console.log(`  ⚠️ Missing section: "${expected}"`);
      }
    }

    const passStatus = matchedCount >= Math.ceil(target.expectedSections.length * 0.5) ? 'PASS' : 'PARTIAL';
    console.log(`\nResult for ${target.name}: [${passStatus}] (${matchedCount}/${target.expectedSections.length} expected sections found in ${Date.now() - t0}ms)`);
  }
}

testUniversalDiscovery().catch(console.error);
