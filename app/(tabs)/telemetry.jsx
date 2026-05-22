import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Activity,
  Bell,
  Droplets,
  RefreshCw,
  AlertTriangle,
  Waves,
  ShieldAlert,
  ThermometerSun,
  Clock3,
  Volume2,
  Smartphone,
  Battery,
  Signal,
} from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useMqtt } from '../../context/MqttContext';
import { getUserGateways, getGatewayNodes } from '../../api/pairingClient';
import {
  getSensorData,
  getLatestSensorData,
  getSensorStats,
  computeQualityScore,
  getScoreColor,
  getScoreLabel,
} from '../../api/telemetryClient';
import SkeletonLoader from '../../components/SkeletonLoader';

const { width } = Dimensions.get('window');

const THEME = {
  bg: '#f8fafc',
  card: '#ffffff',
  textMain: '#0f172a',
  textSub: '#64748b',
  border: '#e2e8f0',
  softBorder: '#f1f5f9',
  ph: '#3b82f6',
  tds: '#10b981',
  temp: '#f59e0b',
  turb: '#8b5cf6',
  primary: '#0ea5e9',
  critical: '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
};

const TABS = [
  { key: 'ph', label: 'pH', Icon: Activity, color: THEME.ph },
  { key: 'tds', label: 'TDS', Icon: Droplets, color: THEME.tds },
  { key: 'temp', label: 'Temp.', Icon: ThermometerSun, color: THEME.temp },
  { key: 'turb', label: 'Turbidité', Icon: Waves, color: THEME.turb },
];

function getAlertModeMeta(value) {
  switch (value) {
    case 'critical_only':
      return {
        label: 'Notifications critiques',
        description: 'Seules les alertes graves sont remontées.',
        tone: '#f59e0b',
        Icon: ShieldAlert,
      };
    case 'none':
      return {
        label: 'Notifications désactivées',
        description: 'Aucune notification push pour ce nœud.',
        tone: '#94a3b8',
        Icon: Bell,
      };
    case 'all':
    default:
      return {
        label: 'Toutes les notifications',
        description: 'Mesures et alertes sont suivies.',
        tone: '#0ea5e9',
        Icon: Smartphone,
      };
  }
}

function getEventMeta(eventType) {
  const normalized = String(eventType || 'None').toUpperCase();
  if (normalized === 'SHAKE') {
    return {
      label: 'Alerte chute',
      description: 'Événement critique détecté par le capteur de mouvement.',
      color: THEME.critical,
      background: '#fee2e2',
      Icon: ShieldAlert,
      critical: true,
    };
  }
  if (normalized !== 'NONE') {
    return {
      label: normalized,
      description: 'Anomalie qualité ou événement terrain.',
      color: THEME.warning,
      background: '#fef3c7',
      Icon: AlertTriangle,
      critical: false,
    };
  }
  return {
    label: 'Mesure périodique',
    description: 'Cycle normal de télémétrie.',
    color: THEME.success,
    background: '#dcfce7',
    Icon: Bell,
    critical: false,
  };
}

