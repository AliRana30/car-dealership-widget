import { createClient } from '@supabase/supabase-js';

async function inspectOttawaCrawl() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  );

  console.log('--- 1. Querying Websites Table for Ottawa ---');
  const { data: websites } = await supabase
    .from('websites')
    .select('*')
    .ilike('name', '%ottawa%');
  console.log('Websites matching "ottawa":', websites);

  console.log('\n--- 2. Querying Crawl Jobs ---');
  const { data: jobs } = await supabase
    .from('crawl_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('Recent crawl jobs:', jobs);

  if (websites && websites.length > 0) {
    const webId = websites[0].id;
    console.log(`\n--- 3. Querying Website Data for Website ID: ${webId} ---`);
    const { data: records, count } = await supabase
      .from('website_data')
      .select('id, title, entity_type, source_url, widget_id', { count: 'exact' })
      .ilike('source_url', '%ottawachryslerjeepdodge.com%');
    console.log(`Website data records matching ottawachryslerjeepdodge.com: ${count}`);
    console.log(records?.slice(0, 5));
  }
}

inspectOttawaCrawl().catch(console.error);
