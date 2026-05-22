import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  Dimensions, TouchableOpacity, StatusBar, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { LinearGradient } from 'expo-linear-gradient';
import { Activity, Droplets, ThermometerSun, RefreshCw, AlertTriangle, Waves } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { useMqtt } from '../../context/MqttContext';
import { getUserGateways, getGatewayNodes } from '../../api/pairingClient';
import { getSensorData, getLatestSensorData, computeQualityScore, getScoreColor } from '../../api/telemetryClient';
import TelemetryNodeCard from '../../components/TelemetryNodeCard';
import SkeletonLoader from '../../components/SkeletonLoader';

const { width } = Dimensions.get('window');

const THEME = {
  bg: '#f8fafc',
  card: '#ffffff',
  textMain: '#0f172a',
  textSub: '#64748b',
  ph: '#3b82f6',
  tds: '#10b981',
  temp: '#f59e0b',
  turb: '#8b5cf6',
  border: '#e2e8f0',
};

const TABS = [
  { key: 'ph', label: 'pH', Icon: Activity, color: THEME.ph },
  { key: 'tds', label: 'TDS', Icon: Droplets, color: THEME.tds },
  { key: 'temp', label: 'Temp.', Icon: ThermometerSun, color: THEME.temp },
  { key: 'turb', label: 'Turbidité', Icon: Waves, color: THEME.turb },
];

