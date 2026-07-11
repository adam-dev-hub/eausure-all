'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HardDrive, Plus, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PreRegRecord = {
  id: string;
  kind: 'gateway' | 'node';
  deviceId: string;
  name: string;
  requestedByEmail: string;
  upstreamStatus: 'queued' | 'success' | 'failed';
  upstreamMessage: string;
  createdAt: string;
};

export default function PreRegisterPage() {
  const [records, setRecords] = useState<PreRegRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [kind, setKind] = useState<'gateway' | 'node'>('gateway');
  const [deviceId, setDeviceId] = useState('');
  const [deviceSecret, setDeviceSecret] = useState('');
  const [name, setName] = useState('');

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/pre-register', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('Impossible de charger les enregistrements.');
      const payload = await res.json();
      setRecords(Array.isArray(payload.records) ? payload.records : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRecords(); }, [fetchRecords]);

  const handleSubmit = async () => {
    const id = deviceId.trim().toUpperCase();
    const secret = deviceSecret.trim();
    if (!id || secret.length < 32) {
      toast.error('ID requis et secret doit faire au moins 32 caractères.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/pre-register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, id, deviceSecret: secret, name: name.trim() }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) throw new Error(payload.message || 'Échec du pré-enregistrement.');
      toast.success(`${kind === 'gateway' ? 'Passerelle' : 'Nœud'} ${id} pré-enregistré avec succès.`);
      setDeviceId('');
      setDeviceSecret('');
      setName('');
      void fetchRecords();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusIcon = (status: PreRegRecord['upstreamStatus']) => {
    if (status === 'success') return <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-[#ef4444]" />;
    return <Clock className="h-4 w-4 text-[#f59e0b]" />;
  };

  const statusBadge = (status: PreRegRecord['upstreamStatus']) => {
    const map = {
      success: 'border-[#bbf7d0] bg-[#dcfce7] text-[#15803d]',
      failed:  'border-[#fecaca] bg-[#fee2e2] text-[#dc2626]',
      queued:  'border-[#fde68a] bg-[#fef3c7] text-[#b45309]',
    };
    const labels = { success: 'Succès', failed: 'Échec', queued: 'En attente' };
    return <Badge className={map[status]}>{labels[status]}</Badge>;
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#0ea5e9]">Sécurité matérielle</p>
          <h1 className="text-2xl font-bold text-[#0f172a]">Pré-enregistrement des équipements</h1>
          <p className="mt-1 text-sm text-[#64748b]">
            Enregistrez les identifiants et secrets de fabrication des passerelles et nœuds avant leur déploiement.
            Cela bloque toute tentative d'usurpation réseau par un équipement non autorisé.
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e0f2fe]">
              <Plus className="h-5 w-5 text-[#0ea5e9]" />
            </div>
            <div>
              <h2 className="font-semibold text-[#0f172a]">Nouvel équipement</h2>
              <p className="text-xs text-[#64748b]">Le secret doit correspondre exactement à celui gravé dans le firmware.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#0f172a]">Type d'équipement</label>
              <Select value={kind} onValueChange={(v) => setKind(v as 'gateway' | 'node')}>
                <SelectTrigger className="rounded-xl border-[#e2e8f0]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gateway">Passerelle (Gateway)</SelectItem>
                  <SelectItem value="node">Nœud de mesure (Node)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#0f172a]">
                Identifiant matériel
                <span className="ml-1 text-xs text-[#94a3b8]">(ex: GW-3FC2A660 ou 5CE617A5)</span>
              </label>
              <Input
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value.toUpperCase())}
                placeholder={kind === 'gateway' ? 'GW-XXXXXXXX' : 'XXXXXXXX'}
                className="rounded-xl border-[#e2e8f0] font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#0f172a]">
                Secret de fabrication
                <span className="ml-1 text-xs text-[#94a3b8]">(min. 32 caractères, identique au firmware)</span>
              </label>
              <Input
                value={deviceSecret}
                onChange={(e) => setDeviceSecret(e.target.value)}
                placeholder="Clé secrète hexadécimale gravée dans le firmware..."
                className="rounded-xl border-[#e2e8f0] font-mono text-sm"
                type="password"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[#0f172a]">
                Nom de l'équipement
                <span className="ml-1 text-xs text-[#94a3b8]">(optionnel)</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Passerelle Site A, Bouée Puits Nord..."
                className="rounded-xl border-[#e2e8f0]"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting || !deviceId.trim() || deviceSecret.trim().length < 32}
              className="gap-2 rounded-xl bg-[#0ea5e9] px-6 text-white hover:bg-[#0284c7] disabled:opacity-50"
            >
              <HardDrive className="h-4 w-4" />
              {submitting ? 'Enregistrement...' : 'Pré-enregistrer'}
            </Button>
          </div>
        </div>

        {/* Records list */}
        <div className="rounded-2xl border border-[#e2e8f0] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f1f5f9] px-5 py-4">
            <div>
              <h2 className="font-semibold text-[#0f172a]">Équipements enregistrés</h2>
              <p className="text-xs text-[#64748b]">{records.length} enregistrement{records.length !== 1 ? 's' : ''}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchRecords()}
              className="gap-1.5 rounded-xl border-[#e2e8f0]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualiser
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#64748b]">Chargement...</div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <HardDrive className="h-10 w-10 text-[#cbd5e1]" />
              <p className="text-sm text-[#64748b]">Aucun équipement pré-enregistré.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f8fafc]">
              {records.map((record) => (
                <div key={record.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#f8fafc] transition-colors">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f9ff]">
                    {statusIcon(record.upstreamStatus)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-[#0f172a]">{record.deviceId}</span>
                      <Badge className="border-[#e2e8f0] bg-[#f8fafc] text-[#64748b] text-[10px]">
                        {record.kind === 'gateway' ? 'Passerelle' : 'Nœud'}
                      </Badge>
                      {record.name && <span className="text-sm text-[#64748b]">{record.name}</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-[#94a3b8]">
                      Par {record.requestedByEmail} · {new Date(record.createdAt).toLocaleDateString('fr-FR')}
                      {record.upstreamMessage && ` · ${record.upstreamMessage}`}
                    </p>
                  </div>
                  {statusBadge(record.upstreamStatus)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
