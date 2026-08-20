import { extractPageEntities } from '../src/lib/crawler/extractor';

// Test generic JS chunk entity extractor
async function extractFromSpaChunks(html: string, pageUrl: string) {
  const base = new URL(pageUrl);
  // Match script tags with src
  const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const scriptSrcs: string[] = [];
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.includes('chunk') || src.includes('page') || src.includes('index') || src.includes('app') || src.includes('main') || src.includes('assets/')) {
      try {
        const fullUrl = new URL(src, base.origin).href;
        scriptSrcs.push(fullUrl);
      } catch {}
    }
  }

  console.log(`Found ${scriptSrcs.length} candidate JS bundles:`, scriptSrcs);

  const foundEntities: any[] = [];

  for (const src of scriptSrcs) {
    try {
      const res = await fetch(src);
      if (!res.ok) continue;
      const text = await res.text();

      // Pattern 1: JSON-like objects with title & (description or price or image or level or rating)
      // e.g. {id:"2",title:"LeetCode Mastery",description:"...",price:"$49.99"...}
      // Matches both quoted and unquoted keys: title:"...", price:"..."
      const objectRegex = /\{[^{}]*?(?:title|name)\s*:\s*["']([^"']{3,100})["'][^{}]*?\}/g;
      let objMatch;
      while ((objMatch = objectRegex.exec(text)) !== null) {
        const fullObjStr = objMatch[0];
        
        // Extract fields using key-value regex
        const extractField = (key: string) => {
          const m = fullObjStr.match(new RegExp(`(?:^|[{,\\s])(?:${key})\\s*:\\s*(?:"([^"]*)"|'([^']*)'|(\\d+(?:\\.\\d+)?)|true|false)`, 'i'));
          return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
        };

        const title = extractField('title') || extractField('name');
        const description = extractField('description') || extractField('desc') || extractField('summary') || extractField('short_description');
        const price = extractField('price') || extractField('cost') || extractField('amount');
        const image = extractField('image') || extractField('imageUrl') || extractField('img') || extractField('photo') || extractField('thumbnail');
        const rating = extractField('rating') || extractField('stars');
        const level = extractField('level') || extractField('difficulty') || extractField('category');
        const id = extractField('id') || extractField('_id');

        if (title && (description || price || level || image)) {
          // Avoid boilerplate strings or standard UI component titles
          const lowerTitle = title.toLowerCase();
          if (!['button', 'dialog', 'modal', 'card', 'loading', 'default', 'root', 'page'].includes(lowerTitle)) {
            foundEntities.push({
              title,
              description: description || '',
              price,
              image,
              rating,
              level,
              id,
              sourceUrl: pageUrl,
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Error fetching script ${src}:`, err);
    }
  }

  return foundEntities;
}

async function runTest() {
  const url = 'https://lms-e-learning-system.vercel.app/courses';
  const res = await fetch(url);
  const html = await res.text();

  const entities = await extractFromSpaChunks(html, url);
  console.log(`\n>>> Extracted ${entities.length} entities from SPA chunks:`);
  console.log(JSON.stringify(entities, null, 2));
}

runTest().catch(console.error);
