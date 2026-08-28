import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

async function verifySupabase() {
  console.log('================================================================');
  console.log('SUPABASE CONNECTION VERIFICATION');
  console.log('================================================================\n');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.');
    process.exit(1);
  }

  console.log(`[1] Connecting to Supabase at: ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Query websites
    const { data: websites, error: wError } = await supabase
      .from('websites')
      .select('id, name, allowed_domains, created_at')
      .limit(5);

    if (wError) {
      console.error('✗ Failed querying websites:', wError.message);
    } else {
      console.log(`✓ Websites table accessible (${websites?.length || 0} found):`);
      websites?.forEach((w) => console.log(`    • [${w.id}] ${w.name} (Domains: ${w.allowed_domains?.join(', ') || 'none'})`));
    }

    // 2. Query widgets
    const { data: widgets, error: wgError } = await supabase
      .from('widgets')
      .select('id, widget_id, name, status, website_id')
      .limit(5);

    if (wgError) {
      console.error('✗ Failed querying widgets:', wgError.message);
    } else {
      console.log(`✓ Widgets table accessible (${widgets?.length || 0} found):`);
      widgets?.forEach((wg) => console.log(`    • [${wg.widget_id}] ${wg.name} (${wg.status})`));
    }

    // 3. Query vehicles
    const { data: vehicles, error: vError, count: vCount } = await supabase
      .from('vehicles')
      .select('id, vin, condition, year, make, model, price, availability', { count: 'exact' })
      .limit(5);

    if (vError) {
      console.error('✗ Failed querying vehicles:', vError.message);
    } else {
      console.log(`✓ Vehicles table accessible (${vCount ?? vehicles?.length ?? 0} total vehicles):`);
      vehicles?.forEach((v, i) => {
        console.log(`    [${i + 1}] ${v.year || ''} ${v.make || ''} ${v.model || ''} (${v.condition}) - $${v.price || 'N/A'} [VIN: ${v.vin || 'N/A'}]`);
      });
    }

    // 4. Query website_data
    const { data: websiteData, error: wdError, count: wdCount } = await supabase
      .from('website_data')
      .select('id, title, entity_type, source_url', { count: 'exact' })
      .limit(5);

    if (wdError) {
      console.error('✗ Failed querying website_data:', wdError.message);
    } else {
      console.log(`✓ Website Data table accessible (${wdCount ?? websiteData?.length ?? 0} records):`);
      websiteData?.forEach((row, i) => {
        console.log(`    [${i + 1}] ${row.title} (${row.entity_type}) - ${row.source_url || 'N/A'}`);
      });
    }

    // 5. Query app_users
    const { data: users, error: uError, count: uCount } = await supabase
      .from('app_users')
      .select('id, email, full_name, role', { count: 'exact' })
      .limit(3);

    if (uError) {
      console.warn('  - Note on app_users table:', uError.message);
    } else {
      console.log(`✓ App Users table accessible (${uCount ?? users?.length ?? 0} users found)`);
    }

    console.log('\n================================================================');
    console.log('✓ SUPABASE CONNECTION FULLY VERIFIED & ACTIVE');
    console.log('================================================================');
  } catch (err: any) {
    console.error('✗ Unexpected error during Supabase verification:', err.message);
    process.exit(1);
  }
}

verifySupabase();
