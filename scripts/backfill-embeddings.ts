import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { embedTexts } from '../src/lib/embeddings';

// Load environment variables manually from .env
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

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(0);
} else {

const supabase = createClient(supabaseUrl, supabaseKey);


async function run() {
  console.log('--- Embeddings Backfill Script ---');
  console.log('Connecting to Supabase and finding rows lacking embeddings...');

  // Fetch only rows where embedding is null
  const { data: rows, error } = await supabase
    .from('website_data')
    .select('id, title, short_description, content')
    .is('embedding', null);

  if (error) {
    console.error('Error querying website_data:', error.message);
    return;
  }

  if (!rows || rows.length === 0) {
    console.log('All entities in website_data already have embeddings. Nothing to backfill!');
    return;
  }

  console.log(`Found ${rows.length} row(s) requiring embeddings.`);

  // Process in chunks of 50 to respect API limit constraints
  const CHUNK_SIZE = 50;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    console.log(`Processing chunk ${i / CHUNK_SIZE + 1} of ${Math.ceil(rows.length / CHUNK_SIZE)} (rows ${i + 1} to ${Math.min(i + CHUNK_SIZE, rows.length)})...`);

    const textsToEmbed = chunk.map(row => {
      const title = row.title || '';
      const desc = row.short_description || row.content?.substring(0, 300) || '';
      return `${title} ${desc}`.trim();
    });

    try {
      const embeddings = await embedTexts(textsToEmbed);

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const embedding = embeddings[j];

        if (embedding) {
          const { error: updateError } = await supabase
            .from('website_data')
            .update({ embedding })
            .eq('id', row.id);

          if (updateError) {
            console.error(`Failed to update row ${row.id}:`, updateError.message);
          }
        }
      }
      console.log(`Successfully completed chunk.`);
    } catch (err: any) {
      console.error(`Error processing chunk:`, err.message || err);
      return;
    }
  }

  console.log('Embedding backfill completed successfully!');
}

run();
}
