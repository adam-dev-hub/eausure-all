import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Wifi,
  RefreshCw,
  X,
  ScanLine,
} from 'lucide-react-native';
import {
  getUserGateways,
  scanNodes,
  confirmPairingCandidate,
  getPairingSession,
} from '../api/pairingClient';
import NodePairingHero from './NodePairingHero';

// ─── Gateway selector ─────────────────────────────────────────────────────────
function GatewaySelector({ gateways, loading, selectedGateway, onSelect }) {
  if (loading) {
    return (
      <View style={styles.centerBlock}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text style={styles.loadingText}>Chargement des passerelles...</Text>
      </View>
    );
  }

  if (gateways.length === 0) {
    return (
      <View style={styles.centerBlock}>
        <AlertCircle size={40} color="#94a3b8" />
        <Text style={styles.emptyTitle}>Aucune passerelle disponible</Text>
        <Text style={styles.emptySubtitle}>
          Provisionnez d'abord une passerelle via l'onglet Scanner.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.selectorBlock}>
      <Text style={styles.selectorLabel}>
        Choisissez la passerelle qui va scanner la bouée :
      </Text>
      {gateways.map((gw) => {
        const isSelected = selectedGateway?._id === gw._id;
        return (
          <Pressable
            key={gw._id}
            style={[styles.gwItem, isSelected && styles.gwItemSelected]}
            onPress={() => onSelect(gw)}
          >
            <View style={[
              styles.gwDot,
              { backgroundColor: gw.status?.online ? '#22c55e' : '#f59e0b' },
            ]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.gwItemName}>{gw.name || gw.gatewayId}</Text>
              <Text style={styles.gwItemId}>{gw.gatewayId}</Text>
            </View>
            {isSelected && <CheckCircle2 size={18} color="#0ea5e9" />}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function NodePairingModal({ visible, onClose }) {
  const [step, setStep]                       = useState('select');
  const [gateways, setGateways]               = useState([]);
  const [loadingGateways, setLoadingGateways] = useState(false);
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [candidate, setCandidate]             = useState(null);
  const [scanError, setScanError]             = useState('');
  const [scanLocked, setScanLocked]           = useState(false);

  const handleOpen = useCallback(async () => {
    setStep('select');
    setSelectedGateway(null);
    setCandidate(null);
    setScanError('');
    setLoadingGateways(true);
    try {
      const res = await getUserGateways();
      if (res.success) setGateways(res.data);
    } catch {
      setGateways([]);
    } finally {
      setLoadingGateways(false);
    }
  }, []);

  const handleStartScan = async (gateway) => {
    setSelectedGateway(gateway);
    setStep('scanning');
    setScanError('');
    setCandidate(null);
    try {
      const res = await scanNodes(gateway._id);
      if (res.success && res.data) {
        setCandidate(res.data);
        setStep('found');
      } else if (res.success && !res.data) {
        setScanError('Aucune bouée détectée. Vérifiez que la bouée est allumée et en mode appairage, puis réessayez.');
        setStep('error');
      } else {
        setScanError('Aucune bouée détectée à portée. Vérifiez que la bouée est allumée et en mode appairage.');
        setStep('error');
      }
    } catch (e) {
      const status = e.response?.status;
      const backendMsg = e.response?.data?.message || '';
      const isTimeout = status === 408 || backendMsg.toLowerCase().includes('timeout') || backendMsg.toLowerCase().includes('no nodes');
      setScanError(isTimeout
        ? 'Aucune bouée détectée à portée. Vérifiez que la bouée est allumée et réessayez.'
        : backendMsg || 'Impossible de contacter la passerelle. Vérifiez la connexion et réessayez.'
      );
      setStep('error');
    }
  };

  const handleConfirmPairing = async () => {
    setStep('scanning');
    try {
      const res = await confirmPairingCandidate(
        selectedGateway._id,
        candidate.nodeId,
        candidate.nodeName || '',
        candidate.bleMac,
      );
      if (res?.data?.sessionId) {
        setStep('pairing');
        pollSessionStatus(selectedGateway._id, res.data.sessionId);
      } else {
        setStep('success');
      }
    } catch (e) {
      setScanError(e.response?.data?.message || "Impossible d'associer la bouée.");
      setStep('error');
    }
  };

  const pollSessionStatus = (gatewayId, sessionId) => {
    const interval = setInterval(async () => {
      try {
        const res = await getPairingSession(gatewayId, sessionId);
        if (res.success && res.data) {
          const s = res.data.status;
          if (s === 'completed' || s === 'consumed') {
            clearInterval(interval);
            setStep('success');
          } else if (s === 'failed' || s === 'expired') {
            clearInterval(interval);
            const rawReason = res.data.failureReason || '';
            let userMsg;
            if (rawReason.toLowerCase().includes('fetch node proof') || rawReason.toLowerCase().includes('wifi')) {
              userMsg = "La passerelle n'a pas pu se connecter à la bouée. Vérifiez que la bouée est allumée, fonctionnelle, et à proximité de la passerelle, puis réessayez.";
            } else if (rawReason.toLowerCase().includes('verify') || rawReason.toLowerCase().includes('proof')) {
              userMsg = "Échec de la vérification de la bouée. Vérifiez qu'elle n'est pas déjà appairée à une autre passerelle.";
            } else if (rawReason.toLowerCase().includes('provision')) {
              userMsg = "La passerelle n'a pas pu transmettre la configuration Wi-Fi à la bouée. Réessayez.";
            } else if (rawReason.toLowerCase().includes('timeout') || rawReason.toLowerCase().includes('expir')) {
              userMsg = "Délai d'attente dépassé. La bouée n'a pas répondu à temps.";
            } else {
              userMsg = rawReason || "L'association a échoué côté passerelle.";
            }
            setScanError(userMsg);
            setStep('error');
          }
        }
      } catch { /* ignore */ }
    }, 2500);

    setTimeout(() => {
      clearInterval(interval);
      setStep((prev) => {
        if (prev === 'pairing') {
          setScanError("Délai d'attente dépassé.");
          return 'error';
        }
        return prev;
      });
    }, 60000);
  };

  const handleClose = () => {
    setStep('select');
    setSelectedGateway(null);
    setCandidate(null);
    setScanError('');
    onClose();
  };

  const goBackToSelect = () => {
    setStep('select');
    setCandidate(null);
    setScanError('');
  };

  // ── Header card content varies by step ──────────────────────────────────────
  const renderHeaderCard = () => {
    if (step === 'select') {
      return (
        <LinearGradient
          colors={['#ffffff', '#f8fbff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerCard}
        >
          <View style={styles.headerIcon}>
            <ScanLine size={22} color="#0b7fd3" />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.headerEyebrow}>Matériel</Text>
            <Text style={styles.headerCardTitle}>Association bouée</Text>
            <Text style={styles.headerSubtitle}>
              Sélectionnez la passerelle qui va détecter et configurer la bouée.
            </Text>
          </View>
          <Pressable style={styles.navBtn} onPress={handleClose}>
            <X size={18} color="#64748b" />
          </Pressable>
        </LinearGradient>
      );
    }

    // scanning / found / pairing / success / error
    return (
      <LinearGradient
        colors={['#ffffff', '#f8fbff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerCard}
      >
        <Pressable style={styles.navBtn} onPress={goBackToSelect}>
          <ArrowLeft size={20} color="#0b7fd3" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Matériel</Text>
          <Text style={styles.headerCardTitle}>Association bouée</Text>
          <Text style={styles.headerSubtitle}>
            La passerelle scanne les bouées à portée et les configure automatiquement.
          </Text>
        </View>
        <Pressable style={styles.navBtn} onPress={handleClose}>
          <X size={18} color="#64748b" />
        </Pressable>
      </LinearGradient>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      onShow={handleOpen}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="dark-content" />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header card — always present, no fixed top bar */}
          {renderHeaderCard()}

          {/* ── Step: select ── */}
          {step === 'select' && (
            <>
              <GatewaySelector
                gateways={gateways}
                loading={loadingGateways}
                selectedGateway={selectedGateway}
                onSelect={setSelectedGateway}
              />
              {selectedGateway && (
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => handleStartScan(selectedGateway)}
                >
                  {({ pressed }) => (
                    <LinearGradient
                      colors={pressed ? ['#0284c7', '#1d4ed8'] : ['#0ea5e9', '#2563eb']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.primaryButtonGradient}
                    >
                      <ScanLine size={18} color="#fff" />
                      <Text style={styles.primaryButtonText}>Lancer le scan de bouée</Text>
                    </LinearGradient>
                  )}
                </Pressable>
              )}
            </>
          )}

          {/* ── Steps: scanning / found / pairing / success / error ── */}
          {step !== 'select' && (
            <>
              {/* Hero card */}
              <LinearGradient
                colors={['#ffffff', '#f8fbff']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                <NodePairingHero
                  step={step}
                  gateway={selectedGateway}
                  candidate={candidate}
                  errorMsg={scanError}
                />
              </LinearGradient>

              {/* Found — confirm */}
              {step === 'found' && candidate && (
                <View style={styles.actionCard}>
                  <View style={styles.candidateRow}>
                    <View style={styles.candidateIcon}>
                      <Wifi size={20} color="#0ea5e9" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.candidateName}>
                        {candidate.nodeName || `Node ${candidate.nodeId}`}
                      </Text>
                      <Text style={styles.candidateId}>ID : {candidate.nodeId}</Text>
                    </View>
                  </View>
                  <Pressable style={styles.primaryButton} onPress={handleConfirmPairing}>
                    {({ pressed }) => (
                      <LinearGradient
                        colors={pressed ? ['#0284c7', '#1d4ed8'] : ['#0ea5e9', '#2563eb']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.primaryButtonGradient}
                      >
                        <CheckCircle2 size={18} color="#fff" />
                        <Text style={styles.primaryButtonText}>Associer cette bouée</Text>
                      </LinearGradient>
                    )}
                  </Pressable>
                </View>
              )}

              {/* Success */}
              {step === 'success' && (
                <View style={styles.actionCard}>
                  <Text style={styles.successMessage}>
                    L'ordre d'association a été transmis à la passerelle via MQTT. La bouée va maintenant se configurer et se connecter au réseau.
                  </Text>
                  <Pressable style={[styles.primaryButton, { marginTop: 16 }]} onPress={handleClose}>
                    {({ pressed }) => (
                      <LinearGradient
                        colors={pressed ? ['#059669', '#047857'] : ['#10b981', '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.primaryButtonGradient}
                      >
                        <Text style={styles.primaryButtonText}>Terminer</Text>
                      </LinearGradient>
                    )}
                  </Pressable>
                </View>
              )}

              {/* Error — retry */}
              {step === 'error' && (
                <Pressable style={styles.retryBtn} onPress={() => handleStartScan(selectedGateway)}>
                  <RefreshCw size={18} color="#0ea5e9" />
                  <Text style={styles.retryText}>Réessayer le scan</Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 4 },

  // ── Header card ──────────────────────────────────────────────────────────────
  headerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginTop: 14,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    fontSize: 11,
    color: '#0b7fd3',
    fontFamily: 'Ubuntu_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  headerCardTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontFamily: 'Ubuntu_700Bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    fontFamily: 'Ubuntu_400Regular',
  },

  // ── Gateway selector ─────────────────────────────────────────────────────────
  selectorBlock: { gap: 10, marginBottom: 20 },
  selectorLabel: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  gwItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  gwItemSelected: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  gwDot: { width: 8, height: 8, borderRadius: 4 },
  gwItemName: { fontFamily: 'Ubuntu_700Bold', fontSize: 15, color: '#0f172a' },
  gwItemId: { fontFamily: 'Ubuntu_400Regular', fontSize: 12, color: '#94a3b8', marginTop: 2 },

  centerBlock: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontFamily: 'Ubuntu_400Regular', fontSize: 14, color: '#64748b' },
  emptyTitle: { fontFamily: 'Ubuntu_700Bold', fontSize: 16, color: '#0f172a' },
  emptySubtitle: { fontFamily: 'Ubuntu_400Regular', fontSize: 13, color: '#64748b', textAlign: 'center' },

  // ── Hero card ────────────────────────────────────────────────────────────────
  heroCard: {
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },

  // ── Action card ──────────────────────────────────────────────────────────────
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  candidateIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center',
  },
  candidateName: { fontFamily: 'Ubuntu_700Bold', fontSize: 17, color: '#0f172a' },
  candidateId: { fontFamily: 'Ubuntu_400Regular', fontSize: 13, color: '#94a3b8', marginTop: 2 },
  successMessage: {
    fontFamily: 'Ubuntu_400Regular', fontSize: 14,
    color: '#065f46', lineHeight: 21, textAlign: 'center',
  },

  // ── Primary button ───────────────────────────────────────────────────────────
  primaryButton: {
    borderRadius: 999, overflow: 'hidden',
    shadowColor: '#2563eb', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 16, elevation: 7,
  },
  primaryButtonGradient: {
    minHeight: 56, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontFamily: 'Ubuntu_700Bold' },

  // ── Retry ────────────────────────────────────────────────────────────────────
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, marginBottom: 14,
    backgroundColor: '#f0f9ff', borderRadius: 16,
    borderWidth: 1, borderColor: '#bae6fd',
  },
  retryText: { color: '#0ea5e9', fontFamily: 'Ubuntu_700Bold', fontSize: 15 },
});
