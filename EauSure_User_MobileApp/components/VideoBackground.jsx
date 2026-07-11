// components/VideoBackground.jsx

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, AppState } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

// Assurez-vous que le chemin est correct selon votre structure
const videoSource = require('../assets/onboarding/auth-background.mp4'); 

export default function VideoBackground() {
  const appState = useRef(AppState.currentState);

  const player = useVideoPlayer(videoSource, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  useEffect(() => {
    // Variable pour stocker l'ID du timeout afin de pouvoir l'annuler
    let timeoutId;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        // On force le redémarrage pour éviter l'écran noir après le navigateur
        try {
          // On annule tout timeout précédent s'il existe
          if (timeoutId) clearTimeout(timeoutId);

          player.pause();
          
          timeoutId = setTimeout(() => {
            // Protection supplémentaire : try/catch au cas où l'objet est release entre temps
            try {
              player.play();
            } catch (innerError) {
              console.log('Player released, play aborted');
            }
          }, 50);
        } catch (e) {
          console.log('Video recovery error:', e);
        }
      }

      appState.current = nextState;
    });

    // NETTOYAGE (CLEANUP) CRUCIAL
    return () => {
      subscription.remove();
      // Si on change de page (Login -> Tabs), on TUE le timeout immédiatement.
      // Cela empêche player.play() d'être appelé sur un objet détruit.
      if (timeoutId) clearTimeout(timeoutId); 
    };
  }, [player]);

  return (
    <View style={styles.container}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={false}
        contentFit="cover"
      />
      <View style={styles.overlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
    backgroundColor: '#0f172a',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
});
