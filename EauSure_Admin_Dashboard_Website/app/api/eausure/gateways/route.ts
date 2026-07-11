import { NextResponse } from 'next/server';
import { getGateways } from '@/lib/api/gateways';
import { toRouteError } from '@/lib/api/client';

export async function GET() {
  try {
    const data = await getGateways();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[GET /api/eausure/gateways]', error);
    const routeError = toRouteError(error);
    return NextResponse.json(routeError.body, { status: routeError.status });
  }
}
