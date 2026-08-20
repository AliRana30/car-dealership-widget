import { safeFetch, extractPageEntities } from '../src/lib/crawler/extractor';

function extractSameDomainLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const links = new Set<string>();
  links.add(base.href);

  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const rawHref = match[1]?.trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, base.href);
      if (resolved.hostname.toLowerCase() === base.hostname.toLowerCase()) {
        const path = resolved.pathname.toLowerCase();
        // Skip static asset files
        if (!path.match(/\.(css|js|woff|woff2|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp|mp4|webm|pdf|json|xml)$/)) {
          // Normalize (strip trailing slash for deduplication)
          resolved.hash = '';
          links.add(resolved.href);
        }
      }
    } catch {}
  }

  return Array.from(links);
}

async function testNativeCrawl() {
  const startUrl = 'https://lms-e-learning-system.vercel.app';
  console.log(`Testing native link-following crawl for: ${startUrl}`);

  // 1. Fetch homepage
  const homeData = await safeFetch(startUrl);
  if (!homeData || !homeData.html) {
    console.error('Failed to fetch homepage!');
    return;
  }

  console.log(`Homepage fetched: ${homeData.html.length} bytes`);

  // 2. Discover links
  const discoveredLinks = extractSameDomainLinks(homeData.html, startUrl);
  console.log(`Discovered ${discoveredLinks.length} candidate URLs:`, discoveredLinks);

  // 3. Extract entities for each page
  for (const url of discoveredLinks) {
    const pageData = await safeFetch(url);
    if (!pageData || !pageData.html) {
      console.log(`[SKIP] Could not fetch ${url}`);
      continue;
    }

    const entities = await extractPageEntities(pageData.html, url);
    console.log(`\n--- URL: ${url} (Found ${entities.length} entities) ---`);
    entities.forEach((e, i) => {
      console.log(`  [Entity ${i + 1}] Title: "${e.title}" | Type: ${e.dataType}`);
      console.log(`  Content snippet: ${e.content.slice(0, 150)}...`);
      if (e.metadata?.images?.length) {
        console.log(`  Images:`, e.metadata.images);
      }
    });
  }
}

testNativeCrawl();
