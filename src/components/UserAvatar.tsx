import React from 'react';
import { View, Text, Image, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheet, ActionSheetAction } from './ActionSheet';
import { imageUtils } from '../utils/imageUtils';
import { authApi } from '../services/authApi';
import { storage } from '../utils/storage';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import { IconCamera } from './Icons';

export interface UserAvatarProps {
  size?: number;
  borderRadius?: number;
  showEditHint?: boolean;
  onSuccess?: (uri: string | undefined) => void;
}

export const UserAvatar: React.FC<UserAvatarProps> = (props) => {
  const theme = useTheme();
  const { currentUser, updateCurrentUser } = useApp();
  const [showSheet, setShowSheet] = React.useState(false);
  const avatar = currentUser?.avatar;
  const nickname = currentUser?.nickname || currentUser?.username || '用';

  const pick = async (source: 'gallery' | 'camera') => {
    try {
      let result: ImagePicker.ImagePickerResult | undefined;
      const options: ImagePicker.ImagePickerOptions = {
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      };
      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync(options);
      } else {
        result = await ImagePicker.launchImageLibraryAsync(options);
      }
      if (!result || result.canceled) return;
      const asset = (result as any).assets?.[0] || (result as any);
      const uri = asset?.uri || asset;
      if (!uri) return;
      const saved = await imageUtils.saveImageToAppDir(uri, 'avatars');
      try {
        await authApi.updateProfile({ avatar: saved });
      } catch (_authErr) {}
      await updateCurrentUser({ avatar: saved });
      try {
        await storage.appendUserLog({
          type: 'avatar-change',
          target: {
            kind: 'user',
            id: String(currentUser?.uid ?? currentUser?.username ?? 'local'),
            name: nickname,
          },
          meta: { from: source, uri: saved },
        });
      } catch (_logErr) {}
      props.onSuccess?.(saved);
    } catch (e: any) {
      Alert.alert('修改头像失败', e?.message || '');
    }
  };

  const remove = async () => {
    try {
      try {
        await authApi.updateProfile({ avatar: undefined });
      } catch (_authErr) {}
      await updateCurrentUser({ avatar: undefined });
      try {
        await storage.appendUserLog({
          type: 'avatar-change',
          target: {
            kind: 'user',
            id: String(currentUser?.uid ?? currentUser?.username ?? 'local'),
            name: nickname,
          },
          meta: { removed: true },
        });
      } catch (_logErr) {}
      props.onSuccess?.(undefined);
    } catch (e: any) {
      Alert.alert('移除头像失败', e?.message || '');
    }
  };

  const size = props.size ?? 64;
  const radius = props.borderRadius ?? size;

  const actions: ActionSheetAction[] = [
    { label: '从相册选择', onPress: () => { setShowSheet(false); setTimeout(() => pick('gallery'), 260); } },
    { label: '拍照', onPress: () => { setShowSheet(false); setTimeout(() => pick('camera'), 260); } },
    ...(avatar
      ? [{ label: '移除头像', destructive: true as const, onPress: () => { setShowSheet(false); setTimeout(remove, 260); } }]
      : []),
  ];

  return (
    <View>
      <TouchableOpacity
        onPress={() => setShowSheet(true)}
        activeOpacity={0.85}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: theme.secondaryColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {avatar ? (
          <Image source={{ uri: avatar }} style={{ width: size, height: size, borderRadius: radius }} />
        ) : (
          <Text style={{ color: theme.accentColor, fontSize: Math.floor(size * 0.4), fontWeight: '700' }}>
            {nickname ? nickname.charAt(0) : '用'}
          </Text>
        )}
        {props.showEditHint && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              paddingVertical: 2,
              alignItems: 'center',
            }}
          >
            <IconCamera size={14} color="#fff" />
          </View>
        )}
      </TouchableOpacity>
      <ActionSheet
        visible={showSheet}
        title="设置头像"
        onClose={() => setShowSheet(false)}
        actions={actions}
        theme={theme}
      />
    </View>
  );
};
