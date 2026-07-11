// app/(onboarding)/index.jsx
import React, { useRef, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import OnboardingSlide from '../../components/OnboardingSlide';
import { SLIDES } from '../../data/slides';
import { useOnboarding } from '../../context/OnboardingContext';

export default function OnboardingScreen() {
  const pagerRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { completeOnboarding } = useOnboarding();
  const insets = useSafeAreaInsets();

  const { width, height } = useWindowDimensions();
  const pageWidth  = useMemo(() => Math.round(width),  [width]);
  const pageHeight = useMemo(() => Math.round(height), [height]);

  // ----------------------------------------------------------------
  // PER-SLIDE VIDEO READINESS
  // Each slide reports when its video (or image) is ready to display.
  // We only unblock interaction once the CURRENT slide is ready —
  // this prevents the loading spinner from hanging until every video
  // in the deck has buffered, and it prevents tapping/swiping before
  // the user actually sees content.
  // ----------------------------------------------------------------
  const [slideReadyMap, setSlideReadyMap] = useState(() => {
    // Pre-mark slides that have no video (image-only) as ready immediately
    const map = {};
    SLIDES.forEach((slide, i) => {
      map[i] = !slide.videoUri; // true if no video → already "ready"
    });
    return map;
  });

  const handleSlideReady = useCallback((index) => {
    setSlideReadyMap((prev) => {
      if (prev[index]) return prev; // already marked, skip re-render
      return { ...prev, [index]: true };
    });
  }, []);

  // The current slide is ready when its entry in the map is truthy
  const currentSlideReady = !!slideReadyMap[currentIndex];

  // Master lock: interactions are blocked if EITHER the current slide
  // isn't ready OR we are in the middle of finishing onboarding.
  const isInteractionBlocked = !currentSlideReady || isTransitioning;

  // ----------------------------------------------------------------
  const skipScale     = useSharedValue(1);
  const continueScale = useSharedValue(1);

  const handlePageSelected = (e) => {
    const newIndex = e.nativeEvent.position;
    setCurrentIndex(newIndex);
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync();
    }
  };

  const finishOnboarding = async () => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Short delay so the button press animation is visible before we navigate
    setTimeout(async () => {
      await completeOnboarding();
      // _layout.jsx useEffect picks up hasSeenOnboarding change and replaces route
    }, 150);
  };

  const handleNext = () => {
    if (isInteractionBlocked) return;

    continueScale.value = withTiming(0.95, { duration: 100 }, () => {
      continueScale.value = withSpring(1, { damping: 10, stiffness: 400 });
    });

    if (currentIndex < SLIDES.length - 1) {
      pagerRef.current?.setPage(currentIndex + 1);
    } else {
      finishOnboarding();
    }
  };

  const handleSkip = () => {
    if (isInteractionBlocked) return;

    skipScale.value = withTiming(0.9, { duration: 100 }, () => {
      skipScale.value = withSpring(1, { damping: 10, stiffness: 400 });
    });
    finishOnboarding();
  };

  const handleDotPress = (index) => {
    if (isInteractionBlocked) return;
    pagerRef.current?.setPage(index);
  };

  // --- ANIMATED STYLES ---
  const continueButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: continueScale.value }],
  }));

  const skipButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: skipScale.value }],
    opacity: withTiming(isTransitioning ? 0 : 1, { duration: 200 }),
  }));

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={handlePageSelected}
        orientation="horizontal"
        offscreenPageLimit={1}
        scrollEnabled={!isInteractionBlocked}
      >
        {SLIDES.map((item, index) => {
          const isFocused = index === currentIndex;
          return (
            <View key={item.key} style={{ flex: 1 }}>
              <OnboardingSlide
                item={item}
                isFocused={isFocused}
                pageWidth={pageWidth}
                pageHeight={pageHeight}
                // When this slide's video fires onReady, mark it in our map.
                // OnboardingSlide should call this once the video is loaded &
                // ready to play (or immediately for image-only slides).
                onReady={() => handleSlideReady(index)}
              />
            </View>
          );
        })}
      </PagerView>

      {!currentSlideReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}

      {/* ---------------------------------------------------------- */}
      {/* TOP-RIGHT SKIP                                               */}
      {/* ---------------------------------------------------------- */}
      <Animated.View style={[styles.skipContainer, { top: insets.top + 16 }, skipButtonStyle]}>
        <TouchableOpacity
          onPress={handleSkip}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          disabled={isInteractionBlocked}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ---------------------------------------------------------- */}
      {/* BOTTOM CONTROLS                                              */}
      {/* ---------------------------------------------------------- */}
      <View style={styles.bottomControls}>
        {/* Pagination dots */}
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => {
            const isActive = index === currentIndex;
            return (
              <TouchableOpacity
                key={index}
                onPress={() => handleDotPress(index)}
                activeOpacity={0.8}
                disabled={isInteractionBlocked}
              >
                <Animated.View
                  style={[
                    styles.dot,
                    {
                      width:           isActive ? 24 : 8,
                      backgroundColor: isActive ? '#3b82f6' : 'rgba(255,255,255,0.3)',
                    },
                  ]}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Continue / Get Started button */}
        <Animated.View style={[styles.buttonContainer, continueButtonStyle]}>
          <TouchableOpacity
            style={[styles.button, isInteractionBlocked && { opacity: 0.5 }]}
            onPress={handleNext}
            activeOpacity={0.9}
            disabled={isInteractionBlocked}
          >
            {isTransitioning ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>
                {currentIndex === SLIDES.length - 1 ? 'Get started' : 'Continue'}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },

  // Full-screen overlay that sits above the pager but below the controls.
  // Keeps the dark bg while the current slide's video buffers.
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems:      'center',
    zIndex:          5,
  },

  skipContainer: { position: 'absolute', right: 30, zIndex: 10 },
  skipText: {
    color:      'rgba(255,255,255,0.7)',
    fontFamily: 'Ubuntu_500Medium',
    fontSize:   16,
  },

  bottomControls: {
    position:          'absolute',
    bottom:            50,
    left:              24,
    right:             24,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    zIndex:            10,
  },
  pagination: { flexDirection: 'row', gap: 8, height: 20, alignItems: 'center' },
  dot:        { height: 6, borderRadius: 3 },

  buttonContainer: {
    shadowColor:   '#3b82f6',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius:  8,
    elevation:     5,
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical:   14,
    paddingHorizontal: 28,
    borderRadius:      30,
    minWidth:          140,
    alignItems:        'center',
    justifyContent:    'center',
  },
  buttonText: { color: '#FFF', fontFamily: 'Ubuntu_700Bold', fontSize: 16 },
});