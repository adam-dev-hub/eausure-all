import { NextRequest, NextResponse } from 'next/server';
import { triggerNodeMeasurement } from '@/lib/api/gateways';
import { toRouteError } from '@/lib/api/client';

export async function POST(request: NextRequest, { params }: { params: Promise<{ gatewayId: string; nodeId: string }> }) {
  try {
    const { gatewayId, nodeId } = await params;
    const data = await triggerNodeMeasurement(gatewayId, nodeId);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[POST /api/eausure/gateways/:gatewayId/nodes/:nodeId/measure]', error);
    const routeError = toRouteError(error);
    return NextResponse.json(routeError.body, { status: routeError.status });
  }
}
