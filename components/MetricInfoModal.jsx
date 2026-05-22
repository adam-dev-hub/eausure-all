import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Image, Dimensions } from 'react-native';
import { X } from 'lucide-react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const CONTENT_WIDTH = screenWidth - 80; // overlay padding (20*2) + modal padding (20*2)

export default function MetricInfoModal({ visible, onClose, title, description, imageSource }) {
  const [imageAspect, setImageAspect] = useState(1.5); // default fallback w/h ratio

  const onImageLayout = (event) => {
    // Not needed — we use onLoad to get natural dimensions
  };

  const onImageLoad = (e) => {
    const { width: w, height: h } = e.nativeEvent.source;
    if (w && h) {
      setImageAspect(w / h);
    }
  };

  // Image fills container width, height adapts to aspect ratio
  const imageHeight = Math.min(CONTENT_WIDTH / imageAspect, screenHeight * 0.45);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
          {imageSource && (
            <Image
              source={imageSource}
              style={[styles.image, { width: CONTENT_WIDTH, height: imageHeight }]}
              resizeMode="contain"
              onLoad={onImageLoad}
            />
          )}
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.4)', 
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: { 
    backgroundColor: '#fff', 
    borderRadius: 24, 
    padding: 20, 
    width: '100%',
    maxHeight: screenHeight * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 16 
  },
  title: { 
    fontSize: 18, 
    fontFamily: 'Ubuntu_700Bold', 
    color: '#0f172a',
    flex: 1,
    marginRight: 12,
  },
  closeBtn: { 
    padding: 6, 
    backgroundColor: '#f1f5f9', 
    borderRadius: 12 
  },
  image: { 
    borderRadius: 14,
    marginBottom: 16,
    alignSelf: 'center',
  },
  description: { 
    fontSize: 14, 
    fontFamily: 'Ubuntu_400Regular', 
    color: '#475569', 
    lineHeight: 22 
  }
});
