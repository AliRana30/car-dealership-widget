import { createClient } from '@supabase/supabase-js';

async function inspectCourseMetadata() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await supabase
    .from('website_data')
    .select('*')
    .in('title', ['Leetcode Mastery', 'MERN Stack Development Course']);

  console.dir(data, { depth: null });
}

inspectCourseMetadata().catch(console.error);
