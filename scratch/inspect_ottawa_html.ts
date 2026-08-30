import * as fs from 'fs';
import * as path from 'path';

async function testFetch() {
  const urls = [
    'https://www.ottawachryslerjeepdodge.com',
    'https://www.ottawachryslerjeepdodge.com/robots.txt',
    'https://www.ottawachryslerjeepdodge.com/sitemap.xml',
    'https://www.ottawachryslerjeepdodge.com/new-vehicles/',
    'https://www.ottawachryslerjeepdodge.com/used-vehicles/',
    'https://www.ottawachryslerjeepdodge.com/inventory/',
  ];

  for (const u of urls) {
    try {
      console.log(`\nFetching ${u}...`);
      const res = await fetch(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      console.log(`Status: ${res.status}, Content-Type: ${res.headers.get('content-type')}`);
      const text = await res.text();
      console.log(`Body length: ${text.length} chars`);
      console.log(`Preview: ${text.slice(0, 300).replace(/\s+/g, ' ')}`);
      if (text.includes('sitemap') || text.includes('inventory') || text.includes('vehicle') || text.includes('schema.org')) {
        console.log(`Keywords found in ${u}`);
      }
    } catch (e: any) {
      console.error(`Error fetching ${u}:`, e.message);
    }
  }
}

testFetch();
