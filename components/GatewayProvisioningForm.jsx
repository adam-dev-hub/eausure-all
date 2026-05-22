import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw, Sparkles, Lock, Eye, EyeOff, Shield, Wifi, Tag, Router, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function GatewayProvisioningForm({
  discoveredGateways,
  setSelectedGateway,
  selectedGateway,
  gatewayName,
  setGatewayName,
  wifiSsid,
  setWifiSsid,
  wifiPassword,
  setWifiPassword,
  showPassword,
  setShowPassword,
  isProvisioning,
  canSubmit,
  handleProvision,
  handleScanWifi,
  isWifiScanning,
  wifiNetworks,
  recentSsids,
  getSignalColor,
  onStepChange,
}) {
  const [step, setStep] = useState(0);

  if (discoveredGateways.length === 0) return null;

  const nextStep = () => {
    if (step < 2) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const newStep = step + 1;
      setStep(newStep);
      onStepChange?.(newStep);
    }
  };

  const prevStep = () => {
    if (step > 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const newStep = step - 1;
      setStep(newStep);
      onStepChange?.(newStep);
    }
  };

  return (
    <View style={styles.wizardCard}>
      {/* ProgressBar / Steps Indicator */}
      <View style={styles.stepIndicatorContainer}>
        {[0, 1, 2].map((i) => (
          <React.Fragment key={i}>
            <View style={[
              styles.stepCircle, 
              step === i && styles.stepCircleActive, 
              step > i && styles.stepCircleCompleted
            ]}>
              {step > i ? (
                <CheckCircle2 size={14} color="#ffffff" />
              ) : (
                <Text style={[
                  styles.stepNumber, 
                  (step === i) && styles.stepNumberActive
                ]}>
                  {i + 1}
                </Text>
              )}
            </View>
            {i < 2 && (
              <View style={[styles.stepLine, step > i && styles.stepLineCompleted]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <View style={{ padding: 20 }}>
        {step === 0 && (
          <View>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>1. Choisir la passerelle</Text>
              {selectedGateway && <Text style={styles.badgeText}>1 sélectionnée</Text>}
            </View>
            
            <View style={styles.slideContent}>
              {discoveredGateways.map((item) => {
                const selected = selectedGateway?.id === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setSelectedGateway(item)}
                    style={[styles.gatewayRow, selected && styles.gatewayRowSelected]}
                  >
                    <View style={styles.gatewayIconWrap}>
                      <Router size={18} color={selected ? '#0b7fd3' : '#64748b'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.gatewayId}>{item.gatewayHardwareId}</Text>
                      <Text style={styles.gatewayMeta}>{item.gatewayName || item.localName || 'Nom indisponible'}</Text>
                    </View>
                    {selected ? <CheckCircle2 size={18} color="#0b7fd3" /> : null}
                    <View style={styles.signalBadgeInline}>
                      <View style={styles.signalBars}>
                        {[1, 2, 3].map((level) => (
                          <View
                            key={level}
                            style={[
                              styles.signalBar,
                              item.rssi >= [-80, -70, -60][level - 1] && { backgroundColor: getSignalColor(item.rssi) },
                              { height: 5 + level * 3 },
                            ]}
                          />
                        ))}
                      </View>
                      <Text style={styles.signalText}>{item.rssi} dBm</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.slideFooter}>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={nextStep}
                disabled={!selectedGateway}
                style={[styles.navButton, !selectedGateway && styles.navButtonDisabled]}
              >
                <Text style={styles.navButtonText}>Réseau</Text>
                <ChevronRight size={18} color={selectedGateway ? '#fff' : '#94a3b8'} />
              </Pressable>
            </View>
          </View>
        )}

        {step === 1 && (
          <View>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>2. Choisir le réseau</Text>
            </View>
            
            <View style={styles.slideContent}>
              <View style={styles.inlineLabelRow}>
                <Text style={styles.inputLabel}>Réseau Wi-Fi (SSID)</Text>
                <Pressable
                  onPress={handleScanWifi}
                  disabled={isWifiScanning || isProvisioning}
                  style={({ pressed }) => [
                    styles.scanWifiChip,
                    (isWifiScanning || isProvisioning) && styles.scanWifiChipDisabled,
                    pressed && styles.quickChipPressed,
                  ]}
                >
                  {isWifiScanning ? <ActivityIndicator size="small" color="#0b7fd3" /> : <RefreshCw size={14} color="#0b7fd3" />}
                  <Text style={styles.scanWifiChipText}>{isWifiScanning ? 'Scan...' : 'Scanner'}</Text>
                </Pressable>
              </View>

              <View style={styles.inputWrapper}>
                <View style={styles.iconContainer}>
                  <Wifi size={18} color="#64748b" />
                </View>
                <TextInput
                  style={styles.inputFilled}
                  value={wifiSsid}
                  onChangeText={setWifiSsid}
                  placeholder="Nom du réseau"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  editable={!isProvisioning}
                />
              </View>

              {wifiNetworks.length > 0 && (
                <View style={styles.networkList}>
                  {wifiNetworks.slice(0, 3).map((network) => {
                    const selected = wifiSsid === network.ssid;
                    return (
                      <Pressable
                        key={`${network.ssid}-${network.rssi}`}
                        onPress={() => setWifiSsid(network.ssid)}
                        style={({ pressed }) => [
                          styles.networkRow,
                          selected && styles.networkRowSelected,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                          <Text style={[styles.networkName, selected && styles.networkNameSelected]}>{network.ssid}</Text>
                        </View>
                        <View style={styles.signalBadgeInline}>
                          <View style={styles.signalBars}>
                            {[1, 2, 3].map((level) => (
                              <View
                                key={level}
                                style={[
                                  styles.signalBar,
                                  network.rssi >= [-80, -70, -60][level - 1] && { backgroundColor: getSignalColor(network.rssi) },
                                  { height: 5 + level * 3 },
                                ]}
                              />
                            ))}
                          </View>
                          <Text style={styles.signalText}>{network.rssi} dBm</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {recentSsids.length > 0 && (
                <View style={styles.chipWrap}>
                  {recentSsids.map((ssid) => {
                    const isActive = wifiSsid === ssid;
                    return (
                      <Pressable
                        key={ssid}
                        onPress={() => setWifiSsid(ssid)}
                        style={({ pressed }) => [
                          styles.quickChip,
                          isActive && styles.quickChipActive,
                          pressed && styles.quickChipPressed
                        ]}
                      >
                        <Sparkles size={14} color={isActive ? "#fff" : "#0ea5e9"} />
                        <Text style={[styles.quickChipText, isActive && styles.quickChipTextActive]}>{ssid}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.slideFooter}>
              <Pressable onPress={prevStep} style={styles.navButtonSecondary}>
                <ChevronLeft size={18} color="#64748b" />
                <Text style={styles.navButtonSecondaryText}>Passerelle</Text>
              </Pressable>
              <Pressable
                onPress={nextStep}
                disabled={!wifiSsid.trim()}
                style={[styles.navButton, !wifiSsid.trim() && styles.navButtonDisabled]}
              >
                <Text style={styles.navButtonText}>Sécurité</Text>
                <ChevronRight size={18} color={wifiSsid.trim() ? '#fff' : '#94a3b8'} />
              </Pressable>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>3. Configuration</Text>
            </View>
            
            <View style={styles.slideContent}>
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Nom de la passerelle</Text>
                <View style={styles.inputWrapper}>
                  <View style={styles.iconContainer}>
                    <Tag size={18} color="#64748b" />
                  </View>
                  <TextInput
                    style={styles.inputFilled}
                    value={gatewayName}
                    onChangeText={setGatewayName}
                    placeholder="Ex: Passerelle Principale"
                    placeholderTextColor="#94a3b8"
                    editable={!isProvisioning}
                  />
                </View>
              </View>

              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Mot de passe Wi-Fi</Text>
                <View style={styles.inputWrapper}>
                  <View style={styles.iconContainer}>
                    <Lock size={18} color="#64748b" />
                  </View>
                  <TextInput
                    style={styles.inputFilled}
                    value={wifiPassword}
                    onChangeText={setWifiPassword}
                    placeholder="••••••••••••"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    editable={!isProvisioning}
                  />
                  <Pressable onPress={() => setShowPassword((prev) => !prev)} hitSlop={15} style={styles.iconContainerRight}>
                    {showPassword ? <EyeOff size={18} color="#64748b" /> : <Eye size={18} color="#64748b" />}
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.slideFooter}>
              <Pressable onPress={prevStep} style={styles.navButtonSecondary}>
                <ChevronLeft size={18} color="#64748b" />
                <Text style={styles.navButtonSecondaryText}>Réseau</Text>
              </Pressable>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Pressable
                  onPress={handleProvision}
                  disabled={!canSubmit}
                  style={({ pressed }) => [
                    styles.provisionButton,
                    !canSubmit && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <LinearGradient
                    colors={canSubmit ? ['#0ea5e9', '#4f46e5'] : ['#f1f5f9', '#e2e8f0']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryButtonGradient}
                  >
                    {isProvisioning ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Shield size={20} color={canSubmit ? "#fff" : "#94a3b8"} />
                    )}
                    <Text style={[styles.primaryButtonText, !canSubmit && styles.primaryButtonTextDisabled]}>
                      {isProvisioning ? 'Envoi...' : 'Connecter'}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wizardCard: {
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
    overflow: 'hidden',
  },
  stepIndicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 4,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  stepCircleActive: {
    backgroundColor: '#eff6ff',
    borderColor: '#0ea5e9',
    borderWidth: 2,
  },
  stepCircleCompleted: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0ea5e9',
  },
  stepNumber: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: 'Ubuntu_700Bold',
  },
  stepNumberActive: {
    color: '#0ea5e9',
  },
  stepLine: {
    width: 30,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 4,
  },
  stepLineCompleted: {
    backgroundColor: '#0ea5e9',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    color: '#0f172a',
    fontFamily: 'Ubuntu_700Bold',
  },
  badgeText: {
    fontSize: 12,
    color: '#0ea5e9',
    fontFamily: 'Ubuntu_700Bold',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  slideContent: {
  },
  slideFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: '#f1f5f9',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 6,
  },
  navButtonDisabled: {
    backgroundColor: '#f1f5f9',
  },
  navButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Ubuntu_500Medium',
  },
  navButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    gap: 6,
  },
  navButtonSecondaryText: {
    color: '#64748b',
    fontSize: 14,
    fontFamily: 'Ubuntu_500Medium',
  },
  gatewayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  gatewayRowSelected: {
    borderColor: '#0ea5e9',
    backgroundColor: '#f0f9ff',
  },
  gatewayIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayId: {
    fontSize: 15,
    color: '#0f172a',
    fontFamily: 'Ubuntu_700Bold',
  },
  gatewayMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
    fontFamily: 'Ubuntu_400Regular',
  },
  signalBadgeInline: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signalText: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: 'Ubuntu_500Medium',
  },
  signalBars: {
    height: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  signalBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  inputBlock: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#0f172a',
    fontFamily: 'Ubuntu_500Medium',
    marginBottom: 8,
    marginLeft: 4,
  },
  inlineLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 56,
  },
  iconContainer: {
    paddingLeft: 16,
    paddingRight: 12,
  },
  iconContainerRight: {
    paddingRight: 16,
    paddingLeft: 12,
  },
  inputFilled: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: '#0f172a',
    fontFamily: 'Ubuntu_500Medium',
  },
  scanWifiChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  scanWifiChipDisabled: {
    opacity: 0.6,
  },
  scanWifiChipText: {
    fontSize: 13,
    color: '#0284c7',
    fontFamily: 'Ubuntu_500Medium',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  quickChipActive: {
    backgroundColor: '#0ea5e9',
  },
  quickChipPressed: {
    opacity: 0.8,
  },
  quickChipText: {
    fontSize: 13,
    color: '#0284c7',
    fontFamily: 'Ubuntu_500Medium',
  },
  quickChipTextActive: {
    color: '#ffffff',
  },
  networkList: {
    marginTop: 12,
    gap: 8,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    borderRadius: 16,
  },
  networkRowSelected: {
    borderColor: '#0ea5e9',
    backgroundColor: '#f0f9ff',
  },
  networkName: {
    fontSize: 15,
    color: '#334155',
    fontFamily: 'Ubuntu_500Medium',
  },
  networkNameSelected: {
    color: '#0ea5e9',
    fontFamily: 'Ubuntu_700Bold',
  },
  provisionButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  buttonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  primaryButtonGradient: {
    paddingHorizontal: 16,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 15,
    color: '#ffffff',
    fontFamily: 'Ubuntu_700Bold',
  },
  primaryButtonTextDisabled: {
    color: '#94a3b8',
  },
});
