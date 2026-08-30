import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[match[1]] = val;
    }
  });
}

const pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });

function encodeUrlSpaces(url: string): string {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  // Encode spaces and special chars without double-encoding existing %20
  return encodeURI(decodeURI(trimmed));
}

async function fixImageUrls() {
  const client = await pool.connect();
  try {
    console.log('=== FIXING UNENCODED IMAGE URLS IN DATABASE ===\n');

    // 1. Fix vehicles table
    const vehs = await client.query(`SELECT id, make, model, images FROM vehicles WHERE array_length(images, 1) > 0`);
    for (const row of vehs.rows) {
      const fixedImages = (row.images || []).map((img: string) => encodeUrlSpaces(img));
      const hasChange = JSON.stringify(row.images) !== JSON.stringify(fixedImages);
      if (hasChange) {
        await client.query(`UPDATE vehicles SET images = $1 WHERE id = $2`, [fixedImages, row.id]);
        console.log(`[vehicles] Fixed ${row.year || ''} ${row.make} ${row.model} (${fixedImages.length} images)`);
        console.log(`   Before: ${row.images[0]}`);
        console.log(`   After:  ${fixedImages[0]}\n`);
      }
    }

    // 2. Fix website_data table
    const wdata = await client.query(`SELECT id, title, image_urls FROM website_data`);
    for (const row of wdata.rows) {
      let imgs: string[] = [];
      if (Array.isArray(row.image_urls)) imgs = row.image_urls;
      else if (typeof row.image_urls === 'string') {
        try { imgs = JSON.parse(row.image_urls); } catch {}
      }

      if (imgs.length > 0) {
        const fixedImgs = imgs.map((u: string) => encodeUrlSpaces(u));
        if (JSON.stringify(imgs) !== JSON.stringify(fixedImgs)) {
          await client.query(`UPDATE website_data SET image_urls = $1 WHERE id = $2`, [JSON.stringify(fixedImgs), row.id]);
          console.log(`[website_data] Fixed ${row.title}`);
        }
      }
    }

    console.log('✅ All image URLs in Supabase updated with valid URL encoding.');
  } finally {
    client.release();
    await pool.end();
  }
}

fixImageUrls().catch(console.error);
