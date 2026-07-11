'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Activity, Cpu, Gauge, Network, RefreshCcw, Search, Signal, Clock, Wifi, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Gateway, IotNode } from '@/lib/api/client';

type NodeRow = IotNode & {
  gatewayName: string;
  gatewayDbId: string;
  gatewayHardwareIdLabel: string;
};

type NodeStatusFilter = 'all' | 'active' | 'inactive';

// ── Status helpers ────────────────────────────────────────────────────────────

/**
 * Gateway is online if last heartbeat is within 2 × heartbeat interval.
 * Heartbeat interval = measureInterval / 2 (min 15s, max 30min).
 * Falls back to 5 minutes if no config.
 */
function isGatewayOnline(gw: Gateway): boolean {
  const lastSeen = gw.lastSeenAt || gw.status?.lastHeartbeatAt;
  if (!lastSeen) return false;
  const measureSec = gw.config?.measureInterval ?? 60;
  const heartbeatSec = Math.max(15, Math.min(1800, measureSec / 2));
  const thresholdMs = heartbeatSec * 2 * 1000;
  return Date.now() - new Date(lastSeen).getTime() < thresholdMs;
}

/**
 * Node is active if last seen within 2 × measureInterval.
 * This tolerates one missed cycle before marking inactive.
 */
function isNodeActive(node: IotNode, gatewayMeasureInterval?: number): boolean {
  const lastSeen = node.status?.lastSeenAt;
  if (!lastSeen) return false;
  const intervalSec = gatewayMeasureInterval ?? 60;
  const thresholdMs = intervalSec * 2 * 1000;
  return Date.now() - new Date(lastSeen).getTime() < thresholdMs;
}

