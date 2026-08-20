import { crawlWebsite } from '../src/lib/crawler/index';
import { createClient } from '@supabase/supabase-js';

async function runOttawaCrawlTest() {
  console.log('================================================================');
  console.log('🚗 Starting Live Ottawa Chrysler Jeep Dodge Crawl Investigation');
  console.log('================================================================\n');

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  );

  const websiteId = '36a4ce28-568e-4709-88e9-b95a18431772';
  console.log('Running crawlWebsite for Ottawa...');
  const result = await crawlWebsite(websiteId, 'https://www.ottawachryslerjeepdodge.com', 'quick');
  console.log('\n--- Crawl Result ---');
  console.log(result);

  console.log('\n--- Checking website_data rows in Supabase ---');
  const { data: records, count } = await supabase
    .from('website_data')
    .select('id, title, entity_type, source_url, data_type, metadata', { count: 'exact' })
    .ilike('source_url', '%ottawachryslerjeepdodge.com%');

  console.log(`Total records in website_data: ${count}`);
  if (records && records.length > 0) {
    records.slice(0, 5).forEach(r => {
      console.log(`- [${r.entity_type}] ${r.title} (${r.source_url})`);
      console.log('  metadata:', r.metadata);
    });
  }
}

runOttawaCrawlTest().catch(console.error);
