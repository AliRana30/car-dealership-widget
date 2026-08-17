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

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_HOURS = 1;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key);
}

export interface AppUser {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

// Convert DB row to AppUser (no password_hash exposed)
function toAppUser(row: any): AppUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name ?? null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
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
  const supabase = getSupabase();
  const normalizedEmail = email.toLowerCase().trim();

  // Delete any existing codes for this email
  await supabase
    .from('app_verification_codes')
    .delete()
    .eq('email', normalizedEmail);

  // Generate 4-digit code (e.g. 1000 - 9999)
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  const { error } = await supabase
    .from('app_verification_codes')
    .insert({
      email: normalizedEmail,
      code,
      expires_at: expiresAt,
    });

  if (error) {
    console.error('[users] generateOtp failed:', error.message);
    throw new Error('Failed to generate verification code.');
  }

  return code;
}

export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const supabase = getSupabase();
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedCode = code.trim();

  const { data, error } = await supabase
    .from('app_verification_codes')
    .select('id, expires_at')
    .eq('email', normalizedEmail)
    .eq('code', normalizedCode)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  const isExpired = new Date(data.expires_at) < new Date();
  if (isExpired) {
    // Delete expired code
    await supabase
      .from('app_verification_codes')
      .delete()
      .eq('id', data.id);
    return false;
  }

  // Code is valid! Delete it so it cannot be reused
  await supabase
    .from('app_verification_codes')
    .delete()
    .eq('id', data.id);

  return true;
}
