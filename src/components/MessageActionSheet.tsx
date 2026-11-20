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
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface MessageAction {
  icon?: React.ReactNode;
  label: string;
  onPress: () => void | Promise<void>;
  destructive?: boolean;
}

interface MessageActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: MessageAction[];
  theme: any;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export const MessageActionSheet: React.FC<MessageActionSheetProps> = ({
  visible,
  onClose,
  title,
  actions,
  theme,
}) => {
  const insets = useSafeAreaInsets();
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

  const handleAction = async (action: MessageAction) => {
    // 先关闭弹窗；然后等待一个动画帧，确保 Modal 关闭动画已进入收尾阶段再执行动作
    // 直接 await action.onPress()，让 action 自己内部的 try/catch / Alert 可以正常工作
    onClose();
    await new Promise<void>((r) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => r());
      } else {
        setTimeout(r, 20);
      }
    });
    try {
      await Promise.resolve(action.onPress());
    } catch (e) {
      // 兜底：如果 action.onPress 自己没写 try/catch，在这里捕获并打印，避免红屏
      console.error('[MessageActionSheet] action onPress threw:', e);
    }
  };

  const nonDestructive = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);

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
                  paddingBottom: insets.bottom + 20,
                },
              ]}
            >
              <View style={styles.dragHandle}>
                <View style={[styles.dragBar, { backgroundColor: theme.borderColor }]} />
              </View>

              {title ? (
                <View style={[styles.titleRow, { borderBottomColor: theme.borderColor + '50' }]}>
                  <Text style={[styles.titleText, { color: theme.subTextColor }]} numberOfLines={1}>
                    {title}
                  </Text>
                </View>
              ) : null}

              <ScrollView
                style={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {nonDestructive.length > 0 && (
                  <View style={[styles.actionGroup, { backgroundColor: theme.secondaryColor }]}>
                    {nonDestructive.map((action, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.actionRow,
                          index < nonDestructive.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.borderColor + '40',
                          },
                        ]}
                        onPress={() => handleAction(action)}
                        activeOpacity={0.5}
                      >
                        {action.icon && <View style={styles.iconBox}>{action.icon}</View>}
                        <Text
                          style={[
                            styles.actionLabel,
                            { color: theme.textColor },
                            !action.icon && styles.labelCentered,
                          ]}
                        >
                          {action.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {destructive.length > 0 && (
                  <View style={[styles.actionGroup, styles.destructiveGroup, { backgroundColor: theme.secondaryColor }]}>
                    {destructive.map((action, index) => (
                      <TouchableOpacity
                        key={`dest-${index}`}
                        style={[
                          styles.actionRow,
                          index < destructive.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.borderColor + '40',
                          },
                        ]}
                        onPress={() => handleAction(action)}
                        activeOpacity={0.5}
                      >
                        {action.icon && <View style={styles.iconBox}>{action.icon}</View>}
                        <Text
                          style={[
                            styles.actionLabel,
                            { color: '#ff4444', fontWeight: '500' },
                            !action.icon && styles.labelCentered,
                          ]}
                        >
                          {action.label}
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
              </ScrollView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ============ ThemedAlert: 主题化居中弹窗，替代 Alert.alert ============
interface ThemedAlertProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  theme: any;
}

export const ThemedAlert: React.FC<ThemedAlertProps> = ({
  visible,
  title,
  message,
  confirmText = '确定',
  cancelText,
  onConfirm,
  onCancel,
  theme,
}) => {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 60, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.85, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleConfirm = () => {
    onConfirm?.();
  };
  const handleCancel = () => {
    onCancel?.();
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleCancel}>
      <TouchableWithoutFeedback onPress={handleCancel}>
        <Animated.View style={[styles.centeredOverlay, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.alertCard,
                {
                  backgroundColor: theme.menuBgColor || theme.primaryColor,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              <Text style={[styles.alertTitle, { color: theme.textColor }]} numberOfLines={2}>{title}</Text>
              {message ? (
                <ScrollView
                  style={styles.alertMsgScroll}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
                  <Text style={[styles.alertMessage, { color: theme.subTextColor }]}>{message}</Text>
                </ScrollView>
              ) : null}
              <View style={styles.alertBtnRow}>
                {cancelText ? (
                  <TouchableOpacity
                    style={[styles.alertBtn, { backgroundColor: theme.secondaryColor }]}
                    onPress={handleCancel}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.alertBtnTextSecondary, { color: theme.subTextColor }]}>
                      {cancelText}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.alertBtn, { backgroundColor: theme.accentColor }]}
                  onPress={handleConfirm}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.alertBtnTextPrimary, { color: theme.buttonTextColor || '#fff' }]}>
                    {confirmText}
                  </Text>
                </TouchableOpacity>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  // ThemedAlert 居中弹窗
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  alertCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  alertMsgScroll: {
    maxHeight: 220,
    marginBottom: 20,
  },
  alertMessage: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'left',
    includeFontPadding: false,
  },
  alertBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  alertBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBtnPrimary: {
    // 背景由 inline style 设置
  },
  alertBtnSecondary: {
    // 背景由 inline style 设置
  },
  alertBtnTextPrimary: {
    fontSize: 15,
    fontWeight: '700',
  },
  alertBtnTextSecondary: {
    fontSize: 15,
    fontWeight: '600',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 12,
    paddingTop: 8,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 24,
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 2,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.3,
  },
  titleRow: {
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  actionGroup: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
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
    marginTop: 4,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
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
  scrollContainer: {
    flexGrow: 0,
    flexShrink: 1,
  },
});
