/**
 * GET  /api/auth/me  — Returns current user info from session.
 * POST /api/auth/me  — Same, useful for client-side JS calls.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getUserById } from '@/lib/users';

async function handler() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const user = await getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    customizerOnboardingStatus: user.customizerOnboardingStatus || 'pending',
  });
}

export const GET = handler;
export const POST = handler;
