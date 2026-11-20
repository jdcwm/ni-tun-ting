import React from 'react';
import { View, Modal, Image, StyleSheet, TouchableOpacity, Text, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ImagePreviewModalProps {
  visible: boolean;
  imageUri: string;
  onClose: () => void;
  onDelete?: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  visible,
  imageUri,
  onClose,
  onDelete,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent onRequestClose={onClose} animationType="fade">
      <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 10 }]} onPress={onClose}>
          <Text style={{ color: '#fff', fontSize: 28 }}>×</Text>
        </TouchableOpacity>

        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="contain"
        />

        {onDelete && (
          <TouchableOpacity
            style={[styles.deleteBtn, { backgroundColor: theme.accentColor, bottom: insets.bottom + 20 }]}
            onPress={onDelete}
          >
            <Text style={{ color: '#fff' }}>删除</Text>
          </TouchableOpacity>
        )}
      </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    position: 'absolute',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
});
