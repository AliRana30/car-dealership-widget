import { NextRequest, NextResponse } from 'next/server';
import { getRelevantWebsiteRecords } from '@/config/widgetsDb';

type Params = { params: Promise<{ websiteId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { websiteId } = await params;
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
