'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, Search, ShieldCheck, ShieldOff, RefreshCw, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  authProvider: string;
  lastLogin: string | null;
  createdAt: string | null;
  adminNotes: string;
};

type Meta = { page: number; limit: number; total: number; totalPages: number };

export default function ManageUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended'>('active');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Impossible de charger les utilisateurs.');
      const payload = await res.json();
      setUsers(Array.isArray(payload.users) ? payload.users : []);
      setMeta(payload.meta || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditStatus(user.status);
    setEditNotes(user.adminNotes || '');
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole, status: editStatus, adminNotes: editNotes }),
      });
      if (!res.ok) throw new Error('Impossible de mettre à jour.');
      toast.success('Utilisateur mis à jour.');
      setEditingUser(null);
      void fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return 'Jamais';
    return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0ea5e9]">Administration</p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Gestion des utilisateurs</h1>
            <p className="mt-1 text-sm text-[#64748b]">
              Gérez les rôles, statuts et notes des comptes enregistrés.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void fetchUsers()}
            className="gap-2 rounded-xl border-[#e2e8f0] bg-white text-[#0f172a] hover:bg-[#f0f9ff]"
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
          <div className="relative flex-1 min-w-48">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Rechercher par email ou nom..."
              className="pl-9 rounded-xl border-[#e2e8f0]"
            />
          </div>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36 rounded-xl border-[#e2e8f0]">
              <SelectValue placeholder="Rôle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les rôles</SelectItem>
              <SelectItem value="user">Utilisateur</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36 rounded-xl border-[#e2e8f0]">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="suspended">Suspendu</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Stats pills */}
        {meta && (
          <div className="flex gap-3">
            <div className="flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm shadow-sm">
              <Users className="h-4 w-4 text-[#0ea5e9]" />
              <span className="font-semibold text-[#0f172a]">{meta.total}</span>
              <span className="text-[#64748b]">utilisateurs</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-4 py-2 text-sm shadow-sm">
              <span className="text-[#64748b]">Page {meta.page} / {meta.totalPages}</span>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-[#64748b]">
              Chargement...
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <Users className="h-10 w-10 text-[#cbd5e1]" />
              <p className="text-sm text-[#64748b]">Aucun utilisateur trouvé.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                  <TableHead className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Utilisateur</TableHead>
                  <TableHead className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Rôle</TableHead>
                  <TableHead className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Statut</TableHead>
                  <TableHead className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Fournisseur</TableHead>
                  <TableHead className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Dernière connexion</TableHead>
                  <TableHead className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="border-b border-[#f8fafc] hover:bg-[#f0f9ff]/40 transition-colors">
                    <TableCell className="px-5 py-4">
                      <p className="font-medium text-[#0f172a]">{user.name || '—'}</p>
                      <p className="text-xs text-[#64748b]">{user.email}</p>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Badge className={user.role === 'admin'
                        ? 'border-[#bae6fd] bg-[#e0f2fe] text-[#0369a1]'
                        : 'border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
                      }>
                        {user.role === 'admin' ? 'Admin' : 'Utilisateur'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-4">
                      <Badge className={user.status === 'active'
                        ? 'border-[#bbf7d0] bg-[#dcfce7] text-[#15803d]'
                        : 'border-[#fecaca] bg-[#fee2e2] text-[#dc2626]'
                      }>
                        {user.status === 'active' ? 'Actif' : 'Suspendu'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#64748b] capitalize">{user.authProvider}</TableCell>
                    <TableCell className="px-5 py-4 text-sm text-[#64748b]">{formatDate(user.lastLogin)}</TableCell>
                    <TableCell className="px-5 py-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(user)}
                        className="gap-1.5 rounded-xl border-[#e2e8f0] text-[#0ea5e9] hover:bg-[#f0f9ff]"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        Modifier
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-xl border-[#e2e8f0]"
            >
              Précédent
            </Button>
            <span className="text-sm text-[#64748b]">Page {page} / {meta.totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl border-[#e2e8f0]"
            >
              Suivant
            </Button>
          </div>
        )}

        {/* Edit modal */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-xl">
              <h2 className="mb-1 text-lg font-bold text-[#0f172a]">Modifier l'utilisateur</h2>
              <p className="mb-5 text-sm text-[#64748b]">{editingUser.email}</p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#0f172a]">Rôle</label>
                  <Select value={editRole} onValueChange={(v) => setEditRole(v as 'user' | 'admin')}>
                    <SelectTrigger className="rounded-xl border-[#e2e8f0]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Utilisateur</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#0f172a]">Statut</label>
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as 'active' | 'suspended')}>
                    <SelectTrigger className="rounded-xl border-[#e2e8f0]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#22c55e]" />Actif</span>
                      </SelectItem>
                      <SelectItem value="suspended">
                        <span className="flex items-center gap-2"><ShieldOff className="h-4 w-4 text-[#ef4444]" />Suspendu</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#0f172a]">Note interne</label>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Note visible uniquement par les admins..."
                    className="min-h-24 rounded-xl border-[#e2e8f0]"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  onClick={() => setEditingUser(null)}
                  variant="outline"
                  className="flex-1 rounded-xl border-[#e2e8f0]"
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => void saveEdit()}
                  disabled={saving}
                  className="flex-1 rounded-xl bg-[#0ea5e9] text-white hover:bg-[#0284c7]"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
