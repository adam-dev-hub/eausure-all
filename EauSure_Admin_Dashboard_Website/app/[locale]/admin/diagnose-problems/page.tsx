'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  LifeBuoy, Github, FileText, RefreshCw, Plus, MessageSquare,
  CheckCircle2, Circle, Tag, ExternalLink, Save, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Types ────────────────────────────────────────────────────────────────────

type GHIssue = {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  labels: Array<{ name: string; color: string }>;
  created_at: string;
  updated_at: string;
  html_url: string;
  comments: number;
  user: { login: string; avatar_url: string };
};

type GHComment = {
  id: number;
  body: string;
  created_at: string;
  user: { login: string; avatar_url: string };
};

type DocEntry = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
};

type View = 'issues' | 'issue-detail' | 'docs' | 'doc-edit';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function labelColor(hex: string) {
  return `#${hex}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DiagnoseProblemsPage() {
  const [view, setView] = useState<View>('issues');

  // Repo selection
  const [repos, setRepos] = useState<Array<{ name: string; fullName: string }>>([]);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [reposLoading, setReposLoading] = useState(true);
  // Issues state
  const [issues, setIssues] = useState<GHIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [selectedIssue, setSelectedIssue] = useState<GHIssue | null>(null);
  const [comments, setComments] = useState<GHComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  // New issue form
  const [showNewIssue, setShowNewIssue] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newLabels, setNewLabels] = useState('');
  const [creatingIssue, setCreatingIssue] = useState(false);

  // Docs state
  const [docEntries, setDocEntries] = useState<DocEntry[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docPath, setDocPath] = useState('');
  const [docContent, setDocContent] = useState('');
  const [docSha, setDocSha] = useState('');
  const [docName, setDocName] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [savingDoc, setSavingDoc] = useState(false);

  // ── Load repos on mount ─────────────────────────────────────────────────────

  useEffect(() => {
    async function loadRepos() {
      setReposLoading(true);
      try {
        const res = await fetch('/api/github/docs', { credentials: 'include', cache: 'no-store' });
        if (!res.ok) throw new Error('Impossible de charger les repos.');
        const data = await res.json();
        setRepos(data);
        if (data.length > 0) setSelectedRepo(data[0].name);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur.');
      } finally {
        setReposLoading(false);
      }
    }
    void loadRepos();
  }, []);

  // ── Issues ──────────────────────────────────────────────────────────────────

  const fetchIssues = useCallback(async () => {
    if (!selectedRepo) return;
    setIssuesLoading(true);
    try {
      const res = await fetch(`/api/github/issues?repo=${encodeURIComponent(selectedRepo)}&state=${stateFilter}&per_page=30`, {
        credentials: 'include', cache: 'no-store',
      });
      if (!res.ok) throw new Error('Impossible de charger les issues GitHub.');
      setIssues(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setIssuesLoading(false);
    }
  }, [stateFilter, selectedRepo]);

  useEffect(() => { if (view === 'issues') void fetchIssues(); }, [view, fetchIssues]);

  const openIssue = async (issue: GHIssue) => {
    setSelectedIssue(issue);
    setView('issue-detail');
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/github/issues/${issue.number}?repo=${encodeURIComponent(selectedRepo)}`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Impossible de charger les commentaires.');
      setComments(await res.json());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleIssueState = async () => {
    if (!selectedIssue) return;
    const newState = selectedIssue.state === 'open' ? 'closed' : 'open';
    try {
      const res = await fetch(`/api/github/issues/${selectedIssue.number}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: selectedRepo, state: newState }),
      });
      if (!res.ok) throw new Error('Impossible de mettre à jour.');
      const updated = await res.json();
      setSelectedIssue(updated);
      toast.success(`Issue ${newState === 'closed' ? 'fermée' : 'rouverte'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const sendComment = async () => {
    if (!selectedIssue || !newComment.trim()) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/github/issues/${selectedIssue.number}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: selectedRepo, body: newComment.trim() }),
      });
      if (!res.ok) throw new Error('Impossible d\'envoyer le commentaire.');
      const comment = await res.json();
      setComments((prev) => [...prev, comment]);
      setNewComment('');
      toast.success('Commentaire ajouté.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSendingComment(false);
    }
  };

  const createIssue = async () => {
    if (!newTitle.trim()) { toast.error('Titre requis.'); return; }
    setCreatingIssue(true);
    try {
      const labels = newLabels.split(',').map((l) => l.trim()).filter(Boolean);
      const res = await fetch('/api/github/issues', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: selectedRepo, title: newTitle.trim(), body: newBody.trim() || undefined, labels }),
      });
      if (!res.ok) throw new Error('Impossible de créer l\'issue.');
      toast.success('Issue créée sur GitHub.');
      setNewTitle(''); setNewBody(''); setNewLabels('');
      setShowNewIssue(false);
      void fetchIssues();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setCreatingIssue(false);
    }
  };

  // ── Docs ────────────────────────────────────────────────────────────────────

  const fetchDocs = useCallback(async (path = '') => {
    if (!selectedRepo) return;
    setDocsLoading(true);
    try {
      const params = new URLSearchParams({ repo: selectedRepo });
      if (path) params.set('path', path);
      const res = await fetch(`/api/github/docs?${params}`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Impossible de charger la documentation.');
      const data = await res.json();
      setDocEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setDocsLoading(false);
    }
  }, [selectedRepo]);

  useEffect(() => { if (view === 'docs') void fetchDocs(); }, [view, fetchDocs]);

  const openDoc = async (entry: DocEntry) => {
    try {
      const res = await fetch(`/api/github/docs/${encodeURIComponent(entry.path)}?repo=${encodeURIComponent(selectedRepo)}`, {
        credentials: 'include', cache: 'no-store',
      });
      if (!res.ok) throw new Error('Impossible de charger le fichier.');
      const data = await res.json();
      setDocPath(data.path);
      setDocContent(data.content);
      setDocSha(data.sha);
      setDocName(data.name);
      setCommitMessage(`docs: update ${data.name}`);
      setView('doc-edit');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    }
  };

  const saveDoc = async () => {
    if (!commitMessage.trim()) { toast.error('Message de commit requis.'); return; }
    setSavingDoc(true);
    try {
      const res = await fetch(`/api/github/docs/${encodeURIComponent(docPath)}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: selectedRepo, content: docContent, message: commitMessage.trim(), sha: docSha }),
      });
      if (!res.ok) throw new Error('Impossible de sauvegarder.');
      const data = await res.json();
      setDocSha(data.content?.sha || docSha);
      toast.success('Documentation mise à jour sur GitHub.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSavingDoc(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fafc] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0ea5e9]">Support & Documentation</p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Tickets & Documentation</h1>
            <p className="mt-1 text-sm text-[#64748b]">
              Suivi des issues GitHub et édition de la documentation Markdown.
            </p>
          </div>
          {/* Tab switcher */}
          <div className="flex gap-2 rounded-xl border border-[#e2e8f0] bg-white p-1 shadow-sm">
            <button
              onClick={() => setView('issues')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                view === 'issues' || view === 'issue-detail'
                  ? 'bg-[#0ea5e9] text-white'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <Github className="h-4 w-4" />
              Issues
            </button>
            <button
              onClick={() => setView('docs')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                view === 'docs' || view === 'doc-edit'
                  ? 'bg-[#0ea5e9] text-white'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <FileText className="h-4 w-4" />
              Documentation
            </button>
          </div>
        </div>

        {/* Repo selector — commun aux deux onglets */}
        <div className="flex items-center gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-3 shadow-sm">
          <Github className="h-4 w-4 shrink-0 text-[#64748b]" />
          <span className="text-sm text-[#64748b] shrink-0">Repo :</span>
          {reposLoading ? (
            <span className="text-sm text-[#94a3b8]">Chargement...</span>
          ) : (
            <Select value={selectedRepo} onValueChange={(v) => { setSelectedRepo(v); setIssues([]); setDocEntries([]); }}>
              <SelectTrigger className="flex-1 rounded-xl border-[#e2e8f0]">
                <SelectValue placeholder="Sélectionner un repo..." />
              </SelectTrigger>
              <SelectContent>
                {repos.map((r) => (
                  <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ── ISSUES LIST ── */}
        {view === 'issues' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as typeof stateFilter)}>
                <SelectTrigger className="w-36 rounded-xl border-[#e2e8f0]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Ouvertes</SelectItem>
                  <SelectItem value="closed">Fermées</SelectItem>
                  <SelectItem value="all">Toutes</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void fetchIssues()} className="gap-2 rounded-xl border-[#e2e8f0]">
                <RefreshCw className="h-4 w-4" />
                Actualiser
              </Button>
              <Button onClick={() => setShowNewIssue(!showNewIssue)} className="ml-auto gap-2 rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]">
                <Plus className="h-4 w-4" />
                Nouvelle issue
              </Button>
            </div>

            {/* New issue form */}
            {showNewIssue && (
              <div className="rounded-2xl border border-[#bae6fd] bg-[#f0f9ff] p-5 space-y-3">
                <h3 className="font-semibold text-[#0f172a]">Créer une issue GitHub</h3>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Titre de l'issue" className="rounded-xl border-[#e2e8f0] bg-white" />
                <Textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} placeholder="Description (Markdown supporté)..." className="min-h-28 rounded-xl border-[#e2e8f0] bg-white" />
                <Input value={newLabels} onChange={(e) => setNewLabels(e.target.value)} placeholder="Labels séparés par virgule (ex: bug, documentation)" className="rounded-xl border-[#e2e8f0] bg-white" />
                <div className="flex gap-2">
                  <Button onClick={() => void createIssue()} disabled={creatingIssue} className="rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]">
                    {creatingIssue ? 'Création...' : 'Créer'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowNewIssue(false)} className="rounded-xl border-[#e2e8f0]">Annuler</Button>
                </div>
              </div>
            )}

            {/* Issues list */}
            <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
              {issuesLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-[#64748b]">Chargement...</div>
              ) : issues.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <LifeBuoy className="h-10 w-10 text-[#cbd5e1]" />
                  <p className="text-sm text-[#64748b]">Aucune issue {stateFilter !== 'all' ? stateFilter === 'open' ? 'ouverte' : 'fermée' : ''}.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f8fafc]">
                  {issues.map((issue) => (
                    <button
                      key={issue.number}
                      onClick={() => void openIssue(issue)}
                      className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-[#f0f9ff] transition-colors"
                    >
                      {issue.state === 'open'
                        ? <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]" />
                        : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#8b5cf6]" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[#0f172a] truncate">#{issue.number} {issue.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {issue.labels.map((l) => (
                            <span key={l.name} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${labelColor(l.color)}22`, color: labelColor(l.color) }}>
                              <Tag className="h-2.5 w-2.5" />{l.name}
                            </span>
                          ))}
                          <span className="text-xs text-[#94a3b8]">{formatDate(issue.created_at)}</span>
                          {issue.comments > 0 && (
                            <span className="flex items-center gap-1 text-xs text-[#94a3b8]">
                              <MessageSquare className="h-3 w-3" />{issue.comments}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[#cbd5e1]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ISSUE DETAIL ── */}
        {view === 'issue-detail' && selectedIssue && (
          <div className="space-y-4">
            <button onClick={() => setView('issues')} className="flex items-center gap-2 text-sm text-[#64748b] hover:text-[#0f172a]">
              <ArrowLeft className="h-4 w-4" />Retour aux issues
            </button>

            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={selectedIssue.state === 'open' ? 'border-[#bbf7d0] bg-[#dcfce7] text-[#15803d]' : 'border-[#ddd6fe] bg-[#ede9fe] text-[#6d28d9]'}>
                      {selectedIssue.state === 'open' ? 'Ouverte' : 'Fermée'}
                    </Badge>
                    <span className="text-sm text-[#94a3b8]">#{selectedIssue.number}</span>
                  </div>
                  <h2 className="text-xl font-bold text-[#0f172a]">{selectedIssue.title}</h2>
                  <p className="mt-1 text-xs text-[#94a3b8]">Ouvert le {formatDate(selectedIssue.created_at)} par {selectedIssue.user.login}</p>
                  {selectedIssue.labels.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedIssue.labels.map((l) => (
                        <span key={l.name} className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: `${labelColor(l.color)}22`, color: labelColor(l.color) }}>
                          {l.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void toggleIssueState()} className="rounded-xl border-[#e2e8f0]">
                    {selectedIssue.state === 'open' ? 'Fermer' : 'Rouvrir'}
                  </Button>
                  <a href={selectedIssue.html_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5 rounded-xl border-[#e2e8f0]">
                      <ExternalLink className="h-3.5 w-3.5" />GitHub
                    </Button>
                  </a>
                </div>
              </div>
              {selectedIssue.body && (
                <div className="mt-5 rounded-xl border border-[#f1f5f9] bg-[#f8fafc] p-4 text-sm text-[#0f172a] whitespace-pre-wrap">
                  {selectedIssue.body}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
              <div className="border-b border-[#f1f5f9] px-5 py-4">
                <h3 className="font-semibold text-[#0f172a]">Commentaires ({comments.length})</h3>
              </div>
              {commentsLoading ? (
                <div className="py-8 text-center text-sm text-[#64748b]">Chargement...</div>
              ) : (
                <div className="divide-y divide-[#f8fafc]">
                  {comments.map((c) => (
                    <div key={c.id} className="px-5 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <img src={c.user.avatar_url} alt={c.user.login} className="h-6 w-6 rounded-full" />
                        <span className="text-sm font-medium text-[#0f172a]">{c.user.login}</span>
                        <span className="text-xs text-[#94a3b8]">{formatDate(c.created_at)}</span>
                      </div>
                      <p className="text-sm text-[#0f172a] whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-[#f1f5f9] p-5 space-y-3">
                <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Ajouter un commentaire admin..." className="min-h-24 rounded-xl border-[#e2e8f0]" />
                <Button onClick={() => void sendComment()} disabled={sendingComment || !newComment.trim()} className="gap-2 rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]">
                  <MessageSquare className="h-4 w-4" />
                  {sendingComment ? 'Envoi...' : 'Commenter'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── DOCS LIST ── */}
        {view === 'docs' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => void fetchDocs()} className="gap-2 rounded-xl border-[#e2e8f0]">
                <RefreshCw className="h-4 w-4" />Actualiser
              </Button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
              {docsLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-[#64748b]">Chargement...</div>
              ) : docEntries.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                  <FileText className="h-10 w-10 text-[#cbd5e1]" />
                  <p className="text-sm text-[#64748b]">Aucun fichier trouvé dans le dossier docs/.</p>
                  <p className="text-xs text-[#94a3b8]">Vérifiez que GITHUB_REPO et GITHUB_TOKEN sont configurés.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f8fafc]">
                  {docEntries.filter((e) => e.type === 'file' && e.name.endsWith('.md')).map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => void openDoc(entry)}
                      className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-[#f0f9ff] transition-colors"
                    >
                      <FileText className="h-5 w-5 shrink-0 text-[#0ea5e9]" />
                      <div className="flex-1">
                        <p className="font-medium text-[#0f172a]">{entry.name}</p>
                        <p className="text-xs text-[#94a3b8]">{entry.path}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[#cbd5e1]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DOC EDITOR ── */}
        {view === 'doc-edit' && (
          <div className="space-y-4">
            <button onClick={() => setView('docs')} className="flex items-center gap-2 text-sm text-[#64748b] hover:text-[#0f172a]">
              <ArrowLeft className="h-4 w-4" />Retour à la documentation
            </button>
            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-[#0f172a]">{docName}</h2>
                  <p className="text-xs text-[#94a3b8]">{docPath}</p>
                </div>
                <Button onClick={() => void saveDoc()} disabled={savingDoc} className="gap-2 rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]">
                  <Save className="h-4 w-4" />
                  {savingDoc ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
              </div>
              <Input
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Message de commit..."
                className="rounded-xl border-[#e2e8f0] font-mono text-sm"
              />
              <Textarea
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                className="min-h-[60vh] rounded-xl border-[#e2e8f0] font-mono text-sm"
                spellCheck={false}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

type TicketRecord = {
  _id: string;
  ticketId: string;
  userName: string;
  userEmail: string;
  category: string;
  priority: string;
  status: string;
  title: string;
  description: string;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
};

type WaitingChat = {
  userId: string;
  name: string;
  email: string;
  reason: string;
  waitTimeSeconds: number;
};

type ActiveChat = {
  chat: {
    status: string;
    messages: Array<{ role: string; text: string; timestamp: string }>;
    suspendedBy?: string | null;
  } | null;
  user: {
    userId: string;
    name: string;
    email: string;
    phone?: string;
    address?: string;
  } | null;
};

