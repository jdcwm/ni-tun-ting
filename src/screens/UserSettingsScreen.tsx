import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Alert, Image, Modal, Animated } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { IconClose, IconUser, IconCamera, IconEdit, IconCheck, IconGlobe, IconWifi, IconTrash, IconPalette, IconChevronRight } from '../components/Icons';
import { UserAvatar } from '../components/UserAvatar';

const SCREEN_W = Dimensions.get('window').width;

interface UserSettingsScreenProps {
  onClose: () => void;
}

type TabType = 'profile' | 'appearance' | 'about';

const PRESET_BACKGROUNDS = [
  { id: 'bg1', color: '#1a1a2e', gradient: ['#1a1a2e', '#16213e'] },
  { id: 'bg2', color: '#0f3460', gradient: ['#0f3460', '#533483'] },
  { id: 'bg3', color: '#16213e', gradient: ['#16213e', '#0f3460'] },
  { id: 'bg4', color: '#2d1b69', gradient: ['#2d1b69', '#1a0033'] },
  { id: 'bg5', color: '#0d1b2a', gradient: ['#0d1b2a', '#1b263b'] },
  { id: 'bg6', color: '#222831', gradient: ['#222831', '#393e46'] },
];

const ACCENT_COLORS = [
  '#ff6b9d',
  '#00ffaa',
  '#4a9eff',
  '#ffaa00',
  '#9932cc',
  '#ff4757',
  '#2ed573',
  '#eccc68',
  '#a29bfe',
  '#fd79a8',
];

