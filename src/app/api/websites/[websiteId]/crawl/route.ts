/**
 * POST /api/websites/[websiteId]/crawl   — Trigger a new crawl
 * GET  /api/websites/[websiteId]/crawl   — Get latest crawl job status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCrawlJob,
  updateCrawlJob,
  crawlWebsite,
  getLatestCrawlJob,
  type ScanMode,
} from '@/lib/crawler';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

type Params = { params: Promise<{ websiteId: string }> };

// ─── GET — latest job status ──────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  const { websiteId } = await params;
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }

    const supabase = getSupabase();

    // Verify ownership
    const { data: existingWebsite, error: checkError } = await supabase
      .from('websites')
      .select('id')
      .eq('id', websiteId)
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError || !existingWebsite) {
      return NextResponse.json(
        { error: 'not_found', message: 'Website not found or access denied' },
        { status: 404 }
      );
    }

    const job = await getLatestCrawlJob(websiteId);
    if (!job) {
      return NextResponse.json({ status: 'never_crawled', websiteId }, { status: 200 });
    }

    // Get count of indexed records
    const { data: widgets } = await supabase
      .from('widgets')
      .select('id')
      .eq('website_id', websiteId);
    const widgetIds = widgets?.map(w => w.id) || [];
    if (widgetIds.length === 0) {
      widgetIds.push('00000000-0000-0000-0000-000000000000');
    }

    const { count } = await supabase
      .from('website_data')
      .select('id', { count: 'exact', head: true })
      .in('widget_id', widgetIds);

    return NextResponse.json({
      jobId:          job.id,
      websiteId,
      status:         job.status,
      scanMode:       job.scan_mode || 'master',
      startUrl:       job.start_url,
      pagesVisited:   job.pages_visited || 0,
      entitiesFound:  job.entities_found || 0,
      blockedPages:   job.blocked_pages || 0,
      indexedRecords: count || 0,
      error:          job.error_message || null,
      startedAt:      job.created_at,
      completedAt:    job.completed_at || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── POST — trigger new crawl ─────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { websiteId } = await params;
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const scanMode: ScanMode = body?.scanMode === 'quick' ? 'quick' : 'master';

    const supabase = getSupabase();

    // Fetch the website to verify ownership and get allowed domain
    const { data: website, error } = await supabase
      .from('websites')
      .select('id, name, allowed_domains')
      .eq('id', websiteId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !website) {
      return NextResponse.json(
        { error: 'not_found', message: `Website '${websiteId}' not found or access denied` },
        { status: 404 }
      );
    }

    // Resolve start URL from allowed_domains
    const domain = website.allowed_domains?.[0];
    if (!domain) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Website has no domain configured' },
        { status: 400 }
      );
    }

    const startUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    // Check if a crawl is already running
    const existing = await getLatestCrawlJob(websiteId);
    if (existing?.status === 'running' || existing?.status === 'pending') {
      return NextResponse.json(
        {
          message:  'A crawl is already in progress',
          jobId:    existing.id,
          status:   existing.status,
          scanMode: existing.scan_mode || 'master',
        },
        { status: 202 }
      );
    }

    // Create + fire background job
    const jobId = await createCrawlJob(websiteId, startUrl, scanMode);
    runCrawlInBackground(websiteId, startUrl, jobId, scanMode);

    return NextResponse.json(
      {
        message:  'Crawl job started',
        jobId,
        websiteId,
        startUrl,
        scanMode,
      },
      { status: 202 }
    );
  } catch (err: any) {
    console.error(`[api/websites/${websiteId}/crawl] POST failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Background helper ─────────────────────────────────────────────────────────

async function runCrawlInBackground(
  websiteId: string,
  startUrl: string,
  jobId: string,
  scanMode: ScanMode
) {
  try {
    await updateCrawlJob(jobId, { status: 'running' });
    const result = await crawlWebsite(websiteId, startUrl, scanMode);
    const finalStatus = result.isBlocked ? 'blocked' : 'completed';
    await updateCrawlJob(jobId, {
      status:         finalStatus,
      pages_visited:  result.pagesVisited,
      entities_found: result.entitiesFound,
      blocked_pages:  result.blockedPages,
      completed_at:   new Date().toISOString(),
      ...(result.errors.length ? { error_message: result.errors.slice(0, 3).join('; ') } : {}),
    });
    console.log(
      `[crawler] Job ${jobId} (${scanMode}) ${finalStatus}: ${result.pagesVisited} pages, ${result.blockedPages} blocked, ${result.entitiesFound} entities`
    );
  } catch (err: any) {
    console.error(`[crawler] Job ${jobId} failed:`, err.message);
    await updateCrawlJob(jobId, {
      status:        'failed',
      error_message: err.message,
      completed_at:  new Date().toISOString(),
    });
  }
}

