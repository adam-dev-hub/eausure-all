import { NextRequest } from 'next/server';
import { adminApiProxyFetch } from '@/lib/api/admin-api';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    return await adminApiProxyFetch(req, `/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[PATCH /api/admin/users/[id]]', error);
    return Response.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
