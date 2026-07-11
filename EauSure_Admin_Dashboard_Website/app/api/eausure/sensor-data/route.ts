import { NextRequest, NextResponse } from 'next/server';
import { getSensorData } from '@/lib/api/sensor';
import { toRouteError } from '@/lib/api/client';

export async function GET(request: NextRequest) {
  try {
    const params = new URLSearchParams(request.nextUrl.searchParams);
    const data = await getSensorData(params);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[GET /api/eausure/sensor-data]', error);
    const routeError = toRouteError(error);
    return NextResponse.json(routeError.body, { status: routeError.status });
  }
}