export default function TelemetryScreen() {
  const { user } = useAuth();
  const { latestData } = useMqtt();

  const [nodes, setNodes] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [latestByNode, setLatestByNode] = useState({});
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('ph');

  // ── Load nodes ──────────────────────────────────────────────────────────────
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
            allNodes.push({ ...n, gatewayName: gw.name, gatewayId: gw._id });
          }
        }
      }

      // Fetch latest data for each node
      for (const n of allNodes) {
        try {
          const res = await getLatestSensorData({ nodeId: n.nodeId });
          if (res.success && res.data) {
            latestMap[n.nodeId] = res.data;
          }
        } catch { /* no data yet */ }
      }

      setNodes(allNodes);
      setLatestByNode(latestMap);

      // Auto-select first node if none selected
      if (!selectedNodeId && allNodes.length > 0) {
        setSelectedNodeId(allNodes[0].nodeId);
      }
    } catch (e) {
      console.error('[Telemetry] loadNodes error:', e);
    }
  }, [selectedNodeId]);

  // ── Load chart data for selected node ───────────────────────────────────────
  const loadChartData = useCallback(async () => {
    if (!selectedNodeId) {
      setChartData([]);
      return;
    }
    try {
      const res = await getSensorData({ nodeId: selectedNodeId, limit: 30 });
      if (res.success && res.data) {
        // Reverse so oldest is first (left to right on chart)
        setChartData(res.data.reverse());
      }
    } catch (e) {
      console.error('[Telemetry] loadChartData error:', e);
      setChartData([]);
    }
  }, [selectedNodeId]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        await loadNodes();
        if (active) setLoading(false);
      })();
      return () => { active = false; };
    }, []),
  );

  // Reload chart when selected node changes
  useEffect(() => {
    if (selectedNodeId) {
      loadChartData();
    }
  }, [selectedNodeId, loadChartData]);

  // Update latest data from MQTT
  useEffect(() => {
    if (latestData && latestData.nodeId) {
      setLatestByNode(prev => ({ ...prev, [latestData.nodeId]: latestData }));
    }
  }, [latestData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNodes();
    await loadChartData();
    setRefreshing(false);
  };

  // ── Chart formatting ────────────────────────────────────────────────────────
  const getFormattedChartData = () => {
    if (!chartData || chartData.length === 0) return [];
    return chartData.map((item, index) => {
      let value = 0;
      if (activeTab === 'ph') value = item.ph?.value || 7;
      if (activeTab === 'tds') value = item.tds?.value || 0;
      if (activeTab === 'temp') value = item.temperature?.water || 20;
      if (activeTab === 'turb') value = item.turbidity?.score || 5;

      const date = new Date(item.timestamp);
      const timeLabel = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

      return {
        value: parseFloat(value.toFixed(1)),
        label: index % 5 === 0 ? timeLabel : '',
      };
    });
  };

  const getChartColor = () => TABS.find(t => t.key === activeTab)?.color || THEME.ph;

  const getMetricTitle = () => {
    switch (activeTab) {
      case 'ph': return 'Potentiel Hydrogène (pH)';
      case 'tds': return 'Solides Dissous (TDS ppm)';
      case 'temp': return 'Température de l\'eau (°C)';
      case 'turb': return 'Score Turbidité (/10)';
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Supervision</Text>
          <Text style={styles.headerTitle}>Télémétrie</Text>
          <Text style={styles.headerSubtitle}>
            {nodes.length} bouée{nodes.length !== 1 ? 's' : ''} • Données en temps réel
          </Text>
        </View>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          {refreshing
            ? <ActivityIndicator size="small" color={THEME.textMain} />
            : <RefreshCw size={20} color={THEME.textMain} />
          }
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={THEME.ph} />}
      >
        {/* Node cards */}
        {loading && nodes.length === 0 ? (
          <View style={styles.nodeList}>
            <SkeletonLoader width="100%" height={110} borderRadius={20} style={{ marginBottom: 12 }} />
            <SkeletonLoader width="100%" height={110} borderRadius={20} style={{ marginBottom: 12 }} />
          </View>
        ) : nodes.length === 0 ? (
          <View style={styles.emptyState}>
            <AlertTriangle size={40} color="#cbd5e1" />
            <Text style={styles.emptyText}>Aucune bouée trouvée.</Text>
            <Text style={styles.emptySubText}>Associez une bouée depuis l'onglet Matériel.</Text>
          </View>
        ) : (
          <View style={styles.nodeList}>
            <Text style={styles.sectionLabel}>Sélectionner une bouée</Text>
            {nodes.map((node) => {
              const latest = latestByNode[node.nodeId];
              const score = computeQualityScore(latest);
              return (
                <TelemetryNodeCard
                  key={node.nodeId}
                  node={node}
                  latestData={latest}
                  score={score}
                  selected={selectedNodeId === node.nodeId}
                  onPress={() => setSelectedNodeId(node.nodeId)}
                />
              );
            })}
          </View>
        )}

        {/* Metric tabs */}
        {selectedNodeId && (
          <>
            <View style={styles.tabs}>
              {TABS.map(({ key, label, Icon, color }) => {
                const isActive = activeTab === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.tab, isActive && { backgroundColor: color }]}
                    onPress={() => setActiveTab(key)}
                  >
                    <Icon size={16} color={isActive ? '#fff' : THEME.textSub} />
                    <Text style={[styles.tabText, isActive && { color: '#fff' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Chart */}
            <View style={[styles.chartCard, styles.shadow]}>
              {chartData.length === 0 ? (
                <View style={styles.loaderContainer}>
                  <AlertTriangle size={28} color={THEME.textSub} style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyChartText}>Aucune donnée pour cette bouée.</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.chartTitle}>{getMetricTitle()}</Text>
                  <View style={styles.chartWrapper}>
                    <LineChart
                      data={formattedData}
                      width={width - 90}
                      height={200}
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

            {/* Recent readings list */}
            {chartData.length > 0 && (
              <View style={[styles.listCard, styles.shadow]}>
                <Text style={styles.listTitle}>Dernières mesures</Text>
                {chartData.slice().reverse().slice(0, 8).map((item, i) => (
                  <View key={item._id || i} style={styles.listItem}>
                    <View style={styles.listLeft}>
                      <Text style={styles.listTime}>
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <Text style={styles.listDate}>
                        {new Date(item.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </Text>
                    </View>
                    <View style={styles.listRight}>
                      <Text style={styles.listVal}>
                        pH <Text style={styles.listValBold}>{item.ph?.value?.toFixed(1)}</Text>
                      </Text>
                      <Text style={styles.listVal}>
                        TDS <Text style={styles.listValBold}>{item.tds?.value} ppm</Text>
                      </Text>
                      <Text style={styles.listVal}>
                        {item.temperature?.water?.toFixed(1)}°C
                      </Text>
                    </View>
                    {item.event?.type !== 'None' && (
                      <View style={styles.eventBadge}>
                        <AlertTriangle size={12} color="#ef4444" />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
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
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 16,
  },
  kicker: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 12,
    color: THEME.ph,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  headerTitle: {
    color: THEME.textMain,
    fontSize: 26,
    fontFamily: 'Ubuntu_700Bold',
  },
  headerSubtitle: {
    color: THEME.textSub,
    fontSize: 13,
    fontFamily: 'Ubuntu_400Regular',
    marginTop: 3,
  },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  // Node list
  nodeList: { marginBottom: 20 },
  sectionLabel: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 14,
    color: THEME.textSub,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 12,
  },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontFamily: 'Ubuntu_700Bold', fontSize: 17, color: THEME.textMain },
  emptySubText: { fontFamily: 'Ubuntu_400Regular', fontSize: 14, color: THEME.textSub, textAlign: 'center' },
  // Tabs
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: THEME.border,
  },
  tabText: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 12,
    color: THEME.textSub,
  },
  // Chart
  chartCard: {
    backgroundColor: THEME.card,
    borderRadius: 22,
    padding: 20,
    paddingRight: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  chartTitle: {
    color: THEME.textMain,
    fontSize: 15,
    fontFamily: 'Ubuntu_700Bold',
    marginBottom: 18,
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
  // List
  listCard: {
    backgroundColor: THEME.card,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: THEME.border,
  },
  listTitle: {
    color: THEME.textMain,
    fontSize: 16,
    fontFamily: 'Ubuntu_700Bold',
    marginBottom: 14,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  listLeft: { width: 70 },
  listTime: { color: THEME.textMain, fontSize: 14, fontFamily: 'Ubuntu_700Bold' },
  listDate: { color: THEME.textSub, fontSize: 11, fontFamily: 'Ubuntu_400Regular', marginTop: 2 },
  listRight: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  listVal: { color: THEME.textSub, fontSize: 12, fontFamily: 'Ubuntu_500Medium' },
  listValBold: { color: THEME.textMain, fontFamily: 'Ubuntu_700Bold' },
  eventBadge: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#fee2e2',
    alignItems: 'center', justifyContent: 'center',
  },
});
