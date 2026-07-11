/**
 * GitHub API helper — proxy sécurisé côté serveur.
 * Utilise GITHUB_TOKEN (Personal Access Token avec scope repo).
 * GITHUB_ORG = nom de l'organisation (ex: "EauSure")
 * Le repo est passé dynamiquement dans chaque appel.
 */

const GITHUB_API = 'https://api.github.com';

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const org   = process.env.GITHUB_ORG || 'EauSure';
  if (!token) throw new Error('GITHUB_TOKEN is not configured');
  return { token, org };
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

// ── Repos de l'organisation ──────────────────────────────────────────────────

export async function listOrgRepos() {
  const { token, org } = getConfig();
  const res = await fetch(`${GITHUB_API}/orgs/${org}/repos?per_page=50&sort=updated`, {
    headers: githubHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub list repos failed: ${res.status}`);
  const repos = await res.json();
  return (repos as Array<{ name: string; full_name: string; description: string | null; private: boolean }>)
    .map((r) => ({ name: r.name, fullName: r.full_name, description: r.description, private: r.private }));
}

// ── Issues (tickets) ─────────────────────────────────────────────────────────

export async function listIssues(repo: string, params?: {
  state?: 'open' | 'closed' | 'all';
  labels?: string;
  per_page?: number;
  page?: number;
}) {
  const { token, org } = getConfig();
  const qs = new URLSearchParams();
  if (params?.state)    qs.set('state',    params.state);
  if (params?.labels)   qs.set('labels',   params.labels);
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  if (params?.page)     qs.set('page',     String(params.page));

  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}/issues?${qs}`, {
    headers: githubHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub issues list failed: ${res.status}`);
  return res.json();
}

export async function createIssue(repo: string, payload: {
  title: string;
  body?: string;
  labels?: string[];
}) {
  const { token, org } = getConfig();
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}/issues`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`GitHub create issue failed: ${res.status}`);
  return res.json();
}

export async function updateIssue(repo: string, number: number, payload: {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
}) {
  const { token, org } = getConfig();
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}/issues/${number}`, {
    method: 'PATCH',
    headers: githubHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`GitHub update issue failed: ${res.status}`);
  return res.json();
}

export async function addIssueComment(repo: string, number: number, body: string) {
  const { token, org } = getConfig();
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}/issues/${number}/comments`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error(`GitHub add comment failed: ${res.status}`);
  return res.json();
}

export async function listIssueComments(repo: string, number: number) {
  const { token, org } = getConfig();
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}/issues/${number}/comments`, {
    headers: githubHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub list comments failed: ${res.status}`);
  return res.json();
}

// ── Documentation (fichiers Markdown) ────────────────────────────────────────

export async function getFileContent(repo: string, path: string) {
  const { token, org } = getConfig();
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}/contents/${path}`, {
    headers: githubHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub get file failed: ${res.status}`);
  const data = await res.json();
  const content = Buffer.from(data.content, 'base64').toString('utf-8');
  return { content, sha: data.sha, path: data.path, name: data.name };
}

export async function upsertFile(repo: string, path: string, content: string, message: string, sha?: string) {
  const { token, org } = getConfig();
  const encoded = Buffer.from(content, 'utf-8').toString('base64');
  const body: Record<string, unknown> = { message, content: encoded };
  if (sha) body.sha = sha;

  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: githubHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub upsert file failed: ${res.status}`);
  return res.json();
}

export async function listMarkdownFiles(repo: string, path = '') {
  const { token, org } = getConfig();
  const res = await fetch(`${GITHUB_API}/repos/${org}/${repo}/contents/${path}`, {
    headers: githubHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GitHub list directory failed: ${res.status}`);
  const entries = await res.json();
  // Retourne uniquement les fichiers .md et les dossiers
  return (entries as Array<{ name: string; path: string; type: string; sha: string }>)
    .filter((e) => e.type === 'dir' || e.name.endsWith('.md'));
}
