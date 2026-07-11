import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getLatestSensorReading } from '@/lib/api/sensor';
import { toRouteError } from '@/lib/api/client';

const sessionCookieName =
  process.env.NODE_ENV === 'production'
    ? '__Host-eausure.session'
    : 'eausure.session';

export async function GET(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: sessionCookieName,
  });

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const params = new URLSearchParams(req.nextUrl.searchParams);
    const data = await getLatestSensorReading(params);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[GET /api/eausure/latest]', error);
    const routeError = toRouteError(error);
    return NextResponse.json(routeError.body, { status: routeError.status });
  }
}
