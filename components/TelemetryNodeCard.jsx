import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { Droplets, Activity, Waves, Battery, ThermometerSun, MapPin } from 'lucide-react-native';
import { getScoreColor, getScoreGradient, getScoreLabel } from '../api/telemetryClient';
import MeshGradientBg from './MeshGradientBg';

const buoyImage = require('../assets/branding/buoy-3d.png');

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function TelemetryNodeCard({ node, latestData, score, selected, onPress }) {
  const pulse = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    // Gentle pulse animation on the buoy image
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );

    // Glow ring animation based on score
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const imageAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: pulse.value * -4 },
      { scale: 1 + pulse.value * 0.03 },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => {
    return {
      opacity: 0.7 + glow.value * 0.3,
    };
  });

  const gradient = getScoreGradient(score);
  const scoreColor = getScoreColor(score);
  const label = getScoreLabel(score);
  const isActive = node?.status?.active;
  const battery = latestData?.battery?.percentage ?? node?.status?.lastBattery;
  const ph = latestData?.ph?.value;
  const tds = latestData?.tds?.value;
  const temp = latestData?.temperature?.water;
  const turbScore = latestData?.turbidity?.score;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrapper, pressed && { opacity: 0.92 }]}>
      <Animated.View style={[
        styles.cardOuter,
        selected && styles.cardSelected,
        glowStyle,
        { shadowColor: scoreColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4 },
      ]}>
        <View style={{ flex: 1, overflow: 'hidden', borderRadius: 19, backgroundColor: '#ffffff' }}>
          {selected && <MeshGradientBg width={350} height={200} colors={[scoreColor, '#3b82f6', '#8b5cf6']} />}
          
          <LinearGradient
            colors={selected ? ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.1)'] : ['#ffffff', '#f8fbff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, selected && { backgroundColor: 'transparent' }]}
          >
            {/* Mapbox placeholder top right */}
            <View style={styles.mapSquare}>
              <MapPin size={16} color="#64748b" style={{ opacity: 0.8 }} />
              <Text style={styles.mapText}>Gateway</Text>
            </View>

            {/* Top row: buoy image + info */}
            <View style={styles.topRow}>
              <Animated.View style={[styles.imageWrap, imageAnimStyle]}>
                <Image source={buoyImage} style={styles.buoyImage} resizeMode="contain" />
              </Animated.View>

              <View style={styles.infoCol}>
                <View style={styles.nameRow}>
                  <View style={[styles.activeDot, { backgroundColor: isActive ? '#22c55e' : '#cbd5e1' }]} />
                  <Text style={[styles.nodeName, selected && { color: '#fff' }]} numberOfLines={1}>
                    {node?.name || `Bouée ${(node?.nodeId || '').slice(-4)}`}
                  </Text>
                </View>

                {/* Score badge */}
                <View style={[styles.scoreBadge, { backgroundColor: selected ? 'rgba(255,255,255,0.25)' : `${scoreColor}15` }]}>
                  <Text style={[styles.scoreText, { color: selected ? '#fff' : scoreColor }]}>
                    Score: {score.toFixed(1)}/10 — {label}
                  </Text>
                </View>

                {/* Quick metrics */}
                <View style={styles.metricsRow}>
                  {ph !== undefined && (
                    <View style={styles.metricPill}>
                      <Activity size={11} color={selected ? '#cbd5e1' : '#64748b'} />
                      <Text style={[styles.metricText, selected && { color: '#f8fafc' }]}>{ph.toFixed(1)}</Text>
                    </View>
                  )}
                  {tds !== undefined && (
                    <View style={styles.metricPill}>
                      <Droplets size={11} color={selected ? '#cbd5e1' : '#64748b'} />
                      <Text style={[styles.metricText, selected && { color: '#f8fafc' }]}>{tds}</Text>
                    </View>
                  )}
                  {temp !== undefined && (
                    <View style={styles.metricPill}>
                      <ThermometerSun size={11} color={selected ? '#cbd5e1' : '#64748b'} />
                      <Text style={[styles.metricText, selected && { color: '#f8fafc' }]}>{temp.toFixed(0)}°</Text>
                    </View>
                  )}
                  {battery !== undefined && (
                    <View style={styles.metricPill}>
                      <Battery size={11} color={battery < 20 ? '#ef4444' : (selected ? '#cbd5e1' : '#64748b')} />
                      <Text style={[styles.metricText, selected && { color: '#f8fafc' }]}>{battery}%</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </LinearGradient>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  cardOuter: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  cardSelected: {
    borderColor: 'transparent',
  },
  card: {
    borderRadius: 19,
    padding: 14,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  mapSquare: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  mapText: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'Ubuntu_500Medium',
    marginTop: 4,
  },
  imageWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(14,165,233,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buoyImage: {
    width: 46,
    height: 46,
  },
  infoCol: {
    flex: 1,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  nodeName: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 15,
    color: '#0f172a',
    flex: 1,
  },
  textWhite: {
    color: '#fff',
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  scoreDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scoreText: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 11,
    color: '#64748b',
  },
});
