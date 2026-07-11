import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

const sessionCookieName =
  process.env.NODE_ENV === 'production'
    ? '__Host-eausure.session'
    : 'eausure.session';

function getProfileBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_PROFILE_API_URL ||
    process.env.PROFILE_API_URL ||
    'https://eau-sure-app-profile.vercel.app/api'
  ).replace(/\/$/, '');
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

export async function GET(req: NextRequest) {
  const accessToken = await getAdminAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const response = await fetch(`${getProfileBaseUrl()}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(payload || { error: 'Profile API error' }, { status: response.status });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error('[GET /api/user/me]', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const accessToken = await getAdminAccessToken(req);
  if (!accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const response = await fetch(`${getProfileBaseUrl()}/me`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(payload || { error: 'Profile API error' }, { status: response.status });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error('[PATCH /api/user/me]', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
