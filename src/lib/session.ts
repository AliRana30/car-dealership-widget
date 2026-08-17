/**
 * JWT-based stateless session management.
 *
 * Sessions are stored as signed JWTs in an HttpOnly cookie.
 * The SESSION_SECRET env var signs and verifies the JWT.
 * 7-day expiry, refreshed on each authenticated request via middleware.
 *
 * This file must only run on the server (imported in Server Actions / Route Handlers).
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'fd_session';
const SESSION_DURATION_DAYS = 7;

export interface SessionPayload {
  userId: string;
  email: string;
  expiresAt: Date;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('[session] SESSION_SECRET env var is not set.');
  }
  return new TextEncoder().encode(secret);
}

// ── Encrypt / Decrypt ────────────────────────────────────────────────────────

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(getSecretKey());
}

export async function decryptSession(
  token: string | undefined
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ['HS256'],
    });
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      expiresAt: new Date((payload.exp as number) * 1000),
    };
  } catch {
    // Expired or tampered token
    return null;
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

export async function createSession(userId: string, email: string): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const token = await encryptSession({ userId, email, expiresAt });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    sameSite: 'lax',
    path: '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return decryptSession(token);
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function refreshSession(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await createSession(session.userId, session.email);
}

// ── Export cookie name for middleware ────────────────────────────────────────

export { SESSION_COOKIE };
