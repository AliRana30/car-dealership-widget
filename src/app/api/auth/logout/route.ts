/**
 * POST /api/auth/logout
 * Deletes the session cookie.
 */

import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/session';

export async function POST() {
  await deleteSession();
  return NextResponse.json({ message: 'Logged out successfully.' }, { status: 200 });
}
