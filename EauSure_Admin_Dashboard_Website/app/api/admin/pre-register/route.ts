import { NextRequest } from 'next/server';
import { adminApiProxyFetch } from '@/lib/api/admin-api';

export async function GET(req: NextRequest) {
  try {
    return await adminApiProxyFetch(req, '/provisioning/pre-register', { method: 'GET' });
  } catch (error) {
    console.error('[GET /api/admin/pre-register]', error);
    return Response.json({ error: 'Failed to fetch pre-registrations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return await adminApiProxyFetch(req, '/provisioning/pre-register', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[POST /api/admin/pre-register]', error);
    return Response.json({ error: 'Failed to pre-register device' }, { status: 500 });
  }
}
