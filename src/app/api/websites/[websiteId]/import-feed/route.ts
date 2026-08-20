import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ingestFeed } from '@/lib/connectors/feed';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ websiteId: string }> }
) {
  try {
    const { websiteId } = await params;
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { feedUrl } = body;

    if (!feedUrl || typeof feedUrl !== 'string' || !feedUrl.startsWith('http')) {
      return NextResponse.json(
        { error: 'bad_request', message: 'Valid feed URL starting with http:// or https:// is required' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    // Verify website exists and belongs to user
    const { data: website, error: wsError } = await supabase
      .from('websites')
      .select('id, name, allowed_domains')
      .eq('id', websiteId)
      .eq('user_id', userId)
      .single();

    if (wsError || !website) {
      return NextResponse.json(
        { error: 'not_found', message: 'Website not found or access denied' },
        { status: 404 }
      );
    }

    console.log(`[api/websites/${websiteId}/import-feed] Ingesting feed from ${feedUrl}...`);
    const result = await ingestFeed(website, feedUrl);

    return NextResponse.json({
      success: true,
      count: result.count,
      format: result.format,
      skipped: result.skipped,
      errors: result.errors,
      message: `Successfully imported ${result.count} products from ${result.format.toUpperCase()} feed${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}.`,
    });
  } catch (err: any) {
    console.error(`[api/websites/import-feed] Error:`, err);
    return NextResponse.json(
      { error: 'import_failed', message: err.message || 'Failed to import feed' },
      { status: 500 }
    );
  }
}
