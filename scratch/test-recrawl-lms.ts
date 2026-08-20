import { crawlWebsite } from '../src/lib/crawler/index';
import { getWidget, getDbClient } from '../src/config/widgetsDb';

async function testRecrawlLms() {
  const widget = await getWidget('lms');
  console.log('Target widget:', widget?.id, (widget as any)?.slug, (widget as any)?.domain);

  const websiteId = widget?.id || 'lms';
  const startUrl = (widget as any)?.domain || 'https://lms-e-learning-system.vercel.app';

  console.log(`Starting crawl for website ${websiteId} at ${startUrl}...`);
  const result = await crawlWebsite(websiteId, startUrl, 'master');
  console.log('\n>>> Crawl Completed Result:', result);

  // Query website_data for this widget
  const { client: supabase } = getDbClient();
  const { data: records, error } = await supabase
    .from('website_data')
    .select('id, title, source_url, entity_type, content, metadata')
    .eq('widget_id', websiteId);

  console.log(`\n>>> Total website_data rows: ${records?.length}`, error || '');
  if (records) {
    for (const r of records) {
      console.log('------------------------------------');
      console.log(`TITLE: "${r.title}"`);
      console.log(`URL: ${r.source_url}`);
      console.log(`TYPE: ${r.entity_type}`);
      console.log(`PRICE: ${r.metadata?.price || 'N/A'}`);
      console.log(`CONTENT: ${r.content?.substring(0, 300)}`);
    }
  }
}

testRecrawlLms().catch(console.error);
