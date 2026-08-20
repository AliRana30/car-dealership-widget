async function testLMS() {
  const targetUrl = 'https://lms-e-learning-system.vercel.app';
  console.log(`\n--- 1. Testing Sitemap at ${targetUrl}/sitemap.xml ---`);
  try {
    const sitemapRes = await fetch(`${targetUrl}/sitemap.xml`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FrontDeskBot/1.0; +https://front-desk-seven.vercel.app)',
      },
    });
    console.log(`Sitemap HTTP Status: ${sitemapRes.status} ${sitemapRes.statusText}`);
    const sitemapText = await sitemapRes.text();
    console.log(`Sitemap Length: ${sitemapText.length} bytes`);
    console.log(`Sitemap Preview: ${sitemapText.slice(0, 300)}`);
  } catch (err: any) {
    console.log(`Sitemap fetch error: ${err.message}`);
  }

  console.log(`\n--- 2. Testing Homepage at ${targetUrl} ---`);
  try {
    const homeRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    console.log(`Homepage HTTP Status: ${homeRes.status} ${homeRes.statusText}`);
    const homeHtml = await homeRes.text();
    console.log(`Homepage HTML Length: ${homeHtml.length} bytes`);
    
    // Check for links
    const linkMatches = Array.from(homeHtml.matchAll(/href=["']([^"']+)["']/gi)).map(m => m[1]);
    console.log(`Total href links found on homepage: ${linkMatches.length}`);
    const sampleLinks = linkMatches.slice(0, 15);
    console.log('Sample links:', sampleLinks);

    // Check for content/headings
    const titleMatch = homeHtml.match(/<title>([^<]+)<\/title>/i);
    console.log(`Page Title: ${titleMatch ? titleMatch[1] : 'No title'}`);

    // Check for script tags / Next.js hydration data
    const hasNextData = homeHtml.includes('__NEXT_DATA__') || homeHtml.includes('self.__next_f');
    console.log(`Has Next.js SSR payload/data: ${hasNextData}`);

    const hasCourseText = /course|learn|enroll|price|python|react|javascript|mastery/i.test(homeHtml);
    console.log(`Contains course/learning keywords: ${hasCourseText}`);

  } catch (err: any) {
    console.log(`Homepage fetch error: ${err.message}`);
  }
}

testLMS();
