/**
 * Next.js Middleware — Authentication & Session Refresh
 *
 * Protected paths: everything except /login, /signup, /forgot-password,
 * /reset-password, and public API routes (/api/widgets/[id] embed calls,
 * /api/widgets/create-call, /api/retell/*, /embed/*)
 *
 * On each authenticated request the session cookie is refreshed to extend
 * the 7-day sliding window.
 */

import { NextRequest, NextResponse } from 'next/server';
import { decryptSession, SESSION_COOKIE } from '@/lib/session';

// Routes that are always public (no auth required)
const PUBLIC_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
];

// API routes that are public (widget embed, call creation, webhooks, cron, agent tools, etc.)
const PUBLIC_API_PREFIXES = [
  '/api/widgets/create-call',
  '/api/widgets/',
  '/api/retell/',
  '/api/auth/',
  '/api/webhooks/',
  '/api/agent/',
  '/api/cron/',
  '/api/websites/',
];

// Static/embed routes
const PUBLIC_PREFIXES = [
  '/embed/',
  '/_next/',
  '/favicon',
  '/logo',
  '/widget.js',
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;
  // Widget GET by ID is public (for embed snippets)
  if (pathname.startsWith('/api/widgets') && pathname !== '/api/widgets' && !pathname.includes('/configuration')) {
    // Allow widget data GET for embed player
    return true;
  }
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public routes
  if (isPublicRoute(pathname)) {
    // If the user is already authenticated and tries to access login/signup,
    // redirect them to the dashboard
    if (PUBLIC_ROUTES.includes(pathname)) {
      const token = req.cookies.get(SESSION_COOKIE)?.value;
      if (token) {
        const session = await decryptSession(token);
        if (session) {
          return NextResponse.redirect(new URL('/', req.url));
        }
      }
    }
    return NextResponse.next();
  }

  // Protected routes — verify session
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const session = await decryptSession(token);
  if (!session) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('from', pathname);
    const res = NextResponse.redirect(loginUrl);
    // Clear invalid cookie
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // Session is valid — refresh it (sliding window) and inject user context headers
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
    /*
     * Match all request paths except static files
     */
    '/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.webp|widget\\.js).*)',
  ],
};
