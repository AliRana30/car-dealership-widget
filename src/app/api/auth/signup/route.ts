/**
 * POST /api/auth/signup
 * Creates a new user account and establishes a session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createUser, validateEmail, validatePassword, verifyOtp } from '@/lib/users';
import { createSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password, confirmPassword, fullName, code } = body;

    // Server-side validation
    const errors: Record<string, string> = {};

    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;

    const passwordErrors = validatePassword(password || '');
    if (passwordErrors.length > 0) errors.password = passwordErrors.join(', ');

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (!code || code.trim().length !== 4) {
      errors.code = '4-digit verification code is required.';
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'validation_failed', errors }, { status: 400 });
    }

    // Verify OTP code
    const isOtpValid = await verifyOtp(email, code);
    if (!isOtpValid) {
      return NextResponse.json({ error: 'validation_failed', errors: { code: 'Invalid or expired verification code.' } }, { status: 400 });
    }

    const { user, error } = await createUser(email, password, fullName);

    if (error || !user) {
      return NextResponse.json(
        { error: 'signup_failed', message: error || 'Failed to create account.' },
        { status: 400 }
      );
    }

    // Create session cookie
    await createSession(user.id, user.email);

    return NextResponse.json(
      { message: 'Account created successfully.', user: { id: user.id, email: user.email, fullName: user.fullName } },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[api/auth/signup] Error:', err.message);
    return NextResponse.json({ error: 'server_error', message: 'An unexpected error occurred.' }, { status: 500 });
  }
}
