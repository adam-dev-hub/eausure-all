import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, BlurMask, Rect, SweepGradient, vec } from '@shopify/react-native-skia';
import { useSharedValue, withRepeat, withTiming, Easing, useDerivedValue } from 'react-native-reanimated';

export default function MeshGradientBg({ width, height, colors = ['#0ea5e9', '#3b82f6', '#8b5cf6'] }) {
  const clock = useSharedValue(0);

  useEffect(() => {
    clock.value = withRepeat(
      withTiming(2 * Math.PI, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const cx1 = useDerivedValue(() => width / 2 + Math.cos(clock.value) * (width * 0.3));
  const cy1 = useDerivedValue(() => height / 2 + Math.sin(clock.value) * (height * 0.3));

  const cx2 = useDerivedValue(() => width / 2 + Math.sin(clock.value + Math.PI / 2) * (width * 0.3));
  const cy2 = useDerivedValue(() => height / 2 + Math.cos(clock.value + Math.PI / 2) * (height * 0.3));

  const cx3 = useDerivedValue(() => width / 2 + Math.cos(clock.value + Math.PI) * (width * 0.4));
  const cy3 = useDerivedValue(() => height / 2 + Math.sin(clock.value + Math.PI) * (height * 0.4));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={{ flex: 1 }}>
        {/* Base dark/premium background color */}
        <Rect x={0} y={0} width={width} height={height} color="#0f172a" />
        
        {/* Animated Orbs */}
        <Circle cx={cx1} cy={cy1} r={height * 0.7} color={colors[0]} opacity={0.6}>
          <BlurMask blur={50} style="normal" />
        </Circle>
        <Circle cx={cx2} cy={cy2} r={height * 0.6} color={colors[1]} opacity={0.5}>
          <BlurMask blur={50} style="normal" />
        </Circle>
        <Circle cx={cx3} cy={cy3} r={height * 0.8} color={colors[2]} opacity={0.5}>
          <BlurMask blur={60} style="normal" />
        </Circle>

        {/* Global Blur layer to smooth everything */}
        <Rect x={0} y={0} width={width} height={height} color="transparent">
           <BlurMask blur={20} style="normal" />
        </Rect>
      </Canvas>
    </View>
  );
}
