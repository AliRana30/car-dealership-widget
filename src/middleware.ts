/**
 * Next.js Middleware — Authentication, Session Refresh & Access Tokens
 *
 * Handles:
 * 1. Session cookie (fd_session) & Authorization: Bearer <token> decryption.
 * 2. Automatic header injection (x-user-id, x-user-email) for downstream API routes.
 * 3. 7-day sliding window session refresh.
 * 4. Graceful handling of public vs protected routes (API returns 401 JSON, pages redirect to /login).
 */

import { NextRequest, NextResponse } from 'next/server';
import { decryptSession, SESSION_COOKIE } from '@/lib/session';

// Pages that are public
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
];

// API prefixes that do NOT require authentication
const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/widgets',
  '/api/widget',
  '/api/retell/',
  '/api/webhooks/',
  '/api/agent/',
  '/api/cron/',
  '/api/websites/',
];

// Static/asset routes
const PUBLIC_PREFIXES = [
  '/embed',
  '/_next/',
  '/favicon',
  '/logo',
  '/widget.js',
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) return true;
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Extract token from cookie or Authorization header
  let rawToken = req.cookies.get(SESSION_COOKIE)?.value;
  if (!rawToken) {
    const authHeader = req.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      rawToken = authHeader.substring(7);
    }
  }

  // 2. Decrypt session if token is present
  const session = rawToken ? await decryptSession(rawToken) : null;

  // 3. If authenticated user visits login/signup, redirect to dashboard (unless forced logout flag)
  const isLogoutRequest = req.nextUrl.searchParams.has('logout');
  if (session && (pathname === '/login' || pathname === '/signup') && !isLogoutRequest) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // 4. If public route, pass through (inject headers if session happens to exist)
  if (isPublicRoute(pathname)) {
    if (session) {
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-user-id', session.userId);
      requestHeaders.set('x-user-email', session.email);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.next();
  }

  // 5. Protected route — handle unauthenticated state
  if (!session) {
    // Return JSON 401 for API requests
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }
    // Redirect browser pages to login
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 6. Valid session on protected route — inject user headers and refresh sliding cookie
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-user-id', session.userId);
  requestHeaders.set('x-user-email', session.email);

  const res = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Refresh cookie expiry (7-day sliding window)
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { SignJWT } = await import('jose');
  const secretKey = new TextEncoder().encode(process.env.SESSION_SECRET);
  const newToken = await new SignJWT({ userId: session.userId, email: session.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey);

  res.cookies.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    expires: newExpiry,
    sameSite: 'lax',
    path: '/',
  });

  return res;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp|widget\\.js).*)',
  ],
};
