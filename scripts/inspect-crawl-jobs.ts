import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: jobs, error } = await supabase
    .from('crawl_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching crawl_jobs:', error);
    return;
  }

  console.log('=== LATEST 10 CRAWL JOBS ===');
  jobs?.forEach(j => {
    console.log(`ID: ${j.id}`);
    console.log(`Website ID: ${j.website_id}`);
    console.log(`Start URL: ${j.start_url}`);
    console.log(`Status: ${j.status}`);
    console.log(`Pages Visited: ${j.pages_visited} | Entities Found: ${j.entities_found} | Blocked: ${j.blocked_pages}`);
    console.log(`Error Message: ${j.error_message}`);
    console.log(`Created At: ${j.created_at} | Completed At: ${j.completed_at}`);
    console.log('----------------------------------------------------');
  });
}

main();
