import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, ImageBackground, Dimensions,
  TouchableOpacity, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Droplets, Activity, Battery, Bell, MapPin,
  ArrowUpRight, Waves, ThermometerSun, AlertTriangle, Wifi, Info,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useMqtt } from '../../context/MqttContext';
import { useRouter, useFocusEffect } from 'expo-router';
import { getUserGateways, getGatewayNodes } from '../../api/pairingClient';
import { getSensorStats, getLatestSensorData, computeQualityScore, getScoreColor, getScoreLabel } from '../../api/telemetryClient';
import SkeletonLoader from '../../components/SkeletonLoader';
import LiveToast from '../../components/LiveToast';
import MeshGradientBg from '../../components/MeshGradientBg';
import WaterWaveBg from '../../components/WaterWaveBg';
import MetricInfoModal from '../../components/MetricInfoModal';
import NodeDetailModal from '../../components/NodeDetailModal';
import UserAvatar from '../../components/UserAvatar';
import { detectAlerts, registerForPushNotifications, sendAlertNotification, DEFAULT_THRESHOLDS } from '../../utils/alertUtils';

const { width } = Dimensions.get('window');

const THEME = {
  primary: ['#0ea5e9', '#2563eb'],
  alert: ['#ef4444', '#b91c1c'],
  success: ['#22c55e', '#15803d'],
  warning: ['#f59e0b', '#d97706'],
  cardBg: '#ffffff',
  textMain: '#0f172a',
  textSub: '#64748b',
};

const buoyImage = require('../../assets/branding/buoy-3d.png');