function formatTimeLabel(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatDateLabel(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

function formatLastSeen(timestamp) {
  if (!timestamp) return 'Aucune mesure récente';
  return `Dernière mesure à ${new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function TelemetryScreen() {
  const { latestData } = useMqtt();

  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [latestByNode, setLatestByNode] = useState({});
  const [chartData, setChartData] = useState([]);
  const [nodeStats, setNodeStats] = useState(null);
  const [nodeEvents, setNodeEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('ph');

  const loadNodes = useCallback(async () => {
    try {
      const gwRes = await getUserGateways();
      if (!gwRes.success) return;

      const allNodes = [];
      const latestMap = {};

      for (const gw of gwRes.data) {
        const nodesRes = await getGatewayNodes(gw._id);
        if (nodesRes.success) {
          for (const n of nodesRes.data) {
            allNodes.push({
              ...n,
              gatewayName: gw.name,
              gatewayId: gw._id,
              gatewayLocation: gw.location,
            });
          }
        }
      }

      for (const n of allNodes) {
        try {
          const res = await getLatestSensorData({ nodeId: n.nodeId });
          if (res.success && res.data) {
            latestMap[n.nodeId] = res.data;
          }
        } catch {}
      }

      setNodes(allNodes);
      setLatestByNode(latestMap);

      if (!selectedNodeId && allNodes.length > 0) {
        setSelectedNodeId(allNodes[0].nodeId);
      }
    } catch (e) {
      console.error('[Telemetry] loadNodes error:', e);
    }
  }, [selectedNodeId]);

  const loadSelectedNodeData = useCallback(async () => {
    if (!selectedNodeId) {
      setChartData([]);
      setNodeStats(null);
      setNodeEvents([]);
      return;
    }

    try {
      const [historyRes, statsRes] = await Promise.all([
        getSensorData({ nodeId: selectedNodeId, limit: 30 }),
        getSensorStats({ nodeId: selectedNodeId, hours: 24 }),
      ]);

      if (historyRes.success && historyRes.data) {
        setChartData(historyRes.data.reverse());
      } else {
        setChartData([]);
      }

      if (statsRes.success) {
        setNodeStats(statsRes.data?.statistics || null);
        setNodeEvents(statsRes.data?.events || []);
      } else {
        setNodeStats(null);
        setNodeEvents([]);
      }
    } catch (e) {
      console.error('[Telemetry] loadSelectedNodeData error:', e);
      setChartData([]);
      setNodeStats(null);
      setNodeEvents([]);
    }
  }, [selectedNodeId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        await loadNodes();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [loadNodes]),
  );

  useEffect(() => {
    if (selectedNodeId) {
      loadSelectedNodeData();
    }
  }, [selectedNodeId, loadSelectedNodeData]);

  useEffect(() => {
    if (latestData && latestData.nodeId) {
      setLatestByNode((prev) => ({ ...prev, [latestData.nodeId]: latestData }));
    }
  }, [latestData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNodes();
    await loadSelectedNodeData();
    setRefreshing(false);
  };

  const selectedNode = useMemo(
    () => nodes.find((node) => node.nodeId === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const selectedLatest = selectedNodeId ? latestByNode[selectedNodeId] : null;
  const selectedScore = computeQualityScore(selectedLatest);
  const selectedScoreColor = getScoreColor(selectedScore);
  const selectedScoreLabel = getScoreLabel(selectedScore);
  const latestEventMeta = getEventMeta(selectedLatest?.event?.type);
  const alertModeMeta = getAlertModeMeta(selectedNode?.config?.alertMode);
  const criticalAlertsCount = nodeEvents
    .filter((eventItem) => String(eventItem?._id || '').toUpperCase() === 'SHAKE')
    .reduce((sum, eventItem) => sum + (eventItem.count || 0), 0);
  const totalAlertsCount = nodeEvents.reduce((sum, eventItem) => sum + (eventItem.count || 0), 0);

  const getFormattedChartData = () => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.map((item, index) => {
      let value = 0;
      if (activeTab === 'ph') value = item.ph?.value || 7;
      if (activeTab === 'tds') value = item.tds?.value || 0;
      if (activeTab === 'temp') value = item.temperature?.water || 20;
      if (activeTab === 'turb') value = item.turbidity?.score || 5;

      return {
        value: parseFloat(value.toFixed(1)),
        label: index % 5 === 0 ? formatTimeLabel(item.timestamp) : '',
      };
    });
  };

  const getChartColor = () => TABS.find((t) => t.key === activeTab)?.color || THEME.ph;

  const getMetricTitle = () => {
    switch (activeTab) {
      case 'ph': return 'Potentiel hydrogène';
      case 'tds': return 'Solides dissous';
      case 'temp': return "Température de l'eau";
      case 'turb': return 'Score turbidité';
      default: return '';
    }
  };

  const getMetricMax = () => {
    switch (activeTab) {
      case 'ph': return 14;
      case 'tds': return 1000;
      case 'temp': return 50;
      case 'turb': return 10;
      default: return 100;
    }
  };

  const formattedData = getFormattedChartData();
  const battery = selectedLatest?.battery?.percentage ?? selectedNode?.status?.lastBattery;
  const rssi = selectedLatest?.signal?.rssi || selectedNode?.status?.lastRssi || -70;
  const battColor = battery >= 50 ? '#22c55e' : battery >= 20 ? '#f59e0b' : '#ef4444';
  const rssiColor = rssi > -60 ? '#22c55e' : rssi > -80 ? '#f59e0b' : '#ef4444';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header (style materiel.jsx) ── */}
      <LinearGradient
        colors={['#ffffff', '#f8fbff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.richHeader}
      >
        <View style={styles.richHeaderTop}>
          <View style={styles.richHeaderLeft}>
            <Text style={styles.richHeaderEyebrow}>Supervision</Text>
            <Text style={styles.richHeaderTitle}>Télémétrie</Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.refreshCircle}>
            {refreshing
              ? <ActivityIndicator size="small" color="#0ea5e9" />
              : <RefreshCw size={18} color="#0ea5e9" />
            }
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.primary} />}
      >
        {/* ── Node selector chips ── */}
        {loading && nodes.length === 0 ? (
          <View style={{ marginBottom: 18 }}>
            <SkeletonLoader width="100%" height={44} borderRadius={999} style={{ marginBottom: 8 }} />
          </View>
        ) : nodes.length === 0 ? (
          <View style={styles.emptyState}>
            <AlertTriangle size={40} color="#cbd5e1" />
            <Text style={styles.emptyText}>Aucune bouée trouvée.</Text>
            <Text style={styles.emptySubText}>Associez une bouée depuis l'onglet Matériel.</Text>
          </View>
        ) : (
          <View style={styles.chipSection}>
            <Text style={styles.sectionLabel}>Sélectionner une bouée</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {nodes.map((node) => {
                const latest = latestByNode[node.nodeId];
                const score = computeQualityScore(latest);
                const dotColor = getScoreColor(score);
                const isSelected = selectedNodeId === node.nodeId;
                return (
                  <TouchableOpacity
                    key={node.nodeId}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setSelectedNodeId(node.nodeId)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.chipDot, { backgroundColor: isSelected ? '#fff' : dotColor }]} />
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]} numberOfLines={1}>
                      {node.name || `Bouée ${node.nodeId.slice(-4)}`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {selectedNodeId && selectedNode && (
          <>
            {/* ── Hero card ── */}
            <LinearGradient
              colors={['#0f172a', '#1d4ed8', '#0ea5e9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.heroBadge}>
                  <Bell size={13} color="#e0f2fe" />
                  <Text style={styles.heroBadgeText}>{selectedNode.gatewayName || 'Passerelle'}</Text>
                </View>
                <View style={[styles.heroStatusBadge, { backgroundColor: latestEventMeta.background }]}>
                  <latestEventMeta.Icon size={11} color={latestEventMeta.color} />
                  <Text style={[styles.heroStatusText, { color: latestEventMeta.color }]}>
                    {latestEventMeta.label}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroTitle}>{selectedNode.name || selectedNode.nodeId}</Text>
              <Text style={styles.heroSubtitle}>{formatLastSeen(selectedLatest?.timestamp)}</Text>

              <View style={styles.heroStatsGrid}>
                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatValue}>{selectedScore.toFixed(1)}/10</Text>
                  <Text style={styles.heroStatLabel}>Score eau</Text>
                  <Text style={[styles.heroStatHint, { color: selectedScoreColor }]}>{selectedScoreLabel}</Text>
                </View>
                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatValue}>{criticalAlertsCount}</Text>
                  <Text style={styles.heroStatLabel}>Alertes chute</Text>
                  <Text style={styles.heroStatHint}>24 dernières h</Text>
                </View>
                <View style={styles.heroStatCard}>
                  <Text style={styles.heroStatValue}>{totalAlertsCount}</Text>
                  <Text style={styles.heroStatLabel}>Événements</Text>
                  <Text style={styles.heroStatHint}>Toutes anomalies</Text>
                </View>
              </View>
            </LinearGradient>

            {/* ── Métriques actuelles — grille 2x3 style buoyMetricItem ── */}
            <View style={styles.metricsCard}>
              <Text style={styles.sectionTitle}>Mesures actuelles</Text>
              <View style={styles.metricsGrid}>
                {[
                  {
                    label: 'pH',
                    value: selectedLatest?.ph?.value?.toFixed(1) ?? '—',
                    color: '#2563eb',
                    bg: '#eff6ff',
                  },
                  {
                    label: 'TDS',
                    value: selectedLatest?.tds?.value != null ? `${selectedLatest.tds.value}` : '—',
                    unit: 'ppm',
                    color: '#0ea5e9',
                    bg: '#f0f9ff',
                  },
                  {
                    label: 'Turbidité',
                    value: selectedLatest?.turbidity?.score != null ? `${selectedLatest.turbidity.score}` : '—',
                    unit: '/10',
                    color: '#8b5cf6',
                    bg: '#faf5ff',
                  },
                  {
                    label: 'Temp.',
                    value: selectedLatest?.temperature?.water != null
                      ? `${selectedLatest.temperature.water.toFixed(1)}`
                      : '—',
                    unit: '°C',
                    color: '#f59e0b',
                    bg: '#fffbeb',
                  },
                  {
                    label: 'Batterie',
                    value: battery != null ? `${battery}` : '—',
                    unit: '%',
                    color: battColor,
                    bg: battery >= 50 ? '#f0fdf4' : battery >= 20 ? '#fffbeb' : '#fef2f2',
                  },
                  {
                    label: 'Signal',
                    value: `${rssi}`,
                    unit: ' dB',
                    color: rssiColor,
                    bg: rssi > -60 ? '#f0fdf4' : rssi > -80 ? '#fffbeb' : '#fef2f2',
                  },
                ].map(({ label, value, unit, color, bg }) => (
                  <View key={label} style={[styles.metricItem, { backgroundColor: bg }]}>
                    <Text style={[styles.metricValue, { color }]}>
                      {value}
                      {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
                    </Text>
                    <Text style={styles.metricLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Config cards ── */}
            <View style={styles.configRow}>
              <View style={[styles.configCard, styles.shadow]}>
                <View style={[styles.configIconWrap, { backgroundColor: '#e0f2fe' }]}>
                  <alertModeMeta.Icon size={17} color={alertModeMeta.tone} />
                </View>
                <View style={styles.configContent}>
                  <Text style={styles.configTitle}>{alertModeMeta.label}</Text>
                  <Text style={styles.configSubtitle}>{alertModeMeta.description}</Text>
                </View>
              </View>
              <View style={[styles.configCard, styles.shadow]}>
                <View style={[styles.configIconWrap, { backgroundColor: '#ecfccb' }]}>
                  <Volume2 size={17} color={selectedNode?.config?.gatewayVocalAlerts ? '#22c55e' : '#94a3b8'} />
                </View>
                <View style={styles.configContent}>
                  <Text style={styles.configTitle}>
                    {selectedNode?.config?.gatewayVocalAlerts ? 'Alerte vocale active' : 'Alerte vocale coupée'}
                  </Text>
                  <Text style={styles.configSubtitle}>Configuration passerelle</Text>
                </View>
              </View>
            </View>

            {/* ── Tabs graphique — pills scrollables ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
              style={styles.tabsScroll}
            >
              {TABS.map(({ key, label, Icon, color }) => {
                const isActive = activeTab === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tabPill, isActive && { backgroundColor: color, borderColor: color }]}
                    onPress={() => setActiveTab(key)}
                    activeOpacity={0.8}
                  >
                    <Icon size={14} color={isActive ? '#fff' : THEME.textSub} />
                    <Text style={[styles.tabPillText, isActive && { color: '#fff' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ── Graphique ── */}
            <View style={[styles.chartCard, styles.shadow]}>
              {chartData.length === 0 ? (
                <View style={styles.loaderContainer}>
                  <AlertTriangle size={28} color={THEME.textSub} style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyChartText}>Aucune donnée pour cette bouée.</Text>
                </View>
              ) : (
                <>
                  <View style={styles.chartHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chartTitle}>{getMetricTitle()}</Text>
                      <Text style={styles.chartSubtitle}>
                        {nodeStats?.count
                          ? `${nodeStats.count} mesures sur 24 h`
                          : 'Historique récent'}
                      </Text>
                    </View>
                    <View style={[styles.chartPill, { backgroundColor: `${getChartColor()}15` }]}>
                      <Clock3 size={11} color={getChartColor()} />
                      <Text style={[styles.chartPillText, { color: getChartColor() }]}>30 pts</Text>
                    </View>
                  </View>
                  <View style={styles.chartWrapper}>
                    <LineChart
                      data={formattedData}
                      width={width - 90}
                      height={210}
                      thickness={2.5}
                      color={getChartColor()}
                      maxValue={getMetricMax()}
                      noOfSections={5}
                      animateOnDataChange
                      animationDuration={800}
                      areaChart
                      yAxisTextStyle={{ color: THEME.textSub, fontSize: 10, fontFamily: 'Ubuntu_500Medium' }}
                      xAxisLabelTextStyle={{ color: THEME.textSub, fontSize: 9, fontFamily: 'Ubuntu_500Medium' }}
                      startFillColor={getChartColor()}
                      endFillColor={THEME.card}
                      startOpacity={0.35}
                      endOpacity={0.01}
                      rulesColor="#f1f5f9"
                      rulesType="solid"
                      yAxisColor="#f1f5f9"
                      xAxisColor="#f1f5f9"
                      dataPointsColor={getChartColor()}
                      dataPointsRadius={3}
                      focusEnabled
                      showTextOnFocus
                      delayBeforeUnFocus={2000}
                    />
                  </View>
                </>
              )}
            </View>

            {/* ── Dernières mesures — cards style nodePremiumItem ── */}
            {chartData.length > 0 && (
              <View style={[styles.listCard, styles.shadow]}>
                <Text style={styles.listTitle}>Dernières mesures</Text>
                {chartData.slice().reverse().slice(0, 8).map((item, i) => {
                  const eventMeta = getEventMeta(item.event?.type);
                  return (
                    <View key={item._id || i} style={styles.measureItem}>
                      {/* Icône événement */}
                      <View style={[styles.measureIconWrap, { backgroundColor: eventMeta.background }]}>
                        <eventMeta.Icon size={14} color={eventMeta.color} />
                      </View>

                      {/* Horodatage */}
                      <View style={styles.measureTime}>
                        <Text style={styles.measureTimeVal}>{formatTimeLabel(item.timestamp)}</Text>
                        <Text style={styles.measureTimeDate}>{formatDateLabel(item.timestamp)}</Text>
                      </View>

                      {/* Valeurs */}
                      <View style={styles.measureVals}>
                        <View style={styles.measureValRow}>
                          <Text style={styles.measureValLabel}>pH</Text>
                          <Text style={styles.measureValNum}>{item.ph?.value?.toFixed?.(1) ?? '—'}</Text>
                        </View>
                        <View style={styles.measureValRow}>
                          <Text style={styles.measureValLabel}>TDS</Text>
                          <Text style={styles.measureValNum}>{item.tds?.value ?? '—'}</Text>
                        </View>
                        <View style={styles.measureValRow}>
                          <Text style={styles.measureValLabel}>T°</Text>
                          <Text style={styles.measureValNum}>{item.temperature?.water?.toFixed?.(1) ?? '—'}°</Text>
                        </View>
                        <View style={styles.measureValRow}>
                          <Text style={styles.measureValLabel}>Turb</Text>
                          <Text style={styles.measureValNum}>{item.turbidity?.score ?? '—'}</Text>
                        </View>
                      </View>

                      {/* Badge événement */}
                      <View style={[styles.measureEventBadge, { backgroundColor: eventMeta.background }]}>
                        <Text style={[styles.measureEventText, { color: eventMeta.color }]} numberOfLines={1}>
                          {eventMeta.label}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── Alertes ── */}
            <View style={[styles.alertCard, styles.shadow]}>
              <View style={styles.alertCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.listTitle}>Alertes & notifications</Text>
                  <Text style={styles.alertCardSubtitle}>
                    Événements critiques et mode de notification sur 24 h.
                  </Text>
                </View>
                <View style={[
                  styles.alertCountBadge,
                  totalAlertsCount > 0 ? styles.alertCountBadgeHot : styles.alertCountBadgeCalm,
                ]}>
                  <Text style={[styles.alertCountText, { color: totalAlertsCount > 0 ? THEME.critical : THEME.success }]}>
                    {totalAlertsCount}
                  </Text>
                </View>
              </View>

              {nodeEvents.length > 0 ? (
                nodeEvents.map((eventItem, index) => {
                  const eventMeta = getEventMeta(eventItem?._id);
                  return (
                    <View key={`${eventItem?._id || 'none'}-${index}`} style={styles.alertRow}>
                      <View style={[styles.alertIconWrap, { backgroundColor: eventMeta.background }]}>
                        <eventMeta.Icon size={15} color={eventMeta.color} />
                      </View>
                      <View style={styles.alertBody}>
                        <Text style={styles.alertTitle}>{eventMeta.label}</Text>
                        <Text style={styles.alertDesc}>{eventMeta.description}</Text>
                      </View>
                      <Text style={[styles.alertCount, { color: eventMeta.color }]}>
                        {eventItem?.count || 0}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <View style={styles.alertEmpty}>
                  <Bell size={22} color="#94a3b8" />
                  <Text style={styles.alertEmptyText}>Aucune alerte recensée sur les 24 dernières heures.</Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },

  shadow: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // ── Header (style materiel.jsx) ──────────────────────────────────────────────
  richHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
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

  // ── Scroll content ───────────────────────────────────────────────────────────
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 120,
  },

  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyText: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 17,
    color: THEME.textMain,
  },
  emptySubText: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 14,
    color: THEME.textSub,
    textAlign: 'center',
  },

  // ── Node selector chips ──────────────────────────────────────────────────────
  chipSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 12,
    color: THEME.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  chipSelected: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 13,
    color: THEME.textMain,
    maxWidth: 120,
  },
  chipTextSelected: {
    color: '#fff',
    fontFamily: 'Ubuntu_700Bold',
  },

  // ── Hero card ────────────────────────────────────────────────────────────────
  heroCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    overflow: 'hidden',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    color: '#e0f2fe',
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 12,
  },
  heroStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  heroStatusText: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 11,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 22,
    fontFamily: 'Ubuntu_700Bold',
  },
  heroSubtitle: {
    color: '#cbd5e1',
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 12,
    marginTop: 3,
    marginBottom: 14,
  },
  heroStatsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    padding: 11,
  },
  heroStatValue: {
    color: '#fff',
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 18,
    marginBottom: 3,
  },
  heroStatLabel: {
    color: '#e2e8f0',
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 11,
  },
  heroStatHint: {
    color: '#cbd5e1',
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 10,
    marginTop: 3,
  },

  // ── Métriques grille 2x3 ─────────────────────────────────────────────────────
  metricsCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 14,
    color: THEME.textMain,
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  metricItem: {
    width: '30%',
    flexGrow: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metricValue: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 16,
    textAlign: 'center',
  },
  metricUnit: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 11,
  },
  metricLabel: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
  },

  // ── Config cards ─────────────────────────────────────────────────────────────
  configRow: {
    gap: 10,
    marginBottom: 14,
  },
  configCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: THEME.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  configIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  configContent: { flex: 1 },
  configTitle: {
    color: THEME.textMain,
    fontSize: 13,
    fontFamily: 'Ubuntu_700Bold',
  },
  configSubtitle: {
    color: THEME.textSub,
    fontSize: 12,
    fontFamily: 'Ubuntu_400Regular',
    marginTop: 2,
  },

  // ── Tabs pills scrollables ───────────────────────────────────────────────────
  tabsScroll: {
    marginBottom: 14,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tabPillText: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 13,
    color: THEME.textSub,
  },

  // ── Graphique ────────────────────────────────────────────────────────────────
  chartCard: {
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 18,
    paddingRight: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingRight: 10,
  },
  chartTitle: {
    color: THEME.textMain,
    fontSize: 15,
    fontFamily: 'Ubuntu_700Bold',
  },
  chartSubtitle: {
    color: THEME.textSub,
    fontSize: 12,
    fontFamily: 'Ubuntu_400Regular',
    marginTop: 3,
  },
  chartPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chartPillText: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 11,
  },
  chartWrapper: {
    alignItems: 'flex-start',
    marginLeft: -8,
  },
  loaderContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyChartText: {
    color: THEME.textSub,
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 14,
  },

  // ── Dernières mesures ────────────────────────────────────────────────────────
  listCard: {
    backgroundColor: THEME.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  listTitle: {
    color: THEME.textMain,
    fontSize: 15,
    fontFamily: 'Ubuntu_700Bold',
    marginBottom: 12,
  },
  measureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.softBorder,
  },
  measureIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  measureTime: {
    width: 52,
  },
  measureTimeVal: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 13,
    color: THEME.textMain,
  },
  measureTimeDate: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 10,
    color: THEME.textSub,
    marginTop: 1,
  },
  measureVals: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  measureValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  measureValLabel: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 10,
    color: THEME.textSub,
  },
  measureValNum: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 12,
    color: THEME.textMain,
  },
  measureEventBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 80,
  },
  measureEventText: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 10,
    textAlign: 'center',
  },

  // ── Alertes ──────────────────────────────────────────────────────────────────
  alertCard: {
    backgroundColor: THEME.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  alertCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  alertCardSubtitle: {
    color: THEME.textSub,
    fontSize: 12,
    fontFamily: 'Ubuntu_400Regular',
    marginTop: 3,
    marginBottom: 8,
  },
  alertCountBadge: {
    minWidth: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  alertCountBadgeHot: { backgroundColor: '#fee2e2' },
  alertCountBadgeCalm: { backgroundColor: '#dcfce7' },
  alertCountText: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 15,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: THEME.softBorder,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBody: { flex: 1 },
  alertTitle: {
    color: THEME.textMain,
    fontSize: 13,
    fontFamily: 'Ubuntu_700Bold',
  },
  alertDesc: {
    color: THEME.textSub,
    fontSize: 11,
    fontFamily: 'Ubuntu_400Regular',
    marginTop: 2,
  },
  alertCount: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 15,
  },
  alertEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
  },
  alertEmptyText: {
    color: THEME.textSub,
    fontSize: 13,
    fontFamily: 'Ubuntu_400Regular',
    flex: 1,
  },
});
