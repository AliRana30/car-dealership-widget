/**
 * Orphaned Websites Audit and Deduplication Report Script
 *
 * Scans the database for websites rows that have NO widgets pointing to them
 * via `widgets.website_id`. Reports all findings in a structured table so they
 * can be reviewed before manual cleanup.
 *
 * Usage:
 *   npx tsx scripts/dedupe-orphaned-websites.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Helper to load key-value pairs from .env / .env.local without external dependencies
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

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON_KEY) are required.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const PLACEHOLDER_WEBSITE_ID = '00000000-0000-0000-0000-000000000000';

async function runAudit() {
  console.log('🔍 Starting Orphaned Websites Audit...\n');

  // 1. Fetch all widgets to gather active website_id references
  const { data: widgets, error: widgetsErr } = await supabase
    .from('widgets')
    .select('id, widget_id, name, website_id, organization_id');

  if (widgetsErr) {
    console.error('❌ Failed to fetch widgets:', widgetsErr.message);
    process.exit(1);
  }

  const activeWebsiteIds = new Set<string>();
  const widgetReferenceMap = new Map<string, string[]>();

  (widgets || []).forEach(w => {
    if (w.website_id && w.website_id !== PLACEHOLDER_WEBSITE_ID) {
      activeWebsiteIds.add(w.website_id);
      const list = widgetReferenceMap.get(w.website_id) || [];
      list.push(`${w.name || w.widget_id || w.id} (${w.id})`);
      widgetReferenceMap.set(w.website_id, list);
    }
  });

  console.log(`📊 Found ${widgets?.length || 0} widget(s) in database.`);
  console.log(`📌 Found ${activeWebsiteIds.size} active website reference(s) linked to widgets.\n`);

  // 2. Fetch all websites
  const { data: websites, error: websitesErr } = await supabase
    .from('websites')
    .select('id, name, allowed_domains, created_at, user_id, organization_id')
    .order('created_at', { ascending: false });

  if (websitesErr) {
    console.error('❌ Failed to fetch websites:', websitesErr.message);
    process.exit(1);
  }

  console.log(`🌐 Total websites rows in database: ${websites?.length || 0}\n`);

  const activeWebsites: any[] = [];
  const orphanedWebsites: any[] = [];

  for (const site of (websites || [])) {
    if (site.id === PLACEHOLDER_WEBSITE_ID) {
      continue; // Skip system placeholder
    }

    const isReferenced = activeWebsiteIds.has(site.id);

    // Get count of crawl_jobs
    const { count: jobCount } = await supabase
      .from('crawl_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('website_id', site.id);

    // Get count of website_data
    const { count: dataCount } = await supabase
      .from('website_data')
      .select('id', { count: 'exact', head: true })
      .eq('widget_id', site.id);

    const siteInfo = {
      id: site.id,
      name: site.name,
      domains: (site.allowed_domains || []).join(', '),
      createdAt: site.created_at,
      crawlJobs: jobCount || 0,
      websiteData: dataCount || 0,
      referencedBy: widgetReferenceMap.get(site.id) || [],
    };

    if (isReferenced) {
      activeWebsites.push(siteInfo);
    } else {
      orphanedWebsites.push(siteInfo);
    }
  }

  // ── Print Active Websites (Verification of zero false positives) ──
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(`✅ ACTIVE WEBSITES IN USE BY WIDGETS (${activeWebsites.length} rows):`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  if (activeWebsites.length === 0) {
    console.log('  (None)');
  } else {
    activeWebsites.forEach((site, i) => {
      console.log(` [${i + 1}] ID: ${site.id}`);
      console.log(`     Name: "${site.name}" | Domain(s): ${site.domains}`);
      console.log(`     Created: ${site.createdAt}`);
      console.log(`     Linked To Widget(s): ${site.referencedBy.join(', ')}`);
      console.log(`     Crawl Jobs: ${site.crawlJobs} | Knowledge Records: ${site.websiteData}`);
      console.log('');
    });
  }

  // ── Print Orphaned Websites ──
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log(`⚠️ ORPHANED WEBSITES (NO WIDGET REFERENCING THEM) (${orphanedWebsites.length} rows):`);
  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  if (orphanedWebsites.length === 0) {
    console.log('  🎉 No orphaned websites found! All rows are linked to active widgets.');
  } else {
    orphanedWebsites.forEach((site, i) => {
      console.log(` [${i + 1}] ID: ${site.id}`);
      console.log(`     Name: "${site.name}" | Domain(s): ${site.domains}`);
      console.log(`     Created: ${site.createdAt}`);
      console.log(`     Crawl Jobs: ${site.crawlJobs} | Knowledge Records: ${site.websiteData}`);
      console.log('     Status: ⚠️ ORPHANED (Safe to review & clean up)');
      console.log('');
    });
  }

  // ── Group summary by Name ──
  const groupedByName = new Map<string, number>();
  orphanedWebsites.forEach(site => {
    groupedByName.set(site.name, (groupedByName.get(site.name) || 0) + 1);
  });

  console.log('═══════════════════════════════════════════════════════════════════════════════════════');
  console.log('📋 ORPHANED GROUP SUMMARY:');
  groupedByName.forEach((count, name) => {
    console.log(`  • "${name}": ${count} orphaned row(s)`);
  });
  console.log('═══════════════════════════════════════════════════════════════════════════════════════\n');
  console.log('ℹ️ Note: This report is read-only. No rows were modified or deleted.');
}

runAudit().catch(err => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
