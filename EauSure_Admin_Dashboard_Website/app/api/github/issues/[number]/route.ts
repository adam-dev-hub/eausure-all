import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { updateIssue, addIssueComment, listIssueComments } from '@/lib/api/github';

const cookieName = process.env.NODE_ENV === 'production'
  ? '__Host-eausure.session' : 'eausure.session';

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName });
  return token?.role === 'admin' ? token : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { number } = await params;
    const repo = req.nextUrl.searchParams.get('repo');
    if (!repo) return NextResponse.json({ error: 'repo is required' }, { status: 400 });
    const comments = await listIssueComments(repo, Number(number));
    return NextResponse.json(comments);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { number } = await params;
    const body = await req.json();
    const { repo, ...payload } = body;
    if (!repo) return NextResponse.json({ error: 'repo is required' }, { status: 400 });
    const issue = await updateIssue(repo, Number(number), payload);
    return NextResponse.json(issue);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { number } = await params;
    const { repo, body } = await req.json();
    if (!repo) return NextResponse.json({ error: 'repo is required' }, { status: 400 });
    const comment = await addIssueComment(repo, Number(number), body);
    return NextResponse.json(comment, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
