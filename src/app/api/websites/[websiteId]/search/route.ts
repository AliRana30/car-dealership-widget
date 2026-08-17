import { NextRequest, NextResponse } from 'next/server';
import { getRelevantWebsiteRecords, supabase } from '@/config/widgetsDb';

type Params = { params: Promise<{ websiteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }

    const { websiteId } = await params;

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

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query') || '';

    if (!query) {
      return NextResponse.json([]);
    }

    const records = await getRelevantWebsiteRecords(websiteId, query, 3);
    return NextResponse.json(records);
  } catch (err: any) {
    console.error('[api/websites/search] GET failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
