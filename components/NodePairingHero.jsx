import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import LottieView from 'lottie-react-native';
import { CheckCircle2, Waves, Router, XCircle } from 'lucide-react-native';

const bleAnimation       = require('../assets/lottie/ble-connection.json');
const noConnectionAnimation = require('../assets/lottie/no_connection.json');
const connectedAnimation = require('../assets/lottie/Connected.json');

function FadeSlide({ children, style }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(6);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  }, [children]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// Lottie that plays once, then replays every `intervalMs`
function PulseLottie({ source, style, intervalMs = 4000 }) {
  const ref = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const schedule = () => {
      timerRef.current = setTimeout(() => {
        ref.current?.play();
        schedule();
      }, intervalMs);
    };
    // play immediately on mount, then schedule repeats
    ref.current?.play();
    schedule();
    return () => clearTimeout(timerRef.current);
  }, [intervalMs]);

  return (
    <LottieView
      ref={ref}
      source={source}
      autoPlay={false}
      loop={false}
      style={style}
    />
  );
}

/**
 * NodePairingHero
 *
 * Props:
 *  step        — 'select' | 'scanning' | 'found' | 'pairing' | 'success' | 'error'
 *  gateway     — { name, gatewayId } | null
 *  candidate   — { nodeId, nodeName } | null
 *  errorMsg    — string
 */
export default function NodePairingHero({ step, gateway, candidate, errorMsg }) {
  const isActive = step === 'scanning' || step === 'pairing';
  const isDone   = step === 'success';
  const isError  = step === 'error';

  const stateLabel =
    step === 'scanning' ? 'Recherche'
    : step === 'pairing'  ? 'Configuration'
    : step === 'found'    ? 'Détectée'
    : step === 'success'  ? 'Associée'
    : step === 'error'    ? 'Erreur'
    : 'Prêt';

  const titleText =
    step === 'scanning' ? 'Scan en cours...'
    : step === 'pairing'  ? 'Appairage...'
    : step === 'found'    ? 'Bouée détectée'
    : step === 'success'  ? 'Associée avec succès'
    : step === 'error'    ? 'Échec du scan'
    : 'Prêt à scanner';

  const descText =
    step === 'scanning'
      ? `La passerelle ${gateway?.name || gateway?.gatewayId || '—'} écoute les bouées aux alentours.`
    : step === 'pairing'
      ? 'La passerelle configure la bouée sur le réseau Wi-Fi...'
    : step === 'found'
      ? `Bouée ${candidate?.nodeName || candidate?.nodeId || ''} prête à être associée.`
    : step === 'success'
      ? 'Le nœud de mesure est maintenant lié à cette passerelle.'
    : step === 'error'
      ? (errorMsg || 'Aucune bouée détectée. Vérifiez que la bouée est allumée et à portée de la passerelle.')
    : 'Sélectionnez une passerelle puis lancez le scan.';

  // Lottie speed crossfade
  const lottieOpacity = useRef(new Animated.Value(1)).current;
  const prevSpeedRef  = useRef(null);
  const speed = isActive ? 1.15 : 0.72;

  useEffect(() => {
    if (prevSpeedRef.current !== null && prevSpeedRef.current !== speed) {
      Animated.sequence([
        Animated.timing(lottieOpacity, { toValue: 0.3, duration: 150, useNativeDriver: true }),
        Animated.timing(lottieOpacity, { toValue: 1,   duration: 200, useNativeDriver: true }),
      ]).start();
    }
    prevSpeedRef.current = speed;
  }, [speed]);

  return (
    <View style={styles.shell}>
      {/* Top row — kicker + badge */}
      <View style={styles.topRow}>
        <View style={styles.kickerRow}>
          <View style={[styles.statusDot, isActive && styles.statusDotActive]} />
          <Text style={styles.kicker}>Association MQTT</Text>
        </View>
        <View style={[
          styles.badge,
          isDone  && styles.badgeSuccess,
          isError && styles.badgeError,
        ]}>
          {isActive
            ? <ActivityIndicator size="small" color="#0ea5e9" />
            : isDone
              ? <CheckCircle2 size={14} color="#10b981" />
              : isError
                ? <XCircle size={14} color="#ef4444" />
                : <Waves size={14} color="#0ea5e9" />
          }
          <FadeSlide key={stateLabel}>
            <Text style={[
              styles.badgeText,
              isDone  && { color: '#059669' },
              isError && { color: '#dc2626' },
            ]}>
              {stateLabel}
            </Text>
          </FadeSlide>
        </View>
      </View>

      {/* Content row — copy + animation */}
      <View style={styles.contentRow}>
        <View style={styles.copyBlock}>
          <FadeSlide key={titleText}>
            <Text style={styles.title}>{titleText}</Text>
          </FadeSlide>
          <FadeSlide key={descText}>
            <Text style={[styles.description, isError && { color: '#dc2626' }]}>
              {descText}
            </Text>
          </FadeSlide>

          {/* Meta pills */}
          <View style={styles.metaRow}>
            {gateway && (
              <View style={styles.metaPill}>
                <Router size={13} color="#0ea5e9" />
                <Text style={styles.metaText} numberOfLines={1}>
                  {gateway.name || gateway.gatewayId}
                </Text>
              </View>
            )}
            {step === 'found' && candidate && (
              <FadeSlide key="node-pill">
                <View style={styles.metaPill}>
                  <CheckCircle2 size={13} color="#86efac" />
                  <Text style={styles.metaText}>{candidate.nodeId}</Text>
                </View>
              </FadeSlide>
            )}
          </View>
        </View>

        {/* Animation plate */}
        <View style={styles.animationPlate}>
          <View style={styles.lottieHalo}>
            {isDone ? (
              <FadeSlide key="done-check">
                <PulseLottie
                  source={connectedAnimation}
                  style={styles.lottieConnected}
                  intervalMs={4000}
                />
              </FadeSlide>
            ) : isError ? (
              <FadeSlide key="error-icon">
                <PulseLottie
                  source={noConnectionAnimation}
                  style={styles.lottieSmall}
                  intervalMs={4000}
                />
              </FadeSlide>
            ) : (
              <Animated.View style={{ opacity: lottieOpacity }}>
                <LottieView
                  source={bleAnimation}
                  autoPlay
                  loop
                  style={styles.lottie}
                  speed={speed}
                />
              </Animated.View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { gap: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#94a3b8' },
  statusDotActive: {
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  kicker: {
    color: '#0f172a',
    fontSize: 12,
    fontFamily: 'Ubuntu_700Bold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  badge: {
    height: 30,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  badgeSuccess: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  badgeError:   { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  badgeText: { color: '#0b7fd3', fontSize: 12, fontFamily: 'Ubuntu_700Bold' },

  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copyBlock: { flex: 1, minWidth: 0 },
  title: {
    color: '#0f172a',
    fontSize: 24,
    lineHeight: 29,
    fontFamily: 'Ubuntu_700Bold',
    marginBottom: 9,
  },
  description: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Ubuntu_400Regular',
  },
  metaRow: { marginTop: 16, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaPill: {
    height: 30,
    borderRadius: 999,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 160,
  },
  metaText: { color: '#334155', fontSize: 12, fontFamily: 'Ubuntu_700Bold', flexShrink: 1 },

  animationPlate: { width: 116, height: 116, alignItems: 'center', justifyContent: 'center' },
  lottieHalo: {
    width: 106,
    height: 106,
    borderRadius: 53,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  lottie:          { width: 118, height: 118 },
  lottieSmall:     { width: 118,  height: 118  },
  lottieConnected: { width: 167, height: 167 },
});
