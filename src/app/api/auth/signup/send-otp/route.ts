import { NextRequest, NextResponse } from 'next/server';
import { generateOtp, validateEmail } from '@/lib/users';
import { sendVerificationOtp } from '@/lib/email';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email } = body;

    const emailError = validateEmail(email);
    if (emailError) {
      return NextResponse.json({ error: 'validation_failed', message: emailError }, { status: 400 });
    }

    // Check if user already exists
    const supabase = getSupabase();
    const { data: existing } = await supabase
      .from('app_users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'user_exists', message: 'An account with this email already exists.' }, { status: 400 });
    }

    // Generate and save code
    const code = await generateOtp(email);

    // Send code via email
    await sendVerificationOtp(email, code);

    return NextResponse.json({ message: 'Verification code sent to your email.' }, { status: 200 });
  } catch (err: any) {
    console.error('[api/auth/signup/send-otp] Error:', err.message);
    return NextResponse.json({ error: 'server_error', message: err.message || 'An unexpected error occurred.' }, { status: 500 });
  }
}
