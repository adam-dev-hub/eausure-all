import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Path, LinearGradient as SkiaGradient, vec, Skia } from '@shopify/react-native-skia';
import { useSharedValue, withRepeat, withTiming, Easing, useDerivedValue } from 'react-native-reanimated';

export default function WaterWaveBg({
  width,
  height,
  baseRatio1 = 0.52,
  baseRatio2 = 0.58,
  fillBackground = true,
  filledWaves = true,
}) {
  const progress1 = useSharedValue(0);
  const progress2 = useSharedValue(0);

  useEffect(() => {
    progress1.value = withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear }), -1, false);
    progress2.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.linear }), -1, true);
  }, []);

  // Extend the wave drawing beyond the visible width so it starts
  // slightly past the right border and wraps seamlessly.
  const drawWidth = width + 40;

  const path1 = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const waveHeight = 12;
    const yOffset = height * baseRatio1;
    
    p.moveTo(-20, height);
    p.lineTo(-20, yOffset);

    for (let x = -20; x <= drawWidth; x += 8) {
      const y = yOffset + Math.sin((x / width * Math.PI * 2) + (progress1.value * Math.PI * 2)) * waveHeight;
      p.lineTo(x, y);
    }
    p.lineTo(drawWidth, height);
    p.close();
    return p;
  });

  const path2 = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const waveHeight = 9;
    const yOffset = height * baseRatio2;
    
    p.moveTo(-20, height);
    p.lineTo(-20, yOffset);

    for (let x = -20; x <= drawWidth; x += 8) {
      const y = yOffset + Math.cos((x / width * Math.PI * 3) - (progress2.value * Math.PI * 2)) * waveHeight;
      p.lineTo(x, y);
    }
    p.lineTo(drawWidth, height);
    p.close();
    return p;
  });

  const linePath1 = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const waveHeight = 12;
    const yOffset = height * baseRatio1;

    p.moveTo(-20, yOffset);
    for (let x = -20; x <= drawWidth; x += 8) {
      const y = yOffset + Math.sin((x / width * Math.PI * 2) + (progress1.value * Math.PI * 2)) * waveHeight;
      p.lineTo(x, y);
    }
    return p;
  });

  const linePath2 = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const waveHeight = 9;
    const yOffset = height * baseRatio2;

    p.moveTo(-20, yOffset);
    for (let x = -20; x <= drawWidth; x += 8) {
      const y = yOffset + Math.cos((x / width * Math.PI * 3) - (progress2.value * Math.PI * 2)) * waveHeight;
      p.lineTo(x, y);
    }
    return p;
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ flex: 1, backgroundColor: fillBackground ? '#0ea5e9' : 'transparent' }}>
        <Canvas style={{ flex: 1 }}>
          {filledWaves ? (
            <>
              <Path path={path1} color="rgba(255,255,255,0.15)" />
              <Path path={path2}>
                <SkiaGradient
                  start={vec(0, height * 0.4)}
                  end={vec(0, height)}
                  colors={['rgba(255,255,255,0.25)', 'rgba(37, 99, 235, 0.4)']}
                />
              </Path>
            </>
          ) : (
            <>
              <Path path={linePath1} color="rgba(255,255,255,0.45)" style="stroke" strokeWidth={3} />
              <Path path={linePath2} color="rgba(191,219,254,0.8)" style="stroke" strokeWidth={2} />
            </>
          )}
        </Canvas>
      </View>
    </View>
  );
}
