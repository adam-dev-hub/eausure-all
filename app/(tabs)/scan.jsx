import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  Radio,
  Shield,
  ScanLine,
  Lock,
  CheckCircle2,
  Router,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from 'lucide-react-native';

import BleProvisioningHero from '../../components/BleProvisioningHero';
import GatewayProvisioningForm from '../../components/GatewayProvisioningForm';
import NodePairingModal from '../../components/NodePairingModal';
import {
  startGatewayScan,
  provisionGatewayOverBle,
} from '../../api/provisioningService';
import { isWifiScanModuleAvailable, scanNearbyWifiNetworks } from '../../api/wifiScanner';
import { getUserGateways, updateGatewayLocation } from '../../api/pairingClient';

const RECENT_SSIDS_KEY = 'gateway_recent_ssids_v1';

async function loadRecentSsids() {
  const raw = await AsyncStorage.getItem(RECENT_SSIDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item.trim()) : [];
  } catch {
    return [];
  }
}

async function saveRecentSsid(ssid) {
  const clean = ssid.trim();
  if (!clean) return;

  const existing = await loadRecentSsids();
  const next = [clean, ...existing.filter((item) => item !== clean)].slice(0, 5);
  await AsyncStorage.setItem(RECENT_SSIDS_KEY, JSON.stringify(next));
}

function getSignalColor(rssi) {
  if (rssi >= -60) return '#22c55e'; // Green
  if (rssi >= -70) return '#f59e0b'; // Amber/Yellow
  return '#ef4444'; // Red
}

