import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getFileContent, upsertFile } from '@/lib/api/github';

const cookieName = process.env.NODE_ENV === 'production'
  ? '__Host-eausure.session' : 'eausure.session';

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName });
  return token?.role === 'admin' ? token : null;
}

// GET /api/github/docs/[path]?repo=firmware
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { path } = await params;
    const repo = req.nextUrl.searchParams.get('repo');
    if (!repo) return NextResponse.json({ error: 'repo is required' }, { status: 400 });
    const file = await getFileContent(repo, decodeURIComponent(path));
    return NextResponse.json(file);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PUT /api/github/docs/[path] — body: { repo, content, message, sha? }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { path } = await params;
    const { repo, content, message, sha } = await req.json();
    if (!repo || !content || !message) return NextResponse.json({ error: 'repo, content and message are required' }, { status: 400 });
    const result = await upsertFile(repo, decodeURIComponent(path), content, message, sha);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
