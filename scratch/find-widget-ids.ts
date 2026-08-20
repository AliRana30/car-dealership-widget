import { supabase } from '../src/config/widgetsDb';

async function findWidget() {
  const { data: widgets } = await supabase.from('widgets').select('*');
  console.log('All Widgets:', widgets?.map(w => ({ id: w.id, widget_id: w.widget_id, website_id: w.website_id, name: w.name })));
}

findWidget().catch(console.error);
