/**
 * User management — password hashing, sign up, login, password reset.
 *
 * All queries use the service role supabase client so they bypass RLS.
 * Authorization (user_id isolation) is enforced at the API route level.
 *
 * Passwords are hashed with bcrypt (cost factor 12).
 * Reset tokens are 48-byte random hex strings, valid for 1 hour.
 */

import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

let _userPool: Pool | null = null;
function getUserPool(): Pool {
  if (!_userPool) {
    _userPool = new Pool({ connectionString: process.env.SUPABASE_DATABASE_URL });
  }
  return _userPool;
}

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_HOURS = 1;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    throw new Error('[users] Missing Supabase credentials in environment.');
  }
  return createClient(url, key);
}

export interface AppUser {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  customizerOnboardingStatus?: 'pending' | 'completed' | 'skipped' | null;
}

// Convert DB row to AppUser (no password_hash exposed)
function toAppUser(row: any): AppUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name ?? null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
    customizerOnboardingStatus: row.customizer_onboarding_status ?? null,
  };
}

// ── Signup ────────────────────────────────────────────────────────────────────

export async function createUser(
  email: string,
  password: string,
  fullName?: string
): Promise<{ user: AppUser | null; error: string | null }> {
  const supabase = getSupabase();

  // Check for existing user
  const { data: existing } = await supabase
    .from('app_users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (existing) {
    return { user: null, error: 'An account with this email already exists.' };
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const { data, error } = await supabase
    .from('app_users')
    .insert({
      email: email.toLowerCase().trim(),
      password_hash: passwordHash,
      full_name: fullName?.trim() || null,
    })
    .select('id, email, full_name, created_at, last_login_at')
    .single();

  if (error) {
    console.error('[users] createUser failed:', error.message);
    return { user: null, error: 'Failed to create account. Please try again.' };
  }

  return { user: toAppUser(data), error: null };
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function verifyUser(
  email: string,
  password: string
): Promise<{ user: AppUser | null; error: string | null }> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('app_users')
    .select('id, email, full_name, created_at, last_login_at, password_hash')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error || !data) {
    // Use a generic message to prevent email enumeration
    return { user: null, error: 'Invalid email or password.' };
  }

  const passwordMatch = await bcrypt.compare(password, data.password_hash);
  if (!passwordMatch) {
    return { user: null, error: 'Invalid email or password.' };
  }

  // Update last_login_at (best-effort, don't fail on error)
  supabase
    .from('app_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(
      () => {},
      () => {}
    );

  return { user: toAppUser(data), error: null };
}

// ── Get user by ID ────────────────────────────────────────────────────────────

export async function getUserById(userId: string): Promise<AppUser | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('app_users')
    .select('id, email, full_name, created_at, last_login_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return toAppUser(data);
}

// ── Password reset token ──────────────────────────────────────────────────────

export async function createResetToken(
  email: string
): Promise<{ token: string | null; error: string | null }> {
  const supabase = getSupabase();

  const { data } = await supabase
    .from('app_users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  // Always return success to prevent email enumeration
  if (!data) {
    return { token: null, error: null };
  }

  const token = randomBytes(48).toString('hex');
  const expiresAt = new Date(
    Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase
    .from('app_users')
    .update({ reset_token: token, reset_token_expires_at: expiresAt })
    .eq('id', data.id);

  if (error) {
    console.error('[users] createResetToken failed:', error.message);
    return { token: null, error: 'Failed to create reset token.' };
  }

  return { token, error: null };
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('app_users')
    .select('id, reset_token_expires_at')
    .eq('reset_token', token)
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: 'Invalid or expired reset link.' };
  }

  if (!data.reset_token_expires_at || new Date(data.reset_token_expires_at) < new Date()) {
    return { success: false, error: 'Reset link has expired. Please request a new one.' };
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  const { error: updateError } = await supabase
    .from('app_users')
    .update({
      password_hash: passwordHash,
      reset_token: null,
      reset_token_expires_at: null,
    })
    .eq('id', data.id);

  if (updateError) {
    console.error('[users] resetPasswordWithToken failed:', updateError.message);
    return { success: false, error: 'Failed to reset password. Please try again.' };
  }

  return { success: true, error: null };
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateEmail(email: string): string | null {
  if (!email || !email.trim()) return 'Email is required.';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email.trim())) return 'Please enter a valid email address.';
  return null;
}

