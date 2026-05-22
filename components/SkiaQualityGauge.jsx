import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Path, Skia, SweepGradient, vec, Group } from '@shopify/react-native-skia';
import Animated, { useSharedValue, withTiming, Easing, useDerivedValue } from 'react-native-reanimated';

export default function SkiaQualityGauge({ score = 0, size = 60, strokeWidth = 6 }) {
  const animatedScore = useSharedValue(0);

  useEffect(() => {
    animatedScore.value = withTiming(score, {
      duration: 1500,
      easing: Easing.out(Easing.cubic),
    });
  }, [score]);

  const radius = (size - strokeWidth) / 2;
  const center = size / 2;

  // Background track path
  const bgPath = Skia.Path.Make();
  bgPath.addCircle(center, center, radius);

  // Foreground progress path
  const progressPath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    // Start at -90 degrees (top)
    p.addArc(
      { x: strokeWidth / 2, y: strokeWidth / 2, width: size - strokeWidth, height: size - strokeWidth },
      -90,
      (animatedScore.value / 10) * 360
    );
    return p;
  });

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ flex: 1 }}>
        <Group>
          {/* Background Track */}
          <Path
            path={bgPath}
            strokeWidth={strokeWidth}
            style="stroke"
            color="rgba(14, 165, 233, 0.1)"
          />
          {/* Foreground Progress */}
          <Path
            path={progressPath}
            strokeWidth={strokeWidth}
            style="stroke"
            strokeCap="round"
          >
            <SweepGradient
              c={vec(center, center)}
              colors={['#ef4444', '#f59e0b', '#22c55e']}
              start={-90}
              end={270}
            />
          </Path>
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({});
