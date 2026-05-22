import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { AlertTriangle } from 'lucide-react-native';
import { useMqtt } from '../context/MqttContext';

export default function LiveToast() {
  const { latestData } = useMqtt();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    // Détection d'un événement MQTT en temps réel
    if (latestData && latestData.event && latestData.event.type !== 'None') {
      const newToast = { 
        id: Date.now(), 
        msg: `Événement ${latestData.event.type} détecté sur la bouée ${latestData.nodeId.slice(-4)}` 
      };
      setToast(newToast);
      
      const timer = setTimeout(() => {
        setToast(null);
      }, 5000); // Disparaît après 5 secondes

      return () => clearTimeout(timer);
    }
  }, [latestData]);

  if (!toast) return null;

  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp} style={styles.container}>
      <View style={styles.iconContainer}>
        <AlertTriangle color="#fff" size={24} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>Alerte Critique</Text>
        <Text style={styles.msg}>{toast.msg}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: '#ef4444',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
    zIndex: 9999,
  },
  iconContainer: {
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontFamily: 'Ubuntu_700Bold',
    fontSize: 16,
    marginBottom: 2,
  },
  msg: {
    color: '#fff',
    fontFamily: 'Ubuntu_500Medium',
    fontSize: 13,
    opacity: 0.95,
  }
});
