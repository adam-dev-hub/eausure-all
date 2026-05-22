import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Pressable,
  ActivityIndicator,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Radio,
  Server,
  Wifi,
  Plus,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  MapPin,
  Activity,
  Settings2,
  Clock,
  Signal,
  AlertTriangle,
  Battery,
} from 'lucide-react-native';
import { getUserGateways, getGatewayNodes, scanNodes, confirmPairingCandidate, getPairingSession, cancelPairing } from '../../api/pairingClient';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import NodePairingHero from '../../components/NodePairingHero';
import NodeConfigModal from '../../components/NodeConfigModal';

const mapBgImage = require('../../assets/images/map-bg.png');

export default function MaterielPage() {
  const [gateways, setGateways]           = useState([]);
  const [nodesByGateway, setNodesByGateway] = useState({});
  const [loading, setLoading]             = useState(true);

  // 'list' | 'scanning' | 'found' | 'pairing' | 'success' | 'error'
  const [viewState, setViewState]         = useState('list');
  const [scanError, setScanError]         = useState('');
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [candidate, setCandidate]         = useState(null);
  const [configModal, setConfigModal]     = useState({ visible: false, gateway: null, node: null });
  const [scanLocked, setScanLocked]       = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const gwsRes = await getUserGateways();
      if (gwsRes.success) {
        setGateways(gwsRes.data);
        const nodesMap = {};
        for (const gw of gwsRes.data) {
          const nodesRes = await getGatewayNodes(gw._id);
          if (nodesRes.success) nodesMap[gw._id] = nodesRes.data;
        }
        setNodesByGateway(nodesMap);
      }
    } catch (e) {
      console.error('Error loading materiel:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (viewState === 'list') loadData();
    }, [loadData, viewState]),
  );

  // ── Pairing flow ────────────────────────────────────────────────────────────
  const handleStartScan = async (gateway) => {
    if (scanLocked) return;
    setScanLocked(true);
    setSelectedGateway(gateway);
    setViewState('scanning');
    setScanError('');
    setCandidate(null);
    try {
      const res = await scanNodes(gateway._id);
      if (res.success && res.data) {
        setCandidate(res.data);
        setViewState('found');
      } else if (res.success && !res.data) {
        setScanError('Aucune bouée détectée. Vérifiez que la bouée est allumée et en mode appairage, puis réessayez.');
        setViewState('error');
      } else {
        setScanError('Aucune bouée détectée à portée. Vérifiez que la bouée est allumée et en mode appairage.');
        setViewState('error');
      }
    } catch (e) {
      const status = e.response?.status;
      const backendMsg = e.response?.data?.message || '';
      const isTimeout = status === 408 || backendMsg.toLowerCase().includes('timeout') || backendMsg.toLowerCase().includes('no nodes');
      if (isTimeout) {
        setScanError('Aucune bouée détectée à portée. Vérifiez que la bouée est allumée et réessayez.');
      } else {
        setScanError(backendMsg || 'Impossible de contacter la passerelle. Vérifiez la connexion et réessayez.');
      }
      setViewState('error');
    } finally {
      setScanLocked(false);
    }
  };

  const handleConfirmPairing = async () => {
    setViewState('scanning');
    try {
      const res = await confirmPairingCandidate(
        selectedGateway._id,
        candidate.nodeId,
        candidate.nodeName || '',
        candidate.bleMac,
      );
      if (res?.data?.sessionId) {
        setViewState('pairing');
        pollSessionStatus(selectedGateway._id, res.data.sessionId);
      } else {
        setViewState('success');
        loadData();
      }
    } catch (e) {
      setScanError(e.response?.data?.message || "Impossible d'associer la bouée.");
      setViewState('error');
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
            setViewState('success');
            loadData();
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
            setViewState('error');
          }
        }
      } catch { /* ignore polling errors */ }
    }, 2500);

    setTimeout(() => {
      clearInterval(interval);
      setViewState((prev) => {
        if (prev === 'pairing') {
          setScanError("Délai d'attente dépassé (timeout).");
          return 'error';
        }
        return prev;
      });
    }, 60000);
  };

  const handleBackToList = async () => {
    if ((viewState === 'scanning' || viewState === 'pairing') && selectedGateway) {
      try {
        await cancelPairing(selectedGateway._id);
      } catch (e) {
        console.log('Failed to cancel pairing:', e);
      }
    }
    setViewState('list');
    setSelectedGateway(null);
    setCandidate(null);
    setScanError('');
  };

  // ── Pairing view ─────────────────────────────────────────────────────────────
  if (viewState !== 'list') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header card with back button */}
          <LinearGradient
            colors={['#ffffff', '#f8fbff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCard}
          >
            <Pressable onPress={handleBackToList} style={styles.headerBackBtn}>
              <ArrowLeft size={20} color="#0b7fd3" />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>Matériel</Text>
              <Text style={styles.headerTitle}>Association bouée</Text>
              <Text style={styles.headerSubtitle}>
                La passerelle scanne les bouées à portée et les configure automatiquement.
              </Text>
            </View>
          </LinearGradient>

          {/* Hero card */}
          <LinearGradient
            colors={['#ffffff', '#f8fbff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <NodePairingHero
              step={viewState}
              gateway={selectedGateway}
              candidate={candidate}
              errorMsg={scanError}
            />
          </LinearGradient>

          {/* Found — confirm card */}
          {viewState === 'found' && candidate && (
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

          {/* Success — back button */}
          {viewState === 'success' && (
            <View style={styles.actionCard}>
              <Text style={styles.successMessage}>
                L'ordre d'association a été transmis à la passerelle via MQTT. La bouée va maintenant se configurer et se connecter au réseau.
              </Text>
              <Pressable style={[styles.primaryButton, { marginTop: 16 }]} onPress={handleBackToList}>
                {({ pressed }) => (
                  <LinearGradient
                    colors={pressed ? ['#059669', '#047857'] : ['#10b981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.primaryButtonGradient}
                  >
                    <Text style={styles.primaryButtonText}>Retour au matériel</Text>
                  </LinearGradient>
                )}
              </Pressable>
            </View>
          )}

          {/* Error — retry */}
          {viewState === 'error' && (
            <Pressable
              style={[styles.retryBtn, scanLocked && { opacity: 0.5 }]}
              onPress={() => !scanLocked && handleStartScan(selectedGateway)}
              disabled={scanLocked}
            >
              {scanLocked
                ? <ActivityIndicator size="small" color="#0ea5e9" />
                : <RefreshCw size={18} color="#0ea5e9" />
              }
              <Text style={styles.retryText}>
                {scanLocked ? 'Scan en cours...' : 'Réessayer le scan'}
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────────
  const totalNodes = Object.values(nodesByGateway).reduce((acc, arr) => acc + arr.length, 0);
  const onlineGateways = gateways.filter(gw => gw.status?.online).length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Rich header */}
      <LinearGradient
        colors={['#ffffff', '#f8fbff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.richHeader}
      >
        <View style={styles.richHeaderTop}>
          <View style={styles.richHeaderLeft}>
            <Text style={styles.richHeaderEyebrow}>Infrastructure</Text>
            <Text style={styles.richHeaderTitle}>Matériel Connecté</Text>
          </View>
          <Pressable onPress={loadData} style={styles.refreshCircle}>
            {loading
              ? <ActivityIndicator size="small" color="#0ea5e9" />
              : <RefreshCw size={18} color="#0ea5e9" />
            }
          </Pressable>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <View style={[styles.statDot, { backgroundColor: '#0ea5e9' }]} />
            <Text style={styles.statValue}>{gateways.length}</Text>
            <Text style={styles.statLabel}>passerelle{gateways.length !== 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statPill}>
            <View style={[styles.statDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.statValue}>{onlineGateways}</Text>
            <Text style={styles.statLabel}>en ligne</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statPill}>
            <View style={[styles.statDot, { backgroundColor: '#8b5cf6' }]} />
            <Text style={styles.statValue}>{totalNodes}</Text>
            <Text style={styles.statLabel}>nœud{totalNodes !== 1 ? 's' : ''}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading && gateways.length === 0 ? (
          <ActivityIndicator size="large" color="#0ea5e9" style={{ marginTop: 40 }} />
        ) : gateways.length === 0 ? (
          <View style={styles.emptyState}>
            <Radio size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
            <Text style={styles.emptyText}>Aucune passerelle trouvée.</Text>
            <Text style={styles.emptySubText}>
              Rendez-vous dans Scanner pour en ajouter une.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {gateways.map((gw) => {
              const nodes = nodesByGateway[gw._id] || [];
              const hasLocation = gw.location?.lat && gw.location?.lng;
              const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
              const mapImageUrl =
                hasLocation && mapboxToken
                  ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/pin-s+ef4444(${gw.location.lng},${gw.location.lat})/${gw.location.lng},${gw.location.lat},14,0/600x300@2x?access_token=${mapboxToken}`
                  : null;

              const isUnprovisioned = gw.status?.provisioned === false;
              
              return (
                <View key={gw._id} style={styles.gwWrapper}>
                  <ImageBackground
                    source={mapImageUrl ? { uri: mapImageUrl } : mapBgImage}
                    style={styles.gwCardBg}
                    imageStyle={styles.gwCardBgImage}
                  >
                    <LinearGradient
                      colors={['rgba(15,23,42,0.08)', 'rgba(15,23,42,0.68)']}
                      style={styles.gwGradientOverlay}
                    >
                      <View style={styles.gwHeaderPremium}>
                        <View style={styles.gwTitleRow}>
                          <View style={styles.gwIconPremium}>
                            <Server size={22} color="#fff" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.gwNamePremium}>{gw.name || 'Gateway'}</Text>
                            <Text style={styles.gwIdPremium}>{gw.gatewayId}</Text>
                          </View>
                          <View style={[
                            styles.statusBadge,
                            { backgroundColor: isUnprovisioned
                                ? 'rgba(255,255,255,0.92)'
                                : gw.status?.online
                                  ? 'rgba(34,197,94,0.2)'
                                  : 'rgba(255,255,255,0.92)' },
                          ]}>
                            <View style={[
                              styles.statusDotPremium,
                              { backgroundColor: isUnprovisioned ? '#ef4444' : gw.status?.online ? '#4ade80' : '#ef4444' },
                            ]} />
                            <Text style={[
                              styles.statusTextPremium,
                              { color: isUnprovisioned ? '#dc2626' : gw.status?.online ? '#4ade80' : '#dc2626' },
                            ]}>
                              {isUnprovisioned ? 'Non configurée' : gw.status?.online ? 'En ligne' : 'Hors ligne'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.gwFooterPremium}>
                          <View style={styles.gwMetaItem}>
                            <MapPin size={14} color="#ef4444" />
                            <Text style={styles.gwMetaText}>
                              {hasLocation ? (gw.location.city || 'Inconnu') : 'Localisation indisponible'}
                            </Text>
                          </View>
                          <View style={styles.gwMetaItem}>
                            <Activity size={14} color="#38bdf8" />
                            <Text style={styles.gwMetaText}>
                              Ping :{' '}
                              {gw.lastSeenAt
                                ? new Date(gw.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                : 'Jamais'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </LinearGradient>
                  </ImageBackground>

                  {/* Nodes panel or Unprovisioned state */}
                  <View style={styles.nodesContainer}>
                    {isUnprovisioned ? (
                      <View style={styles.unprovisionedPanel}>
                        <AlertTriangle size={32} color="#ef4444" style={{ marginBottom: 12 }} />
                        <Text style={styles.unprovisionedTitle}>Passerelle non configurée</Text>
                        <Text style={styles.unprovisionedText}>
                          Cette passerelle a été réinitialisée. Vous devez configurer son accès Wi-Fi pour qu'elle puisse transmettre les données.
                        </Text>
                        {/* We could add a button here navigating to the Scanner/Provisioning page */}
                      </View>
                    ) : (
                      <>
                        <View style={styles.nodesHeader}>
                          <Text style={styles.nodesTitle}>Nœuds de mesure ({nodes.length})</Text>
                      <Pressable style={styles.addNodeBtn} onPress={() => handleStartScan(gw)}>
                        <Plus size={16} color="#0ea5e9" />
                        <Text style={styles.addNodeText}>Associer</Text>
                      </Pressable>
                    </View>

                    {nodes.length > 0 ? (
                      <View style={styles.nodesGrid}>
                        {nodes.map((node) => {
                          const isActive = node.status?.active;
                          const lastSeen = node.status?.lastSeenAt
                            ? new Date(node.status.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : null;
                          const rssi = node.status?.lastRssi;
                          const rssiColor = rssi >= -60 ? '#22c55e' : rssi >= -80 ? '#f59e0b' : '#ef4444';
                          const battery = node.status?.lastBattery;
                          const batteryColor = battery >= 50 ? '#22c55e' : battery >= 20 ? '#f59e0b' : '#ef4444';

                          return (
                            <View key={node.nodeId} style={styles.nodePremiumItem}>
                              <View style={[styles.nodeIconWrap, { backgroundColor: isActive ? '#f0f9ff' : '#f8fafc' }]}>
                                <Wifi size={18} color={isActive ? '#0ea5e9' : '#94a3b8'} />
                              </View>
                              <View style={{ flex: 1, gap: 4 }}>
                                <View style={styles.nodeTopRow}>
                                  <View style={[styles.nodeActiveDot, { backgroundColor: isActive ? '#22c55e' : '#cbd5e1', marginTop: 2 }]} />
                                  <Text style={styles.nodeNamePremium} numberOfLines={1}>
                                    {node.name || `Bouée ${node.nodeId.slice(-4)}`}
                                  </Text>
                                </View>
                                {/* Only show ID if name is not already the node ID */}
                                {node.name !== node.nodeId && node.name !== `Node ${node.nodeId}` && (
                                  <Text style={styles.nodeIdPremium}>ID : {node.nodeId}</Text>
                                )}
                                <View style={styles.nodeMetaRow}>
                                  {lastSeen && (
                                    <View style={styles.nodeMetaItem}>
                                      <Clock size={11} color="#94a3b8" />
                                      <Text style={styles.nodeMetaText}>{lastSeen}</Text>
                                    </View>
                                  )}
                                  {rssi !== 0 && rssi !== undefined && (
                                    <View style={styles.nodeMetaItem}>
                                      <Signal size={11} color={rssiColor} />
                                      <Text style={[styles.nodeMetaText, { color: rssiColor }]}>{rssi} dBm</Text>
                                    </View>
                                  )}
                                  {battery !== undefined && battery !== null && (
                                    <View style={styles.nodeMetaItem}>
                                      <Battery size={11} color={batteryColor} />
                                      <Text style={[styles.nodeMetaText, { color: batteryColor }]}>{battery}%</Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                              <View style={styles.nodeActions}>
                                <Pressable
                                  style={styles.nodeConfigBtn}
                                  onPress={() => setConfigModal({ visible: true, gateway: gw, node })}
                                >
                                  <Settings2 size={16} color="#0ea5e9" />
                                </Pressable>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                      
                    ) : (
                      <View style={styles.noNodesPremium}>
                        <Text style={styles.noNodesTextPremium}>
                          Aucun capteur associé pour le moment.
                        </Text>
                      </View>
                    )}
                      </>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <NodeConfigModal
        visible={configModal.visible}
        onClose={() => setConfigModal({ visible: false, gateway: null, node: null })}
        gateway={configModal.gateway}
        node={configModal.node}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  // ── Top bar (pairing view) ───────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  topBarTitle: { fontFamily: 'Ubuntu_700Bold', fontSize: 20, color: '#0f172a' },
  topBarBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },

  // ── Rich header (list view) ──────────────────────────────────────────────────
  richHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  richHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  richHeaderLeft: { flex: 1 },
  richHeaderEyebrow: {
    fontSize: 11,
    color: '#0b7fd3',
    fontFamily: 'Ubuntu_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  richHeaderTitle: {
    fontSize: 26,
    lineHeight: 31,
    fontFamily: 'Ubuntu_700Bold',
    color: '#0f172a',
  },
  refreshCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statDot: { width: 7, height: 7, borderRadius: 4 },
  statValue: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 15,
    color: '#0f172a',
  },
  statLabel: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 12,
    color: '#64748b',
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 4,
  },

  // ── Scroll ───────────────────────────────────────────────────────────────────
  scrollContent: { paddingHorizontal: 20, paddingBottom: 110 },

  // ── Header card (same as scan.jsx) ───────────────────────────────────────────
  headerCard: {
    flexDirection: 'row',
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
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerEyebrow: {
    fontSize: 12,
    color: '#0b7fd3',
    fontFamily: 'Ubuntu_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontFamily: 'Ubuntu_700Bold',
    color: '#0f172a',
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    fontFamily: 'Ubuntu_400Regular',
  },

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

  // ── Action card (found / success) ────────────────────────────────────────────
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
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  candidateIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  candidateName: { fontFamily: 'Ubuntu_700Bold', fontSize: 17, color: '#0f172a' },
  candidateId: { fontFamily: 'Ubuntu_400Regular', fontSize: 13, color: '#94a3b8', marginTop: 2 },
  successMessage: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 14,
    color: '#065f46',
    lineHeight: 21,
    textAlign: 'center',
  },

  // ── Primary button ───────────────────────────────────────────────────────────
  primaryButton: {
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 7,
  },
  primaryButtonGradient: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontFamily: 'Ubuntu_700Bold' },

  // ── Retry ────────────────────────────────────────────────────────────────────
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  retryText: { color: '#0ea5e9', fontFamily: 'Ubuntu_700Bold', fontSize: 15 },

  // ── List view ────────────────────────────────────────────────────────────────
  list: { gap: 24 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontFamily: 'Ubuntu_700Bold', fontSize: 18, color: '#0f172a', marginBottom: 8 },
  emptySubText: { fontFamily: 'Ubuntu_400Regular', fontSize: 14, color: '#64748b', textAlign: 'center' },

  // Gateway card
  gwWrapper: { marginBottom: 8 },
  gwCardBg: { width: '100%', height: 180, borderRadius: 24, overflow: 'hidden', backgroundColor: '#0f172a' },
  gwCardBgImage: { opacity: 0.92 },
  gwGradientOverlay: { flex: 1, padding: 20, paddingBottom: 28, justifyContent: 'space-between' },
  gwHeaderPremium: { flex: 1, justifyContent: 'space-between' },
  gwTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  gwIconPremium: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  gwNamePremium: { fontFamily: 'Ubuntu_700Bold', fontSize: 18, color: '#fff' },
  gwIdPremium: { fontFamily: 'Ubuntu_400Regular', fontSize: 13, color: '#e2e8f0', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },
  statusDotPremium: { width: 7, height: 7, borderRadius: 4 },
  statusTextPremium: { fontFamily: 'Ubuntu_700Bold', fontSize: 12 },
  gwFooterPremium: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingTop: 14,
  },
  gwMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gwMetaText: { fontFamily: 'Ubuntu_500Medium', fontSize: 13, color: '#fff' },

  // Nodes panel
  nodesContainer: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: -20,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  unprovisionedPanel: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unprovisionedTitle: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 18,
    color: '#0f172a',
    marginBottom: 8,
  },
  unprovisionedText: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  nodesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  nodesTitle: { fontFamily: 'Ubuntu_700Bold', fontSize: 15, color: '#0f172a' },
  addNodeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#f0f9ff', borderRadius: 999,
  },
  addNodeText: { fontFamily: 'Ubuntu_700Bold', fontSize: 13, color: '#0ea5e9' },
  nodesGrid: { gap: 10 },
  nodePremiumItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  nodeIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
    marginTop: 2,
  },
  nodeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nodeNamePremium: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 14,
    color: '#0f172a',
    flex: 1,
  },
  nodeActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  nodeActiveDot: { width: 6, height: 6, borderRadius: 3 },
  nodeActiveText: { fontFamily: 'Ubuntu_700Bold', fontSize: 11 },
  nodeIdPremium: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 11,
    color: '#94a3b8',
  },
  nodeMetaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  nodeMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nodeMetaText: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 11,
    color: '#94a3b8',
  },
  nodeConfigBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#f0f9ff',
    borderWidth: 1, borderColor: '#bae6fd',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  nodeActions: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  nodeStatusSquare: {
    width: 34, height: 34, borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  nodeStatusDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#fff' },
  noNodesPremium: {
    padding: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f8fafc', borderRadius: 14,
    borderWidth: 1, borderColor: '#f1f5f9', borderStyle: 'dashed',
  },
  noNodesTextPremium: { fontFamily: 'Ubuntu_400Regular', fontSize: 13, color: '#94a3b8' },
});
