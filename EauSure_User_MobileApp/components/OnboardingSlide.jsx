// components/OnboardingSlide.jsx
import React, { useEffect, useRef, memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

// Use memo to prevent re-rendering slides that aren't changing
const OnboardingSlide = memo(function OnboardingSlide({ item, isFocused, pageWidth, pageHeight, onReady }) {

  // Store onReady in a ref so:
  //   (a) the memo comparator doesn't need to track it (identity changes every render)
  //   (b) the status-subscription effect always calls the latest version without re-running
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Fire onReady exactly once per mount, even if player status flickers
  const hasCalledReady = useRef(false);

  // Create player with specific high-quality loop settings
  const player = useVideoPlayer(item.videoUri, (playerInstance) => {
    playerInstance.loop = true;
    playerInstance.muted = true;
    playerInstance.timeUpdateEventInterval = 1000; // Reduce JS bridge traffic
  });

  // Animation values
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subheadOpacity = useSharedValue(0);
  const subheadTranslateY = useSharedValue(15);
  const descOpacity = useSharedValue(0);
  const descTranslateY = useSharedValue(10);
  
  // Blur opacity: 1 = Blurred (Inactive), 0 = Clear (Active)
  const blurOpacity = useSharedValue(1);

  useEffect(() => {
  if (!player) return;

  let timeoutId;

  const markReady = () => {
    if (hasCalledReady.current) return;
    hasCalledReady.current = true;
    onReadyRef.current?.();
  };

  const subscription = player.addListener('statusChange', (status) => {
    if (
      status === 'readyToPlay' ||
      status === 'playing' ||
      status === 'paused'
    ) {
      markReady();
    }
  });

  // Handle cached / already-ready cases
  if (
    player.status === 'readyToPlay' ||
    player.status === 'playing' ||
    player.status === 'paused'
  ) {
    markReady();
  }

  // 🚨 Failsafe: NEVER allow infinite loading
  timeoutId = setTimeout(markReady, 1200);

  return () => {
    subscription.remove();
    clearTimeout(timeoutId);
  };
}, [player]);


  useEffect(() => {
    if (!player) return;

    if (isFocused) {
      // --- ENTERING FOCUSED STATE ---
      player.play();
      

      // 1. Reveal Video (fade out blur)
      blurOpacity.value = withTiming(0, {
        duration: 800, // Slightly slower for "premium" feel
        easing: Easing.out(Easing.quad),
      });

      // 2. Animate Text In (Staggered)
      // Reset first for clean entry
      titleOpacity.value = 0; titleTranslateY.value = 20;
      subheadOpacity.value = 0; subheadTranslateY.value = 15;
      descOpacity.value = 0; descTranslateY.value = 10;

      titleOpacity.value = withDelay(300, withTiming(1, { duration: 800 }));
      titleTranslateY.value = withDelay(300, withSpring(0, { damping: 14, stiffness: 70 }));

      subheadOpacity.value = withDelay(500, withTiming(1, { duration: 800 }));
      subheadTranslateY.value = withDelay(500, withSpring(0, { damping: 14, stiffness: 70 }));

      descOpacity.value = withDelay(700, withTiming(1, { duration: 900 }));
      descTranslateY.value = withDelay(700, withSpring(0, { damping: 14, stiffness: 70 }));

    } else {
      // --- LEAVING FOCUSED STATE ---
      player.pause(); // Save GPU/Battery immediately

      // 1. Blur out video
      blurOpacity.value = withTiming(1, { duration: 400 });

      // 2. Hide text quickly
      titleOpacity.value = withTiming(0, { duration: 200 });
      subheadOpacity.value = withTiming(0, { duration: 200 });
      descOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isFocused, player]);

  // --- ANIMATED STYLES ---
  const blurContainerStyle = useAnimatedStyle(() => ({
    opacity: blurOpacity.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subheadStyle = useAnimatedStyle(() => ({
    opacity: subheadOpacity.value,
    transform: [{ translateY: subheadTranslateY.value }],
  }));

  const descStyle = useAnimatedStyle(() => ({
    opacity: descOpacity.value,
    transform: [{ translateY: descTranslateY.value }],
  }));

  return (
    <View style={[styles.container, { width: pageWidth, height: pageHeight }]}>
      
      {/* 1. Video Layer */}
      <View style={[styles.backgroundContainer, { width: pageWidth, height: pageHeight }]}>
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover" // Ensures full screen coverage
          nativeControls={false}
          {...(Platform.OS === 'android' ? { surfaceType: 'textureView' } : {})}
        />
      </View>

      {/* 2. Blur Layer (Visible when slide is not active) */}
      <Animated.View 
        style={[
          styles.backgroundContainer, 
          { width: pageWidth, height: pageHeight, zIndex: 2 },
          blurContainerStyle
        ]}
      >
        <BlurView 
            intensity={40} // Nice frosty glass effect
            tint="dark" 
            style={StyleSheet.absoluteFill} 
        />
        {/* Fallback overlay for Android if blur is low-perf on some devices */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15, 23, 42, 0.6)' }]} />
      </Animated.View>

      {/* 3. Gradient Layer (Legibility) */}
      <LinearGradient
        colors={['transparent', 'rgba(15, 23, 42, 0.1)', 'rgba(15, 23, 42, 0.9)', '#0f172a']}
        style={[styles.backgroundContainer, { zIndex: 3 }]}
        locations={[0, 0.4, 0.8, 1]}
      />

      {/* 4. Text Content */}
      <View style={[styles.contentContainer, { zIndex: 4 }]}>
        <Animated.Text style={[styles.title, titleStyle]}>
          {item.title}
        </Animated.Text>
        
        <Animated.Text style={[styles.subhead, subheadStyle]}>
          {item.subhead}
        </Animated.Text>
        
        <Animated.Text style={[styles.description, descStyle]}>
          {item.description}
        </Animated.Text>
      </View>
    </View>
  );
}, (prev, next) => {
  // Only re-render if focus changes or dimensions change massively
  return (
    prev.isFocused === next.isFocused &&
    prev.pageWidth === next.pageWidth &&
    prev.item.key === next.item.key
  );
});

export default OnboardingSlide;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    backgroundColor: '#0f172a', // Fallback color matches theme
  },
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 160, // Space for bottom controls
  },
  title: {
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 32,
    color: '#FFFFFF',
    marginBottom: 8,
    lineHeight: 38,
  },
  subhead: {
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 18,
    color: '#38bdf8',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  description: {
    fontFamily: 'Ubuntu_400Regular',
    fontSize: 16,
    color: '#cbd5e1',
    lineHeight: 24,
  },
});