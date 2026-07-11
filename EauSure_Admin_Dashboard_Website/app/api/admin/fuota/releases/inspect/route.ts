import { NextRequest } from 'next/server';
import { adminApiProxyFetch } from '@/lib/api/admin-api';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    return await adminApiProxyFetch(req, '/fuota/releases/inspect', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    console.error('[POST /api/admin/fuota/releases/inspect]', error);
    return Response.json({ error: 'Failed to inspect firmware binary' }, { status: 500 });
  }
}
