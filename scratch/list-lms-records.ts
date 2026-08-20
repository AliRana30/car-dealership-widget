import { createClient } from '@supabase/supabase-js';

async function listLmsRecords() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await supabase
    .from('website_data')
    .select('id, title, entity_type, metadata, source_url')
    .or('widget_id.eq.cfbfa598-6c36-4447-9b27-173dbefa8e55,widget_id.eq.635352a8-6d13-4b47-804f-8717b2a1539c');

  console.log(`Found ${data?.length} records:`);
  data?.forEach(r => {
    console.log(`- [${r.entity_type}] ${r.title} | Price: ${r.metadata?.price} | URL: ${r.source_url}`);
  });
}

listLmsRecords().catch(console.error);
