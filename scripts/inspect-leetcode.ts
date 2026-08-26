import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectDetail() {
  const { data } = await supabase.from('website_data').select('*').ilike('title', '%leetcode%');
  console.log('--- LEETCODE MASTERY RECORD ---');
  console.log('Title:', data?.[0]?.title);
  console.log('Content (first 300 chars):', data?.[0]?.content?.slice(0, 300));
  console.log('Short description:', data?.[0]?.short_description);
  console.log('Metadata:', JSON.stringify(data?.[0]?.metadata, null, 2));
}

inspectDetail();
