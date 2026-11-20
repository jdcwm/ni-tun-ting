import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

interface ModalHeaderProps {
  title: string;
  onCancel: () => void;
  onSave: () => void;
  saveText?: string;
  cancelText?: string;
  saveDisabled?: boolean;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  onCancel,
  onSave,
  saveText = '保存',
  cancelText = '取消',
  saveDisabled = false,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.modalHeader,
        {
          borderBottomColor: theme.borderColor,
          paddingTop: Math.max(insets.top, 30) + 12,
          backgroundColor: theme.backgroundColor,
        },
      ]}
    >
      <TouchableOpacity onPress={onCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ color: theme.subTextColor, fontSize: 16 }}>{cancelText}</Text>
      </TouchableOpacity>
      <Text style={[styles.modalHeaderTitle, { color: theme.textColor }]} numberOfLines={1}>
        {title}
      </Text>
      <TouchableOpacity
        onPress={onSave}
        disabled={saveDisabled}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text
          style={{
            color: saveDisabled ? theme.subTextColor + '80' : theme.accentColor,
            fontWeight: '600',
            fontSize: 16,
            opacity: saveDisabled ? 0.5 : 1,
          }}
        >
          {saveText}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

interface FullScreenModalProps {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onSave: () => void;
  saveText?: string;
  cancelText?: string;
  saveDisabled?: boolean;
  children: React.ReactNode;
  contentContainerStyle?: any;
}

export const FullScreenModal: React.FC<FullScreenModalProps> = ({
  visible,
  title,
  onCancel,
  onSave,
  saveText,
  cancelText,
  saveDisabled,
  children,
  contentContainerStyle,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.backgroundColor }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ModalHeader
          title={title}
          onCancel={onCancel}
          onSave={onSave}
          saveText={saveText}
          cancelText={cancelText}
          saveDisabled={saveDisabled}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            { padding: 16, paddingBottom: insets.bottom + 20 },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

interface BottomSheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: number | string;
}

export const BottomSheetModal: React.FC<BottomSheetModalProps> = ({
  visible,
  onClose,
  children,
  maxHeight = '70%',
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <TouchableOpacity
          style={styles.bottomSheetOverlay}
          activeOpacity={1}
          onPress={onClose}
        >
          <View style={[styles.bottomSheetContainer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity activeOpacity={1} style={[styles.bottomSheet, { backgroundColor: theme.backgroundColor, maxHeight: maxHeight as any }]}>
              <View style={styles.dragHandle}>
                <View style={[styles.dragBar, { backgroundColor: theme.borderColor }]} />
              </View>
              {children}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'column',
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  dragBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    opacity: 0.4,
  },
});
