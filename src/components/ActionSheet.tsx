import React, { useRef, useEffect, useState } from 'react';
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
  ScrollView,
  NativeModules,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ActionSheetAction {
  icon?: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions: ActionSheetAction[];
  theme: any;
}

const { width: SCREEN_W, height: WINDOW_H } = Dimensions.get('window');
const SCREEN_H = Dimensions.get('screen').height;

export const ActionSheet: React.FC<ActionSheetProps> = ({
  visible,
  onClose,
  title,
  message,
  actions,
  theme,
}) => {
  const insets = useSafeAreaInsets();
  const [containerHeight, setContainerHeight] = useState(SCREEN_H);

  // 在布局时获取实际可用高度，避免被导航栏遮挡
  const onLayout = (e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height);
  };

  // 统一安全底部高度：insets.bottom（iOS 为 home indicator 高度，Android 为导航条高度）
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

  const handleAction = (action: ActionSheetAction) => {
    onClose();
    setTimeout(() => action.onPress(), 250);
  };

  const nonDestructive = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);

  const renderRow = (action: ActionSheetAction, index: number, total: number, isDestructive: boolean) => (
    <TouchableOpacity
      key={index}
      style={[
        styles.actionRow,
        index < total - 1 && { borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
      onPress={() => handleAction(action)}
      activeOpacity={0.7}
    >
      {action.icon && <View style={styles.iconBox}>{action.icon}</View>}
      <Text
        style={[
          styles.actionLabel,
          { color: isDestructive ? '#ff4444' : theme.textColor },
          !action.icon && styles.labelCentered,
        ]}
        numberOfLines={1}
      >
        {action.label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} onLayout={onLayout}>
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                styles.sheet,
                {
                  backgroundColor: theme.menuBgColor || theme.primaryColor,
                  transform: [{ translateY: slideAnim }],
                  paddingBottom: safeBottom,
                  maxHeight: containerHeight * 0.85,
                },
              ]}
            >
              <View style={styles.dragHandle}>
                <View style={[styles.dragBar, { backgroundColor: theme.borderColor || '#ccc' }]} />
              </View>

              {(title || message) && (
                <View style={styles.titleRow}>
                  {title && (
                    <Text style={[styles.titleText, { color: theme.textColor }]} numberOfLines={1}>
                      {title}
                    </Text>
                  )}
                  {message && (
                    <Text style={[styles.messageText, { color: theme.subTextColor }]} numberOfLines={1}>
                      {message}
                    </Text>
                  )}
                </View>
              )}

              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
                bounces
              >
                {nonDestructive.length > 0 && (
                  <View style={[styles.actionGroup, { backgroundColor: theme.secondaryColor }]}>
                    {nonDestructive.map((a, i) => renderRow(a, i, nonDestructive.length, false))}
                  </View>
                )}

                {destructive.length > 0 && (
                  <View style={[styles.actionGroup, { backgroundColor: theme.secondaryColor }]}>
                    {destructive.map((a, i) => renderRow(a, i, destructive.length, true))}
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={[styles.cancelBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelText, { color: theme.textColor }]}>取消</Text>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    paddingHorizontal: 12,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 16,
    zIndex: 2001,
    ...Platform.select({
      android: {
        elevation: 101,
      },
    }),
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.5,
  },
  titleRow: {
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 6,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  messageText: {
    fontSize: 13,
    marginTop: 2,
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  actionGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  iconBox: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionLabel: {
    fontSize: 15,
    flex: 1,
  },
  labelCentered: {
    textAlign: 'center',
  },
  cancelBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});