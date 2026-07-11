'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Cpu, Network, Radio, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Gateway, IotNode } from '@/lib/api/client';

type Platform = 'gateway' | 'node';
type ReleaseStatus = 'draft' | 'active' | 'archived';
type ReleaseChannel = 'stable' | 'beta' | 'canary';

type FirmwareRelease = {
  id: string;
  platform: Platform;
  version: string;
  channel: ReleaseChannel;
  url: string;
  md5: string;
  size: number;
  notes: string;
  filename: string;
  status: ReleaseStatus;
  createdAt?: string;
};

type FleetNode = IotNode & {
  gatewayName: string;
  gatewayDbId: string;
  gatewayHardwareIdLabel: string;
};

export default function DeployUpdatesPage() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [nodes, setNodes] = useState<FleetNode[]>([]);
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [loadingInfra, setLoadingInfra] = useState(true);
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<'all' | Platform>('all');
  const [uploadPlatform, setUploadPlatform] = useState<Platform>('gateway');
  const [uploadVersion, setUploadVersion] = useState('');
  const [versionSource, setVersionSource] = useState<string | null>(null);
  const [uploadChannel, setUploadChannel] = useState<ReleaseChannel>('stable');
  const [uploadStatus, setUploadStatus] = useState<ReleaseStatus>('active');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [inspectHint, setInspectHint] = useState<string | null>(null);
  const [inspectingBin, setInspectingBin] = useState(false);

  const fetchInfrastructure = useCallback(async () => {
    setLoadingInfra(true);
    try {
      const gatewaysRes = await fetch('/api/eausure/gateways', {
        credentials: 'include',
        cache: 'no-store',
      });

      const gatewaysData = gatewaysRes.ok ? await gatewaysRes.json() : [];
      const gatewayList = Array.isArray(gatewaysData) ? gatewaysData : [];

      const nodeGroups = await Promise.all(
        gatewayList.map(async (gateway) => {
          const gatewayDbId = gateway._id || gateway.gatewayId;
          const response = await fetch(`/api/eausure/gateways/${encodeURIComponent(gatewayDbId)}/nodes`, {
            credentials: 'include',
            cache: 'no-store',
          });
          const data = response.ok ? await response.json() : [];
          const nodesForGateway = Array.isArray(data) ? data : [];
          return nodesForGateway.map((node) => ({
            ...node,
            gatewayDbId,
            gatewayHardwareIdLabel: gateway.gatewayId,
            gatewayName: gateway.name || gateway.gatewayId,
          }));
        })
      );

      setGateways(gatewayList);
      setNodes(nodeGroups.flat());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger l’état du parc.';
      toast.error(message);
    } finally {
      setLoadingInfra(false);
    }
  }, []);

  const fetchReleases = useCallback(async () => {
    setLoadingReleases(true);
    try {
      const response = await fetch('/api/admin/fuota/releases', {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = response.ok ? await response.json() : null;
      const nextReleases = Array.isArray(payload?.releases) ? payload.releases : [];
      setReleases(nextReleases);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de charger les releases firmware.';
      toast.error(message);
    } finally {
      setLoadingReleases(false);
    }
  }, []);

  useEffect(() => {
    void fetchInfrastructure();
    void fetchReleases();
  }, [fetchInfrastructure, fetchReleases]);

  useEffect(() => {
    if (uploadFile) {
      void inspectFirmwareFile(uploadFile);
    }
  }, [uploadPlatform, uploadChannel]);

  const latestGatewayRelease = useMemo(
    () => releases.find((release) => release.platform === 'gateway' && release.status === 'active' && release.channel === 'stable') || null,
    [releases]
  );

  const latestNodeRelease = useMemo(
    () => releases.find((release) => release.platform === 'node' && release.status === 'active' && release.channel === 'stable') || null,
    [releases]
  );

  const gatewayMetrics = useMemo(() => {
    const targetVersion = latestGatewayRelease?.version || '';
    const normalizeV = (v: string) => v.replace(/^v/i, '').trim();
    const targetNorm = normalizeV(targetVersion);
    const total = gateways.length;
    const unknown = gateways.filter((gateway) => !gateway.status?.firmwareVersion).length;
    const upToDate = targetNorm
      ? gateways.filter((gateway) => normalizeV(gateway.status?.firmwareVersion || '') === targetNorm).length
      : 0;
    const outdated = targetNorm
      ? gateways.filter((gateway) => {
          const v = normalizeV(gateway.status?.firmwareVersion || '');
          return !!v && v !== targetNorm;
        }).length
      : 0;

    return { total, upToDate, outdated, unknown, targetVersion: targetVersion || 'Non définie' };
  }, [gateways, latestGatewayRelease]);

  const nodeMetrics = useMemo(() => {
    const targetVersion = latestNodeRelease?.version || '';
    const normalizeV = (v: string) => v.replace(/^v/i, '').trim();
    const targetNorm = normalizeV(targetVersion);
    const total = nodes.length;
    const unknown = nodes.filter((node) => !node.status?.firmwareVersion).length;
    const upToDate = targetNorm
      ? nodes.filter((node) => normalizeV(node.status?.firmwareVersion || '') === targetNorm).length
      : 0;
    const outdated = targetNorm
      ? nodes.filter((node) => {
          const v = normalizeV(node.status?.firmwareVersion || '');
          return !!v && v !== targetNorm;
        }).length
      : 0;

    return { total, upToDate, outdated, unknown, targetVersion: targetVersion || 'Non définie' };
  }, [nodes, latestNodeRelease]);

  const gatewayVersionRows = useMemo(() => {
    const counts = new Map<string, number>();
    gateways.forEach((gateway) => {
      const version = gateway.status?.firmwareVersion || 'Inconnue';
      counts.set(version, (counts.get(version) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([version, count]) => ({ version, count })).sort((a, b) => b.count - a.count);
  }, [gateways]);

  const nodeVersionRows = useMemo(() => {
    const counts = new Map<string, number>();
    nodes.forEach((node) => {
      const version = node.status?.firmwareVersion || 'Inconnue';
      counts.set(version, (counts.get(version) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([version, count]) => ({ version, count })).sort((a, b) => b.count - a.count);
  }, [nodes]);

  const filteredReleases = useMemo(() => {
    if (filterPlatform === 'all') {
      return releases;
    }
    return releases.filter((release) => release.platform === filterPlatform);
  }, [filterPlatform, releases]);

  const inspectFirmwareFile = async (file: File) => {
    setInspectingBin(true);
    setInspectHint(null);
    setVersionSource(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('platform', uploadPlatform);
      formData.append('channel', uploadChannel);
      const response = await fetch('/api/admin/fuota/releases/inspect', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'Inspection du .bin impossible.');
      }
      if (payload?.version) {
        setUploadVersion(String(payload.version));
        setVersionSource(payload.versionSource ? String(payload.versionSource) : null);
      }
      setInspectHint(
        typeof payload?.hint === 'string'
          ? payload.hint
          : 'Version prête — publiez le .bin sans autre configuration.'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Inspection du .bin impossible.';
      setInspectHint(message);
    } finally {
      setInspectingBin(false);
    }
  };

  const handleUploadRelease = async () => {
    if (!uploadFile) {
      toast.error('Sélectionne un fichier .bin.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('platform', uploadPlatform);
      if (uploadVersion.trim()) {
        formData.append('version', uploadVersion.trim());
      }
      formData.append('channel', uploadChannel);
      formData.append('status', uploadStatus);
      formData.append('notes', uploadNotes.trim());
      formData.append('file', uploadFile);

      const response = await fetch('/api/admin/fuota/releases/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : typeof payload?.message === 'string'
              ? payload.message
              : 'Upload firmware impossible.'
        );
      }

      toast.success('Release firmware publiée dans l’écosystème.');
      setUploadFile(null);
      setUploadVersion('');
      setUploadNotes('');
      await fetchReleases();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload firmware impossible.';
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50/70 px-5 py-8 dark:bg-background sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-600">EauSure · Firmware Ecosystem</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-foreground">Releases et propagation FUOTA</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
            Le rôle de l’administrateur propriétaire est de publier une release globale et de suivre la propagation sur le parc. Le déclenchement OTA/FUOTA opérationnel revient ensuite aux utilisateurs via l’application mobile.
          </p>
        </div>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-sky-500/10 p-3 text-sky-700 dark:text-sky-300">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Publier une nouvelle release</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Exportez le `.bin` depuis Arduino, uploadez-le ici : la version est attribuée automatiquement
                (binaire, nom de fichier ou incrément) et injectée dans l’image avant publication FUOTA.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Plateforme</label>
              <Select value={uploadPlatform} onValueChange={(value: Platform) => setUploadPlatform(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gateway">Gateway</SelectItem>
                  <SelectItem value="node">Node</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Version (automatique)</label>
              <Input
                value={uploadVersion}
                onChange={(event) => setUploadVersion(event.target.value)}
                placeholder="Choisir un .bin pour calculer la version"
              />
              {versionSource ? (
                <p className="text-xs text-muted-foreground">Source : {versionSource}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Canal</label>
              <Select value={uploadChannel} onValueChange={(value: ReleaseChannel) => setUploadChannel(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stable">Stable</SelectItem>
                  <SelectItem value="beta">Beta</SelectItem>
                  <SelectItem value="canary">Canary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Statut</label>
              <Select value={uploadStatus} onValueChange={(value: ReleaseStatus) => setUploadStatus(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Brouillon</SelectItem>
                  <SelectItem value="archived">Archivée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Fichier `.bin`</label>
              <Input
                type="file"
                accept=".bin,application/octet-stream"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setUploadFile(file);
                  setInspectHint(null);
                  if (file) {
                    void inspectFirmwareFile(file);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                {inspectingBin
                  ? 'Lecture de la version embarquée dans le .bin...'
                  : uploadFile
                    ? `${uploadFile.name} · ${uploadFile.size} bytes`
                    : 'Aucun fichier sélectionné'}
              </p>
              {inspectHint ? <p className="text-xs text-sky-700 dark:text-sky-300">{inspectHint}</p> : null}
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={uploadNotes}
                onChange={(event) => setUploadNotes(event.target.value)}
                placeholder="Contexte de la release, changements majeurs, remarques d’exploitation..."
                className="min-h-24"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button onClick={() => void handleUploadRelease()} disabled={uploading}>
              {uploading ? 'Publication en cours...' : 'Publier la release'}
            </Button>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Gateway cible */}
          <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#2563eb]">Gateway cible</p>
            <p className="mt-2 font-mono text-2xl font-bold text-[#1e40af]">{gatewayMetrics.targetVersion}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#bfdbfe]">
              <div className="h-full rounded-full bg-[#2563eb] transition-all" style={{ width: gatewayMetrics.total ? `${Math.round((gatewayMetrics.upToDate / gatewayMetrics.total) * 100)}%` : '0%' }} />
            </div>
            <p className="mt-1.5 text-xs text-[#2563eb]">{gatewayMetrics.upToDate}/{gatewayMetrics.total} à jour</p>
          </div>

          {/* Gateway obsolètes */}
          <div className={`rounded-2xl border p-5 shadow-sm ${gatewayMetrics.outdated > 0 ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#bbf7d0] bg-[#f0fdf4]'}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${gatewayMetrics.outdated > 0 ? 'text-[#b45309]' : 'text-[#15803d]'}`}>Gateway obsolètes</p>
            <p className={`mt-2 text-3xl font-bold ${gatewayMetrics.outdated > 0 ? 'text-[#92400e]' : 'text-[#14532d]'}`}>{gatewayMetrics.outdated}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
              <div className="h-full rounded-full transition-all" style={{ width: gatewayMetrics.total ? `${Math.round((gatewayMetrics.outdated / gatewayMetrics.total) * 100)}%` : '0%', backgroundColor: gatewayMetrics.outdated > 0 ? '#f59e0b' : '#22c55e' }} />
            </div>
            <p className={`mt-1.5 text-xs ${gatewayMetrics.outdated > 0 ? 'text-[#b45309]' : 'text-[#15803d]'}`}>{gatewayMetrics.unknown} version(s) inconnue(s)</p>
          </div>

          {/* Node cible */}
          <div className="rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5] p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#059669]">Node cible</p>
            <p className="mt-2 font-mono text-2xl font-bold text-[#065f46]">{nodeMetrics.targetVersion}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#a7f3d0]">
              <div className="h-full rounded-full bg-[#10b981] transition-all" style={{ width: nodeMetrics.total ? `${Math.round((nodeMetrics.upToDate / nodeMetrics.total) * 100)}%` : '0%' }} />
            </div>
            <p className="mt-1.5 text-xs text-[#059669]">{nodeMetrics.upToDate}/{nodeMetrics.total} à jour</p>
          </div>

          {/* Node obsolètes */}
          <div className={`rounded-2xl border p-5 shadow-sm ${nodeMetrics.outdated > 0 ? 'border-[#fecaca] bg-[#fef2f2]' : 'border-[#bbf7d0] bg-[#f0fdf4]'}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${nodeMetrics.outdated > 0 ? 'text-[#dc2626]' : 'text-[#15803d]'}`}>Node obsolètes</p>
            <p className={`mt-2 text-3xl font-bold ${nodeMetrics.outdated > 0 ? 'text-[#991b1b]' : 'text-[#14532d]'}`}>{nodeMetrics.outdated}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
              <div className="h-full rounded-full transition-all" style={{ width: nodeMetrics.total ? `${Math.round((nodeMetrics.outdated / nodeMetrics.total) * 100)}%` : '0%', backgroundColor: nodeMetrics.outdated > 0 ? '#ef4444' : '#22c55e' }} />
            </div>
            <p className={`mt-1.5 text-xs ${nodeMetrics.outdated > 0 ? 'text-[#dc2626]' : 'text-[#15803d]'}`}>{nodeMetrics.unknown} version(s) inconnue(s)</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-700 dark:text-amber-300">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Catalogue des releases</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Historique des firmwares publiés et versions de référence actives pour l’écosystème.
                  </p>
                </div>
              </div>

              <Select value={filterPlatform} onValueChange={(value: 'all' | Platform) => setFilterPlatform(value)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="gateway">Gateway</SelectItem>
                  <SelectItem value="node">Node</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-5 space-y-3">
              {loadingReleases ? (
                <div className="flex items-center justify-center py-10 text-sm text-[#64748b]">Chargement des releases...</div>
              ) : filteredReleases.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Radio className="h-8 w-8 text-[#cbd5e1]" />
                  <p className="text-sm text-[#64748b]">Aucune release enregistrée.</p>
                </div>
              ) : (
                filteredReleases.map((release) => {
                  const platformColor = release.platform === 'gateway'
                    ? { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' }
                    : { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' };

                  const channelColor = release.channel === 'stable'
                    ? { bg: '#f0fdf4', text: '#15803d' }
                    : release.channel === 'beta'
                      ? { bg: '#fffbeb', text: '#b45309' }
                      : { bg: '#fef2f2', text: '#dc2626' };

                  const statusColor = release.status === 'active'
                    ? { bg: '#f0fdf4', text: '#15803d', dot: '#22c55e' }
                    : release.status === 'draft'
                      ? { bg: '#f8fafc', text: '#64748b', dot: '#94a3b8' }
                      : { bg: '#fef2f2', text: '#dc2626', dot: '#ef4444' };

                  const statusLabel = { active: 'Active', draft: 'Brouillon', archived: 'Archivée' }[release.status];

                  return (
                    <div key={release.id} className="flex items-center gap-4 rounded-2xl border border-[#e2e8f0] bg-white px-4 py-3.5 shadow-sm hover:border-[#bae6fd] transition-colors">
                      {/* Version + filename */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold text-[#0f172a]">{release.version}</span>
                          {release.filename && (
                            <span className="text-xs text-[#94a3b8] truncate max-w-32">{release.filename}</span>
                          )}
                        </div>
                        {release.notes && (
                          <p className="mt-0.5 text-xs text-[#64748b] truncate">{release.notes}</p>
                        )}
                        {release.createdAt && (
                          <p className="mt-0.5 text-[10px] text-[#94a3b8]">
                            {new Date(release.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        {/* Platform */}
                        <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: platformColor.bg, color: platformColor.text, borderColor: platformColor.border }}>
                          {release.platform === 'gateway' ? 'Gateway' : 'Node'}
                        </span>

                        {/* Channel */}
                        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: channelColor.bg, color: channelColor.text }}>
                          {release.channel}
                        </span>

                        {/* Status */}
                        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: statusColor.bg, color: statusColor.text }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor.dot }} />
                          {statusLabel}
                        </span>

                        {/* Size */}
                        {release.size > 0 && (
                          <span className="text-[10px] text-[#94a3b8]">
                            {(release.size / 1024).toFixed(0)} KB
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">État global du parc</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Vision simple des versions réellement présentes dans les gateways et les nœuds de mesure.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <VersionBlock title="Gateways" rows={gatewayVersionRows} loading={loadingInfra} />
              <VersionBlock title="Nodes" rows={nodeVersionRows} loading={loadingInfra} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function VersionBlock({
  title,
  rows,
  loading,
}: {
  title: string;
  rows: Array<{ version: string; count: number }>;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-muted/20 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Chargement...</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Aucune donnée versionnelle.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <div key={`${title}-${row.version}`} className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
              <span className="text-sm font-medium">{row.version}</span>
              <Badge variant="outline">{row.count}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
