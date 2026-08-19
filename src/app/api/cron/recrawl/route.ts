/**
 * Recurring Crawl Sync Cron API Route (Phase 5.1)
 *
 * GET / POST /api/cron/recrawl
 *
 * Automatically inspects all connected websites with recurring sync_frequency enabled
 * (weekly, daily, twice_daily, three_times_daily), calculates which sites are due for
 * re-crawling based on their last crawl completion, skips sites with active pending/running
 * jobs, and dispatches background ingestion jobs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createCrawlJob,
  crawlWebsite,
  updateCrawlJob,
  type ScanMode,
} from '@/lib/crawler';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project-url.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
  return createClient(url, key);
}

export const SYNC_INTERVALS_MS: Record<string, number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,           // 7 days
  daily: 24 * 60 * 60 * 1000,                // 24 hours
  twice_daily: 12 * 60 * 60 * 1000,          // 12 hours
  three_times_daily: 8 * 60 * 60 * 1000,     // 8 hours
};

/**
 * Checks if a site is due for a scheduled sync based on its frequency and last completion timestamp.
 */
export function isSiteDueForSync(
  syncFrequency: string,
  lastCompletedAt?: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!syncFrequency || syncFrequency === 'off') {
    return false;
  }

  const interval = SYNC_INTERVALS_MS[syncFrequency];
  if (!interval) return false;

  if (!lastCompletedAt) {
    return true; // Never completed a crawl before -> due immediately
  }

  const lastTime = new Date(lastCompletedAt).getTime();
  if (isNaN(lastTime)) return true;

  return nowMs - lastTime >= interval;
}

/**
 * Fire-and-forget background crawl execution for Route Handlers.
 */
function runCrawlInBackground(websiteId: string, startUrl: string, jobId: string, scanMode: ScanMode) {
  setTimeout(async () => {
    try {
      await updateCrawlJob(jobId, { status: 'running' });
      const result = await crawlWebsite(websiteId, startUrl, scanMode);

      let finalStatus: 'completed' | 'blocked' | 'failed' = 'completed';
      let errorMessage: string | undefined = undefined;

      if (result.isBlocked) {
        finalStatus = 'blocked';
        errorMessage = 'Crawl blocked by anti-bot firewall (WAF challenge detected).';
      } else if (result.pagesVisited === 0 && result.entitiesFound === 0) {
        // Honest failure reporting: zero pages visited and zero entities found
        finalStatus = 'failed';
        if (result.errors && result.errors.length > 0) {
          errorMessage = result.errors.slice(0, 3).join('; ');
        } else {
          errorMessage = `Crawl failed to reach ${startUrl}: 0 pages analyzed and 0 knowledge records extracted.`;
        }
      } else if (result.errors && result.errors.length > 0) {
        errorMessage = result.errors.slice(0, 3).join('; ');
      }

      await updateCrawlJob(jobId, {
        status: finalStatus,
        pages_visited: result.pagesVisited,
        entities_found: result.entitiesFound,
        blocked_pages: result.blockedPages || 0,
        completed_at: new Date().toISOString(),
        ...(errorMessage ? { error_message: errorMessage } : {}),
      });
    } catch (err: any) {
      console.error(`[cron/recrawl] Background crawl for website ${websiteId} failed:`, err);
      await updateCrawlJob(jobId, {
        status: 'failed',
        error_message: err?.message || `Crawl failed in background at stage: execution for ${startUrl}`,
        completed_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }, 100);
}

async function handleRecrawlCron(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If CRON_SECRET is configured, require Bearer auth or skip if matching
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const urlSecret = req.nextUrl.searchParams.get('secret');
      if (urlSecret !== cronSecret) {
        return NextResponse.json({ error: 'unauthorized', message: 'Invalid or missing CRON_SECRET' }, { status: 401 });
      }
    }

    const supabase = getSupabase();
    const now = Date.now();

    // 1. Fetch all websites that have active recurring sync schedules
    const { data: websites, error: wsError } = await supabase
      .from('websites')
      .select('id, name, allowed_domains, sync_frequency, detected_platform')
      .neq('sync_frequency', 'off');

    if (wsError) {
      throw new Error(`Failed to query websites: ${wsError.message}`);
    }

    const eligibleWebsites = websites || [];
    const triggeredJobs: Array<{ websiteId: string; websiteName: string; jobId: string; frequency: string }> = [];
    const skippedActive: Array<{ websiteId: string; reason: string }> = [];
    const notDue: Array<{ websiteId: string; frequency: string; lastCompletedAt?: string }> = [];

    // 2. Evaluate each website's latest job and eligibility
    for (const site of eligibleWebsites) {
      const { data: latestJob } = await supabase
        .from('crawl_jobs')
        .select('id, status, completed_at, created_at')
        .eq('website_id', site.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Skip if an active job is already running or pending
      if (latestJob && (latestJob.status === 'pending' || latestJob.status === 'running')) {
        skippedActive.push({
          websiteId: site.id,
          reason: `Job ${latestJob.id} is already in progress (${latestJob.status})`,
        });
        continue;
      }

      const lastCompletedAt = latestJob?.completed_at || null;
      const isDue = isSiteDueForSync(site.sync_frequency, lastCompletedAt, now);

      if (!isDue) {
        notDue.push({
          websiteId: site.id,
          frequency: site.sync_frequency,
          lastCompletedAt: lastCompletedAt || undefined,
        });
        continue;
      }

      // Determine domain start URL
      const domain = (site.allowed_domains && site.allowed_domains[0]) || '';
      const startUrl = domain.startsWith('http') ? domain : `https://${domain}`;

      if (!domain) {
        skippedActive.push({ websiteId: site.id, reason: 'No domain configured' });
        continue;
      }

      // 3. Dispatch master sync job
      const jobId = await createCrawlJob(site.id, startUrl, 'master');
      runCrawlInBackground(site.id, startUrl, jobId, 'master');

      triggeredJobs.push({
        websiteId: site.id,
        websiteName: site.name,
        jobId,
        frequency: site.sync_frequency,
      });
    }

    console.log(`[cron/recrawl] Evaluated ${eligibleWebsites.length} scheduled sites: triggered ${triggeredJobs.length}, skipped ${skippedActive.length} active, ${notDue.length} not due.`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalScheduled: eligibleWebsites.length,
        triggered: triggeredJobs.length,
        skippedActive: skippedActive.length,
        notDue: notDue.length,
      },
      triggeredJobs,
      skippedActive,
      notDue,
    });
  } catch (err: any) {
    console.error('[cron/recrawl] Cron job failed:', err);
    return NextResponse.json({ error: 'cron_failed', message: err.message || 'Scheduled crawl cron failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleRecrawlCron(req);
}

export async function POST(req: NextRequest) {
  return handleRecrawlCron(req);
}
