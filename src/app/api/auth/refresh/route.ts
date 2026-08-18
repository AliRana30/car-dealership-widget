/**
 * POST /api/auth/refresh — Refresh access session and token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, createSession, encryptSession, SESSION_COOKIE, decryptSession } from '@/lib/session';
import { getUserById } from '@/lib/users';

export async function POST(req: NextRequest) {
  try {
    // 1. Try to resolve session from cookie or Authorization header
    let session = await getSession();

    if (!session) {
      const authHeader = req.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        session = await decryptSession(token);
      }
    }

    if (!session) {
      return NextResponse.json(
        { error: 'unauthenticated', message: 'No valid session or token found to refresh' },
        { status: 401 }
      );
    }

    const user = await getUserById(session.userId);
    if (!user) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    // 2. Generate new 7-day token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newToken = await encryptSession({
      userId: user.id,
      email: user.email,
      expiresAt,
    });

    const response = NextResponse.json({
      success: true,
      token: newToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    });

    // 3. Set refreshed cookie
    response.cookies.set(SESSION_COOKIE, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[auth/refresh] Error:', err);
    return NextResponse.json({ error: 'server_error', message: err.message }, { status: 500 });
  }
}
