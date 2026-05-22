import React, { useState, useCallback } from 'react';
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

const buoyImage = require('../../assets/3D_EauSure.png');

export default function DashboardPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const { latestData, isConnected } = useMqtt();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [latestByNode, setLatestByNode] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [totalAlerts, setTotalAlerts] = useState(0);

  // Modals state
  const [infoModal, setInfoModal] = useState({ visible: false, type: null });
  const [detailModal, setDetailModal] = useState({ visible: false, node: null, gateway: null, data: null });

  const INFO_DATA = {
    tds: {
      title: "Qualité de l'eau (TDS)",
      description: "Le TDS (Total Dissolved Solids) mesure la quantité totale de matières dissoutes dans l'eau (minéraux, sels, métaux). Un taux élevé peut indiquer une eau contaminée ou très dure. Un score bas (moins de 300 ppm) indique généralement une eau douce et pure.",
      image: require('../../assets/tds_info.png')
    },
    ph: {
      title: "Le pH de l'eau",
      description: "Le pH mesure l'acidité ou l'alcalinité de l'eau sur une échelle de 0 à 14. Une eau pure a un pH de 7 (neutre). Un bon équilibre est vital pour la santé et la faune.",
      image: require('../../assets/ph_scale.png')
    },
    temp: {
      title: "Température",
      description: "La température affecte les propriétés chimiques de l'eau. L'eau chaude dissout moins d'oxygène, ce qui peut affecter la vie aquatique et influencer les autres capteurs.",
      image: require('../../assets/temp_info.png')
    },
    turbidity: {
      title: "Turbidité",
      description: "La turbidité mesure le degré de trouble de l'eau causé par des particules en suspension. Une eau trouble indique souvent des sédiments ou pollutions.",
      image: require('../../assets/turb_info.png')
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

      const latestMap = {};
      for (const n of allNodes) {
        try {
          const res = await getLatestSensorData({ nodeId: n.nodeId });
          if (res.success && res.data) latestMap[n.nodeId] = res.data;
        } catch { /* no data */ }
      }
      setLatestByNode(latestMap);

      try {
        const statsRes = await getSensorStats({ hours: 24 });
        if (statsRes.success) {
          setStats(statsRes.data.statistics);
          if (statsRes.data.events && statsRes.data.events.length > 0) {
            setAlerts(statsRes.data.events);
          }
        }
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
      setLatestByNode(prev => ({ ...prev, [latestData.nodeId]: latestData }));
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

  const totalAlertsValue = alerts.reduce((sum, e) => sum + e.count, 0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <LiveToast />

      <SafeAreaView style={styles.headerSafe}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoWrapper}>
              <Image source={require('../../assets/logo.png')} style={styles.logoIcon} resizeMode="cover" />
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
                        ? alerts.map(a => `${a._id}: ${a.count}`).join(', ')
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
              const scoreLabel = getScoreLabel(score);
              const isActive = node.status?.active;

              // Mapbox satellite background with LoRa range circle
              const loc = node.gatewayLocation;
              const hasLocation = loc?.lat && loc?.lng;
              const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

              // Estimate LoRa range from RSSI: rough formula
              const rssi = latest?.signal?.rssi || node.status?.lastRssi || -70;
              // Higher zoom = smaller area visible. At RSSI -32 dBm (very close), 
              // the node is likely within 50-200m. Use zoom 15-16 to show that scale.
              const zoom = rssi > -50 ? 16 : rssi > -70 ? 15 : rssi > -90 ? 14.5 : 14;

              // Use logo=false and attribution=false to remove Mapbox watermark/attribution
              const mapImageUrl =
                hasLocation && mapboxToken
                  ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${loc.lng},${loc.lat},${zoom},0/600x280@2x?access_token=${mapboxToken}&logo=false&attribution=false`
                  : null;

              return (
                <TouchableOpacity
                  key={node.nodeId}
                  activeOpacity={0.9}
                  style={styles.buoyCardWrapper}
                  onPress={() => router.push('/telemetry')}
                >
                  <View style={[styles.buoyCard, styles.shadow]}>
                    {/* Full-card map background */}
                    {mapImageUrl ? (
                      <ImageBackground
                        source={{ uri: mapImageUrl }}
                        style={styles.buoyCardFull}
                        imageStyle={styles.buoyCardFullImage}
                      >
                        {/* LoRa range overlay — small colored circle */}
                        <View style={styles.loraRangeOverlay}>
                          <View style={[styles.loraCircle, {
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: rssi > -60 ? 'rgba(34,197,94,0.2)' : rssi > -80 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.25)',
                            borderWidth: 1.5,
                            borderColor: rssi > -60 ? 'rgba(34,197,94,0.5)' : rssi > -80 ? 'rgba(245,158,11,0.5)' : 'rgba(239,68,68,0.5)',
                          }]} />
                          <View style={styles.loraCenterDot} />
                        </View>

                        {/* Dark gradient overlay for text readability */}
                        <LinearGradient
                          colors={['rgba(15,23,42,0.45)', 'rgba(15,23,42,0.88)']}
                          style={StyleSheet.absoluteFill}
                        />

                        {/* Content */}
                        <View style={styles.buoyContentOverlay}>
                          {/* Top: image + name + gauge + arrow */}
                          <View style={styles.buoyCardTop}>
                            <Image source={buoyImage} style={styles.buoyImg} resizeMode="contain" />
                            <View style={styles.buoyInfo}>
                              <View style={styles.buoyNameRow}>
                                <View style={[styles.buoyDot, { backgroundColor: isActive ? '#22c55e' : '#cbd5e1' }]} />
                                <Text style={[styles.buoyName, { color: '#fff' }]} numberOfLines={1}>
                                  {node.name || `Bouée ${node.nodeId.slice(-4)}`}
                                </Text>
                                {/* Score gauge */}
                                <View style={styles.gaugeWrap}>
                                  <View style={styles.gaugeTrack}>
                                    <View style={[styles.gaugeFill, { width: `${score * 10}%`, backgroundColor: scoreColor }]} />
                                  </View>
                                  <Text style={[styles.gaugeLabel, { color: scoreColor }]}>{score}</Text>
                                </View>
                              </View>
                              {/* Location */}
                              <View style={styles.buoyLocationRow}>
                                <MapPin size={12} color="#ef4444" />
                                <Text style={styles.buoyLocationText}>
                                  {node.gatewayLocation?.city || 'Localisation inconnue'}
                                </Text>
                              </View>
                            </View>
                            <TouchableOpacity
                              onPress={() => setDetailModal({ visible: true, node, gateway: { name: node.gatewayName }, data: latest })}
                              style={styles.detailArrowBtn}
                              hitSlop={12}
                            >
                              <ArrowUpRight size={18} color="#fff" />
                            </TouchableOpacity>
                          </View>

                          {/* Spacer to push metrics to bottom */}
                          <View style={{ flex: 1 }} />

                          {/* Bottom: Metrics rows */}
                          {latest && (
                            <View style={styles.buoyMetricsWrap}>
                              <View style={styles.buoyMetrics}>
                                <View style={styles.buoyMetricBoxDark}>
                                  <Text style={styles.buoyMetricLabelDark}>pH</Text>
                                  <Text style={styles.buoyMetricValueDark}>{latest.ph?.value?.toFixed(1) || '--'}</Text>
                                </View>
                                <View style={styles.buoyMetricBoxDark}>
                                  <Text style={styles.buoyMetricLabelDark}>TDS</Text>
                                  <Text style={styles.buoyMetricValueDark}>{latest.tds?.value ?? '--'}</Text>
                                </View>
                                <View style={styles.buoyMetricBoxDark}>
                                  <Text style={styles.buoyMetricLabelDark}>Turbidité</Text>
                                  <Text style={styles.buoyMetricValueDark}>{latest.turbidity?.score ?? '--'}/10</Text>
                                </View>
                              </View>
                              <View style={styles.buoyMetrics}>
                                <View style={styles.buoyMetricBoxDark}>
                                  <Text style={styles.buoyMetricLabelDark}>Temp.</Text>
                                  <Text style={styles.buoyMetricValueDark}>{latest.temperature?.water?.toFixed(1) || '--'}°</Text>
                                </View>
                                <View style={styles.buoyMetricBoxDark}>
                                  <Text style={styles.buoyMetricLabelDark}>Batterie</Text>
                                  <Text style={[styles.buoyMetricValueDark, { color: (latest.battery?.percentage || 0) < 20 ? '#f87171' : '#fff' }]}>
                                    {latest.battery?.percentage ?? '--'}%
                                  </Text>
                                </View>
                                <View style={styles.buoyMetricBoxDark}>
                                  <Text style={styles.buoyMetricLabelDark}>Signal</Text>
                                  <Text style={[styles.buoyMetricValueDark, { color: rssi > -60 ? '#4ade80' : rssi > -80 ? '#fbbf24' : '#f87171' }]}>
                                    {rssi} dB
                                  </Text>
                                </View>
                              </View>
                            </View>
                          )}
                        </View>
                      </ImageBackground>
                    ) : (
                      <View style={styles.buoyCardFull}>
                        <LinearGradient
                          colors={['rgba(14,165,233,0.15)', 'rgba(15,23,42,0.9)']}
                          style={StyleSheet.absoluteFill}
                        />
                        <View style={styles.buoyContentOverlay}>
                          <View style={styles.buoyCardTop}>
                            <Image source={buoyImage} style={styles.buoyImg} resizeMode="contain" />
                            <View style={styles.buoyInfo}>
                              <View style={styles.buoyNameRow}>
                                <View style={[styles.buoyDot, { backgroundColor: isActive ? '#22c55e' : '#cbd5e1' }]} />
                                <Text style={[styles.buoyName, { color: '#fff' }]} numberOfLines={1}>
                                  {node.name || `Bouée ${node.nodeId.slice(-4)}`}
                                </Text>
                                <View style={styles.gaugeWrap}>
                                  <View style={styles.gaugeTrack}>
                                    <View style={[styles.gaugeFill, { width: `${score * 10}%`, backgroundColor: scoreColor }]} />
                                  </View>
                                  <Text style={[styles.gaugeLabel, { color: scoreColor }]}>{score}</Text>
                                </View>
                              </View>
                              <View style={styles.buoyLocationRow}>
                                <MapPin size={12} color="#ef4444" />
                                <Text style={styles.buoyLocationText}>
                                  {node.gatewayLocation?.city || 'Localisation inconnue'}
                                </Text>
                              </View>
                            </View>
                            <TouchableOpacity
                              onPress={() => setDetailModal({ visible: true, node, gateway: { name: node.gatewayName }, data: latest })}
                              style={styles.detailArrowBtn}
                              hitSlop={12}
                            >
                              <ArrowUpRight size={18} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
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
  logoWrapper: { width: 40, height: 40, backgroundColor: '#e0f2fe', borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoIcon: { width: 60, height: 60 },
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

  buoyCardWrapper: { marginBottom: 14 },
  buoyCard: { borderRadius: 20, overflow: 'hidden' },
  buoyCardFull: { width: '100%', minHeight: 280, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1e293b', justifyContent: 'flex-end' },
  buoyCardFullImage: { borderRadius: 20 },
  loraRangeOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  loraCircle: { position: 'absolute' },
  loraCenterDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.3)' },
  buoyContentOverlay: { flex: 1, padding: 14, zIndex: 3, justifyContent: 'space-between' },
  buoyCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buoyImg: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(148,163,184,1)' },
  buoyInfo: { flex: 1, gap: 5 },
  buoyNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buoyDot: { width: 7, height: 7, borderRadius: 4 },
  buoyName: { fontFamily: 'Ubuntu_700Bold', fontSize: 15, color: '#fff', flexShrink: 1 },
  gaugeWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gaugeTrack: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  gaugeFill: { height: '100%', borderRadius: 3 },
  gaugeLabel: { fontFamily: 'Ubuntu_700Bold', fontSize: 11 },
  buoyLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  buoyLocationText: { fontFamily: 'Ubuntu_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  buoyScoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  buoyScoreDot: { width: 6, height: 6, borderRadius: 3 },
  buoyScoreText: { fontFamily: 'Ubuntu_700Bold', fontSize: 12 },
  buoyMetrics: { flexDirection: 'row', gap: 6 },
  buoyMetricsWrap: { gap: 6 },
  buoyMetricBoxDark: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 8, alignItems: 'center', gap: 3 },
  buoyMetricLabelDark: { fontFamily: 'Ubuntu_500Medium', fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  buoyMetricValueDark: { fontFamily: 'Ubuntu_700Bold', fontSize: 14, color: '#fff' },
  detailArrowBtn: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
});
