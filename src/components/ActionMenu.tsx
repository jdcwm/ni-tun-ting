import React, { useRef, useEffect } from 'react';
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

export interface ActionMenuItem {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  icon?: React.ReactNode;
}

interface ActionMenuProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: ActionMenuItem[];
  theme: any;
}

const { width: SCREEN_W, height: WINDOW_H } = Dimensions.get('window');
const SCREEN_H = Dimensions.get('screen').height;

export const ActionMenu: React.FC<ActionMenuProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  items,
  theme,
}) => {
  const insets = useSafeAreaInsets();
  // 统一安全底部高度：insets.bottom（iOS 为 home indicator，Android 为导航条高度）
  // Android 叠加 88 + |screenH-windowH| 保底，防止导航条遮挡
  const navBarPad = 88 + Math.abs(SCREEN_H - WINDOW_H);
  const safeBottom = Math.max(insets.bottom || 0, Platform.OS === 'android' ? navBarPad : 34);
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 10,
          tension: 50,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: SCREEN_H,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleAction = (item: ActionMenuItem) => {
    onClose();
    setTimeout(() => item.onPress(), 250);
  };

  const nonDestructive = items.filter((a) => !a.destructive);
  const destructive = items.filter((a) => a.destructive);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.menuBgColor || theme.primaryColor,
                  transform: [{ translateY: slideAnim }],
                  paddingBottom: safeBottom,
                },
              ]}
            >
              <View style={styles.dragHandle}>
                <View style={[styles.dragBar, { backgroundColor: theme.borderColor }]} />
              </View>

              {(title || subtitle) && (
                <View style={[styles.titleSection, { borderBottomColor: theme.borderColor + '50' }]}>
                  {title && (
                    <Text style={[styles.titleText, { color: theme.textColor, fontWeight: '600' }]}>
                      {title}
                    </Text>
                  )}
                  {subtitle && (
                    <Text style={[styles.subtitleText, { color: theme.subTextColor }]} numberOfLines={2}>
                      {subtitle}
                    </Text>
                  )}
                </View>
              )}

              {nonDestructive.length > 0 && (
                <View style={[styles.actionGroup, { backgroundColor: theme.secondaryColor }]}>
                  {nonDestructive.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.actionRow,
                        index < nonDestructive.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.borderColor + '40',
                        },
                      ]}
                      onPress={() => handleAction(item)}
                      activeOpacity={0.5}
                    >
                      {item.icon && <View style={styles.iconBox}>{item.icon}</View>}
                      <Text
                        style={[
                          styles.actionLabel,
                          { color: theme.textColor },
                          !item.icon && styles.labelCentered,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {destructive.length > 0 && (
                <View style={[styles.actionGroup, styles.destructiveGroup, { backgroundColor: theme.secondaryColor }]}>
                  {destructive.map((item, index) => (
                    <TouchableOpacity
                      key={`dest-${index}`}
                      style={[
                        styles.actionRow,
                        index < destructive.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.borderColor + '40',
                        },
                      ]}
                      onPress={() => handleAction(item)}
                      activeOpacity={0.5}
                    >
                      {item.icon && <View style={styles.iconBox}>{item.icon}</View>}
                      <Text
                        style={[
                          styles.actionLabel,
                          { color: '#ff4444', fontWeight: '500' },
                          !item.icon && styles.labelCentered,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={onClose}
                activeOpacity={0.6}
              >
                <Text style={[styles.cancelText, { color: theme.textColor, fontWeight: '600' }]}>取消</Text>
              </TouchableOpacity>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    zIndex: 2000,
    ...Platform.select({
      android: {
        elevation: 100,
      },
    }),
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    zIndex: 2001,
    ...Platform.select({
      android: {
        elevation: 101,
      },
      default: {
        elevation: 20,
      },
    }),
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 4,
  },
  dragBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    opacity: 0.4,
  },
  titleSection: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  titleText: {
    fontSize: 17,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  subtitleText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.8,
  },
  actionGroup: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  destructiveGroup: {
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  iconBox: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  actionLabel: {
    fontSize: 16,
    flex: 1,
    fontWeight: '500',
  },
  labelCentered: {
    textAlign: 'center',
  },
  cancelBtn: {
    marginTop: 6,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    fontWeight: '600',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});