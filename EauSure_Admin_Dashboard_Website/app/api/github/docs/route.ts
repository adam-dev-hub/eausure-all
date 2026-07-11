import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { listMarkdownFiles, listOrgRepos } from '@/lib/api/github';

const cookieName = process.env.NODE_ENV === 'production'
  ? '__Host-eausure.session' : 'eausure.session';

async function requireAdmin(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName });
  return token?.role === 'admin' ? token : null;
}

// GET /api/github/docs?repo=firmware&path=docs
// GET /api/github/docs (sans repo → liste les repos de l'org)
export async function GET(req: NextRequest) {
  if (!await requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const repo = req.nextUrl.searchParams.get('repo');
    if (!repo) {
      // Retourne la liste des repos de l'organisation
      const repos = await listOrgRepos();
      return NextResponse.json(repos);
    }
    const path = req.nextUrl.searchParams.get('path') || '';
    const entries = await listMarkdownFiles(repo, path);
    return NextResponse.json(entries);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
