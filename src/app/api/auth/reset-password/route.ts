/**
 * POST /api/auth/reset-password
 * Validates a reset token and sets a new password.
 */

import { NextRequest, NextResponse } from 'next/server';
import { resetPasswordWithToken, validatePassword } from '@/lib/users';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, password, confirmPassword } = body;

    const errors: Record<string, string> = {};

    if (!token || typeof token !== 'string') {
      errors.token = 'Reset token is missing or invalid.';
    }

    const passwordErrors = validatePassword(password || '');
    if (passwordErrors.length > 0) {
      errors.password = passwordErrors.join(', ');
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'validation_failed', errors }, { status: 400 });
    }

    const { success, error } = await resetPasswordWithToken(token, password);

    if (!success) {
      return NextResponse.json(
        { error: 'reset_failed', message: error || 'Failed to reset password.' },
        { status: 400 }
      );
    }

    return NextResponse.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err: any) {
    console.error('[api/auth/reset-password] Error:', err.message);
    return NextResponse.json({ error: 'server_error', message: 'An unexpected error occurred.' }, { status: 500 });
  }
}
