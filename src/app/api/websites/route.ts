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
import { decryptSession, SESSION_COOKIE } from '@/lib/session';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

async function resolveAuthUserId(req: NextRequest): Promise<string | null> {
  const headerId = req.headers.get('x-user-id');
  if (headerId) return headerId;

  const rawToken = req.cookies.get(SESSION_COOKIE)?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (rawToken) {
    const session = await decryptSession(rawToken);
    if (session?.userId) return session.userId;
  }
  return null;
}

// ─── GET /api/websites ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const userId = await resolveAuthUserId(req);
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
    const userId = await resolveAuthUserId(req);
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

    const targetHost = new URL(validatedUrl).hostname.toLowerCase();
    const targetWidgetId = body?.widgetId || body?.widget_id || null;

    // ── Deduplication: Check if website already exists for this widget or user domain ──
    let existingWebsite: any = null;
    const isTargetUuid = Boolean(targetWidgetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetWidgetId));

    // 1. Check if the target widget already has a linked website with the same domain
    if (targetWidgetId) {
      const { data: currentWidget } = isTargetUuid
        ? await supabase
            .from('widgets')
            .select('id, website_id')
            .or(`id.eq.${targetWidgetId},widget_id.eq.${targetWidgetId}`)
            .maybeSingle()
        : await supabase
            .from('widgets')
            .select('id, website_id')
            .eq('widget_id', targetWidgetId)
            .maybeSingle();

      if (currentWidget?.website_id && currentWidget.website_id !== '00000000-0000-0000-0000-000000000000') {
        const { data: currentWs } = await supabase
          .from('websites')
          .select('id, name, allowed_domains, css_selector_schema, detected_platform, sync_frequency, created_at')
          .eq('id', currentWidget.website_id)
          .maybeSingle();

        if (currentWs) {
          const currentDomains = (currentWs.allowed_domains || []).map((d: string) => d.toLowerCase());
          if (currentDomains.includes(targetHost)) {
            existingWebsite = currentWs;
          }
        }
      }
    }

    // 2. If not found on widget, check if this user already has a website row with this domain
    if (!existingWebsite) {
      const { data: userWebsites } = await supabase
        .from('websites')
        .select('id, name, allowed_domains, css_selector_schema, detected_platform, sync_frequency, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (userWebsites && userWebsites.length > 0) {
        existingWebsite = userWebsites.find(site => {
          const domains = (site.allowed_domains || []).map((d: string) => d.toLowerCase());
          return domains.includes(targetHost);
        }) || null;
      }
    }

    let website: any = null;

    if (existingWebsite) {
      // ── REUSE & UPDATE EXISTING ROW (Prevent duplicate creation on reconnect) ──
      console.log(`[api/websites] Reusing existing website record ${existingWebsite.id} for domain ${targetHost}`);
      const updatePayload: Record<string, any> = {
        name: name.trim(),
        css_selector_schema: cssSelectorSchema ?? existingWebsite.css_selector_schema,
        detected_platform: detectedPlatform !== 'unknown' ? detectedPlatform : existingWebsite.detected_platform,
        sync_frequency: finalSyncFreq !== 'off' ? finalSyncFreq : existingWebsite.sync_frequency,
      };

      const { data: updatedWs } = await supabase
        .from('websites')
        .update(updatePayload)
        .eq('id', existingWebsite.id)
        .select('id, name, allowed_domains, css_selector_schema, detected_platform, sync_frequency, created_at')
        .single();

      website = updatedWs || existingWebsite;
    } else {
      // ── INSERT NEW ROW (Brand-new domain) ──
      // Check if user exists before attaching user_id foreign key
      const { data: userExists } = await supabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      const validUserId = userExists?.id || null;

      const fullPayload: Record<string, any> = {
        organization_id: orgId,
        ...(validUserId ? { user_id: validUserId } : {}),
        name: name.trim(),
        allowed_domains: [targetHost],
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
      let wsError = fullResult.error;

      // Fallback if remote schema cache is missing newer columns or user_id FK fails
      if (wsError && (wsError.code === '23503' || wsError.code === 'PGRST204' || wsError.message?.includes('user_id') || wsError.message?.includes('schema cache') || wsError.message?.includes('column'))) {
        console.warn('[api/websites] Retrying website creation with base columns:', wsError.message);
        const fallbackResult = await supabase
          .from('websites')
          .insert({
            organization_id: orgId,
            name: name.trim(),
            allowed_domains: [targetHost],
          })
          .select('id, name, allowed_domains, created_at')
          .single();

        website = fallbackResult.data;
        wsError = fallbackResult.error;
      }

      if (wsError || !website) {
        throw new Error(wsError?.message || 'Failed to create website');
      }
    }

    // Immediately link website to the owning widget (UUID-safe)
    if (targetWidgetId) {
      const { data: linkedWidget, error: widgetLinkError } = isTargetUuid
        ? await supabase
            .from('widgets')
            .update({ website_id: website.id })
            .or(`id.eq.${targetWidgetId},widget_id.eq.${targetWidgetId}`)
            .select('id, widget_id, website_id')
            .maybeSingle()
        : await supabase
            .from('widgets')
            .update({ website_id: website.id })
            .eq('widget_id', targetWidgetId)
            .select('id, widget_id, website_id')
            .maybeSingle();

      if (widgetLinkError) {
        console.error('[api/websites] Failed to update widget.website_id:', widgetLinkError.message);
      } else {
        console.log(`[api/websites] Successfully linked website ${website.id} to widget ${targetWidgetId} (${linkedWidget?.id})`);
      }
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
        errorMessage = `Crawl failed to reach ${startUrl}: 0 pages analyzed and 0 knowledge records extracted. Verify site accessibility.`;
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
    console.error(`[runCrawlInBackground] Job ${jobId} failed:`, err);
    await updateCrawlJob(jobId, {
      status: 'failed',
      error_message: err.message || `Crawl failed unexpectedly at stage: execution for ${startUrl}`,
      completed_at: new Date().toISOString(),
    });
  }
}
