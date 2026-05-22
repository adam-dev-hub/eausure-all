import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
  StatusBar,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Activity,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Unlink,
  Pencil,
} from 'lucide-react-native';
import { updateNodeConfig, unpairNode } from '../api/pairingClient';

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERVAL_STEPS = [
  { label: '30 min', value: 1800,  battery: 'Élevée',    batteryColor: '#ef4444' },
  { label: '1 h',    value: 3600,  battery: 'Modérée',   batteryColor: '#f59e0b' },
  { label: '2 h',    value: 7200,  battery: 'Faible',    batteryColor: '#84cc16' },
  { label: '3 h',    value: 10800, battery: 'Optimale',  batteryColor: '#10b981', recommended: true },
  { label: '4 h',    value: 14400, battery: 'Très faible', batteryColor: '#10b981' },
  { label: '6 h',    value: 21600, battery: 'Minimale',  batteryColor: '#10b981' },
  { label: '8 h',    value: 28800, battery: 'Minimale',  batteryColor: '#10b981' },
];

// Shake sensitivity — pure labels, no units shown to user
// Internally mapped to g values for MPU-6050 dynamicG threshold
const SHAKE_LEVELS = [
  { label: 'Très sensible', value: 0.5,  desc: 'Petites vagues' },
  { label: 'Sensible',      value: 0.8,  desc: 'Vagues modérées' },
  { label: 'Normal',        value: 1.1,  desc: 'Mouvement normal' },
  { label: 'Fort',          value: 2.0,  desc: 'Chocs importants' },
  { label: 'Très fort',     value: 3.0,  desc: 'Impacts / collisions',recommended: true },
];

// ─── Interval stepper ─────────────────────────────────────────────────────────
function IntervalStepper({ value, onChange }) {
  const idx = INTERVAL_STEPS.findIndex(s => s.value === value);
  const current = INTERVAL_STEPS[idx] || INTERVAL_STEPS[3];
  const canDec = idx > 0;
  const canInc = idx < INTERVAL_STEPS.length - 1;

  return (
    <View style={styles.stepperBlock}>
      <Pressable
        style={[styles.stepperArrow, !canDec && styles.stepperArrowDisabled]}
        onPress={() => canDec && onChange(INTERVAL_STEPS[idx - 1].value)}
        disabled={!canDec}
      >
        <ChevronLeft size={22} color={canDec ? '#0ea5e9' : '#cbd5e1'} />
      </Pressable>

      <View style={styles.stepperCenter}>
        <Text style={styles.stepperValue}>{current.label}</Text>
        <View style={styles.stepperMeta}>
          <View style={[styles.stepperDot, { backgroundColor: current.batteryColor }]} />
          <Text style={[styles.stepperBattery, { color: current.batteryColor }]}>
            {current.battery}
          </Text>
          {current.recommended && (
            <View style={styles.stepperRecommended}>
              <Text style={styles.stepperRecommendedText}>Recommandé</Text>
            </View>
          )}
        </View>
        {/* Progress dots */}
        <View style={styles.stepperDots}>
          {INTERVAL_STEPS.map((s, i) => (
            <View
              key={s.value}
              style={[
                styles.stepperProgressDot,
                i === idx && styles.stepperProgressDotActive,
                i < idx && styles.stepperProgressDotPast,
              ]}
            />
          ))}
        </View>
      </View>

      <Pressable
        style={[styles.stepperArrow, !canInc && styles.stepperArrowDisabled]}
        onPress={() => canInc && onChange(INTERVAL_STEPS[idx + 1].value)}
        disabled={!canInc}
      >
        <ChevronRight size={22} color={canInc ? '#0ea5e9' : '#cbd5e1'} />
      </Pressable>
    </View>
  );
}