export function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (!password || password.length < 8) errors.push('At least 8 characters long');
  if (!/[a-zA-Z]/.test(password)) errors.push('Contains at least one letter');
  if (!/[0-9]/.test(password)) errors.push('Contains at least one number');
  return errors;
}

// ── OTP verification ─────────────────────────────────────────────────────────

export async function generateOtp(email: string): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const pool = getUserPool();

  try {
    // Delete any existing codes for this email
    await pool.query(`DELETE FROM app_verification_codes WHERE email = $1`, [normalizedEmail]);

    // Generate 4-digit code (e.g. 1000 - 9999)
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await pool.query(
      `INSERT INTO app_verification_codes (email, code, expires_at) VALUES ($1, $2, $3)`,
      [normalizedEmail, code, expiresAt]
    );

    return code;
  } catch (err: any) {
    console.error('[users] generateOtp failed via pg pool:', err.message);
    // Fallback to Supabase client if pool fails
    const supabase = getSupabase();
    await supabase.from('app_verification_codes').delete().eq('email', normalizedEmail);
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { error } = await supabase.from('app_verification_codes').insert({ email: normalizedEmail, code, expires_at: expiresAt });
    if (error) throw new Error(`Failed to generate verification code: ${error.message}`);
    return code;
  }
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedCode = code.trim();
  const pool = getUserPool();

  try {
    const { rows } = await pool.query(
      `SELECT id, expires_at FROM app_verification_codes WHERE email = $1 AND code = $2 LIMIT 1`,
      [normalizedEmail, normalizedCode]
    );

    if (rows.length === 0) return false;

    const row = rows[0];
    const isExpired = new Date(row.expires_at) < new Date();
    
    // Always delete the code row so it cannot be re-used
    await pool.query(`DELETE FROM app_verification_codes WHERE id = $1`, [row.id]);

    return !isExpired;
  } catch (err: any) {
    console.error('[users] verifyOtp failed via pg pool:', err.message);
    const supabase = getSupabase();
    const { data } = await supabase
      .from('app_verification_codes')
      .select('id, expires_at')
      .eq('email', normalizedEmail)
      .eq('code', normalizedCode)
      .maybeSingle();

    if (!data) return false;
    await supabase.from('app_verification_codes').delete().eq('id', data.id);
    return new Date(data.expires_at) >= new Date();
  }
}

// ── Widget Customizer Onboarding Status ──────────────────────────────────────

export async function getCustomizerOnboardingStatus(userId: string): Promise<{
  status: 'pending' | 'completed' | 'skipped';
  shouldShowOnboarding: boolean;
}> {
  const supabase = getSupabase();

  const { data: user, error } = await supabase
    .from('app_users')
    .select('id, customizer_onboarding_status, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !user) {
    return { status: 'completed', shouldShowOnboarding: false };
  }

  // If already explicitly marked completed or skipped
  if (user.customizer_onboarding_status === 'completed' || user.customizer_onboarding_status === 'skipped') {
    return { status: user.customizer_onboarding_status, shouldShowOnboarding: false };
  }

  // Requirement 12: Existing users check
  // If an existing user has widgets in the widgets table, they must NOT see the onboarding tour.
  const { count: widgetCount } = await supabase
    .from('widgets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (widgetCount && widgetCount > 0) {
    // Auto-mark existing accounts with existing widgets as completed
    await supabase
      .from('app_users')
      .update({ customizer_onboarding_status: 'completed' })
      .eq('id', userId);
    return { status: 'completed', shouldShowOnboarding: false };
  }

  const status = (user.customizer_onboarding_status as 'pending' | 'completed' | 'skipped') || 'pending';
  return {
    status,
    shouldShowOnboarding: status === 'pending',
  };
}

export async function setCustomizerOnboardingStatus(
  userId: string,
  status: 'pending' | 'completed' | 'skipped'
): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('app_users')
    .update({ customizer_onboarding_status: status })
    .eq('id', userId);

  if (error) {
    console.error('[users] setCustomizerOnboardingStatus failed:', error.message);
    return false;
  }
  return true;
}

