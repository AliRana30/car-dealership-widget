import { getWidget, getDbClient } from '../src/config/widgetsDb';

async function inspectLmsData() {
  const widget = await getWidget('lms');
  console.log('Resolved LMS Widget:', widget?.id, widget?.name, (widget as any)?.slug, (widget as any)?.domain);

  const { client: supabase } = getDbClient();
  const widgetId = widget?.id;

  if (!widgetId) {
    console.log('Could not find widget for slug "lms"');
    return;
  }

  // 2. Query website_data
  const { data: records, error } = await supabase
    .from('website_data')
    .select('id, widget_id, title, source_url, entity_type, content_hash')
    .eq('widget_id', widgetId);

  console.log('website_data records count:', records?.length, error || '');
  if (records) {
    for (const r of records) {
      console.log(`- Title: "${r.title}", URL: "${r.source_url}", Type: "${r.entity_type}"`);
    }
  }

  // Also let's inspect the actual content of the crawled pages
  const { data: fullRecords } = await supabase
    .from('website_data')
    .select('id, title, source_url, content, short_description, metadata')
    .eq('widget_id', widgetId)
    .limit(10);

  if (fullRecords) {
    for (const r of fullRecords) {
      console.log('====================================');
      console.log('TITLE:', r.title);
      console.log('URL:', r.source_url);
      console.log('CONTENT SNIPPET (first 400 chars):', r.content?.substring(0, 400));
      console.log('TOTAL LENGTH:', r.content?.length);
      console.log('METADATA:', JSON.stringify(r.metadata));
    }
  }
}

inspectLmsData().catch(console.error);
