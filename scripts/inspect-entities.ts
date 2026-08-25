import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables manually
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

async function inspectEntities() {
  const { data: rows, error } = await supabase
    .from('website_data')
    .select('id, widget_id, title, entity_type, source_url, metadata')
    .order('widget_id');

  if (error) {
    console.error('Supabase error:', error.message);
    return;
  }

  console.log(`Total website_data rows: ${rows?.length}`);
  const byWidget: Record<string, any[]> = {};
  rows?.forEach(r => {
    byWidget[r.widget_id] = byWidget[r.widget_id] || [];
    byWidget[r.widget_id].push(r);
  });

  for (const [wId, list] of Object.entries(byWidget)) {
    console.log(`\n===============================================================`);
    console.log(`WIDGET: ${wId} (${list.length} records)`);
    console.log(`===============================================================`);
    list.forEach(r => {
      const price = r.metadata?.price || r.metadata?.pricing || 'N/A';
      const rating = r.metadata?.rating || r.metadata?.ratings || 'N/A';
      const availability = r.metadata?.availability || 'in_stock';
      console.log(`• ID: ${r.id}`);
      console.log(`  Title: "${r.title}" [${r.entity_type}]`);
      console.log(`  Price: ${price} | Rating: ${rating} | Avail: ${availability}`);
      console.log(`  URL: ${r.source_url}`);
      console.log(`  Metadata keys: ${Object.keys(r.metadata || {}).join(', ')}`);
    });
  }
}

inspectEntities();
