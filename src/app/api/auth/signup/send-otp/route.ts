import { NextRequest, NextResponse } from 'next/server';
import { generateOtp, validateEmail } from '@/lib/users';
import { sendVerificationOtp } from '@/lib/email';
import { Pool } from 'pg';

// Use direct pg pool — bypasses Supabase RLS entirely, no 401 risk
let _pool: Pool | null = null;
function getPool() {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
  }
  return _pool;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: 'validation_failed', message: emailError }, { status: 400 });
    }

    // Check if user already exists via direct SQL — no RLS, no 401
    const pool = getPool();
    const { rows } = await pool.query(
      `SELECT id FROM app_users WHERE email = $1 LIMIT 1`,
      [email.toLowerCase().trim()]
    );

    if (rows.length > 0) {
      return NextResponse.json({ error: 'user_exists', message: 'An account with this email already exists.' }, { status: 400 });
    }

    // Generate and save OTP code
    const code = await generateOtp(email);

    // Send verification email
    await sendVerificationOtp(email, code);

    return NextResponse.json({ message: 'Verification code sent to your email.' }, { status: 200 });
  } catch (err: any) {
    console.error('[api/auth/signup/send-otp] Error:', err.message);
    return NextResponse.json({ error: 'server_error', message: err.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
