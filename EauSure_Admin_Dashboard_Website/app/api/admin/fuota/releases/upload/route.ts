import { NextRequest } from 'next/server';
import { adminApiProxyFetch } from '@/lib/api/admin-api';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    return await adminApiProxyFetch(req, '/fuota/releases/upload', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    console.error('[POST /api/admin/fuota/releases/upload]', error);
    return Response.json({ error: 'Failed to upload firmware release' }, { status: 500 });
  }
}