// ─── Shake level stepper ──────────────────────────────────────────────────────
function ShakeStepper({ value, onChange }) {
  const idx = SHAKE_LEVELS.findIndex(s => s.value === value);
  const current = SHAKE_LEVELS[idx >= 0 ? idx : 2];
  const canDec = idx > 0;
  const canInc = idx < SHAKE_LEVELS.length - 1;

  return (
    <View style={styles.stepperBlock}>
      <Pressable
        style={[styles.stepperArrow, !canDec && styles.stepperArrowDisabled]}
        onPress={() => canDec && onChange(SHAKE_LEVELS[idx - 1].value)}
        disabled={!canDec}
      >
        <ChevronLeft size={22} color={canDec ? '#0ea5e9' : '#cbd5e1'} />
      </Pressable>

      <View style={styles.stepperCenter}>
        <Text style={styles.stepperValue}>{current.label}</Text>
        <Text style={styles.stepperDesc}>{current.desc}</Text>
        <View style={styles.stepperDots}>
          {SHAKE_LEVELS.map((s, i) => (
            <View
              key={s.value}
              style={[
                styles.stepperProgressDot,
                i === idx && styles.stepperProgressDotActive,
                i < idx && styles.stepperProgressDotPast,
              ]}
            />
          ))}
        </View>
      </View>

      <Pressable
        style={[styles.stepperArrow, !canInc && styles.stepperArrowDisabled]}
        onPress={() => canInc && onChange(SHAKE_LEVELS[idx + 1].value)}
        disabled={!canInc}
      >
        <ChevronRight size={22} color={canInc ? '#0ea5e9' : '#cbd5e1'} />
      </Pressable>
    </View>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────
function ToggleRow({ icon, label, subtitle, value, onChange, disabled }) {
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: '#e2e8f0', true: '#7dd3fc' }}
        thumbColor={value ? '#0ea5e9' : '#94a3b8'}
      />
    </View>
  );
}

// ─── Alert mode selector ──────────────────────────────────────────────────────
function AlertModeRow({ value, onChange }) {
  const options = [
    {
      value: 'all',
      label: 'Tout notifier',
      desc: 'Toutes les alertes et mesures',
      icon: <Bell size={16} color="#0ea5e9" />,
    },
    {
      value: 'critical_only',
      label: 'Critiques seulement',
      desc: 'pH extrême, turbidité, choc',
      icon: <AlertCircle size={16} color="#f59e0b" />,
    },
    {
      value: 'none',
      label: 'Silencieux',
      desc: 'Aucune notification push',
      icon: <BellOff size={16} color="#94a3b8" />,
    },
  ];

  return (
    <View style={styles.alertModeBlock}>
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.alertModeBtn, isSelected && styles.alertModeBtnActive]}
            onPress={() => onChange(opt.value)}
          >
            <View style={styles.alertModeIcon}>{opt.icon}</View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertModeLabel, isSelected && { color: '#0ea5e9' }]}>
                {opt.label}
              </Text>
              <Text style={styles.alertModeDesc}>{opt.desc}</Text>
            </View>
            {isSelected && <CheckCircle2 size={15} color="#0ea5e9" />}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Section title ────────────────────────────────────────────────────────────
