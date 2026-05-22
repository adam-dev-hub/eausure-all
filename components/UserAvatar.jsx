import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

function getInitials(name) {
  const cleaned = String(name || '').trim();
  if (!cleaned) return 'ES';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export default function UserAvatar({
  uri,
  name,
  size = 44,
  borderColor = '#ffffff',
}) {
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius: radius,
            borderColor,
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderColor,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize: Math.max(14, size * 0.32) }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    borderWidth: 2,
    backgroundColor: '#e2e8f0',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: '#e2e8f0',
  },
  initials: {
    color: '#0f172a',
    fontFamily: 'Ubuntu_700Bold',
  },
});
