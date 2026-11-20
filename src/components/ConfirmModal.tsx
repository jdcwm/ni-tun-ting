import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ConfirmModalAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  primary?: boolean;
}

interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions?: ConfirmModalAction[];
  theme?: any;
  type?: 'info' | 'warning' | 'error' | 'success';
}

const { width: SCREEN_W } = Dimensions.get('window');

const ICONS: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  success: '✅',
};

const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  info: { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
  warning: { bg: '#fef3c7', text: '#d97706', border: '#fcd34d' },
  error: { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5' },
  success: { bg: '#dcfce7', text: '#16a34a', border: '#86efac' },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  visible,
  onClose,
  title,
  message,
  actions = [{ label: '确定', onPress: () => {} }],
  theme,
  type = 'info',
}) => {
  const insets = useSafeAreaInsets();
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const bgColor = theme?.menuBgColor || '#ffffff';
  const textColor = theme?.textColor || '#000000';
  const subTextColor = theme?.subTextColor || '#888888';
  const accentColor = theme?.accentColor || '#6366f1';
  const borderColor = theme?.borderColor || '#e5e5e5';
  const typeColor = TYPE_COLORS[type];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <Animated.View
              style={[
                styles.modal,
                {
                  backgroundColor: bgColor,
                  transform: [{ scale: scaleAnim }],
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 0.15,
                  shadowRadius: 24,
                  elevation: 24,
                },
              ]}
            >
              <View style={[styles.iconContainer, { backgroundColor: typeColor.bg }]}>
                <Text style={styles.icon}>{ICONS[type] || ICONS.info}</Text>
              </View>
              
              {title && (
                <Text style={[styles.title, { color: textColor }]}>{title}</Text>
              )}
              
              {message && (
                <Text style={[styles.message, { color: subTextColor }]}>
                  {message}
                </Text>
              )}
              
              <View style={[styles.actions, { borderTopColor: borderColor + '50' }]}>
                {actions.map((action, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.actionBtn,
                      index > 0 && styles.actionBtnBorder,
                      action.primary && { backgroundColor: accentColor },
                      action.destructive && { backgroundColor: 'rgba(239, 68, 68, 0.1)' },
                    ]}
                    onPress={() => {
                      action.onPress();
                      onClose();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.actionText,
                        {
                          color: action.primary
                            ? '#ffffff'
                            : action.destructive
                            ? '#ef4444'
                            : accentColor,
                          fontWeight: action.primary || action.destructive ? '600' : '500',
                        },
                      ]}
                    >
                      {action.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    paddingTop: 60,
    paddingBottom: 60,
  },
  modal: {
    width: SCREEN_W * 0.85,
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'hidden',
  },
  iconContainer: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 20,
  },
  icon: {
    fontSize: 44,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    fontSize: 16,
  },
});