export default function DashboardPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const { latestData, isConnected } = useMqtt();

  // Seuils et préférences de notification depuis le profil
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(profile?.preferences?.alertThresholds ?? {}) };
  const pushEnabled = profile?.preferences?.notifications?.push ?? true;
  const criticalOnly = profile?.preferences?.notifications?.criticalOnly ?? false;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [latestByNode, setLatestByNode] = useState({});
  const [alerts, setAlerts] = useState([]);   // alertes basées sur les seuils
  const [totalAlerts, setTotalAlerts] = useState(0);
  const nodesRef = useRef([]);

  // Demande la permission de notification au montage
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  // Modals state
  const [infoModal, setInfoModal] = useState({ visible: false, type: null });
  const [detailModal, setDetailModal] = useState({ visible: false, node: null, gateway: null, data: null });

  const INFO_DATA = {
    tds: {
      title: "Qualité de l'eau (TDS)",
      description: "Le TDS (Total Dissolved Solids) mesure la quantité totale de matières dissoutes dans l'eau (minéraux, sels, métaux). Un taux élevé peut indiquer une eau contaminée ou très dure. Un score bas (moins de 300 ppm) indique généralement une eau douce et pure.",
      image: require('../../assets/illustrations/tds-info.png')
    },
    ph: {
      title: "Le pH de l'eau",
      description: "Le pH mesure l'acidité ou l'alcalinité de l'eau sur une échelle de 0 à 14. Une eau pure a un pH de 7 (neutre). Un bon équilibre est vital pour la santé et la faune.",
      image: require('../../assets/illustrations/ph-scale.png')
    },
    temp: {
      title: "Température",
      description: "La température affecte les propriétés chimiques de l'eau. L'eau chaude dissout moins d'oxygène, ce qui peut affecter la vie aquatique et influencer les autres capteurs.",
      image: require('../../assets/illustrations/temperature-info.png')
    },
    turbidity: {
      title: "Turbidité",
      description: "La turbidité mesure le degré de trouble de l'eau causé par des particules en suspension. Une eau trouble indique souvent des sédiments ou pollutions.",
      image: require('../../assets/illustrations/turbidity-info.png')
    }
  };

  const loadDashboard = useCallback(async () => {
    try {
      const gwRes = await getUserGateways();
      if (!gwRes.success) return;

      const allNodes = [];
      for (const gw of gwRes.data) {
        const nodesRes = await getGatewayNodes(gw._id);
        if (nodesRes.success) {
          for (const n of nodesRes.data) {
            allNodes.push({ ...n, gatewayName: gw.name, gatewayLocation: gw.location });
          }
        }
      }
      setNodes(allNodes);
      nodesRef.current = allNodes;

      const latestMap = {};
      for (const n of allNodes) {
        try {
          const res = await getLatestSensorData({ nodeId: n.nodeId });
          if (res.success && res.data) latestMap[n.nodeId] = res.data;
        } catch { /* no data */ }
      }
      setLatestByNode(latestMap);

      // Calcul des alertes basées sur les seuils (pas les events backend)
      const allAlerts = [];
      for (const n of allNodes) {
        const record = latestMap[n.nodeId];
        const nodeAlerts = detectAlerts(record, n.name || `Bouée ${n.nodeId.slice(-4)}`, thresholds);
        allAlerts.push(...nodeAlerts);
      }
      setAlerts(allAlerts);

      // Envoyer les notifications pour les nouvelles alertes critiques
      for (const alert of allAlerts) {
        sendAlertNotification(alert, pushEnabled, criticalOnly);
      }

      try {
        const statsRes = await getSensorStats({ hours: 24 });
        if (statsRes.success) setStats(statsRes.data.statistics);
      } catch { /* no stats */ }
    } catch (e) {
      console.error('[Dashboard] load error:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        await loadDashboard();
        if (active) setLoading(false);
      })();
      return () => { active = false; };
    }, [loadDashboard]),
  );

  React.useEffect(() => {
    if (latestData && latestData.nodeId) {
      setLatestByNode(prev => {
        const updated = { ...prev, [latestData.nodeId]: latestData };

        // Recalcul des alertes en temps réel sur la nouvelle donnée
        const allAlerts = [];
        for (const n of nodesRef.current) {
          const record = updated[n.nodeId];
          const nodeAlerts = detectAlerts(record, n.name || `Bouée ${n.nodeId.slice(-4)}`, thresholds);
          allAlerts.push(...nodeAlerts);
        }
        setAlerts(allAlerts);

        // Notifications pour les alertes de la nouvelle donnée uniquement
        const newNodeAlerts = detectAlerts(latestData, latestData.nodeId, thresholds);
        for (const alert of newNodeAlerts) {
          sendAlertNotification(alert, pushEnabled, criticalOnly);
        }

        return updated;
      });
    }
  }, [latestData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDashboard();
    setRefreshing(false);
  };

  const avatarUri = profile?.avatar || profile?.image || user?.avatar || user?.image || '';
  const firstName = (profile?.name || user?.name || 'Utilisateur').split(' ')[0] || 'Utilisateur';

  const latestVals = Object.values(latestByNode);
  let phSum = 0, phCount = 0;
  let tdsSum = 0, tdsCount = 0;
  let tempSum = 0, tempCount = 0;
  let turbSum = 0, turbCount = 0;

  latestVals.forEach(v => {
    const phVal = v?.ph?.value ?? v?.ph;
    if (typeof phVal === 'number') { phSum += phVal; phCount++; }

    const tdsVal = v?.tds?.value ?? v?.tds;
    if (typeof tdsVal === 'number') { tdsSum += tdsVal; tdsCount++; }

    const tempVal = v?.temperature?.water ?? v?.temperature?.value ?? v?.temperature;
    if (typeof tempVal === 'number') { tempSum += tempVal; tempCount++; }

    const turbVal = v?.turbidity?.score ?? v?.turbidity?.value ?? v?.turbidity;
    if (typeof turbVal === 'number') { turbSum += turbVal; turbCount++; }
  });

  const currentPH = phCount > 0 ? (phSum / phCount).toFixed(1) : '--';
  const currentTDS = tdsCount > 0 ? Math.round(tdsSum / tdsCount) : '--';
  const currentTemp = tempCount > 0 ? (tempSum / tempCount).toFixed(1) : '--';
  const currentTurbidity = turbCount > 0 ? (turbSum / turbCount).toFixed(1) : '--';

  const totalAlertsValue = alerts.length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <LiveToast />

      <SafeAreaView style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoWrapper}>
              <Image source={require('../../assets/branding/logo.png')} style={styles.logoIcon} resizeMode="cover" />
            </View>
            <View style={styles.headerTextWrap}>
              <Text style={styles.appName}>EauSûre</Text>
              <Text style={styles.appSlogan}>Quality Controlled</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.bellBtn} activeOpacity={0.8}>
              <Bell size={22} color="#0f172a" />
              {totalAlertsValue > 0 && <View style={styles.notifBadge} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/settings')} activeOpacity={0.8}>
              <UserAvatar uri={avatarUri} name={profile?.name || user?.name} size={44} borderColor="#22c55e" />
              <View style={styles.onlineDot} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0ea5e9" />}
      >
        <View style={styles.section}>
          <View style={styles.dateHeader}>
            <Text style={styles.dateHeroText}>
              {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} • {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>

          {loading && nodes.length === 0 ? (
            <View style={styles.metricsContainer}>
              <SkeletonLoader width="100%" height={170} borderRadius={24} />
              <View style={styles.secondaryRow}>
                <SkeletonLoader width="48%" height={120} borderRadius={20} />
                <SkeletonLoader width="48%" height={120} borderRadius={20} />
              </View>
            </View>
          ) : (
            <View style={styles.metricsContainer}>
              <View style={styles.metricsHeaderInfo}>
                <Text style={styles.metricsTitle}>Moyennes globales actuelles</Text>
                <Text style={styles.metricsSubtitle}>Moyennes calculées à partir de vos {nodes.length} bouées actives.</Text>
              </View>

              <TouchableOpacity activeOpacity={0.8} style={styles.metricCardLarge} onPress={() => router.push('/telemetry')}>
                <WaterWaveBg width={width - 40} height={170} />
                <View style={[styles.gradientCard, { backgroundColor: 'transparent' }]}>
                  <View style={styles.cardContent}>
                    <View style={styles.metricHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={styles.iconContainer}>
                          <Droplets size={22} color="#fff" />
                        </View>
                        <Text style={styles.metricLabel}>Qualité de l'eau (TDS)</Text>
                      </View>
                      <TouchableOpacity onPress={() => setInfoModal({ visible: true, type: 'tds' })} hitSlop={10} style={styles.infoIcon}>
                        <Info size={22} color="#fff" />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.metricValueLarge}>
                      {currentTDS} <Text style={styles.metricUnit}>ppm</Text>
                    </Text>
                    <Text style={styles.metricSubtext}>Temps réel • {nodes.length} bouée{nodes.length !== 1 ? 's' : ''}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              <View style={styles.secondaryRow}>
                {/* pH */}
                <TouchableOpacity activeOpacity={0.8} style={styles.metricCardSmall} onPress={() => router.push('/telemetry')}>
                  <LinearGradient colors={['#dbeafe', '#bfdbfe']} style={[styles.gradientCard, styles.shadow]}>
                    <TouchableOpacity onPress={() => setInfoModal({ visible: true, type: 'ph' })} hitSlop={10} style={styles.infoIconSmall}>
                      <Info size={14} color="#2563eb" />
                    </TouchableOpacity>
                    <View style={styles.cardContent}>
                      <View style={styles.metricHeaderSmall}>
                        <View style={[styles.iconContainer, { backgroundColor: '#93c5fd' }]}>
                          <Activity size={18} color="#1e40af" />
                        </View>
                      </View>
                      <Text style={[styles.metricLabelSmall, { color: '#1e40af' }]}>pH</Text>
                      <Text style={[styles.metricValueMedium, { color: '#1e3a8a' }]}>{currentPH}</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Temperature */}
                <TouchableOpacity activeOpacity={0.8} style={styles.metricCardSmall} onPress={() => router.push('/telemetry')}>
                  <LinearGradient colors={['#ffedd5', '#fed7aa']} style={[styles.gradientCard, styles.shadow]}>
                    <TouchableOpacity onPress={() => setInfoModal({ visible: true, type: 'temp' })} hitSlop={10} style={styles.infoIconSmall}>
                      <Info size={14} color="#ea580c" />
                    </TouchableOpacity>
                    <View style={styles.cardContent}>
                      <View style={styles.metricHeaderSmall}>
                        <View style={[styles.iconContainer, { backgroundColor: '#fdba74' }]}>
                          <ThermometerSun size={18} color="#9a3412" />
                        </View>
                      </View>
                      <Text style={[styles.metricLabelSmall, { color: '#9a3412' }]}>Température</Text>
                      <Text style={[styles.metricValueMedium, { color: '#7c2d12' }]}>
                        {currentTemp}°C
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Turbidity */}
                <TouchableOpacity activeOpacity={0.8} style={styles.metricCardSmall} onPress={() => router.push('/telemetry')}>
                  <LinearGradient colors={['#f3e8ff', '#e9d5ff']} style={[styles.gradientCard, styles.shadow]}>
                    <TouchableOpacity onPress={() => setInfoModal({ visible: true, type: 'turbidity' })} hitSlop={10} style={styles.infoIconSmall}>
                      <Info size={14} color="#7c3aed" />
                    </TouchableOpacity>
                    <View style={styles.cardContent}>
                      <View style={styles.metricHeaderSmall}>
                        <View style={[styles.iconContainer, { backgroundColor: '#d8b4fe' }]}>
                          <Waves size={18} color="#6b21a8" />
                        </View>
                      </View>
                      <Text style={[styles.metricLabelSmall, { color: '#6b21a8' }]}>Turbidité</Text>
                      <Text style={[styles.metricValueMedium, { color: '#581c87' }]}>
                        {currentTurbidity} <Text style={{ fontSize: 13 }}>Pts</Text>
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Alerts card */}
              <TouchableOpacity activeOpacity={0.8} style={styles.alertCard}>
                <View style={[styles.alertCardInner, styles.shadow]}>
                  <View style={[styles.alertIcon, { backgroundColor: totalAlertsValue > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)' }]}>
                    <Bell size={20} color={totalAlertsValue > 0 ? '#ef4444' : '#22c55e'} />
                    {totalAlertsValue > 0 && (
                      <View style={styles.alertBadge}>
                        <Text style={styles.alertBadgeText}>{totalAlertsValue}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.alertContent}>
                    <Text style={styles.alertTitle}>
                      {totalAlertsValue > 0
                        ? `${totalAlertsValue} événement${totalAlertsValue > 1 ? 's' : ''} récents`
                        : 'Aucune alerte'}
                    </Text>
                    <Text style={styles.alertText}>
                      {totalAlertsValue > 0
                        ? alerts.map(a => a.label).join(' • ')
                        : 'Tout fonctionne normalement'}
                    </Text>
                  </View>
                  <ArrowUpRight size={18} color="#475569" />
                </View>
              </TouchableOpacity>
            </View>
          )}

          {/* Buoy list */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Mes Bouées</Text>
            <TouchableOpacity onPress={() => router.push('/telemetry')}>
              <Text style={styles.seeAll}>Détails →</Text>
            </TouchableOpacity>
          </View>

          {nodes.length === 0 && !loading ? (
            <View style={styles.emptyBuoys}>
              <Wifi size={36} color="#cbd5e1" />
              <Text style={styles.emptyBuoysText}>Aucune bouée associée.</Text>
            </View>
          ) : (
            nodes.map((node) => {
              const latest = latestByNode[node.nodeId];
              const score = computeQualityScore(latest);
              const scoreColor = getScoreColor(score);
              const isActive = node.status?.active;
              const rssi = latest?.signal?.rssi || node.status?.lastRssi || -70;
              const battery = latest?.battery?.percentage ?? node.status?.lastBattery;
              const rssiColor = rssi > -60 ? '#22c55e' : rssi > -80 ? '#f59e0b' : '#ef4444';
              const battColor = battery >= 50 ? '#22c55e' : battery >= 20 ? '#f59e0b' : '#ef4444';

              const loc = node.gatewayLocation;
              const hasLocation = loc?.lat && loc?.lng;
              const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
              const zoom = 14;
              const mapImageUrl =
                hasLocation && mapboxToken
                  ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/pin-s+ef4444(${loc.lng},${loc.lat})/${loc.lng},${loc.lat},${zoom},0/600x300@2x?access_token=${mapboxToken}`
                  : null;

              return (
                <TouchableOpacity
                  key={node.nodeId}
                  activeOpacity={0.92}
                  style={styles.buoyCardWrapper}
                  onPress={() => router.push('/telemetry')}
                >
                  {/* ── Carte map satellite (style materiel.jsx) ── */}
                  <ImageBackground
                    source={mapImageUrl ? { uri: mapImageUrl } : buoyImage}
                    style={styles.buoyMapCard}
                    imageStyle={styles.buoyMapCardImage}
                  >
                    <LinearGradient
                      colors={['rgba(15,23,42,0.08)', 'rgba(15,23,42,0.72)']}
                      style={styles.buoyMapGradient}
                    >
                      <View style={styles.buoyMapHeader}>
                        {/* Icône + nom + statut */}
                        <View style={styles.buoyMapTitleRow}>
                          <View style={styles.buoyMapIcon}>
                            <Waves size={20} color="#fff" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.buoyMapName} numberOfLines={1}>
                              {node.name || `Bouée ${node.nodeId.slice(-4)}`}
                            </Text>
                            <Text style={styles.buoyMapId}>{node.nodeId}</Text>
                          </View>
                          <View style={[
                            styles.buoyStatusBadge,
                            { backgroundColor: isActive ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.92)' },
                          ]}>
                            <View style={[styles.buoyStatusDot, { backgroundColor: isActive ? '#4ade80' : '#ef4444' }]} />
                            <Text style={[styles.buoyStatusText, { color: isActive ? '#4ade80' : '#dc2626' }]}>
                              {isActive ? 'Actif' : 'Inactif'}
                            </Text>
                          </View>                        </View>

                        {/* Footer map */}
                        <View style={styles.buoyMapFooter}>
                          <View style={styles.buoyMapMeta}>
                            <MapPin size={13} color="#ef4444" />
                            <Text style={styles.buoyMapMetaText}>
                              {loc?.city || 'Localisation inconnue'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={[styles.buoyScorePill, { backgroundColor: `${scoreColor}22`, borderColor: `${scoreColor}55` }]}>
                              <View style={[styles.buoyScoreDot, { backgroundColor: scoreColor }]} />
                              <Text style={[styles.buoyScorePillText, { color: scoreColor }]}>
                                {score}/10
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={(e) => { e.stopPropagation?.(); setDetailModal({ visible: true, node, gateway: { name: node.gatewayName }, data: latest }); }}
                              style={styles.buoyDetailBtn}
                              hitSlop={8}
                            >
                              <ArrowUpRight size={15} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </LinearGradient>
                  </ImageBackground>

                  {/* ── Carte blanche métriques ── */}
                  <View style={styles.buoyMetricsCard}>
                    <View style={styles.buoyMetricsRow}>
                      {[
                        { label: 'pH',        value: latest?.ph?.value?.toFixed(1) ?? '--',                           color: '#2563eb',  bg: '#eff6ff' },
                        { label: 'TDS',       value: latest?.tds?.value != null ? `${latest.tds.value}` : '--',       color: '#0ea5e9',  bg: '#f0f9ff', unit: 'ppm' },
                        { label: 'Turbidité', value: latest?.turbidity?.score != null ? `${latest.turbidity.score}` : '--', color: '#8b5cf6', bg: '#faf5ff', unit: '/10' },
                        { label: 'Temp.',     value: latest?.temperature?.water != null ? `${latest.temperature.water.toFixed(1)}` : '--', color: '#f59e0b', bg: '#fffbeb', unit: '°C' },
                        { label: 'Batterie',  value: battery != null ? `${battery}` : '--',                           color: battColor,  bg: battery >= 50 ? '#f0fdf4' : battery >= 20 ? '#fffbeb' : '#fef2f2', unit: '%' },
                        { label: 'Signal',    value: `${rssi}`,                                                        color: rssiColor,  bg: rssi > -60 ? '#f0fdf4' : rssi > -80 ? '#fffbeb' : '#fef2f2', unit: ' dB' },
                      ].map(({ label, value, color, bg, unit }) => (
                        <View key={label} style={[styles.buoyMetricItem, { backgroundColor: bg }]}>
                          <Text style={[styles.buoyMetricValue, { color }]}>
                            {value}<Text style={styles.buoyMetricUnit}>{unit}</Text>
                          </Text>
                          <Text style={styles.buoyMetricLabel}>{label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          {infoModal.type && (
            <MetricInfoModal 
              visible={infoModal.visible} 
              onClose={() => setInfoModal({ visible: false, type: null })}
              title={INFO_DATA[infoModal.type].title}
              description={INFO_DATA[infoModal.type].description}
              imageSource={INFO_DATA[infoModal.type].image}
            />
          )}

          <NodeDetailModal
            visible={detailModal.visible}
            onClose={() => setDetailModal({ visible: false, node: null, gateway: null, data: null })}
            node={detailModal.node}
            gateway={detailModal.gateway}
            latestData={detailModal.data}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  shadow: { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3 },
  headerSafe: { 
    backgroundColor: '#ffffff', 
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 6,
    zIndex: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoWrapper: { width: 44, height: 44, backgroundColor: '#e0f2fe', borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoIcon: { width: 44, height: 44 },
  headerTextWrap: { justifyContent: 'center' },
  appName: { fontSize: 18, fontFamily: 'Ubuntu_700Bold', color: '#0f172a' },
  appSlogan: { fontSize: 10, fontFamily: 'Ubuntu_500Medium', color: '#0ea5e9', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  profileBtn: { position: 'relative' },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#22c55e' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' },
  bellBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', position: 'relative', borderWidth: 1, borderColor: '#e2e8f0' },
  notifBadge: { position: 'absolute', top: 10, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444', borderWidth: 2, borderColor: '#fff' },
  section: { padding: 20, paddingTop: 10 },
  dateHeader: { marginBottom: 24, paddingHorizontal: 4 },
  dateHeroText: { fontSize: 26, fontFamily: 'Ubuntu_700Bold', color: '#0f172a', textTransform: 'capitalize' },
  metricsContainer: { gap: 16, marginBottom: 32 },
  metricsHeaderInfo: { marginBottom: 4 },
  metricsTitle: { fontSize: 16, fontFamily: 'Ubuntu_700Bold', color: '#0f172a', marginBottom: 4 },
  metricsSubtitle: { fontSize: 13, fontFamily: 'Ubuntu_400Regular', color: '#64748b' },
  metricCardLarge: { borderRadius: 24, overflow: 'hidden' },
  metricCardSmall: { width: '31%', borderRadius: 20, overflow: 'hidden', marginBottom: 14 },
  secondaryRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  gradientCard: { borderRadius: 20, flex: 1 },
  cardContent: { padding: 16, flex: 1 },
  metricHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  metricHeaderSmall: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconContainer: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  infoIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  infoIconSmall: { position: 'absolute', top: 10, right: 10, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  metricLabel: { fontSize: 15, fontFamily: 'Ubuntu_500Medium', color: '#fff' },
  metricLabelSmall: { fontSize: 12, fontFamily: 'Ubuntu_500Medium', marginBottom: 2 },
  metricValueLarge: { color: '#fff', fontSize: 44, fontFamily: 'Ubuntu_700Bold', lineHeight: 48 },
  metricValueMedium: { fontSize: 18, fontFamily: 'Ubuntu_700Bold' },
  metricUnit: { fontSize: 18, fontFamily: 'Ubuntu_500Medium', opacity: 0.9 },
  metricSubtext: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'Ubuntu_400Regular' },
  // Alerts
  alertCard: { borderRadius: 16 },
  alertCardInner: { backgroundColor: '#fff', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  alertIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alertBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 2, borderColor: '#fff' },
  alertBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Ubuntu_700Bold' },
  alertContent: { flex: 1 },
  alertTitle: { fontSize: 15, fontFamily: 'Ubuntu_700Bold', color: '#0f172a', marginBottom: 2 },
  alertText: { fontSize: 13, color: '#64748b', fontFamily: 'Ubuntu_400Regular' },

  // Buoy list
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 19, fontFamily: 'Ubuntu_700Bold', color: '#0f172a' },
  seeAll: { fontSize: 14, color: '#3b82f6', fontFamily: 'Ubuntu_500Medium' },
  emptyBuoys: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyBuoysText: { fontFamily: 'Ubuntu_400Regular', fontSize: 14, color: '#64748b' },

  buoyCardWrapper: { marginBottom: 12 },

  // ── Carte map satellite (identique gwCardBg de materiel.jsx) ──
  buoyMapCard: {
    width: '100%',
    height: 180,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  buoyMapCardImage: { opacity: 0.92 },
  buoyMapGradient: {
    flex: 1,
    padding: 20,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },
  buoyMapHeader: { flex: 1, justifyContent: 'space-between' },
  buoyMapTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  buoyMapIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
  },
  buoyMapName: { fontFamily: 'Ubuntu_700Bold', fontSize: 18, color: '#fff' },
  buoyMapId: { fontFamily: 'Ubuntu_400Regular', fontSize: 13, color: '#e2e8f0', marginTop: 2 },
  buoyStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },
  buoyStatusDot: { width: 7, height: 7, borderRadius: 4 },
  buoyStatusText: { fontFamily: 'Ubuntu_700Bold', fontSize: 12 },
  gwFooterPremium: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingTop: 8,
  },
  buoyMapFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)', paddingTop: 8,
  },
  buoyMapMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  buoyMapMetaText: { fontFamily: 'Ubuntu_500Medium', fontSize: 13, color: '#fff' },

  // ── Carte blanche métriques ──
  buoyMetricsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: -20,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  buoyMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  buoyMetricItem: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buoyMetricValue: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 16,
    textAlign: 'center',
  },
  buoyMetricUnit: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 11,
  },
  buoyMetricLabel: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
  },

  // Score pill dans le footer map
  buoyScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  buoyScoreDot: { width: 6, height: 6, borderRadius: 3 },
  buoyScorePillText: { fontFamily: 'Ubuntu_700Bold', fontSize: 12 },

  buoyDetailBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
