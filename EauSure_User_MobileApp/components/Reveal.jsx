// components/Reveal.jsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Reveal Component - Fades in when element appears and resets on screen focus
 * React Native version of IntersectionObserver-based reveal
 * 
 * Props:
 * - threshold: Not used in simple version (kept for API compatibility)
 * - delay: Milliseconds to wait before animating (default: 0)
 * - duration: Animation duration in ms (default: 700)
 * - style: Additional styles to apply
 * 
 * Usage:
 * <Reveal delay={100}>
 *   <Text>Content that fades in</Text>
 * </Reveal>
 * 
 * For staggered animations:
 * <Reveal delay={0}><View /></Reveal>
 * <Reveal delay={100}><View /></Reveal>
 * <Reveal delay={200}><View /></Reveal>
 */
export default function Reveal({ 
  children, 
  threshold = 0.15, // Kept for API consistency with web version
  delay = 0,
  duration = 700,
  style = {}
}) {
  const [isVisible, setIsVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  // Reset animation when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // Reset to hidden
      setIsVisible(false);
      opacity.setValue(0);

      // Trigger animation after delay
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, delay);

      return () => {
        clearTimeout(timer);
      };
    }, [delay])
  );

  useEffect(() => {
    if (isVisible) {
      // Fade in animation - simple opacity transition
      Animated.timing(opacity, {
        toValue: 1,
        duration: duration,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, duration]);

  return (
    <Animated.View
      style={[
        {
          opacity,
        },
        style
      ]}
    >
      {children}
    </Animated.View>
  );
}