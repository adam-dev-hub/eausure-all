import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { listIssues, createIssue } from '@/lib/api/github';

const cookieName = process.env.NODE_ENV === 'production'
  ? '__Host-eausure.session' : 'eausure.session';

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName });
  return token?.role === 'admin' ? token : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { searchParams } = req.nextUrl;
    const repo = searchParams.get('repo');
    if (!repo) return NextResponse.json({ error: 'repo is required' }, { status: 400 });
    const issues = await listIssues(repo, {
      state: (searchParams.get('state') as 'open' | 'closed' | 'all') || 'open',
      labels: searchParams.get('labels') || undefined,
      per_page: Number(searchParams.get('per_page') || 20),
      page: Number(searchParams.get('page') || 1),
    });
    return NextResponse.json(issues);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const { repo, ...payload } = body;
    if (!repo) return NextResponse.json({ error: 'repo is required' }, { status: 400 });
    const issue = await createIssue(repo, payload);
    return NextResponse.json(issue, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
