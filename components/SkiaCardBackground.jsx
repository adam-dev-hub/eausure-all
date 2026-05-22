import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Rect, SweepGradient, vec, Skia } from '@shopify/react-native-skia';
import { useSharedValue, withRepeat, withTiming, Easing, useDerivedValue } from 'react-native-reanimated';

export default function SkiaCardBackground({ width, height, color1, color2 }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 10000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const transform = useDerivedValue(() => {
    return [{ rotate: (rotation.value * Math.PI) / 180 }];
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Canvas style={{ flex: 1 }}>
        <Rect x={0} y={0} width={width} height={height} opacity={0.15}>
          <SweepGradient
            c={vec(width / 2, height / 2)}
            colors={[color1, color2, color1]}
            transform={transform}
          />
        </Rect>
      </Canvas>
    </View>
  );
}
