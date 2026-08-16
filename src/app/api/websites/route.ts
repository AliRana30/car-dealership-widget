/**
 * POST /api/websites
 * Creates a new website record and immediately triggers a background crawl job.
 *
 * GET /api/websites
 * Returns all websites for the default organization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createCrawlJob, updateCrawlJob, crawlWebsite } from '@/lib/crawler';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

// ─── GET /api/websites ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get('orgId') || '00000000-0000-0000-0000-000000000000';

    const { data: websites, error } = await supabase
      .from('websites')
      .select('id, name, allowed_domains, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // For each website, get the latest crawl job status
    const enriched = await Promise.all((websites || []).map(async (site: any) => {
      const { data: job } = await supabase
        .from('crawl_jobs')
        .select('id, status, pages_visited, entities_found, completed_at, error_message')
        .eq('website_id', site.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
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
    const body = await req.json();
    const { name, domain, orgId = '00000000-0000-0000-0000-000000000000', triggerCrawl = true } = body;

    if (!name || !domain) {
      return NextResponse.json(
        { error: 'bad_request', message: 'name and domain are required' },
        { status: 400 }
      );
    }

    // Normalize domain → start URL
    const startUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    let validatedUrl: string;
    try {
      validatedUrl = new URL(startUrl).href;
    } catch {
      return NextResponse.json(
        { error: 'bad_request', message: 'Invalid domain/URL provided' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Ensure organization exists
    await supabase
      .from('organizations')
      .upsert({ id: orgId, name: 'Default Organization' }, { onConflict: 'id', ignoreDuplicates: true });

    // Create the website record
    const { data: website, error: wsError } = await supabase
      .from('websites')
      .insert({
        organization_id: orgId,
        name: name.trim(),
        allowed_domains: [new URL(validatedUrl).hostname],
      })
      .select('id, name, allowed_domains, created_at')
      .single();

    if (wsError || !website) {
      throw new Error(wsError?.message || 'Failed to create website');
    }

    let jobId: string | null = null;

    if (triggerCrawl) {
      // Create job record
      jobId = await createCrawlJob(website.id, validatedUrl);

      // Fire-and-forget background crawl (Next.js Route Handlers support async work)
      // We do NOT await this — the response returns immediately with job ID.
      runCrawlInBackground(website.id, validatedUrl, jobId);
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

async function runCrawlInBackground(websiteId: string, startUrl: string, jobId: string) {
  try {
    await updateCrawlJob(jobId, { status: 'running' });
    const result = await crawlWebsite(websiteId, startUrl);
    await updateCrawlJob(jobId, {
      status: 'completed',
      pages_visited: result.pagesVisited,
      entities_found: result.entitiesFound,
      completed_at: new Date().toISOString(),
      ...(result.errors.length ? { error_message: result.errors.slice(0, 3).join('; ') } : {}),
    });
    console.log(`[crawler] Job ${jobId} completed: ${result.pagesVisited} pages, ${result.entitiesFound} entities`);
  } catch (err: any) {
    console.error(`[crawler] Job ${jobId} failed:`, err.message);
    await updateCrawlJob(jobId, {
      status: 'failed',
      error_message: err.message,
      completed_at: new Date().toISOString(),
    });
  }
}
