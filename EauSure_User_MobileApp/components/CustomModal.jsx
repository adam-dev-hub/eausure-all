import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const { height } = Dimensions.get('window');

export default function CustomModal({
  visible,
  message,
  onClose,
  type = 'error',
}) {
  const translateY = useRef(new Animated.Value(height)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Haptics.notificationAsync(
        type === 'error'
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Success
      );

      translateY.setValue(height);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 9,
          tension: 35,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.selectionAsync();

    Animated.timing(translateY, {
      toValue: height,
      duration: 250,
      useNativeDriver: true,
    }).start(onClose);
  };

  // ❗ Important : ne rien rendre si invisible
  if (!visible) return null;

  return (
    <View style={styles.absoluteLayer} pointerEvents="auto">
      {/* SAFE overlay (no blur!) */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity, backgroundColor: 'rgba(15,23,42,0.85)' },
        ]}
      />

      <Animated.View
        style={[styles.modalWrapper, { transform: [{ translateY }] }]}
      >
        <View style={styles.modalCard}>
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor:
                  type === 'error'
                    ? 'rgba(239, 68, 68, 0.1)'
                    : 'rgba(37, 99, 235, 0.1)',
              },
            ]}
          >
            <Feather
              name={type === 'error' ? 'x-circle' : 'check-circle'}
              size={32}
              color={type === 'error' ? '#F87171' : '#3B82F6'}
            />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.message}>{message}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: type === 'error' ? '#EF4444' : '#2563EB' },
            ]}
            onPress={handleClose}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  absoluteLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalWrapper: {
    width: '90%',
    maxWidth: 400,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 20,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
    marginRight: 16,
  },
  message: {
    fontSize: 15,
    color: '#1E293B',
    fontWeight: '600',
    lineHeight: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
});
