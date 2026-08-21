import { supabase } from '../src/config/widgetsDb';

async function testQuery() {
  console.log('Testing query with or:');
  const q1 = await supabase.from('widgets').select('*').or('widget_id.eq.lms,id.eq.lms');
  console.log('q1 error:', q1.error);
  console.log('q1 data:', q1.data);

  console.log('\nTesting query with eq on widget_id:');
  const q2 = await supabase.from('widgets').select('*').eq('widget_id', 'lms');
  console.log('q2 error:', q2.error);
  console.log('q2 data:', q2.data);
}

testQuery();
