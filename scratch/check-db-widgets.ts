import { supabase, listWidgets } from '../src/config/widgetsDb';

async function check() {
  const { data: widgets, error } = await supabase.from('widgets').select('*');
  console.log('Widgets in Supabase:', widgets);
  if (error) console.error('Error fetching widgets:', error);
}

check();
