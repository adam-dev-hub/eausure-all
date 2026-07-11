import { NextRequest } from 'next/server';
import { adminApiProxyFetch } from '@/lib/api/admin-api';

export async function GET(req: NextRequest) {
  try {
    return await adminApiProxyFetch(req, '/users', { method: 'GET' });
  } catch (error) {
    console.error('[GET /api/admin/users]', error);
    return Response.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
