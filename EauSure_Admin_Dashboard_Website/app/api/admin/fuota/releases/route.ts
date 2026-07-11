import { NextRequest } from 'next/server';
import { adminApiProxyFetch } from '@/lib/api/admin-api';

export async function GET(req: NextRequest) {
  try {
    return await adminApiProxyFetch(req, '/fuota/releases', {
      method: 'GET',
    });
  } catch (error) {
    console.error('[GET /api/admin/fuota/releases]', error);
    return Response.json({ error: 'Failed to fetch firmware releases' }, { status: 500 });
  }
}
