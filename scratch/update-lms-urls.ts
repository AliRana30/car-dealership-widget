import { createClient } from '@supabase/supabase-js';

async function updateLmsUrls() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  await supabase
    .from('website_data')
    .update({ source_url: 'https://lms-e-learning-system.vercel.app/course/69309149f53ad74946204d40' })
    .eq('title', 'Leetcode Mastery');

  await supabase
    .from('website_data')
    .update({ source_url: 'https://lms-e-learning-system.vercel.app/course/6945abe7c4769ef223f140fd' })
    .eq('title', 'MERN Stack Development Course');

  console.log('✅ Updated LMS course source_urls to direct /course/:id routes!');
}

updateLmsUrls().catch(console.error);