export const UserSettingsScreen: React.FC<UserSettingsScreenProps> = ({ onClose }) => {
  const theme = useTheme();
  const { userProfile, updateUserProfile, settings, setSettings } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [editForm, setEditForm] = useState({
    username: userProfile?.username || '',
    avatar: userProfile?.avatar || '',
  });
  const [serverStatus, setServerStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [serverLatency, setServerLatency] = useState<number>(0);
  const [backgroundPickerVisible, setBackgroundPickerVisible] = useState(false);
  const [urlInputVisible, setUrlInputVisible] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [urlInputCallback, setUrlInputCallback] = useState<((url: string) => void) | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useState(new Animated.Value(0))[0];

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const checkServer = async () => {
    setServerStatus('checking');
    const startTime = Date.now();
    try {
      await fetch('https://api.github.com', { method: 'HEAD' });
      const latency = Date.now() - startTime;
      setServerLatency(latency);
      setServerStatus('online');
    } catch {
      setServerLatency(Date.now() - startTime);
      setServerStatus('offline');
    }
  };

  React.useEffect(() => {
    checkServer();
  }, []);

  const handleSave = () => {
    if (!editForm.username.trim()) {
      Alert.alert('错误', '请输入用户名');
      return;
    }

    updateUserProfile({
      username: editForm.username.trim(),
      avatar: editForm.avatar,
    });
    setIsEditing(false);
    showToast('资料已更新');
  };

  const openUrlInput = (callback: (url: string) => void, placeholder: string) => {
    setUrlInputCallback(() => callback);
    setUrlInputValue('');
    setUrlInputVisible(true);
  };

  const handleUrlSubmit = () => {
    if (urlInputCallback && urlInputValue.trim()) {
      urlInputCallback(urlInputValue.trim());
    }
    setUrlInputVisible(false);
    setUrlInputCallback(null);
  };

  const handlePickAvatar = async () => {
    Alert.alert('更换头像', '选择头像来源', [
      {
        text: '从相册选择',
        onPress: async () => {
          try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
              Alert.alert('权限错误', '需要相册权限才能选择图片');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              const uri = result.assets[0].uri;
              setEditForm((prev) => ({ ...prev, avatar: uri }));
              if (isEditing) {
                // Don't auto-save while editing
              } else {
                updateUserProfile({ avatar: uri });
                showToast('头像已更新');
              }
            }
          } catch (err) {
            Alert.alert('错误', '无法访问相册');
          }
        },
      },
      {
        text: '拍照',
        onPress: async () => {
          try {
            const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
            if (!permissionResult.granted) {
              Alert.alert('权限错误', '需要相机权限才能拍照');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              const uri = result.assets[0].uri;
              setEditForm((prev) => ({ ...prev, avatar: uri }));
              if (!isEditing) {
                updateUserProfile({ avatar: uri });
                showToast('头像已更新');
              }
            }
          } catch (err) {
            Alert.alert('错误', '无法打开相机');
          }
        },
      },
      {
        text: '输入URL',
        onPress: () => {
          openUrlInput((url) => {
            setEditForm((prev) => ({ ...prev, avatar: url }));
            if (!isEditing) {
              updateUserProfile({ avatar: url });
              showToast('头像已更新');
            }
          }, '请输入头像图片地址');
        },
      },
      { text: '移除头像', style: 'destructive', onPress: () => handleRemoveAvatar() },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const handleRemoveAvatar = () => {
    Alert.alert('移除头像', '确定要移除当前头像吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: () => {
          setEditForm((prev) => ({ ...prev, avatar: '' }));
          updateUserProfile({ avatar: undefined });
          showToast('头像已移除');
        },
      },
    ]);
  };

  const handlePickBackground = async () => {
    Alert.alert('选择背景', '选择背景图片来源', [
      {
        text: '从相册选择',
        onPress: async () => {
          try {
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permissionResult.granted) {
              Alert.alert('权限错误', '需要相册权限才能选择图片');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              const uri = result.assets[0].uri;
              setSettings({ ...settings, conversation: { ...settings.conversation, backgroundImage: uri } });
              showToast('背景已更新');
            }
          } catch (err) {
            Alert.alert('错误', '无法访问相册');
          }
        },
      },
      { text: '预设背景', onPress: () => setBackgroundPickerVisible(true) },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const handleRemoveBackground = () => {
    Alert.alert('移除背景', '确定要移除当前背景图片吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: () => {
          setSettings({ ...settings, conversation: { ...settings.conversation, backgroundImage: undefined } });
          showToast('背景已移除');
        },
      },
    ]);
  };

  const selectPresetBackground = (bg: typeof PRESET_BACKGROUNDS[0]) => {
    setBackgroundPickerVisible(false);
    const bgData = {
      type: 'preset' as const,
      id: bg.id,
      color: bg.color,
      gradient: bg.gradient,
    };
    setSettings({ ...settings, conversation: { ...settings.conversation, backgroundImage: JSON.stringify(bgData) } });
    showToast('背景已更新');
  };

  const getStatusColor = () => {
    switch (serverStatus) {
      case 'online': return '#00ff00';
      case 'offline': return '#ff0000';
      default: return '#ffaa00';
    }
  };

  const getStatusText = () => {
    switch (serverStatus) {
      case 'online': return `在线 (${serverLatency}ms)`;
      case 'offline': return '离线';
      default: return '检测中...';
    }
  };

  const generateUserId = () => {
    const newId = 'USER-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    updateUserProfile({ userId: newId });
    Alert.alert('用户编号已生成', `你的新编号是: ${newId}`);
  };

  const getBackgroundDisplay = () => {
    const bg = settings.conversation?.backgroundImage;
    if (!bg) return null;
    try {
      const parsed = JSON.parse(bg);
      if (parsed.type === 'preset' && parsed.color) {
        return { isPreset: true, color: parsed.color, gradient: parsed.gradient };
      }
    } catch {
      return { isPreset: false, uri: bg };
    }
    return null;
  };

  const bgDisplay = getBackgroundDisplay();

  const renderProfileTab = () => (
    <>
      {/* 用户信息卡片 */}
      <View style={[styles.profileCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        <View style={styles.avatarSection}>
          <UserAvatar size={80} showEditHint />
        </View>

        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.username, { color: theme.textColor }]}>
              {userProfile?.username || '未设置'}
            </Text>
            <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.editBtn}>
              <IconEdit size={18} color={theme.accentColor} />
            </TouchableOpacity>
          </View>

          {userProfile?.userId ? (
            <View style={[styles.userIdBadge, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.userIdText, { color: theme.subTextColor }]}>
                ID: {userProfile.userId}
              </Text>
            </View>
          ) : (
            <TouchableOpacity onPress={generateUserId} style={[styles.generateBtn, { backgroundColor: theme.accentColor }]}>
              <Text style={styles.generateBtnText}>生成用户编号</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 服务器状态 */}
      <View style={[styles.serverCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        <View style={styles.serverHeader}>
          <View style={styles.serverStatusRow}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
            <Text style={[styles.serverStatusText, { color: theme.textColor }]}>服务器状态</Text>
          </View>
          <TouchableOpacity onPress={checkServer} style={styles.refreshBtn}>
            <IconWifi size={18} color={theme.accentColor} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.serverStatusValue, { color: getStatusColor() }]}>
          {getStatusText()}
        </Text>

        <View style={[styles.speedBar, { backgroundColor: theme.secondaryColor }]}>
          <View
            style={[
              styles.speedFill,
              {
                backgroundColor: serverStatus === 'online'
                  ? theme.accentColor
                  : serverStatus === 'checking'
                    ? '#ffaa00'
                    : '#ff0000',
                width: serverStatus === 'online'
                  ? `${Math.max(20, 100 - serverLatency / 5)}%`
                  : serverStatus === 'offline' ? '100%' : '50%',
              },
            ]}
          />
        </View>
      </View>

      {/* 账户设置 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>账户设置</Text>

        <View style={[styles.settingsList, { backgroundColor: theme.primaryColor }]}>
          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => setIsEditing(true)}
          >
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>用户名</Text>
            <View style={styles.settingValueRow}>
              <Text style={[styles.settingValue, { color: theme.subTextColor }]}>
                {userProfile?.username || '未设置'}
              </Text>
              <IconChevronRight size={16} color={theme.subTextColor} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}
            onPress={generateUserId}
          >
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>用户编号</Text>
            <View style={styles.settingValueRow}>
              <Text style={[styles.settingValue, { color: theme.subTextColor }]}>
                {userProfile?.userId || '点击生成'}
              </Text>
              <IconChevronRight size={16} color={theme.subTextColor} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}
            onPress={handlePickAvatar}
          >
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>更换头像</Text>
            <View style={styles.settingValueRow}>
              <Text style={[styles.settingValue, { color: theme.subTextColor }]}>
                {userProfile?.avatar ? '已设置' : '未设置'}
              </Text>
              <IconChevronRight size={16} color={theme.subTextColor} />
            </View>
          </TouchableOpacity>

          <View style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>加入时间</Text>
            <Text style={[styles.settingValue, { color: theme.subTextColor }]}>
              {userProfile?.createdAt
                ? new Date(userProfile.createdAt).toLocaleDateString('zh-CN')
                : '-'}
            </Text>
          </View>

          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>在线状态</Text>
            <View style={styles.settingValueRow}>
              <View style={[styles.statusPill, { backgroundColor: userProfile?.isOnline ? '#00ff0030' : '#88888830' }]}>
                <View style={[styles.statusPillDot, { backgroundColor: userProfile?.isOnline ? '#00ff00' : '#888' }]} />
                <Text style={[styles.statusPillText, { color: userProfile?.isOnline ? '#00ff00' : '#888' }]}>
                  {userProfile?.isOnline ? '在线' : '离线'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </>
  );

  const renderAppearanceTab = () => (
    <>
      {/* 背景自定义 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>背景设置</Text>

        <View style={[styles.settingsList, { backgroundColor: theme.primaryColor }]}>
          <View style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>当前背景</Text>
            <View style={styles.currentBgPreview}>
              {bgDisplay ? (
                bgDisplay.isPreset ? (
                  <View style={[styles.bgPreview, { backgroundColor: bgDisplay.color }]} />
                ) : (
                  <Image source={{ uri: bgDisplay.uri }} style={styles.bgPreview} />
                )
              ) : (
                <View style={[styles.bgPreview, { backgroundColor: theme.secondaryColor }]} />
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}
            onPress={handlePickBackground}
          >
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>设置背景</Text>
            <View style={styles.settingValueRow}>
              <Text style={[styles.settingValue, { color: theme.subTextColor }]}>选择图片</Text>
              <IconChevronRight size={16} color={theme.subTextColor} />
            </View>
          </TouchableOpacity>

          {bgDisplay && (
            <TouchableOpacity
              style={styles.settingItem}
              onPress={handleRemoveBackground}
            >
              <Text style={[styles.settingLabel, { color: '#ff4444' }]}>移除背景</Text>
              <IconTrash size={16} color="#ff4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 显示设置 */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>显示设置</Text>

        <View style={[styles.settingsList, { backgroundColor: theme.primaryColor }]}>
          <View style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>字体大小</Text>
            <View style={styles.valueRow}>
              {[14, 16, 18, 20].map((size) => (
                  <TouchableOpacity
                    key={size}
                    onPress={() => setSettings({ ...settings, theme: { ...settings.theme, fontSize: size } })}
                    style={[
                      styles.sizeOption,
                      {
                        backgroundColor: settings.theme.fontSize === size ? settings.theme.accentColor : theme.secondaryColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sizeText,
                        { color: settings.theme.fontSize === size ? '#fff' : theme.textColor },
                      ]}
                    >
                      {size}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>

          <View style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>消息密度</Text>
            <View style={styles.valueRow}>
              {['紧凑', '正常', '宽松'].map((density, idx) => (
                  <TouchableOpacity
                    key={density}
                    onPress={() => setSettings({ ...settings, display: { ...settings.display, messageDensity: idx } })}
                    style={[
                      styles.sizeOption,
                      {
                        backgroundColor: (settings.display.messageDensity ?? 1) === idx ? settings.theme.accentColor : theme.secondaryColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sizeText,
                        { color: (settings.display.messageDensity ?? 1) === idx ? '#fff' : theme.textColor },
                      ]}
                    >
                      {density}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>

          <View style={[styles.settingItem]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>主题色</Text>
            <View style={styles.colorGrid}>
              {ACCENT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  onPress={() => {
                    setSettings({ ...settings, theme: { ...settings.theme, accentColor: color } });
                  }}
                  style={[
                    styles.colorDot,
                    {
                      backgroundColor: color,
                      borderColor: settings.theme.accentColor === color ? '#fff' : 'transparent',
                    },
                  ]}
                >
                  {settings.theme.accentColor === color && (
                    <IconCheck size={14} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>
    </>
  );

  const renderAboutTab = () => (
    <>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>关于</Text>

        <View style={[styles.settingsList, { backgroundColor: theme.primaryColor }]}>
          <View style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>版本</Text>
            <Text style={[styles.settingValue, { color: theme.subTextColor }]}>3.0.0</Text>
          </View>
          <View style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>构建时间</Text>
            <Text style={[styles.settingValue, { color: theme.subTextColor }]}>2024</Text>
          </View>
          <View style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>应用名称</Text>
            <Text style={[styles.settingValue, { color: theme.subTextColor }]}>AI 酒馆</Text>
          </View>
          <View style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>支持平台</Text>
            <Text style={[styles.settingValue, { color: theme.subTextColor }]}>iOS / Android / Web</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>法律信息</Text>

        <View style={[styles.settingsList, { backgroundColor: theme.primaryColor }]}>
          <TouchableOpacity style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>用户协议</Text>
            <IconChevronRight size={16} color={theme.subTextColor} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.settingItem, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>隐私政策</Text>
            <IconChevronRight size={16} color={theme.subTextColor} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>开源许可</Text>
            <IconChevronRight size={16} color={theme.subTextColor} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.versionFooter}>
        <Text style={[styles.versionText, { color: theme.subTextColor }]}>
          AI 酒馆 v3.0.0
        </Text>
        <Text style={[styles.versionSubtext, { color: theme.subTextColor }]}>
          © 2024 AI Tavern. All rights reserved.
        </Text>
      </View>
    </>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfileTab();
      case 'appearance':
        return renderAppearanceTab();
      case 'about':
        return renderAboutTab();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconClose size={24} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>个人设置</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab 切换 */}
      <View style={[styles.tabBar, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        {([
          { key: 'profile', label: '个人资料', icon: <IconUser size={16} color={activeTab === 'profile' ? theme.accentColor : theme.subTextColor} /> },
          { key: 'appearance', label: '外观', icon: <IconPalette size={16} color={activeTab === 'appearance' ? theme.accentColor : theme.subTextColor} /> },
          { key: 'about', label: '关于', icon: <IconGlobe size={16} color={activeTab === 'about' ? theme.accentColor : theme.subTextColor} /> },
        ] as const).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[
              styles.tabItem,
              activeTab === tab.key && { borderBottomColor: theme.accentColor },
            ]}
          >
            {tab.icon}
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.key ? theme.accentColor : theme.subTextColor },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>

      {/* 编辑信息弹窗 */}
      <Modal
        visible={isEditing}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setIsEditing(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>修改个人信息</Text>
              <TouchableOpacity onPress={() => setIsEditing(false)}>
                <IconClose size={20} color={theme.textColor} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalForm}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>用户名</Text>
                <TextInput
                  style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                  value={editForm.username}
                  onChangeText={(text) => setEditForm({ ...editForm, username: text })}
                  placeholder="输入用户名"
                  placeholderTextColor={theme.subTextColor}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>头像</Text>
                <View style={styles.formAvatarRow}>
                  {editForm.avatar ? (
                    <Image source={{ uri: editForm.avatar }} style={styles.formAvatar} />
                  ) : (
                    <View style={[styles.formAvatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                      <IconUser size={24} color={theme.subTextColor} />
                    </View>
                  )}
                  <View style={styles.formAvatarActions}>
                    <TouchableOpacity onPress={handlePickAvatar} style={[styles.formAvatarBtn, { backgroundColor: theme.accentColor }]}>
                      <IconCamera size={14} color="#fff" />
                      <Text style={styles.formAvatarBtnText}>更换</Text>
                    </TouchableOpacity>
                    {editForm.avatar ? (
                      <TouchableOpacity
                        onPress={() => setEditForm((prev) => ({ ...prev, avatar: '' }))}
                        style={[styles.formAvatarBtn, { backgroundColor: theme.secondaryColor }]}
                      >
                        <IconTrash size={14} color={theme.textColor} />
                        <Text style={[styles.formAvatarBtnText, { color: theme.textColor }]}>清除</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setIsEditing(false)}
                style={[styles.cancelBtn, { backgroundColor: theme.primaryColor }]}
              >
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                style={[styles.saveBtn, { backgroundColor: theme.accentColor }]}
              >
                <Text style={{ color: '#fff' }}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 预设背景选择器 */}
      <Modal
        visible={backgroundPickerVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setBackgroundPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>选择预设背景</Text>
              <TouchableOpacity onPress={() => setBackgroundPickerVisible(false)}>
                <IconClose size={20} color={theme.textColor} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.bgGrid}>
              {PRESET_BACKGROUNDS.map((bg) => (
                <TouchableOpacity
                  key={bg.id}
                  onPress={() => selectPresetBackground(bg)}
                  style={[styles.bgCard, { borderColor: theme.borderColor }]}
                >
                  <View
                    style={[
                      styles.bgCardPreview,
                      { backgroundColor: bg.color },
                    ]}
                  />
                  <Text style={[styles.bgCardLabel, { color: theme.textColor }]}>
                    {bg.id === 'bg1' ? '深邃夜空' :
                     bg.id === 'bg2' ? '蓝紫梦境' :
                     bg.id === 'bg3' ? '深蓝海洋' :
                     bg.id === 'bg4' ? '神秘紫夜' :
                     bg.id === 'bg5' ? '沉稳深灰' : '暗调石墨'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* URL 输入弹窗 */}
      <Modal
        visible={urlInputVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setUrlInputVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>输入图片URL</Text>
              <TouchableOpacity onPress={() => setUrlInputVisible(false)}>
                <IconClose size={20} color={theme.textColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalForm}>
              <TextInput
                style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                value={urlInputValue}
                onChangeText={setUrlInputValue}
                placeholder="https://..."
                placeholderTextColor={theme.subTextColor}
                autoFocus
                onSubmitEditing={handleUrlSubmit}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setUrlInputVisible(false)}
                style={[styles.cancelBtn, { backgroundColor: theme.primaryColor }]}
              >
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUrlSubmit}
                style={[styles.saveBtn, { backgroundColor: theme.accentColor }]}
              >
                <Text style={{ color: '#fff' }}>确定</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast 提示 */}
      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <Text style={[styles.toastText, { color: theme.textColor }]}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 20,
    paddingBottom: 40,
  },
  profileCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    gap: 12,
  },
  avatarSection: {
    position: 'relative',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  avatarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  avatarActionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  avatarActionTextDanger: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  avatarActionTextLight: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  userInfo: {
    alignItems: 'center',
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  username: {
    fontSize: 22,
    fontWeight: '700',
  },
  editBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userIdBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  userIdText: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  generateBtn: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  generateBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  serverCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  serverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serverStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  serverStatusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  refreshBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serverStatusValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  speedBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  speedFill: {
    height: '100%',
    borderRadius: 3,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  settingsList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  settingLabel: {
    fontSize: 14,
    flex: 1,
  },
  settingValue: {
    fontSize: 14,
  },
  settingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  valueRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sizeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentBgPreview: {
    flexDirection: 'row',
    gap: 8,
  },
  bgPreview: {
    width: 50,
    height: 30,
    borderRadius: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 32,
  },
  modalContent: {
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalForm: {
    padding: 16,
    gap: 16,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
  },
  formInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
  },
  formAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  formAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  formAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formAvatarActions: {
    gap: 8,
  },
  formAvatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  formAvatarBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  bgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  bgCard: {
    width: '48%',
    aspectRatio: 2,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bgCardPreview: {
    flex: 1,
  },
  bgCardLabel: {
    padding: 6,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  versionFooter: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 4,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  versionSubtext: {
    fontSize: 12,
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    marginLeft: -100,
    width: 200,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
