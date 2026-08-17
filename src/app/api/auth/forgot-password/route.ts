/**
 * POST /api/auth/forgot-password
 * Creates a password reset token and returns it (in prod, you'd email it).
 *
 * For development: the reset link is included in the API response.
 * For production: wire up an email provider (Resend, SendGrid, etc.) to send it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createResetToken, validateEmail } from '@/lib/users';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: 'validation_failed', errors: { email: emailError } }, { status: 400 });
    }

    const { token } = await createResetToken(email);

    // Always return success to prevent email enumeration
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const resetLink = token ? `${baseUrl}/reset-password?token=${token}` : null;

    if (resetLink) {
      await sendPasswordResetEmail(email, resetLink);
    }

    if (process.env.NODE_ENV === 'development' && resetLink) {
      console.log(`[forgot-password] Reset link for ${email}: ${resetLink}`);
    }

    return NextResponse.json({
      message: 'If an account with that email exists, a reset link has been sent.',
      ...(process.env.NODE_ENV === 'development' && resetLink ? { devResetLink: resetLink } : {}),
    });
  } catch (err: any) {
    console.error('[api/auth/forgot-password] Error:', err.message);
    return NextResponse.json({ error: 'server_error', message: 'An unexpected error occurred.' }, { status: 500 });
  }
}