export default function GatewayProvisioningScreen() {
  const scanStopRef = useRef(null);
  const scanEndTimerRef = useRef(null);
  const scanProgress = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef(null);
  const provisioningLockRef = useRef(false);
  const wizardLayoutY = useRef(0);

  const [isSeeking, setIsSeeking] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [discoveredGateways, setDiscoveredGateways] = useState([]);
  const [selectedGateway, setSelectedGateway] = useState(null);
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [gatewayName, setGatewayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recentSsids, setRecentSsids] = useState([]);
  const [isWifiScanning, setIsWifiScanning] = useState(false);
  const [wifiNetworks, setWifiNetworks] = useState([]);
  const [hasScannedOnce, setHasScannedOnce] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [pairingModalVisible, setPairingModalVisible] = useState(false);
  const [wifiScanAvailable] = useState(isWifiScanModuleAvailable());

  const canSubmit = !!selectedGateway && !!wifiSsid.trim() && !!wifiPassword.trim() && !isProvisioning;
  const helperStatus = useMemo(() => {
    if (isProvisioning) return 'Transmission chiffrée vers la passerelle...';
    if (isSeeking) return 'Recherche BLE active pendant 12 secondes.';
    if (selectedGateway) return `Passerelle prête : ${selectedGateway.gatewayHardwareId}`;
    if (discoveredGateways.length > 0) return 'Sélectionnez une passerelle pour continuer.';
    return 'Lancez un scan pour détecter les passerelles GW-* à proximité.';
  }, [discoveredGateways.length, isProvisioning, isSeeking, selectedGateway]);

  useEffect(() => {
    loadRecentSsids().then(setRecentSsids).catch(() => {});
    return () => {
      if (scanEndTimerRef.current) clearTimeout(scanEndTimerRef.current);
      if (scanStopRef.current) scanStopRef.current();
    };
  }, []);

  // Reset the full screen state when user leaves this tab
  useFocusEffect(
    useCallback(() => {
      // onBlur cleanup
      return () => {
        if (scanStopRef.current) {
          scanStopRef.current();
          scanStopRef.current = null;
        }
        if (scanEndTimerRef.current) {
          clearTimeout(scanEndTimerRef.current);
          scanEndTimerRef.current = null;
        }
        scanProgress.stopAnimation();
        scanProgress.setValue(0);
        provisioningLockRef.current = false;

        setIsSeeking(false);
        setIsProvisioning(false);
        setDiscoveredGateways([]);
        setSelectedGateway(null);
        setWifiSsid('');
        setWifiPassword('');
        setGatewayName('');
        setShowPassword(false);
        setWifiNetworks([]);
        setIsWifiScanning(false);
        setHasScannedOnce(false);
        setError('');
        setSuccess(null);
        setPairingModalVisible(false);
      };
    }, [])
  );

  const animateLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const upsertGateway = (gateway) => {
    setDiscoveredGateways((prev) => {
      if (prev.length === 0) animateLayout(); // animate form appearance
      const next = [...prev];
      const idx = next.findIndex((item) => item.id === gateway.id);
      if (idx >= 0) next[idx] = gateway;
      else next.push(gateway);
      next.sort((a, b) => b.rssi - a.rssi);
      return next;
    });

    setSelectedGateway((prev) => {
      if (!prev) {
        // First gateway found — stop the scan, no need to keep scanning
        if (scanStopRef.current) scanStopRef.current();
        if (scanEndTimerRef.current) clearTimeout(scanEndTimerRef.current);
        scanProgress.stopAnimation();
        scanProgress.setValue(0);
        animateLayout();
        setIsSeeking(false);
      }
      return prev || gateway;
    });
    setGatewayName((prev) => prev || gateway.gatewayName || `Passerelle ${gateway.gatewayHardwareId.slice(-4)}`);
  };

  const handleStartScan = async () => {
    setError('');
    setSuccess(null);
    setDiscoveredGateways([]);
    setSelectedGateway(null);

    if (scanStopRef.current) scanStopRef.current();
    if (scanEndTimerRef.current) clearTimeout(scanEndTimerRef.current);

    animateLayout(); // animate text/button changes
    setIsSeeking(true);
    setHasScannedOnce(true);
    scanProgress.setValue(0);
    Animated.timing(scanProgress, {
      toValue: 100,
      duration: 12000,
      useNativeDriver: false,
    }).start();
    try {
      scanStopRef.current = await startGatewayScan({
        onGateway: upsertGateway,
        onError: (message) => {
          animateLayout();
          setError(message);
          setIsSeeking(false);
        },
        scanDurationMs: 12000,
      });

      scanEndTimerRef.current = setTimeout(() => {
        animateLayout();
        setIsSeeking(false);
        scanProgress.stopAnimation();
        scanProgress.setValue(0);
      }, 12400);
    } catch (e) {
      animateLayout();
      setError(e.message || 'Impossible de lancer le scan BLE.');
      setIsSeeking(false);
    }
  };

  const handleStopScan = () => {
    if (scanStopRef.current) scanStopRef.current();
    if (scanEndTimerRef.current) clearTimeout(scanEndTimerRef.current);
    scanProgress.stopAnimation();
    scanProgress.setValue(0);
    animateLayout();
    setIsSeeking(false);
  };

  const handleProvision = async () => {
    if (provisioningLockRef.current) {
      return;
    }

    provisioningLockRef.current = true;
    setError('');
    setSuccess(null);

    if (!selectedGateway) {
      animateLayout();
      setError('Aucune passerelle sélectionnée.');
      provisioningLockRef.current = false;
      return;
    }

    if (!wifiSsid.trim() || !wifiPassword.trim()) {
      animateLayout();
      setError('SSID et mot de passe WiFi sont obligatoires.');
      provisioningLockRef.current = false;
      return;
    }

    setIsProvisioning(true);
    try {
      const ack = await provisionGatewayOverBle({
        deviceId: selectedGateway.id,
        gatewayHardwareId: selectedGateway.gatewayHardwareId,
        ssid: wifiSsid,
        password: wifiPassword,
        gatewayName,
      });

      await saveRecentSsid(wifiSsid);
      setRecentSsids(await loadRecentSsids());

      // Capture phone GPS and push location to backend (best-effort, non-blocking)
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
          });
          if (pos?.coords && selectedGateway?.gatewayHardwareId) {
            // Reverse geocode to get city/country names
            let city = '';
            let country = '';
            try {
              const [place] = await Location.reverseGeocodeAsync({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
              if (place) {
                city = place.city || place.subregion || place.region || '';
                country = place.isoCountryCode || place.country || '';
              }
            } catch {
              // reverse geocode is best-effort
            }

            const gwsRes = await getUserGateways();
            if (gwsRes?.success && Array.isArray(gwsRes.data)) {
              const match = gwsRes.data.find(
                (gw) => gw.gatewayId === selectedGateway.gatewayHardwareId
              );
              if (match?._id) {
                await updateGatewayLocation(match._id, {
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  city,
                  country,
                });
                console.log('[Provisioning][GPS] Location pushed to backend', {
                  gatewayId: match.gatewayId,
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  city,
                  country,
                });
              }
            }
          }
        }
      } catch (gpsErr) {
        // GPS is best-effort — provisioning already succeeded, don't fail the flow
        console.log('[Provisioning][GPS][WARN]', gpsErr?.message || 'GPS unavailable');
      }

      animateLayout();
      setSuccess({ ack });
    } catch (e) {
      animateLayout();
      setError(e.message || 'Provisioning BLE échoué.');
    } finally {
      provisioningLockRef.current = false;
      setIsProvisioning(false);
    }
  };

  const handleScanWifi = async () => {
    if (!wifiScanAvailable) {
      animateLayout();
      setError("Le scan Wi‑Fi natif n'est pas disponible dans cette build Android. Saisissez le nom du réseau manuellement.");
      return;
    }

    setError('');
    setIsWifiScanning(true);
    try {
      const networks = await scanNearbyWifiNetworks();
      setWifiNetworks(networks);
      if (networks.length === 0) {
        animateLayout();
        setError('Aucun réseau Wi‑Fi visible. Vérifiez que le Wi‑Fi du téléphone est actif et que la localisation Android est autorisée.');
      }
    } catch (e) {
      animateLayout();
      setError(e.message || 'Impossible de scanner les réseaux Wi‑Fi.');
    } finally {
      setIsWifiScanning(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 16 : 0}
      >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
            <Text style={styles.headerEyebrow}>Scanner</Text>
            <Text style={styles.title}>Provisioning passerelle</Text>
            <Text style={styles.subtitle}>
              Scannez une passerelle, choisissez le Wi-Fi, puis envoyez la configuration de façon sécurisée.
            </Text>
          </View>
        </LinearGradient>

        <LinearGradient
          colors={['#ffffff', '#f8fbff']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <BleProvisioningHero
            active={isSeeking}
            targetCount={discoveredGateways.length}
            selectedGateway={selectedGateway}
            helperStatus={helperStatus}
            isProvisioning={isProvisioning}
            provisioned={!!success}
          />

          <Pressable
            disabled={isProvisioning}
            style={({ pressed }) => [styles.primaryButton, styles.heroAction, pressed && styles.buttonPressed]}
            onPress={isSeeking ? handleStopScan : handleStartScan}
          >
            {({ pressed }) => (
              <View style={styles.primaryButtonContainer}>
                <LinearGradient
                  colors={pressed ? ['#0284c7', '#1d4ed8'] : ['#0ea5e9', '#2563eb']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                
                {isSeeking && (
                  <Animated.View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        width: scanProgress.interpolate({
                          inputRange: [0, 100],
                          outputRange: ['0%', '100%'],
                        }),
                        backgroundColor: 'rgba(255, 255, 255, 0.22)',
                      },
                    ]}
                  />
                )}
                
                <View style={styles.primaryButtonContent}>
                  <Radio size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>
                    {isSeeking ? 'Arrêter le scan BLE' : hasScannedOnce ? 'Relancer le scan BLE' : 'Lancer le scan BLE'}
                  </Text>
                </View>
              </View>
            )}
          </Pressable>
        </LinearGradient>

        {!success ? (
          <View onLayout={(e) => { wizardLayoutY.current = e.nativeEvent.layout.y; }}>
            <GatewayProvisioningForm
              discoveredGateways={discoveredGateways}
              setSelectedGateway={setSelectedGateway}
              selectedGateway={selectedGateway}
              gatewayName={gatewayName}
              setGatewayName={setGatewayName}
              wifiSsid={wifiSsid}
              setWifiSsid={setWifiSsid}
              wifiPassword={wifiPassword}
              setWifiPassword={setWifiPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              isProvisioning={isProvisioning}
              canSubmit={canSubmit}
              handleProvision={handleProvision}
              handleScanWifi={handleScanWifi}
              wifiScanAvailable={wifiScanAvailable}
              isWifiScanning={isWifiScanning}
              wifiNetworks={wifiNetworks}
              recentSsids={recentSsids}
              getSignalColor={getSignalColor}
              onStepChange={() => {
                if (scrollViewRef.current) {
                  setTimeout(() => {
                    scrollViewRef.current.scrollToEnd({ animated: true });
                  }, 50);
                }
              }}
            />
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <AlertCircle size={24} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {success ? (
          <View style={styles.successBox}>
            <View style={styles.successHeader}>
              <CheckCircle2 size={24} color="#10b981" />
              <Text style={styles.successTitle}>Provisioning BLE terminé</Text>
            </View>
            <Text style={styles.successText}>
              La passerelle a reçu les credentials WiFi + token. Elle va redémarrer puis effectuer son provisioning cloud.
            </Text>

            <Pressable style={styles.nextButton} onPress={() => setPairingModalVisible(true)}>
              <ScanLine size={18} color="#0ea5e9" />
              <Text style={styles.nextButtonText}>Associer une bouée</Text>
            </Pressable>

            <Pressable 
              style={[styles.nextButton, { backgroundColor: '#f1f5f9', marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0' }]} 
              onPress={() => {
                animateLayout();
                setSuccess(null);
                setError('');
                setSelectedGateway(null);
                setDiscoveredGateways([]);
                setGatewayName('');
                setWifiSsid('');
                setWifiPassword('');
                setHasScannedOnce(false);
                setIsSeeking(false);
              }}
            >
              <RefreshCw size={18} color="#475569" />
              <Text style={[styles.nextButtonText, { color: '#475569' }]}>Nouvelle passerelle</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
      <NodePairingModal
        visible={pairingModalVisible}
        onClose={() => setPairingModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  keyboardWrap: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 110 },
  headerCard: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginTop: 10,
    marginBottom: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerEyebrow: {
    fontSize: 12,
    color: '#0b7fd3',
    fontFamily: 'Ubuntu_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    lineHeight: 29,
    fontFamily: 'Ubuntu_700Bold',
    color: '#0f172a',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748b',
    fontFamily: 'Ubuntu_400Regular',
  },
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
  heroAction: {
    marginTop: 22,
  },
  primaryButton: {
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 7,
  },
  provisionButton: {
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  primaryButtonGradient: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  primaryButtonContainer: {
    minHeight: 56,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
  },
  primaryButtonContent: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 18,
    zIndex: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Ubuntu_700Bold',
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.94,
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  errorBox: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Ubuntu_500Medium',
  },
  successBox: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 18,
    color: '#065f46',
    fontFamily: 'Ubuntu_700Bold',
  },
  successText: {
    fontSize: 14,
    color: '#065f46',
    lineHeight: 20,
    fontFamily: 'Ubuntu_500Medium',
  },
  nextButton: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#7dd3fc',
    backgroundColor: '#fff',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextButtonText: {
    color: '#0369a1',
    fontSize: 14,
    fontFamily: 'Ubuntu_700Bold',
  },
});
