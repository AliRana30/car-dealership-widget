import * as fs from 'fs';
import * as path from 'path';

async function testVdp() {
  const url = 'https://www.ottawachryslerjeepdodge.com/used/2024-Ford-Escape-id14203170.html';
  console.log('Fetching', url);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      }
    });
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('HTML Length:', html.length);
    fs.writeFileSync(path.join(process.cwd(), 'scratch/escape_vdp.html'), html);
    console.log('Saved to scratch/escape_vdp.html');
  } catch (e: any) {
    console.error('Fetch error:', e.message);
  }
}

testVdp();
