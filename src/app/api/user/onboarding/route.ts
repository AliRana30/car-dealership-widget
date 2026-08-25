/**
 * /api/user/onboarding — Tracks and updates user-level customizer onboarding tour status.
 *
 * GET  — Returns { status, shouldShowOnboarding }
 * POST — Accepts { status: 'pending' | 'completed' | 'skipped' | 'reset' } and updates DB
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getCustomizerOnboardingStatus, setCustomizerOnboardingStatus } from '@/lib/users';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { status, shouldShowOnboarding } = await getCustomizerOnboardingStatus(session.userId);

  return NextResponse.json({
    status,
    shouldShowOnboarding,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    let targetStatus: 'pending' | 'completed' | 'skipped' = 'completed';

    if (body.status === 'skipped') {
      targetStatus = 'skipped';
    } else if (body.status === 'reset' || body.status === 'pending') {
      targetStatus = 'pending';
    } else {
      targetStatus = 'completed';
    }

    const success = await setCustomizerOnboardingStatus(session.userId, targetStatus);
    if (!success) {
      return NextResponse.json({ error: 'failed_to_update_status' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: targetStatus,
      shouldShowOnboarding: targetStatus === 'pending',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'invalid_request' }, { status: 400 });
  }
}