function SectionTitle({ label }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function NodeConfigModal({ visible, onClose, gateway, node }) {
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [unpairing, setUnpairing] = useState(false);

  // Rename state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]     = useState('');
  const [savingName, setSavingName]   = useState(false);

  const nodeConfig = node?.config || {};
  const gwConfig   = gateway?.config || {};

  const [measureInterval, setMeasureInterval] = useState(nodeConfig.measureInterval ?? 10800);
  const [shakeEnabled, setShakeEnabled]       = useState(nodeConfig.shakeEnabled    ?? gwConfig.shakeEnabled    ?? true);
  const [shakeThreshold, setShakeThreshold]   = useState(nodeConfig.shakeThreshold  ?? gwConfig.shakeThreshold  ?? 1.1);
  const [nodeActive, setNodeActive]           = useState(nodeConfig.nodeActive       ?? gwConfig.nodeActive       ?? true);
  const [units, setUnits]                     = useState(nodeConfig.units            ?? gwConfig.units            ?? 'metric');
  const [alertMode, setAlertMode]             = useState(nodeConfig.alertMode        ?? 'all');
  const [vocalAlerts, setVocalAlerts]         = useState(nodeConfig.gatewayVocalAlerts ?? true);

  useEffect(() => {
    if (!visible) return;
    const nc = node?.config || {};
    const gc = gateway?.config || {};
    setMeasureInterval(nc.measureInterval ?? 10800);
    setShakeEnabled(nc.shakeEnabled    ?? gc.shakeEnabled    ?? true);
    setShakeThreshold(nc.shakeThreshold  ?? gc.shakeThreshold  ?? 1.1);
    setNodeActive(nc.nodeActive       ?? gc.nodeActive       ?? true);
    setUnits(nc.units            ?? gc.units            ?? 'metric');
    setAlertMode(nc.alertMode        ?? 'all');
    setVocalAlerts(nc.gatewayVocalAlerts ?? true);
    setSaved(false);
    setError('');
    setEditingName(false);
    setNameInput(node?.name || '');
  }, [visible, gateway, node]);

  const handleSave = async () => {
    if (!gateway?._id || !node?.nodeId) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateNodeConfig(gateway._id, node.nodeId, {
        measureInterval,
        shakeEnabled,
        shakeThreshold,
        units,
        nodeActive,
        alertMode,
        gatewayVocalAlerts: vocalAlerts,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.message || 'Impossible d\'envoyer la configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === node?.name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      await updateNodeConfig(gateway._id, node.nodeId, { name: trimmed });
      setEditingName(false);
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de renommer le nœud.');
    } finally {
      setSavingName(false);
    }
  };

  const handleUnpair = () => {
    Alert.alert(
      'Dissocier ce nœud',
      `Le nœud "${nodeName}" sera retiré de la passerelle "${gateway?.name || ''}". Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Dissocier',
          style: 'destructive',
          onPress: async () => {
            setUnpairing(true);
            setError('');
            try {
              await unpairNode(gateway._id, node.nodeId);
              onClose();
            } catch (e) {
              setError(e.response?.data?.message || 'Impossible de dissocier le nœud.');
            } finally {
              setUnpairing(false);
            }
          },
        },
      ],
    );
  };

  if (!node || !gateway) return null;

  const nodeName = node.name && node.name !== `Node ${node.nodeId}`
    ? node.name
    : `Bouée ${node.nodeId.slice(-4)}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header card */}
          <LinearGradient
            colors={['#ffffff', '#f8fbff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCard}
          >
            <View style={styles.headerIcon}>
              <Settings2 size={22} color="#0b7fd3" />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>Configuration</Text>
              <Text style={styles.headerTitle}>{nodeName}</Text>
              <Text style={styles.headerSubtitle}>
                Paramètres matériels envoyés via MQTT · Alertes sauvegardées en base
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <X size={18} color="#64748b" />
            </Pressable>
          </LinearGradient>

          {/* ── État (en premier) ── */}
          <View style={styles.configCard}>
            <SectionTitle label="État du nœud" />
            <ToggleRow
              icon={<Activity size={18} color={nodeActive ? '#22c55e' : '#94a3b8'} />}
              label="Nœud actif"
              subtitle={nodeActive ? 'Le nœud envoie des mesures' : 'Le nœud est en veille'}
              value={nodeActive}
              onChange={setNodeActive}
            />

            {/* Changer le nom */}
            {!editingName ? (
              <Pressable style={styles.row} onPress={() => { setNameInput(node?.name || ''); setEditingName(true); }}>
                <View style={styles.rowIcon}><Pencil size={18} color="#0ea5e9" /></View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel}>Changer le nom</Text>
                  <Text style={styles.rowSubtitle}>{node?.name || nodeName}</Text>
                </View>
              </Pressable>
            ) : (
              <View style={styles.renameRow}>
                <View style={styles.rowIcon}><Pencil size={18} color="#0ea5e9" /></View>
                <TextInput
                  style={styles.renameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Nom du nœud"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSaveName}
                />
                <Pressable style={styles.renameSaveBtn} onPress={handleSaveName} disabled={savingName}>
                  {savingName
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <CheckCircle2 size={16} color="#fff" />
                  }
                </Pressable>
                <Pressable style={styles.renameCancelBtn} onPress={() => setEditingName(false)}>
                  <X size={16} color="#64748b" />
                </Pressable>
              </View>
            )}
          </View>

          {/* ── Mesure ── */}
          <View style={styles.configCard}>
            <SectionTitle label="Intervalle de mesure" />
            <IntervalStepper value={measureInterval} onChange={setMeasureInterval} />

            <View style={styles.divider} />
            <SectionTitle label="Unités" />
            <View style={styles.segmentRow}>
              {[
                { value: 'metric',   label: 'Métrique' },
                { value: 'imperial', label: 'Impérial' },
              ].map((u) => (
                <Pressable
                  key={u.value}
                  style={[styles.segmentBtn, units === u.value && styles.segmentBtnActive]}
                  onPress={() => setUnits(u.value)}
                >
                  <Text style={[styles.segmentText, units === u.value && styles.segmentTextActive]}>
                    {u.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* ── Mouvement ── */}
          <View style={styles.configCard}>
            <SectionTitle label="Détection de mouvement" />
            <ToggleRow
              icon={<Activity size={18} color="#0ea5e9" />}
              label="Détection de secousse"
              subtitle="Déclenche une mesure immédiate si mouvement détecté"
              value={shakeEnabled}
              onChange={setShakeEnabled}
            />
            {shakeEnabled && (
              <>
                <View style={styles.divider} />
                <SectionTitle label="Sensibilité" />
                <ShakeStepper value={shakeThreshold} onChange={setShakeThreshold} />
              </>
            )}
          </View>

          {/* ── Alertes ── */}
          <View style={styles.configCard}>
            <SectionTitle label="Notifications push" />
            <AlertModeRow value={alertMode} onChange={setAlertMode} />

            <View style={styles.divider} />
            <SectionTitle label="Alerte vocale passerelle" />
            <ToggleRow
              icon={vocalAlerts
                ? <Volume2 size={18} color="#0ea5e9" />
                : <VolumeX size={18} color="#94a3b8" />
              }
              label="Alerte sonore locale"
              subtitle="La passerelle émet un signal sonore pour ce nœud"
              value={vocalAlerts}
              onChange={setVocalAlerts}
            />
          </View>

          {/* Feedback */}
          {error ? (
            <View style={styles.feedbackBox}>
              <AlertCircle size={18} color="#ef4444" />
              <Text style={styles.feedbackError}>{error}</Text>
            </View>
          ) : null}

          {saved ? (
            <View style={[styles.feedbackBox, styles.feedbackSuccess]}>
              <CheckCircle2 size={18} color="#10b981" />
              <Text style={styles.feedbackOk}>
                Configuration sauvegardée et envoyée à la passerelle.
              </Text>
            </View>
          ) : null}

          {/* Save + Dissocier côte à côte */}
          <View style={styles.bottomActions}>
            <Pressable
              style={[styles.saveButton, { flex: 1 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {({ pressed }) => (
                <LinearGradient
                  colors={pressed ? ['#0284c7', '#1d4ed8'] : ['#0ea5e9', '#2563eb']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.saveButtonGradient}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Settings2 size={18} color="#fff" />
                  }
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Envoi...' : 'Appliquer'}
                  </Text>
                </LinearGradient>
              )}
            </Pressable>

            <Pressable
              style={styles.unpairBtn}
              onPress={handleUnpair}
              disabled={unpairing}
            >
              {unpairing
                ? <ActivityIndicator size="small" color="#ef4444" />
                : <Unlink size={16} color="#ef4444" />
              }
              <Text style={styles.unpairBtnText}>Dissocier</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },

  // ── Header card ──────────────────────────────────────────────────────────────
  headerCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0',
    padding: 16, marginTop: 14, marginBottom: 14,
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 18, elevation: 4,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    fontSize: 11, color: '#0b7fd3', fontFamily: 'Ubuntu_700Bold',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3,
  },
  headerTitle: {
    fontSize: 20, lineHeight: 25, fontFamily: 'Ubuntu_700Bold',
    color: '#0f172a', marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 12, lineHeight: 17, color: '#94a3b8',
    fontFamily: 'Ubuntu_400Regular',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },

  // ── Config card ──────────────────────────────────────────────────────────────
  configCard: {
    backgroundColor: '#fff', borderRadius: 24,
    borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 8, marginBottom: 14,
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06, shadowRadius: 18, elevation: 3,
  },
  sectionTitle: {
    fontFamily: 'Ubuntu_700Bold', fontSize: 11, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6,
  },
  divider: {
    height: 1, backgroundColor: '#f1f5f9',
    marginHorizontal: 20, marginVertical: 4,
  },

  // ── Stepper ──────────────────────────────────────────────────────────────────
  stepperBlock: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 8,
  },
  stepperArrow: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd',
    alignItems: 'center', justifyContent: 'center',
  },
  stepperArrowDisabled: {
    backgroundColor: '#f8fafc', borderColor: '#e2e8f0',
  },
  stepperCenter: {
    flex: 1, alignItems: 'center', gap: 4,
  },
  stepperValue: {
    fontFamily: 'Ubuntu_700Bold', fontSize: 22, color: '#0f172a',
  },
  stepperDesc: {
    fontFamily: 'Ubuntu_400Regular', fontSize: 13, color: '#64748b',
  },
  stepperMeta: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  stepperDot: { width: 7, height: 7, borderRadius: 4 },
  stepperBattery: { fontFamily: 'Ubuntu_700Bold', fontSize: 12 },
  stepperRecommended: {
    backgroundColor: '#f0fdf4', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: '#86efac',
  },
  stepperRecommendedText: {
    fontFamily: 'Ubuntu_700Bold', fontSize: 10, color: '#059669',
  },
  stepperDots: {
    flexDirection: 'row', gap: 5, marginTop: 6,
  },
  stepperProgressDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#e2e8f0',
  },
  stepperProgressDotActive: {
    backgroundColor: '#0ea5e9', width: 14,
  },
  stepperProgressDotPast: {
    backgroundColor: '#bae6fd',
  },

  // ── Row ──────────────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  rowDisabled: { opacity: 0.45 },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#f0f9ff', alignItems: 'center', justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowLabel: { fontFamily: 'Ubuntu_700Bold', fontSize: 14, color: '#0f172a' },
  rowSubtitle: {
    fontFamily: 'Ubuntu_400Regular', fontSize: 12, color: '#94a3b8', marginTop: 2,
  },

  // ── Segment (units) ──────────────────────────────────────────────────────────
  segmentRow: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 14,
    backgroundColor: '#f1f5f9', borderRadius: 12, padding: 3, gap: 3,
  },
  segmentBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  segmentText: { fontFamily: 'Ubuntu_500Medium', fontSize: 13, color: '#64748b' },
  segmentTextActive: { color: '#0ea5e9', fontFamily: 'Ubuntu_700Bold' },

  // ── Alert mode ───────────────────────────────────────────────────────────────
  alertModeBlock: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  alertModeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 13, borderRadius: 14,
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  alertModeBtnActive: { backgroundColor: '#f0f9ff', borderColor: '#0ea5e9' },
  alertModeIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  alertModeLabel: { fontFamily: 'Ubuntu_700Bold', fontSize: 14, color: '#0f172a' },
  alertModeDesc: {
    fontFamily: 'Ubuntu_400Regular', fontSize: 12, color: '#94a3b8', marginTop: 2,
  },

  // ── Feedback ─────────────────────────────────────────────────────────────────
  feedbackBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderRadius: 16,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    marginBottom: 14,
  },
  feedbackSuccess: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  feedbackError: { flex: 1, fontFamily: 'Ubuntu_500Medium', fontSize: 13, color: '#dc2626' },
  feedbackOk: { flex: 1, fontFamily: 'Ubuntu_500Medium', fontSize: 13, color: '#059669' },

  // ── Save button ──────────────────────────────────────────────────────────────
  saveButton: {
    borderRadius: 999, overflow: 'hidden',
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 16, elevation: 7,
  },
  saveButtonGradient: {
    minHeight: 56, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingHorizontal: 18,
  },
  saveButtonText: { color: '#fff', fontSize: 15, fontFamily: 'Ubuntu_700Bold' },

  // ── Bottom actions ────────────────────────────────────────────────────────────
  bottomActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },

  // ── Dissocier ────────────────────────────────────────────────────────────────
  unpairBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingHorizontal: 16,
    borderRadius: 999, borderWidth: 1.5, borderColor: '#fecaca',
    backgroundColor: '#fff5f5', minHeight: 56,
  },
  unpairBtnText: { fontFamily: 'Ubuntu_700Bold', fontSize: 14, color: '#ef4444' },

  // ── Rename ───────────────────────────────────────────────────────────────────
  renameRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  renameInput: {
    flex: 1, height: 40, borderRadius: 10,
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#bae6fd',
    paddingHorizontal: 12, fontFamily: 'Ubuntu_400Regular',
    fontSize: 14, color: '#0f172a',
  },
  renameSaveBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center',
  },
  renameCancelBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },
});