export default function SuperviseSystemPage() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<NodeStatusFilter>('all');
  const [selectedGatewayId, setSelectedGatewayId] = useState('all');
  const [measuringNodeId, setMeasuringNodeId] = useState<string | null>(null);

  const fetchInfrastructure = useCallback(async () => {
    setLoading(true);
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
      const message = error instanceof Error ? error.message : 'Impossible de charger l’infrastructure.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchInfrastructure();
  }, [fetchInfrastructure]);

  const filteredNodes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const gatewayMap = new Map(gateways.map((g) => [g._id || g.gatewayId, g]));

    return nodes.filter((node) => {
      const gw = gatewayMap.get(node.gatewayDbId);
      const active = isNodeActive(node, gw?.config?.measureInterval);
      const statusMatches =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? active : !active);
      const gatewayMatches = selectedGatewayId === 'all' || node.gatewayDbId === selectedGatewayId;
      const searchMatches =
        !query ||
        node.nodeId.toLowerCase().includes(query) ||
        (node.name || '').toLowerCase().includes(query) ||
        node.gatewayName.toLowerCase().includes(query);

      return statusMatches && gatewayMatches && searchMatches;
    });
  }, [nodes, gateways, search, selectedGatewayId, statusFilter]);

  const stats = useMemo(() => {
    const gatewayMap = new Map(gateways.map((g) => [g._id || g.gatewayId, g]));
    const onlineGateways = gateways.filter((gw) => isGatewayOnline(gw)).length;
    const activeNodes = nodes.filter((node) => {
      const gw = gatewayMap.get(node.gatewayDbId);
      return isNodeActive(node, gw?.config?.measureInterval);
    }).length;
    const firmwareVersions = new Set(nodes.map((node) => node.status?.firmwareVersion).filter(Boolean)).size;

    return { onlineGateways, activeNodes, firmwareVersions };
  }, [gateways, nodes]);

  const triggerMeasure = async (node: NodeRow) => {
    setMeasuringNodeId(node.nodeId);
    try {
      const response = await fetch(
        `/api/eausure/gateways/${encodeURIComponent(node.gatewayDbId)}/nodes/${encodeURIComponent(node.nodeId)}/measure`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Mesure à la demande impossible.');
      }

      toast.success(`Demande de mesure envoyée à ${node.nodeId}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mesure à la demande impossible.';
      toast.error(message);
    } finally {
      setMeasuringNodeId(null);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50/70 px-5 py-8 dark:bg-background sm:px-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">EauSure · Hardware API</p>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-foreground">Supervision système</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-muted-foreground">
              Vue admin basée sur les mêmes endpoints matériels que l’application mobile.
            </p>
          </div>
          <Button variant="outline" onClick={() => void fetchInfrastructure()}>
            <RefreshCcw className="me-2 h-4 w-4" />
            Actualiser
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Network} label="Passerelles" value={loading ? '...' : `${stats.onlineGateways}/${gateways.length}`} />
          <StatCard icon={Activity} label="Nœuds actifs" value={loading ? '...' : `${stats.activeNodes}/${nodes.length}`} />
          <StatCard icon={Cpu} label="Versions firmware" value={loading ? '...' : String(stats.firmwareVersions)} />
          <StatCard icon={Gauge} label="Parc remonté" value={loading ? '...' : String(nodes.length)} />
        </div>

        {/* ── Carte satellite des passerelles ── */}
        {!loading && gateways.length > 0 && (() => {
          const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
          const onlineGws = gateways.filter((gw) => isGatewayOnline(gw));

          // Build Mapbox static map URL with all gateway pins
          const markers = gateways
            .filter((gw) => gw.location?.lat && gw.location?.lng)
            .map((gw) => {
              const color = isGatewayOnline(gw) ? '22c55e' : 'ef4444';
              return `pin-s+${color}(${gw.location.lng},${gw.location.lat})`;
            })
            .join(',');

          // Center on first gateway with location, fallback to Tunisia
          const firstGw = gateways.find((gw) => gw.location?.lat && gw.location?.lng);
          const center = firstGw
            ? `${firstGw.location.lng},${firstGw.location.lat},12`
            : '9.5375,33.8869,6';

          const mapUrl = token && markers
            ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${markers}/${center},0/1200x280@2x?access_token=${token}`
            : null;

          return (
            <div className="relative overflow-hidden rounded-2xl shadow-sm" style={{ height: 200 }}>
              {mapUrl ? (
                <img src={mapUrl} alt="Carte des passerelles" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-[#0f172a]" />
              )}
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-[rgba(15,23,42,0.75)] to-transparent" />
              {/* Content */}
              <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-5 pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#7dd3fc]">Réseau territorial</p>
                  <p className="text-lg font-bold text-white">
                    {onlineGws.length}/{gateways.length} passerelle{gateways.length !== 1 ? 's' : ''} en ligne
                  </p>
                </div>
                <div className="flex gap-3">
                  {gateways.map((gw) => {
                    const online = isGatewayOnline(gw);
                    return (
                      <div key={gw._id || gw.gatewayId} className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
                        <span className={`h-2 w-2 rounded-full ${online ? 'bg-[#22c55e]' : 'bg-[#ef4444]'}`} />
                        <span className="text-xs font-medium text-white">{gw.name || gw.gatewayId}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Étude d'efficacité ── */}
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0ea5e9]">Analyse</p>
            <h2 className="text-lg font-bold text-[#0f172a]">Étude d'efficacité du réseau</h2>
            <p className="text-sm text-[#64748b]">Métriques de disponibilité, qualité radio et temps d'activité calculées sur le parc actuel.</p>
          </div>

          {/* KPI row */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Disponibilité globale */}
            {(() => {
              const pct = nodes.length > 0 ? Math.round((stats.activeNodes / nodes.length) * 100) : 0;
              const color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
              const bg = pct >= 90 ? '#f0fdf4' : pct >= 70 ? '#fffbeb' : '#fef2f2';
              const border = pct >= 90 ? '#bbf7d0' : pct >= 70 ? '#fde68a' : '#fecaca';
              return (
                <div className="rounded-2xl border p-5 shadow-sm" style={{ backgroundColor: bg, borderColor: border }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>Disponibilité</p>
                    <CheckCircle2 className="h-4 w-4" style={{ color }} />
                  </div>
                  <p className="text-3xl font-bold" style={{ color }}>{loading ? '...' : `${pct}%`}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/60">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color }}>{stats.activeNodes}/{nodes.length} nœuds actifs</p>
                </div>
              );
            })()}

            {/* Signal RSSI moyen */}
            {(() => {
              const rssiValues = nodes.map((n) => n.status?.lastRssi).filter((v): v is number => typeof v === 'number');
              const avgRssi = rssiValues.length ? Math.round(rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length) : null;
              const quality = avgRssi === null ? 0 : avgRssi > -60 ? 100 : avgRssi > -80 ? 65 : 30;
              const color = avgRssi === null ? '#94a3b8' : avgRssi > -60 ? '#22c55e' : avgRssi > -80 ? '#f59e0b' : '#ef4444';
              const label = avgRssi === null ? 'Aucune donnée' : avgRssi > -60 ? 'Excellent' : avgRssi > -80 ? 'Correct' : 'Faible';
              return (
                <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Signal LoRa moyen</p>
                    <Signal className="h-4 w-4 text-[#64748b]" />
                  </div>
                  <p className="text-3xl font-bold text-[#0f172a]">{loading ? '...' : avgRssi !== null ? `${avgRssi} dBm` : 'N/A'}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${quality}%`, backgroundColor: color }} />
                  </div>
                  <p className="mt-1.5 text-xs font-medium" style={{ color }}>{label}</p>
                </div>
              );
            })()}

            {/* Temps d'activité estimé */}
            {(() => {
              const now = Date.now();
              const uptimes = nodes
                .filter((n) => n.status?.lastSeenAt)
                .map((n) => {
                  const lastSeen = new Date(n.status.lastSeenAt).getTime();
                  const pairedAt = n.pairedAt ? new Date(n.pairedAt).getTime() : lastSeen - 7 * 24 * 3600 * 1000;
                  const totalMs = Date.now() - pairedAt;
                  const gw = gateways.find((g) => g._id === n.gatewayDbId || g.gatewayId === n.gatewayDbId);
                  const active = isNodeActive(n, gw?.config?.measureInterval);
                  const activeMs = active ? totalMs : Math.max(0, lastSeen - pairedAt);
                  return totalMs > 0 ? (activeMs / totalMs) * 100 : 0;
                });
              const avgUptime = uptimes.length ? Math.round(uptimes.reduce((a, b) => a + b, 0) / uptimes.length) : null;
              const color = avgUptime === null ? '#94a3b8' : avgUptime >= 90 ? '#22c55e' : avgUptime >= 70 ? '#f59e0b' : '#ef4444';
              return (
                <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">Uptime estimé</p>
                    <Clock className="h-4 w-4 text-[#64748b]" />
                  </div>
                  <p className="text-3xl font-bold text-[#0f172a]">{loading ? '...' : avgUptime !== null ? `${avgUptime}%` : 'N/A'}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${avgUptime ?? 0}%`, backgroundColor: color }} />
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color }}>Temps actif / temps total depuis appairage</p>
                </div>
              );
            })()}

            {/* Signal critique — toujours rouge, 0 = bon signe */}
            {(() => {
              const weakSignal = nodes.filter((n) => typeof n.status?.lastRssi === 'number' && n.status.lastRssi < -90).length;
              return (
                <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#dc2626]">Signal critique</p>
                    <AlertTriangle className="h-4 w-4 text-[#dc2626]" />
                  </div>
                  <p className="text-3xl font-bold text-[#991b1b]">{loading ? '...' : weakSignal}</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#fecaca]">
                    <div className="h-full rounded-full bg-[#ef4444] transition-all duration-700" style={{ width: nodes.length ? `${Math.round((weakSignal / nodes.length) * 100)}%` : '0%' }} />
                  </div>
                  <p className="mt-1.5 text-xs text-[#dc2626]">Nœuds avec RSSI {'<'} -90 dBm</p>
                </div>
              );
            })()}
          </div>

          {/* Per-node RSSI breakdown */}
          {!loading && nodes.length > 0 && (
            <div className="rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#0ea5e9]" />
                <h3 className="font-semibold text-[#0f172a]">Qualité radio par nœud</h3>
              </div>
              <div className="space-y-3">
                {nodes.map((node) => {
                  const rssi = node.status?.lastRssi;
                  const hasRssi = typeof rssi === 'number';
                  const pct = hasRssi ? Math.max(0, Math.min(100, Math.round(((rssi + 120) / 60) * 100))) : 0;
                  const color = !hasRssi ? '#94a3b8' : rssi > -60 ? '#22c55e' : rssi > -80 ? '#f59e0b' : '#ef4444';
                  const label = !hasRssi ? 'N/A' : rssi > -60 ? 'Excellent' : rssi > -80 ? 'Correct' : 'Faible';
                  return (
                    <div key={node.nodeId} className="flex items-center gap-3">
                      <div className="w-28 shrink-0">
                        <p className="truncate text-xs font-medium text-[#0f172a]">{node.name || node.nodeId}</p>
                        <p className="text-[10px] text-[#94a3b8]">{node.gatewayName}</p>
                      </div>
                      <div className="flex-1 h-2 overflow-hidden rounded-full bg-[#f1f5f9]">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs font-semibold" style={{ color }}>
                        {hasRssi ? `${rssi} dBm` : 'N/A'}
                      </span>
                      <span className="w-16 shrink-0 text-right text-[10px]" style={{ color }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="relative md:col-span-2">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="ps-9"
                placeholder="Rechercher par nœud, nom ou passerelle..."
              />
            </div>

            <Select value={statusFilter} onValueChange={(value: NodeStatusFilter) => setStatusFilter(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="active">Actifs</SelectItem>
                <SelectItem value="inactive">Inactifs</SelectItem>
              </SelectContent>
            </Select>

            <div className="md:col-span-3">
              <Select value={selectedGatewayId} onValueChange={setSelectedGatewayId}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrer par passerelle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les passerelles</SelectItem>
                  {gateways.map((gateway) => (
                    <SelectItem key={gateway._id || gateway.gatewayId} value={gateway._id || gateway.gatewayId}>
                      {gateway.name || gateway.gatewayId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`node-row-${index}`} className="h-20 w-full rounded-2xl" />
                ))}
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] p-8 text-center text-sm text-[#64748b]">
                Aucun nœud correspondant.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNodes.map((node) => {
                  const gw = gateways.find((g) => g._id === node.gatewayDbId || g.gatewayId === node.gatewayDbId);
                  const active = isNodeActive(node, gw?.config?.measureInterval);
                  const rssi = node.status?.lastRssi;
                  const snr = node.status?.lastSnr;
                  const rssiColor = typeof rssi !== 'number' ? '#94a3b8' : rssi > -60 ? '#22c55e' : rssi > -80 ? '#f59e0b' : '#ef4444';
                  const rssiLabel = typeof rssi !== 'number' ? 'N/A' : rssi > -60 ? 'Excellent' : rssi > -80 ? 'Correct' : 'Faible';
                  const lastSeen = node.status?.lastSeenAt
                    ? new Date(node.status.lastSeenAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : 'Jamais';

                  return (
                    <div key={`${node.gatewayDbId}:${node.nodeId}`}
                      className="flex items-center gap-4 rounded-2xl border border-[#e2e8f0] bg-white px-5 py-4 shadow-sm hover:border-[#bae6fd] transition-colors">

                      {/* Status dot */}
                      <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? 'bg-[#22c55e]' : 'bg-[#cbd5e1]'}`} />

                      {/* Node ID + name */}
                      <div className="w-36 shrink-0">
                        <p className="font-mono text-sm font-bold text-[#0f172a]">{node.nodeId}</p>
                        <p className="text-xs text-[#94a3b8]">{node.name || node.gatewayName}</p>
                      </div>

                      {/* Firmware */}
                      <div className="w-24 shrink-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[#94a3b8]">Firmware</p>
                        <p className="font-mono text-sm font-semibold text-[#0f172a]">{node.status?.firmwareVersion || 'N/A'}</p>
                      </div>

                      {/* Signal */}
                      <div className="w-28 shrink-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[#94a3b8]">Signal LoRa</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold" style={{ color: rssiColor }}>
                            {typeof rssi === 'number' ? `${rssi} dBm` : 'N/A'}
                          </span>
                          {typeof snr === 'number' && (
                            <span className="text-[10px] text-[#94a3b8]">/ {snr} dB</span>
                          )}
                        </div>
                        <p className="text-[10px] font-medium" style={{ color: rssiColor }}>{rssiLabel}</p>
                      </div>

                      {/* Last seen */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[#94a3b8]">Dernière activité</p>
                        <p className="text-sm text-[#0f172a]">{lastSeen}</p>
                      </div>

                      {/* Status badge */}
                      <div className="shrink-0">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                          active
                            ? 'border border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]'
                            : 'border border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-[#22c55e]' : 'bg-[#cbd5e1]'}`} />
                          {active ? 'Actif' : 'Inactif'}
                        </span>
                      </div>

                      {/* Action */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void triggerMeasure(node)}
                        disabled={measuringNodeId === node.nodeId}
                        className="shrink-0 rounded-xl border-[#e2e8f0] text-[#0ea5e9] hover:bg-[#f0f9ff]"
                      >
                        {measuringNodeId === node.nodeId ? 'Envoi...' : 'Mesurer'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-black text-foreground">{value}</p>
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
