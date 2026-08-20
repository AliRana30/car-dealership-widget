import * as fs from 'fs';
import * as path from 'path';

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

import { createClient } from '@supabase/supabase-js';
import { crawlWebsite, createCrawlJob, updateCrawlJob } from '../src/lib/crawler/index';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFullLMSCrawlAndPersist() {
  const lmsWidgetId = '635352a8-6d13-4b47-804f-8717b2a1539c';
  const websiteId = 'cfbfa598-6c36-4447-9b27-173dbefa8e55';
  const startUrl = 'https://lms-e-learning-system.vercel.app';

  // 1. Link widget to website
  console.log(`Linking widget ${lmsWidgetId} to website ${websiteId}...`);
  await supabase
    .from('widgets')
    .update({ website_id: websiteId })
    .eq('id', lmsWidgetId);

  // 2. Create crawl job
  const jobId = await createCrawlJob(websiteId, startUrl, 'master');
  console.log(`Created crawl job ${jobId}`);
  await updateCrawlJob(jobId, { status: 'running' });

  // 3. Run crawl
  const result = await crawlWebsite(websiteId, startUrl, 'master');

  let finalStatus: 'completed' | 'blocked' | 'failed' = 'completed';
  let errorMessage: string | undefined = undefined;

  if (result.isBlocked) {
    finalStatus = 'blocked';
    errorMessage = 'Crawl blocked by anti-bot firewall (WAF challenge detected).';
  } else if (result.pagesVisited === 0 && result.entitiesFound === 0) {
    finalStatus = 'failed';
    errorMessage = result.errors.length > 0
      ? result.errors.slice(0, 3).join('; ')
      : `Crawl failed to reach ${startUrl}: 0 pages analyzed.`;
  }

  await updateCrawlJob(jobId, {
    status: finalStatus,
    pages_visited: result.pagesVisited,
    entities_found: result.entitiesFound,
    blocked_pages: result.blockedPages,
    error_message: errorMessage || undefined,
    completed_at: new Date().toISOString(),
  });

  console.log('\n=== CRAWL JOB RESULT ===');
  console.log(`Job ID: ${jobId}`);
  console.log(`Status: ${finalStatus}`);
  console.log(`Pages Visited: ${result.pagesVisited}`);
  console.log(`Entities Found: ${result.entitiesFound}`);
  console.log(`Errors: ${errorMessage || 'none (clean success)'}`);
  console.log(`Duration: ${result.durationMs} ms`);

  // 4. Verify website_data rows for the LMS widget
  const { data: savedRows, error: fetchErr } = await supabase
    .from('website_data')
    .select('id, widget_id, title, entity_type, source_url, content')
    .eq('widget_id', lmsWidgetId);

  if (fetchErr) {
    console.error('Fetch error:', fetchErr);
    return;
  }

  console.log(`\n=== SAVED WEBSITE_DATA ROWS FOR LMS WIDGET (${savedRows?.length || 0} rows) ===`);
  savedRows?.forEach((r, idx) => {
    console.log(`[${idx + 1}] ID: ${r.id} | Title: "${r.title}" | Type: ${r.entity_type} | URL: ${r.source_url}`);
    console.log(`    Content: ${r.content?.slice(0, 150)}...\n`);
  });
}

testFullLMSCrawlAndPersist();
