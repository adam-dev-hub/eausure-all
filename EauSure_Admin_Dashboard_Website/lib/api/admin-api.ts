import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const sessionCookieName =
  process.env.NODE_ENV === 'production'
    ? '__Host-eausure.session'
    : 'eausure.session';

function getAdminApiBaseUrl() {
  const baseUrl =
    process.env.NEXT_PUBLIC_SUPPORT_API_URL ||
    process.env.SUPPORT_API_URL ||
    'https://eau-sure-app-admin.vercel.app/api';

  return baseUrl.replace(/\/$/, '');
}

async function getAdminAccessToken(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: sessionCookieName,
  });

  if (!token || token.role !== 'admin' || typeof token.accessToken !== 'string') {
    return null;
  }

  return token.accessToken;
}

export async function adminApiProxyFetch(
  req: NextRequest,
  path: string,
  init?: RequestInit
) {
  const accessToken = await getAdminAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(`${getAdminApiBaseUrl()}${path}`);
  url.search = req.nextUrl.search;

  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(url.toString(), {
    ...init,
    headers,
    cache: 'no-store',
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (contentType.includes('application/json')) {
    return NextResponse.json(payload, { status: response.status });
  }

  return new NextResponse(typeof payload === 'string' ? payload : null, {
    status: response.status,
    headers: contentType ? { 'Content-Type': contentType } : undefined,
  });
}
