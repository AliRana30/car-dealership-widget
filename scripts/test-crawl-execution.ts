import { crawlWebsite } from '../src/lib/crawler/index';
import * as path from 'path';
import * as fs from 'fs';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

async function testFullCrawl() {
  const targetUrl = 'https://lms-e-learning-system.vercel.app';
  console.log(`Starting crawl execution for: ${targetUrl}`);

  // Use a dummy or real websiteId
  const result = await crawlWebsite(
    '00000000-0000-0000-0000-000000000000',
    targetUrl,
    'master'
  );

  console.log('\n=== CRAWL RESULT ===');
  console.log(`Pages Visited: ${result.pagesVisited}`);
  console.log(`Pages Processed: ${result.pagesProcessed}`);
  console.log(`Entities Found: ${result.entitiesFound}`);
  console.log(`Blocked Pages: ${result.blockedPages}`);
  console.log(`Is Blocked: ${result.isBlocked}`);
  console.log(`Errors count: ${result.errors.length}`);
  if (result.errors.length) {
    console.log('Errors:', result.errors);
  }
  console.log(`Duration: ${result.durationMs} ms`);

  console.log('\n=== EXTRACTED ENTITIES SAMPLE ===');
  result.entities.forEach((e, idx) => {
    console.log(`[${idx + 1}] Title: "${e.title}" | URL: ${e.url} | Type: ${e.dataType}`);
    console.log(`    Content: ${e.content.slice(0, 120)}...`);
    if (e.metadata?.images?.length) {
      console.log(`    Images:`, e.metadata.images);
    }
    console.log('');
  });
}

testFullCrawl();
