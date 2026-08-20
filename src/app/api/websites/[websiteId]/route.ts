/**
 * PUT /api/websites/[websiteId]     — Update website name and domain
 * DELETE /api/websites/[websiteId]  — Delete website record
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

type Params = { params: Promise<{ websiteId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
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

    const body = await req.json();
    const { name, domain } = body;
    const updateData: Record<string, any> = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (body.cssSelectorSchema !== undefined || body.css_selector_schema !== undefined) {
      updateData.css_selector_schema = body.cssSelectorSchema !== undefined ? body.cssSelectorSchema : body.css_selector_schema;
    }

    if (body.detectedPlatform !== undefined || body.detected_platform !== undefined) {
      updateData.detected_platform = body.detectedPlatform !== undefined ? body.detectedPlatform : body.detected_platform;
    }

    if (body.syncFrequency !== undefined || body.sync_frequency !== undefined) {
      updateData.sync_frequency = body.syncFrequency !== undefined ? body.syncFrequency : body.sync_frequency;
    }

    if (domain !== undefined) {
      const trimmedDomain = domain.trim();
      const startUrl = trimmedDomain.startsWith('http') ? trimmedDomain : `https://${trimmedDomain}`;
      let validatedUrl: string;
      try {
        validatedUrl = new URL(startUrl).href;
        updateData.allowed_domains = [new URL(validatedUrl).hostname];
      } catch {
        return NextResponse.json(
          { error: 'bad_request', message: 'Invalid domain/URL provided' },
          { status: 400 }
        );
      }
    }

    let website: any = null;
    let error: any = null;

    const fullResult = await supabase
      .from('websites')
      .update(updateData)
      .eq('id', websiteId)
      .select('id, name, allowed_domains, css_selector_schema, detected_platform, sync_frequency, created_at')
      .single();

    website = fullResult.data;
    error = fullResult.error;

    if (error && (error.code === 'PGRST204' || error.message?.includes('schema cache') || error.message?.includes('column'))) {
      console.warn('[api/websites/PUT] Retrying update with basic fields:', error.message);
      const safeUpdate: Record<string, any> = {};
      if (updateData.name) safeUpdate.name = updateData.name;
      if (updateData.allowed_domains) safeUpdate.allowed_domains = updateData.allowed_domains;

      const fallbackResult = await supabase
        .from('websites')
        .update(safeUpdate)
        .eq('id', websiteId)
        .select('id, name, allowed_domains, created_at')
        .single();

      website = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) throw error;

    return NextResponse.json({ website });


  } catch (err: any) {
    console.error(`[api/websites/${websiteId}] PUT failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
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

    const { error } = await supabase
      .from('websites')
      .delete()
      .eq('id', websiteId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`[api/websites/${websiteId}] DELETE failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
