/**
 * POST /api/auth/login
 * Verifies credentials and establishes a session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyUser, validateEmail } from '@/lib/users';
import { createSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password } = body;

    const errors: Record<string, string> = {};
    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;
    if (!password) errors.password = 'Password is required.';

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'validation_failed', errors }, { status: 400 });
    }

    const { user, error } = await verifyUser(email, password);

    if (error || !user) {
      return NextResponse.json(
        { error: 'auth_failed', message: error || 'Invalid email or password.' },
        { status: 401 }
      );
    }

    await createSession(user.id, user.email);

    return NextResponse.json(
      { message: 'Login successful.', user: { id: user.id, email: user.email, fullName: user.fullName } },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[api/auth/login] Error:', err.message);
    return NextResponse.json({ error: 'server_error', message: 'An unexpected error occurred.' }, { status: 500 });
  }
}
