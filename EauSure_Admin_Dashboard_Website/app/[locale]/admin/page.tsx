'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { Activity, HardDrive, LifeBuoy, Rocket, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import type { Gateway, IotNode } from '@/lib/api/client';

type AdminProfile = { name?: string; email?: string; role?: string };

export default function AdminDashboardPage() {
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [nodes, setNodes] = useState<IotNode[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [profileRes, gatewaysRes] = await Promise.all([
          fetch('/api/user/me', { credentials: 'include', cache: 'no-store' }),
          fetch('/api/eausure/gateways', { credentials: 'include', cache: 'no-store' }),
        ]);
        const profileData = profileRes.ok ? await profileRes.json() : null;
        const gatewaysData = gatewaysRes.ok ? await gatewaysRes.json() : [];
        const gatewayList = Array.isArray(gatewaysData) ? gatewaysData : [];
        const nodeResponses = await Promise.all(
          gatewayList.map(async (gw) => {
            const r = await fetch(`/api/eausure/gateways/${encodeURIComponent(gw._id || gw.gatewayId)}/nodes`, {
              credentials: 'include', cache: 'no-store',
            });
            return r.ok ? await r.json() : [];
          })
        );
        if (cancelled) return;
        setProfile(profileData);
        setGateways(gatewayList);
        setNodes(nodeResponses.flat().filter((n) => n && typeof n === 'object'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => ({
    gatewaysOnline: gateways.filter((g) => g.status?.online).length,
    activeNodes: nodes.filter((n) => n.status?.active).length,
    firmwareVersions: new Set(nodes.map((n) => n.status?.firmwareVersion).filter(Boolean)).size,
  }), [gateways, nodes]);

  const modules = [
    {
      title: 'Supervision système',
      description: 'Inventaire des passerelles et nœuds, mesure à la demande, filtres par statut.',
      href: `/${locale}/admin/supervise-system`,
      icon: Activity,
      color: '#22c55e',
      bg: '#f0fdf4',
    },
    {
      title: 'Déploiement firmware',
      description: 'Publication des releases OTA/FUOTA et suivi de propagation sur le parc.',
      href: `/${locale}/admin/deploy-updates`,
      icon: Rocket,
      color: '#f59e0b',
      bg: '#fffbeb',
    },
    {
      title: 'Support technique',
      description: 'Tickets d\'assistance, chat en direct avec les utilisateurs, notes internes.',
      href: `/${locale}/admin/diagnose-problems`,
      icon: LifeBuoy,
      color: '#0ea5e9',
      bg: '#f0f9ff',
    },
    {
      title: 'Gestion utilisateurs',
      description: 'Rôles, statuts, suspension de comptes et notes administratives.',
      href: `/${locale}/admin/manage-users`,
      icon: Users,
      color: '#8b5cf6',
      bg: '#faf5ff',
    },
    {
      title: 'Pré-enregistrement matériel',
      description: 'Enregistrement des secrets de fabrication avant déploiement terrain.',
      href: `/${locale}/admin/pre-register`,
      icon: HardDrive,
      color: '#ef4444',
      bg: '#fef2f2',
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0ea5e9]">EauSûre</p>
            <h1 className="text-2xl font-bold text-[#0f172a]">Console administrateur</h1>
            <p className="mt-1 text-sm text-[#64748b]">
              Supervision, maintenance et gestion du réseau d'équipements EauSûre.
            </p>
          </div>
          <div className="rounded-2xl border border-[#e2e8f0] bg-white px-5 py-3 shadow-sm">
            <p className="text-[11px] uppercase tracking-wider text-[#94a3b8]">Session admin</p>
            <p className="mt-0.5 font-semibold text-[#0f172a]">{profile?.name || 'Admin'}</p>
            <p className="text-xs text-[#64748b]">{profile?.email || ''}</p>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))
          ) : (
            <>
              {[
                { label: 'Passerelles', value: gateways.length, sub: `${stats.gatewaysOnline} en ligne`, color: '#0ea5e9' },
                { label: 'Nœuds', value: nodes.length, sub: `${stats.activeNodes} actifs`, color: '#22c55e' },
                { label: 'Versions firmware', value: stats.firmwareVersions, sub: 'sur le parc', color: '#f59e0b' },
                { label: 'Rôle', value: 'Admin', sub: profile?.email?.split('@')[0] || '', color: '#8b5cf6' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-[#e2e8f0] bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8]">{card.label}</p>
                  <p className="mt-2 text-2xl font-bold text-[#0f172a]">{card.value}</p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
                    <div className="h-full w-3/4 rounded-full" style={{ backgroundColor: card.color }} />
                  </div>
                  <p className="mt-1.5 text-xs text-[#64748b]">{card.sub}</p>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Modules grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => (
            <Link key={mod.href} href={mod.href}>
              <div className="group h-full cursor-pointer rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm transition-all hover:border-[#bae6fd] hover:shadow-md">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-xl"
                    style={{ backgroundColor: mod.bg }}
                  >
                    <mod.icon className="h-5 w-5" style={{ color: mod.color }} />
                  </div>
                  <span className="rounded-full border border-[#e2e8f0] px-2.5 py-0.5 text-[10px] font-medium text-[#64748b]">
                    Admin
                  </span>
                </div>
                <h2 className="font-semibold text-[#0f172a] group-hover:text-[#0ea5e9] transition-colors">
                  {mod.title}
                </h2>
                <p className="mt-1.5 text-sm text-[#64748b] leading-relaxed">{mod.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
