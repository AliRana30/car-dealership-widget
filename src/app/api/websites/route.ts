/**
 * POST /api/websites
 * Creates a new website record and immediately triggers a background crawl job.
 *
 * GET /api/websites
 * Returns all websites for the default organization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCrawlJob,
  updateCrawlJob,
  crawlWebsite,
  type ScanMode,
} from '@/lib/crawler';
import { detectPlatform } from '@/lib/crawler/platform-detect';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

// ─── GET /api/websites ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }

    const supabase = getSupabase();

    let websites: any[] | null = null;
    let error: any = null;

    const fullSelect = await supabase
      .from('websites')
      .select('id, name, allowed_domains, css_selector_schema, detected_platform, sync_frequency, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    websites = fullSelect.data;
    error = fullSelect.error;

    // Fallback if remote schema cache is missing newer columns
    if (error && (error.code === 'PGRST204' || error.message?.includes('schema cache') || error.message?.includes('column'))) {
      console.warn('[api/websites] Fallback GET select without newer columns:', error.message);
      const fallback = await supabase
        .from('websites')
        .select('id, name, allowed_domains, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      websites = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;

    // For each website, get the latest crawl job status
    const enriched = await Promise.all((websites || []).map(async (site: any) => {
      const { data: job } = await supabase
        .from('crawl_jobs')
        .select('id, status, pages_visited, entities_found, completed_at, error_message')
        .eq('website_id', site.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { ...site, crawlJob: job || null };
    }));

    return NextResponse.json(enriched);
  } catch (err: any) {
    console.error('[api/websites] GET failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST /api/websites ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      domain,
      triggerCrawl = true,
      scanMode = 'master',
      cssSelectorSchema = null,
      syncFrequency = 'off',
      sync_frequency,
    } = body;

    const finalSyncFreq = sync_frequency || syncFrequency || 'off';

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    const validatedUrl = domain.startsWith('http://') || domain.startsWith('https://')
      ? domain
      : `https://${domain}`;

    const supabase = getSupabase();
    const orgId = userId; // User-level org isolation

    // Ensure default organization exists
    await supabase
      .from('organizations')
      .upsert({ id: orgId, name: 'Default Organization' }, { onConflict: 'id', ignoreDuplicates: true });

    // Platform auto-detection (Shopify, WooCommerce, unknown)
    const detectedPlatform = await detectPlatform(validatedUrl).catch(() => 'unknown');

    // Create the website record with resilient fallback for un-migrated columns
    let website: any = null;
    let wsError: any = null;

    const fullPayload: Record<string, any> = {
      organization_id: orgId,
      user_id: userId,
      name: name.trim(),
      allowed_domains: [new URL(validatedUrl).hostname],
      css_selector_schema: cssSelectorSchema,
      detected_platform: detectedPlatform,
      sync_frequency: finalSyncFreq,
    };

    const fullResult = await supabase
      .from('websites')
      .insert(fullPayload)
      .select('id, name, allowed_domains, css_selector_schema, detected_platform, sync_frequency, created_at')
      .single();

    website = fullResult.data;
    wsError = fullResult.error;

    // Fallback if remote schema cache is missing newer columns
    if (wsError && (wsError.code === 'PGRST204' || wsError.message?.includes('schema cache') || wsError.message?.includes('column'))) {
      console.warn('[api/websites] Retrying website creation with base columns due to missing DB columns:', wsError.message);
      const fallbackResult = await supabase
        .from('websites')
        .insert({
          organization_id: orgId,
          user_id: userId,
          name: name.trim(),
          allowed_domains: [new URL(validatedUrl).hostname],
        })
        .select('id, name, allowed_domains, created_at')
        .single();

      website = fallbackResult.data;
      wsError = fallbackResult.error;
    }

    if (wsError || !website) {
      throw new Error(wsError?.message || 'Failed to create website');
    }

    let jobId: string | null = null;

    if (triggerCrawl) {
      // Create job record
      jobId = await createCrawlJob(website.id, validatedUrl, scanMode);

      // Fire-and-forget background crawl (Next.js Route Handlers support async work)
      // We do NOT await this — the response returns immediately with job ID.
      runCrawlInBackground(website.id, validatedUrl, jobId, scanMode);
    }

    return NextResponse.json(
      {
        website,
        crawlJobId: jobId,
        message: triggerCrawl
          ? 'Website created. Crawl job started — intelligence will be available shortly.'
          : 'Website created.',
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[api/websites] POST failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Background crawl runner ───────────────────────────────────────────────────

async function runCrawlInBackground(
  websiteId: string,
  startUrl: string,
  jobId: string,
  scanMode: ScanMode = 'master'
) {
  try {
    await updateCrawlJob(jobId, { status: 'running' });

    const result = await crawlWebsite(websiteId, startUrl, scanMode);

    const finalStatus = result.isBlocked ? 'blocked' : 'completed';
    await updateCrawlJob(jobId, {
      status: finalStatus,
      pages_visited: result.pagesVisited,
      entities_found: result.entitiesFound,
      blocked_pages: result.blockedPages || 0,
      completed_at: new Date().toISOString(),
      ...(result.isBlocked ? { error_message: 'Crawl blocked by anti-bot firewall (WAF challenge detected).' } : {}),
    });
  } catch (err: any) {
    console.error(`[runCrawlInBackground] Job ${jobId} failed:`, err);
    await updateCrawlJob(jobId, {
      status: 'failed',
      error_message: err.message || 'Crawl failed unexpectedly',
      completed_at: new Date().toISOString(),
    });
  }
}
