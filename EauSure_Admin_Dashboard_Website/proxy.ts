import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginRequest } from '@/lib/csrf';
import { sessionCookieName } from '@/lib/session-cookie';

const locales = ['fr'] as const;
const defaultLocale = 'fr';
const legacyLocales = ['en', 'ar'] as const;

const PUBLIC_PATHS = [
  '/signin',
  '/signup',
  '/forgot-password',
  '/forget-password',
  '/reset-password',
  '/auth/signin',
  '/auth/signup',
  '/auth/forgot-password',
  '/auth/forget-password',
  '/auth/reset-password',
  '/admin/signin',
  '/api/auth',
  '/api/signup',
  '/api/forgot-password',
  '/api/reset-password',
  '/_next',
  '/favicon.ico',
] as const;

function getLocaleFromPath(pathname: string): (typeof locales)[number] | null {
  const firstSegment = pathname.split('/')[1];
  return locales.includes(firstSegment as (typeof locales)[number])
    ? (firstSegment as (typeof locales)[number])
    : null;
}

function getLegacyLocaleFromPath(pathname: string): (typeof legacyLocales)[number] | null {
  const firstSegment = pathname.split('/')[1];
  return legacyLocales.includes(firstSegment as (typeof legacyLocales)[number])
    ? (firstSegment as (typeof legacyLocales)[number])
    : null;
}

function stripLocalePrefix(pathname: string): string {
  const locale = getLocaleFromPath(pathname);
  if (!locale) {
    return pathname;
  }

  const stripped = pathname.slice(locale.length + 1);
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

function isStaticAsset(pathname: string): boolean {
  return /\/[^/]+\.[^/]+$/.test(pathname);
}

function isPublicPath(pathname: string): boolean {
  if (isStaticAsset(pathname)) {
    return true;
  }

  const withoutLocale = stripLocalePrefix(pathname);
  const hasLocalePrefix = Boolean(getLocaleFromPath(pathname));

  if (hasLocalePrefix && withoutLocale === '/') {
    return true;
  }

  return PUBLIC_PATHS.some((publicPath) => {
    return (
      withoutLocale === publicPath ||
      withoutLocale.startsWith(`${publicPath}/`) ||
      pathname === publicPath ||
      pathname.startsWith(`${publicPath}/`)
    );
  });
}

function isPublicApiPath(pathname: string): boolean {
  const withoutLocale = stripLocalePrefix(pathname);

  return [
    '/api/auth',
    '/api/signup',
    '/api/forgot-password',
    '/api/reset-password',
  ].some((publicPath) => {
    return withoutLocale === publicPath || withoutLocale.startsWith(`${publicPath}/`);
  });
}

function isAdminAreaPath(pathname: string): boolean {
  const localizedPath = stripLocalePrefix(pathname);
  return localizedPath === '/admin' || localizedPath.startsWith('/admin/');
}

function isOperatorAreaPath(pathname: string): boolean {
  const localizedPath = stripLocalePrefix(pathname);
  return localizedPath === '/dashboard' || localizedPath.startsWith('/dashboard/');
}

function isAuthPath(pathname: string): boolean {
  const localizedPath = stripLocalePrefix(pathname);

  return [
    '/signin',
    '/signup',
    '/forgot-password',
    '/forget-password',
    '/reset-password',
    '/auth/signin',
    '/auth/signup',
    '/auth/forgot-password',
    '/auth/forget-password',
    '/auth/reset-password',
    '/admin/signin',
  ].includes(localizedPath);
}

function resolveLocale(request: NextRequest): (typeof locales)[number] {
  const pathLocale = getLocaleFromPath(request.nextUrl.pathname);
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;

  if (pathLocale) {
    return pathLocale;
  }

  if (locales.includes(cookieLocale as (typeof locales)[number])) {
    return cookieLocale as (typeof locales)[number];
  }

  return defaultLocale;
}

function getPreferredLocale(request: NextRequest): (typeof locales)[number] {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;

  if (locales.includes(cookieLocale as (typeof locales)[number])) {
    return cookieLocale as (typeof locales)[number];
  }

  return defaultLocale;
}

function redirectToSignIn(request: NextRequest, locale: string): NextResponse {
  const signInPath = isAdminAreaPath(request.nextUrl.pathname)
    ? `/${locale}/admin/signin`
    : `/${locale}/auth/signin`;
  const signInUrl = new URL(signInPath, request.url);
  signInUrl.searchParams.set('callbackUrl', request.url);

  return NextResponse.redirect(signInUrl);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const legacyLocale = getLegacyLocaleFromPath(pathname);
  if (legacyLocale) {
    const stripped = pathname.slice(legacyLocale.length + 1) || '/';
    const normalizedPath = stripped.startsWith('/') ? stripped : `/${stripped}`;
    const redirectedPath = normalizedPath === '/' ? `/${defaultLocale}` : `/${defaultLocale}${normalizedPath}`;
    return NextResponse.redirect(new URL(redirectedPath, request.url));
  }

  if (pathname.startsWith('/api/')) {
    if (!isPublicApiPath(pathname) && request.method === 'POST' && !isSameOriginRequest(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.next();
  }

  if (!getLocaleFromPath(pathname)) {
    const preferredLocale = getPreferredLocale(request);
    const prefixedPath = pathname === '/' ? `/${preferredLocale}` : `/${preferredLocale}${pathname}`;

    return NextResponse.redirect(new URL(prefixedPath, request.url));
  }

  const locale = resolveLocale(request);
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: sessionCookieName,
  });

  if (isAuthPath(pathname)) {
    if (!token) {
      return NextResponse.next();
    }

    const dest = token.role === 'admin' ? `/${locale}/admin` : `/${locale}/dashboard`;
    return NextResponse.redirect(new URL(dest, request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!token) {
    return redirectToSignIn(request, locale);
  }

  if (isOperatorAreaPath(pathname) && token.role === 'admin') {
    return NextResponse.redirect(new URL(`/${locale}/admin`, request.url));
  }

  if (isAdminAreaPath(pathname) && token.role !== 'admin') {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  return NextResponse.next();
}

export default proxy;

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff|woff2|ttf)$).*)',
  ],
};
