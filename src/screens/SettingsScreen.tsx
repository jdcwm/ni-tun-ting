import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Image,
  PanResponder,
  ViewStyle,
  Keyboard,
  Platform,
  LayoutChangeEvent,
  Switch,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { ThemedCard } from '../components/ThemedCard';
import { ThemedButton } from '../components/ThemedButton';
import { AIProvider, AIType, QuickCommand, AppSettings, ThinkingIndicatorConfig } from '../types';
import {
  IconEye, IconEyeOff, IconUserCircle, IconFont, IconInputBox, IconSun, IconMoon,
  IconCopy, IconStar, IconRefresh, IconSummarize, IconEdit, IconTrash, IconClose,
  IconSend, IconSearch, IconMenu, IconImage, IconPlus, IconSettings, IconMore,
  IconDown, IconUp, IconShare, IconDownload, IconUpload, IconBack, IconForward,
  IconBrowser, IconCheck, IconX, IconCamera, IconUser, IconAI, IconGlobe, IconWifi,
  IconCpu, IconDatabase, IconZap, IconPalette, IconInbox, IconChevronRight,
  IconFavoriteMsg, IconFavoriteChat, IconWorldBook, IconTheme, IconPin, IconStop,
} from '../components/Icons';
import { generateId } from '../constants/defaults';
import { imageUtils } from '../utils/imageUtils';
import { testConnection as _testConnection, ErrorKind } from '../utils/networkUtils';
import { aiService } from '../services/aiService';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { storage } from '../utils/storage';
import { ThemedAlert } from '../components/MessageActionSheet';

const getErrorTips = (kind?: ErrorKind): string => {
  switch (kind) {
    case 'no_api_key':
      return '请填写 API 密钥';
    case 'no_base_url':
      return '请填写 API 主机地址';
    case 'timeout':
      return '1. 检查网络是否正常\n2. 服务器可能很慢，可稍后重试\n3. 确认 API 地址是否正确（注意不要带 /v1 后的路径）';
    case 'network':
      return '1. 检查 WiFi/移动数据是否开启\n2. 关闭代理或切换网络\n3. 确认 API 地址在浏览器中可以打开';
    case 'dns':
      return '1. 域名拼写是否正确\n2. 是否需要使用 IP 而非域名\n3. 切换到公共 DNS（如 8.8.8.8）';
    case 'ssl':
      return '1. 服务器证书可能过期或无效\n2. 可尝试使用 http:// 而非 https://\n3. 联系 API 提供方';
    case 'cors':
      return '1. 大多数 API 不允许浏览器直接访问\n2. 但本应用使用原生 fetch 通常不受影响\n3. 如果是自建服务，请在服务端开启 CORS';
    case 'auth':
      return '1. 检查 API 密钥是否复制完整（注意首尾空格）\n2. 密钥是否已过期或被吊销\n3. 账户是否欠费';
    case 'rate_limit':
      return '1. 请求过于频繁，请稍候重试\n2. 升级套餐或减少并发';
    case 'quota':
      return '1. API 余额不足\n2. 前往 API 控制台充值或切换账户';
    case 'server':
      return '1. API 服务器暂时不可用\n2. 几分钟后重试\n3. 查看 API 服务状态页';
    default:
      return '1. 检查网络连接\n2. 确认 API 主机和密钥正确\n3. 稍后重试';
  }
};

const colorPresets = [
  '#e94560', '#0f3460', '#533483', '#1aacac', '#ff6b35',
  '#2ec4b6', '#ffd93d', '#6bcb77', '#4d96ff', '#9d4edd',
];

const bgPresets = [
  '#1a1a2e', '#0f0f1a', '#2d2d44', '#1e3a5f', '#1a2f1a',
  '#2d1f2d', '#ffffff', '#f5f5f5', '#fff5e6', '#e8f5e9',
];

const typeLabels: Record<string, string> = {
  text: '文字对话',
  image: '图片生成',
  vision: '图像识别',
  summary: '对话总结',
  function_calling: '函数调用',
  streaming: '流式输出',
  reasoning: '深度推理',
  audio: '音频处理',
};

const modeLabels: Record<string, string> = {
  openai: 'OpenAI 兼容',
  anthropic: 'Claude',
  gemini: 'Gemini',
  ollama: 'Ollama本地',
  azure: 'Azure',
  custom: '自定义',
};

const fontFamilyOptions = [
  { label: '系统默认', value: undefined, preview: 'Aa 中文字体' },
  { label: '无衬线体', value: 'sans-serif', preview: 'Aa Sans Serif 中文' },
  { label: '衬线体', value: 'serif', preview: 'Aa Serif 中文衬线' },
  { label: '等宽字体', value: 'monospace', preview: 'Aa Monospace 等宽' },
  { label: 'PingFang SC', value: 'PingFang SC', preview: '苹方 PingFang SC' },
  { label: 'Hiragino', value: 'Hiragino Sans GB', preview: '冬青黑体 Hiragino' },
  { label: 'Noto Sans', value: 'Noto Sans CJK SC', preview: '思源黑体 Noto Sans' },
  { label: 'Noto Serif', value: 'Noto Serif CJK SC', preview: '思源宋体 Noto Serif' },
];

const borderStyleOptions = [
  { label: '实线', value: 'solid' as const },
  { label: '虚线', value: 'dashed' as const },
  { label: '点线', value: 'dotted' as const },
  { label: '无边', value: 'none' as const },
];

const buttonPatternOptions = [
  { label: '圆角', value: 'rounded' as const },
  { label: '方形', value: 'square' as const },
  { label: '胶囊', value: 'pill' as const },
  { label: '描边', value: 'outline' as const },
  { label: '阴影', value: 'shadow' as const },
  { label: '渐变', value: 'gradient' as const },
];

const inputBorderColorPresets = [
  '#e0e0e0', '#cccccc', '#999999', '#666666', '#333333', '#ff6b35', '#4d96ff', '#9d4edd',
];

const inputBgColorPresets = [
  '#ffffff', '#f5f5f5', '#f0f0f0', '#e8f5e9', '#fff5e6', '#1a1a2e', '#16213e', '#0f3460',
];

const buttonBorderColorPresets = [
  '#e0e0e0', '#cccccc', '#999999', '#666666', '#333333', '#ff6b35', '#4d96ff', '#9d4edd',
];

interface SettingsScreenProps {
  onClose?: () => void;
  /** 跳转时聚焦到指定区块 */
  focusSection?: 'appearance' | 'theme' | 'splash' | 'input' | 'display' | 'aiThinking' | 'buttons';
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose, focusSection }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  /** 交流群信息 */
  const QQ_GROUP_NUMBER = '1101925715';
  const QQ_GROUP_URL = 'https://qm.qq.com/q/N2GMl3laIa';
  /**
   * 一键加群。
   *
   * 依次尝试：
   *  1. mqqapi:// 直接唤起 QQ 打开这个群的群卡片（最直接，进群就在眼前）
   *  2. https://qm.qq.com/q/... 官方加群链接（QQ 装了就能接）
   *  3. 都不行 → 把群号复制到剪贴板并提示手动搜索
   */
  const handleJoinQQGroup = async () => {
    const mqq = `mqqapi://card/show_pslcard?src_type=internal&version=1&uin=${QQ_GROUP_NUMBER}&card_type=group&source=qrcode`;
    const candidates = [mqq, QQ_GROUP_URL];
    for (const url of candidates) {
      try {
        if (await Linking.canOpenURL(url)) {
          await Linking.openURL(url);
          return;
        }
      } catch {
        /* 试下一个 */
      }
    }
    // 打不开 QQ：复制群号兜底
    try {
      await Clipboard.setStringAsync(QQ_GROUP_NUMBER);
      Alert.alert(
        '没能打开 QQ',
        `已把群号复制到剪贴板：${QQ_GROUP_NUMBER}\n\n打开 QQ → 加群/找群 → 搜索该群号即可加入「幻想入界（东方Project AI模拟交流群）」。`,
      );
    } catch {
      Alert.alert('加群信息', `请手动在 QQ 里搜索群号：${QQ_GROUP_NUMBER}`);
    }
  };

  // Android 键盘跟随：供应商编辑弹窗内输入框聚焦时底部内容不被键盘遮挡
  const [modalKeyboardHeight, setModalKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setModalKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setModalKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const {
    settings,
    updateTheme,
    setSettings,
    providers,
    setProviders,
    exportAllData,
    exportAllDataWithMedia,
    importAllData,
    userProfile,
    updateUserProfile,
    isDarkMode,
    setDarkMode,
    toggleTheme,
    chats,
  } = useApp();
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string; message?: string; confirmText?: string; cancelText?: string;
    onConfirm?: () => void; onCancel?: () => void;
  }>({ title: '' });
  const showAlert = (
    title: string,
    message?: string,
    opts?: { confirmText?: string; cancelText?: string; onConfirm?: () => void; onCancel?: () => void },
  ) => {
    setAlertConfig({ title, message, ...opts });
    setAlertVisible(true);
  };

  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [providerForm, setProviderForm] = useState({
    name: '',
    capabilities: ['text'] as string[],
    apiKey: '',
    baseUrl: '',
    apiPath: '/chat/completions',
    model: '',
    mode: 'openai',
    format: 'openai' as 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'azure' | 'custom',
    avatar: '',
  });
  const [modelList, setModelList] = useState<string[]>([]);
  const [showModelForm, setShowModelForm] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [editingCommand, setEditingCommand] = useState<QuickCommand | null>(null);
  const [commandForm, setCommandForm] = useState({ name: '', content: '' });
  const [checkingApi, setCheckingApi] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [customColorKey, setCustomColorKey] = useState<string | null>(null);
  const [customColorValue, setCustomColorValue] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showFontFamilyModal, setShowFontFamilyModal] = useState(false);
  const [showBorderColorPicker, setShowBorderColorPicker] = useState(false);
  const [showInputBgColorPicker, setShowInputBgColorPicker] = useState(false);
  const [showButtonBorderColorPicker, setShowButtonBorderColorPicker] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState('');

  // 滚动到指定区块
  const scrollViewRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  const setSectionRef = (key: string) => (ref: View | null) => {
    if (ref) {
      ref.measure((_x, _y, _w, h, pageX, pageY) => {
        sectionOffsets.current[key] = pageY - 80;
      });
    }
  };

  useEffect(() => {
    if (focusSection && sectionOffsets.current[focusSection] !== undefined) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: sectionOffsets.current[focusSection] || 0, animated: true });
      }, 300);
    }
  }, [focusSection]);

  // ===== 自定义按钮图标：key -> 预览组件 + 中文标签 =====
  const BUTTON_ICON_DEFS: Array<{ key: string; label: string; Preview: React.ComponentType<any> }> = [
    { key: 'send', label: '发送', Preview: (p: any) => <IconSend {...p} /> },
    { key: 'refresh', label: '重试/重新生成', Preview: (p: any) => <IconRefresh {...p} /> },
    { key: 'copy', label: '复制', Preview: (p: any) => <IconCopy {...p} /> },
    { key: 'edit', label: '编辑', Preview: (p: any) => <IconEdit {...p} /> },
    { key: 'favoriteMsg', label: '收藏消息', Preview: (p: any) => <IconFavoriteMsg {...p} /> },
    { key: 'favoriteChat', label: '收藏对话', Preview: (p: any) => <IconFavoriteChat {...p} /> },
    { key: 'star', label: '星标', Preview: (p: any) => <IconStar {...p} /> },
    { key: 'trash', label: '删除', Preview: (p: any) => <IconTrash {...p} /> },
    { key: 'search', label: '搜索', Preview: (p: any) => <IconSearch {...p} /> },
    { key: 'menu', label: '抽屉菜单', Preview: (p: any) => <IconMenu {...p} /> },
    { key: 'settings', label: '设置', Preview: (p: any) => <IconSettings {...p} /> },
    { key: 'image', label: '图片上传', Preview: (p: any) => <IconImage {...p} /> },
    { key: 'plus', label: '新建/+', Preview: (p: any) => <IconPlus {...p} /> },
    { key: 'more', label: '更多', Preview: (p: any) => <IconMore {...p} /> },
    { key: 'summarize', label: '总结', Preview: (p: any) => <IconSummarize {...p} /> },
    { key: 'eye', label: '显示/展开', Preview: (p: any) => <IconEye {...p} /> },
    { key: 'eyeOff', label: '隐藏/收起', Preview: (p: any) => <IconEyeOff {...p} /> },
    { key: 'down', label: '回到底部', Preview: (p: any) => <IconDown {...p} /> },
    { key: 'up', label: '向上', Preview: (p: any) => <IconUp {...p} /> },
    { key: 'share', label: '分享', Preview: (p: any) => <IconShare {...p} /> },
    { key: 'download', label: '下载', Preview: (p: any) => <IconDownload {...p} /> },
    { key: 'upload', label: '上传', Preview: (p: any) => <IconUpload {...p} /> },
    { key: 'back', label: '返回', Preview: (p: any) => <IconBack {...p} /> },
    { key: 'forward', label: '前进', Preview: (p: any) => <IconForward {...p} /> },
    { key: 'browser', label: '打开角色卡获取', Preview: (p: any) => <IconBrowser {...p} /> },
    { key: 'check', label: '确认/完成', Preview: (p: any) => <IconCheck {...p} /> },
    { key: 'close', label: '关闭', Preview: (p: any) => <IconClose {...p} /> },
    { key: 'stop', label: '停止生成', Preview: (p: any) => <IconStop {...p} /> },
    { key: 'camera', label: '拍照', Preview: (p: any) => <IconCamera {...p} /> },
    { key: 'user', label: '用户气泡', Preview: (p: any) => <IconUser {...p} /> },
    { key: 'ai', label: 'AI 气泡', Preview: (p: any) => <IconAI {...p} /> },
    { key: 'theme', label: '主题', Preview: (p: any) => <IconTheme {...p} /> },
    { key: 'sun', label: '日间', Preview: (p: any) => <IconSun {...p} /> },
    { key: 'moon', label: '夜间', Preview: (p: any) => <IconMoon {...p} /> },
    { key: 'worldBook', label: '世界书', Preview: (p: any) => <IconWorldBook {...p} /> },
    { key: 'globe', label: '网络搜索', Preview: (p: any) => <IconGlobe {...p} /> },
    { key: 'zap', label: '快捷指令', Preview: (p: any) => <IconZap {...p} /> },
    { key: 'pin', label: '置顶', Preview: (p: any) => <IconPin {...p} /> },
    { key: 'chevronRight', label: '箭头 >', Preview: (p: any) => <IconChevronRight {...p} /> },
    { key: 'upload', label: '导入/上传', Preview: (p: any) => <IconUpload {...p} /> },
  ];
  // 去重（key 相同的保留第一条）
  const BUTTON_ICON_DEFS_UNIQUE = BUTTON_ICON_DEFS.filter((it, i, arr) => arr.findIndex((x) => x.key === it.key) === i);

  const handleColorChange = (colorKey: keyof typeof theme, color: string) => {
    updateTheme({ [colorKey]: color } as any);
  };

  const handleFontSizeChange = (delta: number) => {
    const newSize = Math.max(12, Math.min(24, theme.fontSize + delta));
    updateTheme({ fontSize: newSize });
  };

  const handleStatusBarSizeChange = (delta: number) => {
    const newSize = Math.max(20, Math.min(50, theme.statusBarSize + delta));
    updateTheme({ statusBarSize: newSize });
  };

  const pickWallpaper = async () => {
    const uri = await imageUtils.pickImageFromGallery();
    if (uri) {
      const savedUri = await imageUtils.saveImageToAppDir(uri, 'wallpapers');
      updateTheme({ wallpaper: savedUri });
    }
  };

  const removeWallpaper = () => {
    updateTheme({ wallpaper: undefined });
  };

  const pickButtonIcon = async (iconKey: string) => {
    try {
      const uri = await imageUtils.pickAnyMediaFromGallery();
      if (!uri) return;
      const savedUri = await imageUtils.saveMediaToAppDir(uri, 'buttonIcons');
      const next: AppSettings = {
        ...settings,
        customButtonIcons: { ...(settings.customButtonIcons || {}), [iconKey]: savedUri },
      };
      await setSettings(next);
    } catch (e) {
      Alert.alert('错误', '设置按钮图标失败');
    }
  };

  const clearButtonIcon = async (iconKey: string) => {
    try {
      const map = { ...(settings.customButtonIcons || {}) };
      const old = map[iconKey];
      delete map[iconKey];
      const next: AppSettings = { ...settings, customButtonIcons: map };
      await setSettings(next);
      if (old && imageUtils.deleteImage) imageUtils.deleteImage(old).catch(() => {});
    } catch (e) {
      Alert.alert('错误', '清除按钮图标失败');
    }
  };

  const clearAllButtonIcons = async () => {
    try {
      const map = { ...(settings.customButtonIcons || {}) };
      const uris = Object.values(map).filter(Boolean) as string[];
      const next: AppSettings = { ...settings, customButtonIcons: {} };
      await setSettings(next);
      uris.forEach((u) => imageUtils.deleteImage && imageUtils.deleteImage(u).catch(() => {}));
    } catch (e) {
      Alert.alert('错误', '清除全部失败');
    }
  };

  // ===== 「AI思考中」占位态自定义 =====
  const updateThinkingIndicator = async (patch: Partial<ThinkingIndicatorConfig>) => {
    const cur: ThinkingIndicatorConfig = settings.thinkingIndicator || {};
    const next: AppSettings = { ...settings, thinkingIndicator: { ...cur, ...patch } };
    await setSettings(next);
  };
  const pickThinkingImage = async () => {
    try {
      const uri = await imageUtils.pickAnyMediaFromGallery();
      if (!uri) return;
      const savedUri = await imageUtils.saveMediaToAppDir(uri, 'thinkingIndicator');
      await updateThinkingIndicator({ imageUri: savedUri });
    } catch (e) {
      Alert.alert('错误', '设置图片失败');
    }
  };
  const clearThinkingImage = async () => {
    const old = settings.thinkingIndicator?.imageUri;
    await updateThinkingIndicator({ imageUri: undefined });
    if (old) imageUtils.deleteImage(old).catch(() => {});
  };
  const resetThinkingIndicator = async () => {
    const old = settings.thinkingIndicator?.imageUri;
    await setSettings({ ...settings, thinkingIndicator: undefined });
    if (old) imageUtils.deleteImage(old).catch(() => {});
  };

  const pickAvatar = async () => {
    try {
      const uri = await imageUtils.pickAvatarFromGallery();
      if (uri) {
        const savedUri = await imageUtils.saveImageToAppDir(uri, 'avatars');
        updateUserProfile({ avatar: savedUri });
      }
    } catch (error) {
      Alert.alert('错误', '选择头像失败');
    }
  };

  const saveUsername = () => {
    const trimmed = tempUsername.trim();
    if (trimmed) {
      updateUserProfile({ username: trimmed });
    }
    setEditingUsername(false);
  };

  const parseBaseUrl = (url: string) => {
    if (!url) return { host: '', path: '/chat/completions' };
    const match = url.match(/^(https?:\/\/[^/]+)(\/.*)$/);
    if (match) {
      return { host: match[1], path: match[2] };
    }
    return { host: url.replace(/\/$/, ''), path: '/chat/completions' };
  };

  const buildBaseUrl = (host: string, path: string) => {
    const h = host.trim().replace(/\/$/, '');
    const p = path.trim();
    return h + p;
  };

  const openAddProvider = () => {
    setEditingProvider(null);
    setProviderForm({
      name: '',
      capabilities: ['text'],
      apiKey: '',
      baseUrl: '',
      apiPath: '/chat/completions',
      model: '',
      mode: 'openai',
      format: 'openai',
      avatar: '',
    });
    setModelList([]);
    setShowProviderModal(true);
  };

  const openEditProvider = (provider: AIProvider) => {
    setEditingProvider(provider);
    const { host, path } = parseBaseUrl(provider.baseUrl);
    const fmt = (provider as any).format || 'openai';
    setProviderForm({
      name: provider.name,
      capabilities: [...provider.capabilities],
      apiKey: provider.apiKey,
      baseUrl: host,
      apiPath: path || '/chat/completions',
      model: provider.model,
      mode: fmt,
      format: fmt,
      avatar: provider.avatar || '',
    });
    setModelList(provider.model ? [provider.model] : []);
    setShowProviderModal(true);
  };

  const saveProvider = () => {
    if (!providerForm.name.trim()) {
      Alert.alert('提示', '请输入名称');
      return;
    }
    if (!providerForm.baseUrl.trim()) {
      Alert.alert('提示', '请输入 API 主机');
      return;
    }
    if (providerForm.capabilities.length === 0) {
      Alert.alert('提示', '请至少选择一个能力');
      return;
    }

    const fullUrl = buildBaseUrl(providerForm.baseUrl, providerForm.apiPath);
    const data = {
      name: providerForm.name.trim(),
      capabilities: providerForm.capabilities,
      apiKey: providerForm.apiKey,
      baseUrl: fullUrl,
      model: providerForm.model,
      format: providerForm.format,
      avatar: providerForm.avatar || undefined,
    };

    if (editingProvider) {
      const updated = providers.map((p: AIProvider) =>
        p.id === editingProvider.id ? { ...p, ...data } : p
      );
      setProviders(updated);
    } else {
      const newProvider: AIProvider = {
        id: generateId(),
        ...data,
        models: [],
        isFavorite: false,
      };
      setProviders([...providers, newProvider]);
    }
    setShowProviderModal(false);
  };

  const deleteProvider = (id: string) => {
    Alert.alert('确认删除', '确定要删除这个 AI 提供商吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setProviders(providers.filter((p) => p.id !== id));
        },
      },
    ]);
  };

  const toggleFavorite = (id: string) => {
    setProviders(
      providers.map((p) => (p.id === id ? { ...p, isFavorite: !p.isFavorite } : p))
    );
  };

  const checkApi = async () => {
    if (!providerForm.apiKey || !providerForm.baseUrl) {
      Alert.alert('提示', '请先填写 API 密钥和主机');
      return;
    }
    setCheckingApi(true);
    const fullUrl = buildBaseUrl(providerForm.baseUrl, providerForm.apiPath);
    const result = await aiService.testConnection(fullUrl, providerForm.apiKey, providerForm.format);
    setCheckingApi(false);

    if (result.ok) {
      Alert.alert(
        '✅ 连接成功',
        `延迟: ${result.latency}ms\n\n提示：接下来可以点击"获取"拉取可用模型，或手动新建模型名称`
      );
    } else {
      const tips = getErrorTips((result as any).errorKind);
      Alert.alert(
        '❌ 连接失败',
        `${result.error}\n\n💡 建议：\n${tips}`
      );
    }
  };

  const fetchModels = async () => {
    if (!providerForm.apiKey || !providerForm.baseUrl) {
      Alert.alert('提示', '请先填写 API 密钥和主机');
      return;
    }
    setCheckingApi(true);
    const fullUrl = buildBaseUrl(providerForm.baseUrl, providerForm.apiPath);
    const result = await aiService.fetchModels(fullUrl, providerForm.apiKey, providerForm.format);
    setCheckingApi(false);

    if (result.error) {
      Alert.alert('获取失败', `${result.error}\n\n💡 建议：\n${getErrorTips()}`);
      return;
    }

    setModelList(result.models);
    if (result.models.length > 0 && !providerForm.model) {
      setProviderForm({ ...providerForm, model: result.models[0] });
    } else if (result.models.length === 0) {
      Alert.alert('提示', '该 API 未返回模型列表，请手动添加');
    }
  };

  const addModel = () => {
    if (!newModelName.trim()) return;
    if (!modelList.includes(newModelName.trim())) {
      setModelList([...modelList, newModelName.trim()]);
    }
    setProviderForm({ ...providerForm, model: newModelName.trim() });
    setNewModelName('');
    setShowModelForm(false);
  };

  const removeModel = (modelName: string) => {
    setModelList(modelList.filter((m) => m !== modelName));
    if (providerForm.model === modelName) {
      setProviderForm({ ...providerForm, model: '' });
    }
  };

  const resetModels = () => {
    setModelList([]);
    setProviderForm({ ...providerForm, model: '' });
  };

  const openAddCommand = () => {
    setEditingCommand(null);
    setCommandForm({ name: '', content: '' });
    setShowCommandModal(true);
  };

  const openEditCommand = (cmd: QuickCommand) => {
    setEditingCommand(cmd);
    setCommandForm({ name: cmd.name, content: cmd.content });
    setShowCommandModal(true);
  };

  const saveCommand = () => {
    if (!commandForm.name.trim() || !commandForm.content.trim()) {
      Alert.alert('提示', '请填写名称和内容');
      return;
    }

    let newCommands = [...settings.quickCommands];

    if (editingCommand) {
      newCommands = newCommands.map((c) =>
        c.id === editingCommand.id ? { ...c, ...commandForm } : c
      );
    } else {
      const newCmd: QuickCommand = {
        id: generateId(),
        name: commandForm.name.trim(),
        content: commandForm.content,
        order: newCommands.length,
      };
      newCommands.push(newCmd);
    }

    setSettings({ ...settings, quickCommands: newCommands });
    setShowCommandModal(false);
  };

  const deleteCommand = (id: string) => {
    Alert.alert('确认删除', '确定要删除这个快捷指令吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          const newCommands = settings.quickCommands.filter((c) => c.id !== id);
          setSettings({ ...settings, quickCommands: newCommands });
        },
      },
    ]);
  };

  const moveCommand = (index: number, direction: -1 | 1) => {
    const newCommands = [...settings.quickCommands];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newCommands.length) return;
    [newCommands[index], newCommands[newIndex]] = [newCommands[newIndex], newCommands[index]];
    newCommands.forEach((c, i) => (c.order = i));
    setSettings({ ...settings, quickCommands: newCommands });
  };

  const handleExportCommands = async () => {
    try {
      const exportData = {
        type: 'ai-tavern-quick-commands',
        version: '1.0',
        exportedAt: Date.now(),
        commands: settings.quickCommands,
      };
      const jsonStr = JSON.stringify(exportData, null, 2);
      const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const fileUri = documentDir + `quick_commands_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, jsonStr);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '导出快捷指令',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('导出成功', `已导出到: ${fileUri}`);
      }
    } catch (error: any) {
      Alert.alert('导出失败', error.message || '未知错误');
    }
  };

  const handleImportCommands = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);
      const data = JSON.parse(content);

      let commandsToImport: QuickCommand[] = [];

      if (data.type === 'ai-tavern-quick-commands' && Array.isArray(data.commands)) {
        commandsToImport = data.commands;
      } else if (Array.isArray(data) && data.length > 0 && data[0].name && data[0].content) {
        commandsToImport = data;
      } else {
        Alert.alert('导入失败', '文件格式不正确，请确保是快捷指令导出文件');
        return;
      }

      const existingNames = new Set(settings.quickCommands.map((c) => c.name));
      const newCommands: QuickCommand[] = [];

      commandsToImport.forEach((cmd) => {
        let name = cmd.name;
        let counter = 1;
        while (existingNames.has(name)) {
          name = `${cmd.name} (${counter})`;
          counter++;
        }
        existingNames.add(name);
        newCommands.push({
          id: generateId(),
          name,
          content: cmd.content,
          order: settings.quickCommands.length + newCommands.length,
        });
      });

      if (newCommands.length > 0) {
        setSettings({
          ...settings,
          quickCommands: [...settings.quickCommands, ...newCommands],
        });
        Alert.alert('导入成功', `已导入 ${newCommands.length} 条快捷指令`);
      } else {
        Alert.alert('提示', '没有可导入的快捷指令');
      }
    } catch (error: any) {
      Alert.alert('导入失败', error.message || '未知错误');
    }
  };

  const handleExportData = async () => {
    try {
      const data = await exportAllDataWithMedia();
      const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const fileUri = documentDir + `ai_tavern_backup_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, data);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('导出成功', `已导出到: ${fileUri}`);
      }
    } catch (error: any) {
      Alert.alert('导出失败', error.message || '未知错误');
    }
  };

  const handleImportData = async () => {
    // 不使用 Alert.alert 的 async onPress（Android 上 async 回调执行到第一个 await 就被丢弃）
    // 直接调用 DocumentPicker，让用户选文件本身就是"确认"操作
    try {
      // 用 */* 兜底：Android 文件管理器对 .json 的 MIME 识别不一致，数组格式在部分机型选不到文件
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const file = result.assets[0];
      // 处理 content:// URI：copyToCacheDirectory 已复制到 cache，但部分机型仍返回 content://
      let content: string;
      try {
        content = await FileSystem.readAsStringAsync(file.uri);
      } catch (readErr) {
        const cacheUri = `${FileSystem.cacheDirectory}import_temp_${Date.now()}.json`;
        await FileSystem.copyAsync({ from: file.uri, to: cacheUri });
        content = await FileSystem.readAsStringAsync(cacheUri);
        FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
      }
      if (!content || content.trim().length === 0) {
        showAlert('导入失败', '文件内容为空');
        return;
      }
      const beforeCount = chats.length;
      const success = await importAllData(content);
      const afterChats = await storage.getChats();
      showAlert(
        success ? '导入完成' : '导入失败',
        success
          ? `导入前: ${beforeCount} 条对话\n当前: ${afterChats.length} 条对话\n数据已保存，重启后仍会保留`
          : '文件格式不正确或缺少 version 字段',
      );
    } catch (error: any) {
      showAlert('导入失败', error?.message || '未知错误');
    }
  };

  const handleCopyData = async () => {
    const data = await exportAllDataWithMedia();
    Clipboard.setStringAsync(data);
    Alert.alert('已复制', '所有数据（含素材库）已复制到剪贴板');
  };

  const openCustomColor = (colorKey: string) => {
    setCustomColorKey(colorKey);
    setCustomColorValue((theme as any)[colorKey] || '#ffffff');
    setShowColorPicker(true);
  };

  const saveCustomColor = () => {
    if (!customColorKey) return;
    let color = customColorValue.trim();
    if (!color.startsWith('#')) {
      color = '#' + color;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      // 开屏背景色属于 conversation 设置，不在 theme 上
      if (customColorKey === 'splashBackgroundColor') {
        setSettings({ ...settings, conversation: { ...settings.conversation, splashBackgroundColor: color } });
      } else {
        handleColorChange(customColorKey as keyof typeof theme, color);
      }
      setShowColorPicker(false);
      setCustomColorKey(null);
    } else {
      Alert.alert('提示', '请输入有效的颜色值，例如 #ff6b35 或 ff6b35');
    }
  };

  const sortedProviders = [...providers].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  return (
    <>
    <ScrollView ref={scrollViewRef} style={[styles.container, { backgroundColor: theme.backgroundColor }]} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ThemedCard title="外观模式" onLayout={(e) => { sectionOffsets.current['appearance'] = e.nativeEvent.layout.y; }}>
        <View style={styles.settingRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isDarkMode ? (
              <IconMoon size={20} color={theme.accentColor} />
            ) : (
              <IconSun size={20} color={theme.accentColor} />
            )}
            <View>
              <Text style={{ color: theme.textColor, fontWeight: '500' }}>
                {isDarkMode ? '夜间模式' : '日间模式'}
              </Text>
              <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
                切换后下次启动自动保持此模式
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.dayNightRow, { backgroundColor: theme.secondaryColor }]}>
          <TouchableOpacity
            style={[
              styles.dayNightBtn,
              {
                backgroundColor: !isDarkMode ? theme.accentColor : 'transparent',
                borderColor: !isDarkMode ? theme.accentColor : theme.borderColor,
              },
            ]}
            onPress={() => setDarkMode(false)}
          >
            <IconSun size={18} color={!isDarkMode ? '#fff' : theme.textColor} />
            <Text style={{ color: !isDarkMode ? '#fff' : theme.textColor, fontWeight: !isDarkMode ? '600' : '400', marginLeft: 6 }}>日间</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.dayNightBtn,
              {
                backgroundColor: isDarkMode ? theme.accentColor : 'transparent',
                borderColor: isDarkMode ? theme.accentColor : theme.borderColor,
              },
            ]}
            onPress={() => setDarkMode(true)}
          >
            <IconMoon size={18} color={isDarkMode ? '#fff' : theme.textColor} />
            <Text style={{ color: isDarkMode ? '#fff' : theme.textColor, fontWeight: isDarkMode ? '600' : '400', marginLeft: 6 }}>夜间</Text>
          </TouchableOpacity>
        </View>
      </ThemedCard>

      <ThemedCard title="主题设置" onLayout={(e) => { sectionOffsets.current['theme'] = e.nativeEvent.layout.y; }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: theme.secondaryColor, padding: 8, borderRadius: 8 }}>
          {isDarkMode ? <IconMoon size={16} color={theme.accentColor} /> : <IconSun size={16} color={theme.accentColor} />}
          <Text style={{ color: theme.subTextColor, fontSize: 12, flex: 1 }}>
            当前编辑：{isDarkMode ? '夜间模式' : '日间模式'}主题颜色（切换模式后可独立配置另一套）
          </Text>
        </View>
        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>主题色（强调色）</Text>
        <View style={styles.colorRow}>
          {colorPresets.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.accentColor === color ? '#fff' : 'transparent', borderWidth: 3 },
              ]}
              onPress={() => handleColorChange('accentColor', color)}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => openCustomColor('accentColor')}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>按钮颜色</Text>
        <View style={styles.colorRow}>
          {colorPresets.map((color) => (
            <TouchableOpacity
              key={`btn-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.buttonColor === color ? '#fff' : 'transparent', borderWidth: 3 },
              ]}
              onPress={() => handleColorChange('buttonColor', color)}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => openCustomColor('buttonColor')}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>背景颜色</Text>
        <View style={styles.colorRow}>
          {bgPresets.map((color) => (
            <TouchableOpacity
              key={`bg-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.backgroundColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => handleColorChange('backgroundColor', color)}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => openCustomColor('backgroundColor')}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>文字颜色</Text>
        <View style={styles.colorRow}>
          {['#ffffff', '#000000', '#f0f0f0', '#333333', '#666666', '#999999'].map((color) => (
            <TouchableOpacity
              key={`text-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.textColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => handleColorChange('textColor', color)}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => openCustomColor('textColor')}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>卡片背景</Text>
        <View style={styles.colorRow}>
          {['#1a1a2e', '#16213e', '#0f3460', '#2d3436', '#636e72', '#ffffff', '#f5f5f5'].map((color) => (
            <TouchableOpacity
              key={`primary-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.primaryColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => handleColorChange('primaryColor', color)}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => openCustomColor('primaryColor')}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>次级背景</Text>
        <View style={styles.colorRow}>
          {['#252542', '#1e2a4a', '#1a3a5c', '#3d4446', '#747d8c', '#ffffff', '#e0e0e0'].map((color) => (
            <TouchableOpacity
              key={`secondary-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.secondaryColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => handleColorChange('secondaryColor', color)}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => openCustomColor('secondaryColor')}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>边框颜色</Text>
        <View style={styles.colorRow}>
          {['#333333', '#555555', '#777777', '#999999', '#cccccc', '#e0e0e0', '#ffffff'].map((color) => (
            <TouchableOpacity
              key={`border-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.borderColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => handleColorChange('borderColor', color)}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => openCustomColor('borderColor')}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>壁纸</Text>
        <View style={styles.wallpaperRow}>
          {theme.wallpaper ? (
            <View style={styles.wallpaperPreview}>
              <Image source={{ uri: theme.wallpaper }} style={styles.wallpaperImage} />
              <TouchableOpacity
                style={[styles.removeWallpaperBtn, { backgroundColor: theme.accentColor }]}
                onPress={removeWallpaper}
              >
                <Text style={{ color: '#fff', fontSize: 12 }}>移除</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ color: theme.subTextColor, fontSize: 12 }}>未设置壁纸</Text>
          )}
          <TouchableOpacity
            style={[styles.wallpaperBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={pickWallpaper}
          >
            <Text style={{ color: theme.textColor, fontSize: 12 }}>选择壁纸</Text>
          </TouchableOpacity>
        </View>
      </ThemedCard>

      <ThemedCard title="按钮图标自定义" onLayout={(e) => { sectionOffsets.current['buttons'] = e.nativeEvent.layout.y; }}>
        <Text style={[styles.sectionHint, { color: theme.subTextColor, marginBottom: 10 }]}>
          可为每个按钮替换图片/GIF（PNG/JPG/WebP/GIF 均支持，动图可播放）。
        </Text>
        <View style={styles.iconGrid}>
          {BUTTON_ICON_DEFS_UNIQUE.map((def) => {
            const custom = settings.customButtonIcons?.[def.key];
            const { Preview } = def;
            return (
              <View
                key={def.key}
                style={[
                  styles.iconTile,
                  { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.iconTileLabel, { color: theme.textColor }]}>{def.label}</Text>
                  {custom ? (
                    <TouchableOpacity
                      hitSlop={{ top: 4, left: 4, right: 8, bottom: 4 }}
                      onPress={() => clearButtonIcon(def.key)}
                    >
                      <IconTrash size={15} color={theme.subTextColor} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={[styles.iconPreviewRow, { borderTopColor: theme.borderColor }]}>
                  {custom ? (
                    <Image source={{ uri: custom }} style={styles.iconPreviewImg} resizeMode="contain" />
                  ) : (
                    <Preview size={28} color={theme.textColor} />
                  )}
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    style={[
                      styles.iconPickBtn,
                      { backgroundColor: theme.primaryColor, borderColor: theme.borderColor },
                    ]}
                    onPress={() => pickButtonIcon(def.key)}
                  >
                    <Text style={{ color: theme.textColor, fontSize: 12 }}>选择图片</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
        <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            onPress={clearAllButtonIcons}
            style={[
              styles.iconResetAllBtn,
              { borderColor: theme.borderColor, backgroundColor: theme.secondaryColor },
            ]}
          >
            <Text style={{ color: theme.subTextColor, fontSize: 12 }}>全部恢复默认</Text>
          </TouchableOpacity>
        </View>
      </ThemedCard>

      <ThemedCard title="AI思考中 自定义" onLayout={(e) => { sectionOffsets.current['aiThinking'] = e.nativeEvent.layout.y; }}>
        <Text style={[styles.sectionHint, { color: theme.subTextColor, marginBottom: 10 }]}>
          自定义 AI 输出时的"思考中"占位态：可放任意图片/动图，文字可随意编辑，字体可调。
        </Text>

        {/* 文字内容 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>文字内容</Text>
        <TextInput
          style={[
            styles.thinkingTextInput,
            { backgroundColor: theme.inputBgColor, color: theme.textColor, borderColor: theme.borderColor },
          ]}
          value={settings.thinkingIndicator?.text ?? 'AI 思考中'}
          placeholder="输入占位文字（留空则只显示图片）"
          placeholderTextColor={theme.subTextColor}
          onChangeText={(v) => updateThinkingIndicator({ text: v })}
        />

        {/* 字体大小 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 10 }]}>字体大小: {settings.thinkingIndicator?.fontSize ?? theme.fontSize}px</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <TouchableOpacity
            style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={() => updateThinkingIndicator({ fontSize: Math.max(8, (settings.thinkingIndicator?.fontSize ?? theme.fontSize) - 1) })}
          >
            <Text style={{ color: theme.textColor }}>-</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
            {settings.thinkingIndicator?.fontSize ?? theme.fontSize}
          </Text>
          <TouchableOpacity
            style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={() => updateThinkingIndicator({ fontSize: Math.min(48, (settings.thinkingIndicator?.fontSize ?? theme.fontSize) + 1) })}
          >
            <Text style={{ color: theme.textColor }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* 字体颜色 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 10 }]}>字体颜色</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {[theme.subTextColor, theme.textColor, theme.accentColor, '#888', '#fff', '#000', '#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe'].map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => updateThinkingIndicator({ fontColor: c })}
              style={[
                styles.colorSwatch,
                { backgroundColor: c, borderColor: settings.thinkingIndicator?.fontColor === c ? theme.accentColor : 'transparent', borderWidth: 2 },
              ]}
            />
          ))}
        </View>

        {/* 字体粗细 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 10 }]}>字体粗细</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {(['300', '400', '500', '600', '700'] as const).map((w) => (
            <TouchableOpacity
              key={w}
              onPress={() => updateThinkingIndicator({ fontWeight: w })}
              style={[
                styles.weightBtn,
                {
                  backgroundColor: settings.thinkingIndicator?.fontWeight === w ? theme.accentColor : theme.secondaryColor,
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <Text style={{ color: settings.thinkingIndicator?.fontWeight === w ? '#fff' : theme.textColor, fontSize: 12, fontWeight: w as any }}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 排列方式 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 10 }]}>图片/文字排列</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {([
            { v: 'left', l: '图左文右' },
            { v: 'right', l: '文左图右' },
            { v: 'top', l: '图上文下' },
            { v: 'bottom', l: '文上图下' },
          ] as const).map((o) => (
            <TouchableOpacity
              key={o.v}
              onPress={() => updateThinkingIndicator({ layout: o.v })}
              style={[
                styles.weightBtn,
                {
                  backgroundColor: (settings.thinkingIndicator?.layout || 'left') === o.v ? theme.accentColor : theme.secondaryColor,
                  borderColor: theme.borderColor,
                },
              ]}
            >
              <Text style={{ color: (settings.thinkingIndicator?.layout || 'left') === o.v ? '#fff' : theme.textColor, fontSize: 12 }}>{o.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 省略号动画 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>尾部省略号动画</Text>
          <TouchableOpacity
            onPress={() => updateThinkingIndicator({ showDots: !(settings.thinkingIndicator?.showDots !== false) })}
            style={[
              styles.toggleBtn,
              { backgroundColor: (settings.thinkingIndicator?.showDots !== false) ? theme.accentColor : theme.secondaryColor },
            ]}
          >
            <Text style={{ color: (settings.thinkingIndicator?.showDots !== false) ? '#fff' : theme.subTextColor, fontSize: 12 }}>
              {(settings.thinkingIndicator?.showDots !== false) ? '开' : '关'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 图片/动图 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 10 }]}>图片/动图（替代转圈）</Text>
        <View style={styles.wallpaperRow}>
          {settings.thinkingIndicator?.imageUri ? (
            <View style={styles.wallpaperPreview}>
              <Image source={{ uri: settings.thinkingIndicator.imageUri }} style={[styles.wallpaperImage, { width: 60, height: 60, borderRadius: (settings.thinkingIndicator.imageRound ? 30 : 8) }]} resizeMode="contain" />
              <TouchableOpacity
                style={[styles.removeWallpaperBtn, { backgroundColor: theme.accentColor }]}
                onPress={clearThinkingImage}
              >
                <Text style={{ color: '#fff', fontSize: 12 }}>移除</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ color: theme.subTextColor, fontSize: 12 }}>未设置（显示默认转圈）</Text>
          )}
          <TouchableOpacity
            style={[styles.wallpaperBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={pickThinkingImage}
          >
            <Text style={{ color: theme.textColor, fontSize: 12 }}>选择图片/动图</Text>
          </TouchableOpacity>
        </View>

        {/* 图片尺寸 + 圆角 */}
        {settings.thinkingIndicator?.imageUri ? (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 10 }]}>
              图片尺寸: {settings.thinkingIndicator?.imageWidth ?? 24} x {settings.thinkingIndicator?.imageHeight ?? 24}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: theme.subTextColor, fontSize: 12 }}>宽</Text>
                <TouchableOpacity
                  style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, marginHorizontal: 4 }]}
                  onPress={() => updateThinkingIndicator({ imageWidth: Math.max(8, (settings.thinkingIndicator?.imageWidth ?? 24) - 4) })}
                >
                  <Text style={{ color: theme.textColor }}>-</Text>
                </TouchableOpacity>
                <Text style={{ color: theme.textColor, minWidth: 30, textAlign: 'center' }}>{settings.thinkingIndicator?.imageWidth ?? 24}</Text>
                <TouchableOpacity
                  style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, marginHorizontal: 4 }]}
                  onPress={() => updateThinkingIndicator({ imageWidth: Math.min(200, (settings.thinkingIndicator?.imageWidth ?? 24) + 4) })}
                >
                  <Text style={{ color: theme.textColor }}>+</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: theme.subTextColor, fontSize: 12 }}>高</Text>
                <TouchableOpacity
                  style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, marginHorizontal: 4 }]}
                  onPress={() => updateThinkingIndicator({ imageHeight: Math.max(8, (settings.thinkingIndicator?.imageHeight ?? 24) - 4) })}
                >
                  <Text style={{ color: theme.textColor }}>-</Text>
                </TouchableOpacity>
                <Text style={{ color: theme.textColor, minWidth: 30, textAlign: 'center' }}>{settings.thinkingIndicator?.imageHeight ?? 24}</Text>
                <TouchableOpacity
                  style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, marginHorizontal: 4 }]}
                  onPress={() => updateThinkingIndicator({ imageHeight: Math.min(200, (settings.thinkingIndicator?.imageHeight ?? 24) + 4) })}
                >
                  <Text style={{ color: theme.textColor }}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={{ color: theme.textColor, fontWeight: '500' }}>图片圆角裁剪</Text>
              <TouchableOpacity
                onPress={() => updateThinkingIndicator({ imageRound: !settings.thinkingIndicator?.imageRound })}
                style={[
                  styles.toggleBtn,
                  { backgroundColor: settings.thinkingIndicator?.imageRound ? theme.accentColor : theme.secondaryColor },
                ]}
              >
                <Text style={{ color: settings.thinkingIndicator?.imageRound ? '#fff' : theme.subTextColor, fontSize: 12 }}>
                  {settings.thinkingIndicator?.imageRound ? '开' : '关'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {/* 重置 */}
        <View style={{ marginTop: 14, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            onPress={resetThinkingIndicator}
            style={[
              styles.iconResetAllBtn,
              { borderColor: theme.borderColor, backgroundColor: theme.secondaryColor },
            ]}
          >
            <Text style={{ color: theme.subTextColor, fontSize: 12 }}>恢复默认</Text>
          </TouchableOpacity>
        </View>
      </ThemedCard>

      <ThemedCard title="显示设置" onLayout={(e) => { sectionOffsets.current['display'] = e.nativeEvent.layout.y; }}>
        <View style={styles.settingRow}>
          <View>
            <Text style={{ color: theme.textColor, fontWeight: '500' }}>字体大小</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
              调整对话文字大小
            </Text>
          </View>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => handleFontSizeChange(-1)}
            >
              <Text style={{ color: theme.textColor }}>A-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 50, textAlign: 'center' }}>
              {theme.fontSize}px
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => handleFontSizeChange(1)}
            >
              <Text style={{ color: theme.textColor }}>A+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 4 }]}>
          <View>
            <Text style={{ color: theme.textColor, fontWeight: '500' }}>状态栏字号</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
              角色状态栏的文字大小
            </Text>
          </View>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => handleStatusBarSizeChange(-2)}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {theme.statusBarSize}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => handleStatusBarSizeChange(2)}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconFont size={18} color={theme.accentColor} />
            <View>
              <Text style={{ color: theme.textColor, fontWeight: '500' }}>字体选择</Text>
              <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
                选择应用全局字体
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.fontSelectorBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={() => setShowFontFamilyModal(true)}
          >
            <Text style={{ color: theme.textColor, fontSize: 13 }}>
              {fontFamilyOptions.find(f => f.value === theme.fontFamily)?.label || '系统默认'}
            </Text>
            <Text style={{ color: theme.subTextColor, fontSize: 12 }}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 4 }]}>
          <View>
            <Text style={{ color: theme.textColor, fontWeight: '500' }}>气泡样式</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
              对话消息气泡外观
            </Text>
          </View>
        </View>
        <View style={styles.bubbleStyleRow}>
          {([
            { value: 'classic', label: '经典', preview: '💬', desc: '传统对话' },
            { value: 'qq', label: 'QQ风格', preview: '🐧', desc: '圆彩色气泡' },
            { value: 'transparent', label: '透明', preview: '✨', desc: '简约透明' },
          ] as const).map((opt) => {
            const isActive = (theme.bubbleStyle || 'classic') === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.bubbleStyleCard,
                  {
                    backgroundColor: isActive ? theme.accentColor : theme.secondaryColor,
                    borderColor: isActive ? theme.accentColor : theme.borderColor,
                  },
                ]}
                onPress={() => updateTheme({ bubbleStyle: opt.value })}
              >
                <View style={styles.bubblePreview}>
                  <Text style={{ fontSize: 18 }}>{opt.preview}</Text>
                  <View style={[
                    styles.bubblePreviewDot,
                    { backgroundColor: isActive ? '#fff' : theme.accentColor }
                  ]} />
                </View>
                <Text style={{
                  color: isActive ? '#fff' : theme.textColor,
                  fontWeight: isActive ? '600' : '500',
                  fontSize: 13,
                }}>{opt.label}</Text>
                <Text style={{
                  color: isActive ? 'rgba(255,255,255,0.8)' : theme.subTextColor,
                  fontSize: 10,
                  marginTop: 2,
                }}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ThemedCard>

      <ThemedCard title="输入框美化" onLayout={(e) => { sectionOffsets.current['input'] = e.nativeEvent.layout.y; }}>
        <View style={styles.settingRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconInputBox size={18} color={theme.accentColor} />
            <Text style={{ color: theme.textColor, fontWeight: '500' }}>边框宽度</Text>
          </View>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateTheme({ inputBorderWidth: Math.max(0, (theme.inputBorderWidth || 0) - 1) })}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {theme.inputBorderWidth || 0}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateTheme({ inputBorderWidth: Math.min(5, (theme.inputBorderWidth || 0) + 1) })}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 4 }]}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>边框圆角</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateTheme({ inputBorderRadius: Math.max(0, (theme.inputBorderRadius || 0) - 2) })}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {theme.inputBorderRadius || 0}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateTheme({ inputBorderRadius: Math.min(30, (theme.inputBorderRadius || 0) + 2) })}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>边框颜色</Text>
        <View style={styles.colorRow}>
          {inputBorderColorPresets.map((color) => (
            <TouchableOpacity
              key={`input-border-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.inputBorderColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => updateTheme({ inputBorderColor: color })}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => {
              setCustomColorKey('inputBorderColor');
              setCustomColorValue(theme.inputBorderColor || '#e0e0e0');
              setShowColorPicker(true);
            }}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>边框样式</Text>
        <View style={styles.borderStyleRow}>
          {borderStyleOptions.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.borderStyleChip,
                {
                  backgroundColor: theme.inputBorderStyle === opt.value ? theme.accentColor : theme.inputBgColor,
                  borderColor: theme.inputBorderStyle === opt.value ? theme.accentColor : theme.borderColor,
                },
              ]}
              onPress={() => updateTheme({ inputBorderStyle: opt.value })}
            >
              <Text style={{
                color: theme.inputBorderStyle === opt.value ? '#fff' : theme.textColor,
                fontWeight: theme.inputBorderStyle === opt.value ? '600' : '400',
              }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>输入框背景色</Text>
        <View style={styles.colorRow}>
          {inputBgColorPresets.map((color) => (
            <TouchableOpacity
              key={`input-bg-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.inputBgColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => updateTheme({ inputBgColor: color })}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => {
              setCustomColorKey('inputBgColor');
              setCustomColorValue(theme.inputBgColor || '#ffffff');
              setShowColorPicker(true);
            }}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>字体大小</Text>
        <View style={styles.counterRow}>
          <TouchableOpacity
            style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={() => updateTheme({ inputFontSize: Math.max(12, (theme.inputFontSize || 14) - 1) })}
          >
            <Text style={{ color: theme.textColor }}>-</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
            {theme.inputFontSize || 14}px
          </Text>
          <TouchableOpacity
            style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={() => updateTheme({ inputFontSize: Math.min(24, (theme.inputFontSize || 14) + 1) })}
          >
            <Text style={{ color: theme.textColor }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* 输入框背景图（9-patch 风格，类似 QQ 输入框皮肤） */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 12 }]}>背景图（9-patch 风格）</Text>
        <Text style={{ color: theme.subTextColor, fontSize: 12, marginBottom: 8 }}>
          导入自定义图片作为输入框背景，通过 padding 和圆角参数模拟 9-patch 切片拉伸，四角保持不变形。
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
          <TouchableOpacity
            onPress={async () => {
              try {
                const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
                if (result.canceled || !result.assets || result.assets.length === 0) return;
                const file = result.assets[0];
                const savedUri = await imageUtils.saveImageToAppDir(file.uri, 'inputbg');
                updateTheme({ inputBackgroundImage: savedUri });
              } catch (e: any) {
                Alert.alert('错误', '导入背景图失败：' + (e?.message || ''));
              }
            }}
          >
            {theme.inputBackgroundImage ? (
              <Image source={{ uri: theme.inputBackgroundImage }} style={{ width: 90, height: 56, borderRadius: 10 }} resizeMode="cover" />
            ) : (
              <View style={{ width: 90, height: 56, borderRadius: 10, backgroundColor: theme.secondaryColor, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.borderColor, borderStyle: 'dashed' }}>
                <IconImage size={20} color={theme.subTextColor} />
                <Text style={{ color: theme.subTextColor, fontSize: 10, marginTop: 2 }}>点击导入</Text>
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textColor, fontSize: 13 }}>
              {theme.inputBackgroundImage ? '已设置背景图' : '未设置（使用纯色背景）'}
            </Text>
            {theme.inputBackgroundImage && (
              <TouchableOpacity
                onPress={() => {
                  if (theme.inputBackgroundImage && imageUtils.deleteImage) {
                    imageUtils.deleteImage(theme.inputBackgroundImage).catch(() => {});
                  }
                  updateTheme({ inputBackgroundImage: undefined });
                }}
              >
                <Text style={{ color: theme.accentColor, fontSize: 12, marginTop: 4 }}>移除背景图</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {theme.inputBackgroundImage && (() => {
          const np = theme.inputBgNinePatch || { paddingTop: 8, paddingBottom: 8, paddingLeft: 12, paddingRight: 12, cornerRadius: 12, opacity: 1 };
          const setNp = (patch: Partial<typeof np>) => updateTheme({ inputBgNinePatch: { ...np, ...patch } });
          return (
            <>
              <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 8 }]}>
                <Text style={{ color: theme.textColor, fontWeight: '500' }}>内容上边距</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ paddingTop: Math.max(0, np.paddingTop - 1) })}>
                    <Text style={{ color: theme.textColor }}>-</Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>{np.paddingTop}</Text>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ paddingTop: Math.min(40, np.paddingTop + 1) })}>
                    <Text style={{ color: theme.textColor }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.settingRow}>
                <Text style={{ color: theme.textColor, fontWeight: '500' }}>内容下边距</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ paddingBottom: Math.max(0, np.paddingBottom - 1) })}>
                    <Text style={{ color: theme.textColor }}>-</Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>{np.paddingBottom}</Text>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ paddingBottom: Math.min(40, np.paddingBottom + 1) })}>
                    <Text style={{ color: theme.textColor }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.settingRow}>
                <Text style={{ color: theme.textColor, fontWeight: '500' }}>内容左右边距</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ paddingLeft: Math.max(0, np.paddingLeft - 1), paddingRight: Math.max(0, np.paddingRight - 1) })}>
                    <Text style={{ color: theme.textColor }}>-</Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>{np.paddingLeft}</Text>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ paddingLeft: Math.min(40, np.paddingLeft + 1), paddingRight: Math.min(40, np.paddingRight + 1) })}>
                    <Text style={{ color: theme.textColor }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.settingRow}>
                <Text style={{ color: theme.textColor, fontWeight: '500' }}>四角圆角</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ cornerRadius: Math.max(0, np.cornerRadius - 2) })}>
                    <Text style={{ color: theme.textColor }}>-</Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>{np.cornerRadius}</Text>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ cornerRadius: Math.min(40, np.cornerRadius + 2) })}>
                    <Text style={{ color: theme.textColor }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.settingRow}>
                <Text style={{ color: theme.textColor, fontWeight: '500' }}>图片透明度</Text>
                <View style={styles.counterRow}>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ opacity: Math.max(0.2, (np.opacity ?? 1) - 0.1) })}>
                    <Text style={{ color: theme.textColor }}>-</Text>
                  </TouchableOpacity>
                  <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>{((np.opacity ?? 1) * 10).toFixed(0)}0%</Text>
                  <TouchableOpacity style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]} onPress={() => setNp({ opacity: Math.min(1, (np.opacity ?? 1) + 0.1) })}>
                    <Text style={{ color: theme.textColor }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          );
        })()}
      </ThemedCard>

      <ThemedCard title="开屏动画" onLayout={(e) => { sectionOffsets.current['splash'] = e.nativeEvent.layout.y; }}>
        <Text style={{ color: theme.subTextColor, fontSize: 12, marginBottom: 12 }}>
          自定义应用启动时的开屏画面。可设置图片、大小、位置、背景色和显示文字。
        </Text>

        {/* 开屏图片 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>开屏图片</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 }}>
          <TouchableOpacity
            onPress={async () => {
              try {
                const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
                if (result.canceled || !result.assets || result.assets.length === 0) return;
                const file = result.assets[0];
                const savedUri = await imageUtils.saveImageToAppDir(file.uri, 'splash');
                setSettings({ ...settings, conversation: { ...settings.conversation, splashImage: savedUri } });
              } catch (e: any) {
                Alert.alert('错误', '导入图片失败：' + (e?.message || ''));
              }
            }}
          >
            {settings.conversation.splashImage ? (
              <Image source={{ uri: settings.conversation.splashImage }} style={{ width: 64, height: 64, borderRadius: 12 }} resizeMode="cover" />
            ) : (
              <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: theme.secondaryColor, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.borderColor, borderStyle: 'dashed' }}>
                <IconImage size={22} color={theme.subTextColor} />
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textColor, fontSize: 13 }}>
              {settings.conversation.splashImage ? '已设置自定义图片' : '使用默认图片（奥野田美宵）'}
            </Text>
            {settings.conversation.splashImage && (
              <TouchableOpacity
                onPress={() => {
                  if (settings.conversation.splashImage && imageUtils.deleteImage) {
                    imageUtils.deleteImage(settings.conversation.splashImage).catch(() => {});
                  }
                  setSettings({ ...settings, conversation: { ...settings.conversation, splashImage: undefined } });
                }}
              >
                <Text style={{ color: theme.accentColor, fontSize: 12, marginTop: 4 }}>恢复默认</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 图片大小 */}
        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 8 }]}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>图片大小</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashImageSize: Math.max(80, (settings.conversation.splashImageSize || 200) - 10) } })}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {settings.conversation.splashImageSize || 200}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashImageSize: Math.min(400, (settings.conversation.splashImageSize || 200) + 10) } })}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 图片水平位置 */}
        <View style={styles.settingRow}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>水平偏移</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashImageOffsetX: Math.max(-200, (settings.conversation.splashImageOffsetX || 0) - 10) } })}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {settings.conversation.splashImageOffsetX || 0}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashImageOffsetX: Math.min(200, (settings.conversation.splashImageOffsetX || 0) + 10) } })}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 图片垂直位置 */}
        <View style={styles.settingRow}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>垂直偏移</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashImageOffsetY: Math.max(-300, (settings.conversation.splashImageOffsetY || 0) - 10) } })}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {settings.conversation.splashImageOffsetY || 0}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashImageOffsetY: Math.min(300, (settings.conversation.splashImageOffsetY || 0) + 10) } })}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 背景颜色 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 8 }]}>背景颜色</Text>
        <View style={styles.colorRow}>
          {['#fff5f6', '#ffe4ec', '#ffffff', '#000000', '#0d0d1a', '#1a1a2e', '#2c3e50', '#34495e'].map((color) => (
            <TouchableOpacity
              key={`splash-bg-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: settings.conversation.splashBackgroundColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashBackgroundColor: color } })}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => {
              setCustomColorKey('splashBackgroundColor');
              setCustomColorValue(settings.conversation.splashBackgroundColor || '#fff5f6');
              setShowColorPicker(true);
            }}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* 显示文字 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 8 }]}>显示文字</Text>
        <View style={styles.settingRow}>
          <Text style={{ color: theme.textColor }}>显示标题/副标题</Text>
          <TouchableOpacity
            style={[styles.toggleBtn, { backgroundColor: (settings.conversation.showSplashTitle ?? true) ? theme.accentColor : theme.secondaryColor, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }]}
            onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, showSplashTitle: !(settings.conversation.showSplashTitle ?? true) } })}
          >
            <Text style={{ color: (settings.conversation.showSplashTitle ?? true) ? '#fff' : theme.subTextColor, fontSize: 12 }}>
              {(settings.conversation.showSplashTitle ?? true) ? '显示中' : '已隐藏'}
            </Text>
          </TouchableOpacity>
        </View>
        {(settings.conversation.showSplashTitle ?? true) && (
          <>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.secondaryColor, color: theme.textColor, marginTop: 8 }]}
              value={settings.conversation.splashTitle || ''}
              onChangeText={(v) => setSettings({ ...settings, conversation: { ...settings.conversation, splashTitle: v } })}
              placeholder="标题（默认：鲵吞亭）"
              placeholderTextColor={theme.subTextColor}
            />
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.secondaryColor, color: theme.textColor, marginTop: 8 }]}
              value={settings.conversation.splashSubtitle || ''}
              onChangeText={(v) => setSettings({ ...settings, conversation: { ...settings.conversation, splashSubtitle: v } })}
              placeholder="副标题（默认：少女开张中~）"
              placeholderTextColor={theme.subTextColor}
            />
          </>
        )}

        {/* 动画类型 */}
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 8 }]}>动画类型</Text>
        <View style={styles.buttonPatternRow}>
          {[
            { label: '缩放', value: 'scale' },
            { label: '淡入', value: 'fade' },
            { label: '滑动', value: 'slide' },
            { label: '无', value: 'none' },
          ].map((opt) => (
            <TouchableOpacity
              key={`splash-anim-${opt.value}`}
              style={[
                styles.buttonPatternChip,
                {
                  backgroundColor: settings.conversation.splashAnimation === opt.value ? theme.accentColor : theme.secondaryColor,
                  borderColor: settings.conversation.splashAnimation === opt.value ? theme.accentColor : theme.borderColor,
                },
              ]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashAnimation: opt.value as any } })}
            >
              <Text style={{ color: settings.conversation.splashAnimation === opt.value ? '#fff' : theme.textColor, fontSize: 12 }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 独立日间/夜间配置 */}
        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textColor, fontWeight: '500' }}>独立日间/夜间配置</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 2 }}>开启后夜间模式使用专属开屏配置</Text>
          </View>
          <Switch
            value={settings.conversation.splashSeparateDark ?? false}
            onValueChange={(v) => setSettings({ ...settings, conversation: { ...settings.conversation, splashSeparateDark: v } })}
            trackColor={{ false: theme.borderColor, true: theme.accentColor }}
          />
        </View>

        {(settings.conversation.splashSeparateDark ?? false) && (
          <View style={{ backgroundColor: theme.secondaryColor, padding: 12, borderRadius: 12, marginTop: 8, gap: 8 }}>
            <Text style={[styles.sectionLabel, { color: theme.textColor }]}>夜间模式专属</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.primaryColor, color: theme.textColor, marginTop: 8 }]}
              value={settings.conversation.splashTitleDark || ''}
              onChangeText={(v) => setSettings({ ...settings, conversation: { ...settings.conversation, splashTitleDark: v } })}
              placeholder="夜间标题"
              placeholderTextColor={theme.subTextColor}
            />
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.primaryColor, color: theme.textColor, marginTop: 8 }]}
              value={settings.conversation.splashSubtitleDark || ''}
              onChangeText={(v) => setSettings({ ...settings, conversation: { ...settings.conversation, splashSubtitleDark: v } })}
              placeholder="夜间副标题"
              placeholderTextColor={theme.subTextColor}
            />
            <TouchableOpacity
              style={{ backgroundColor: theme.accentColor, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, marginTop: 8 }}
              onPress={async () => {
                try {
                  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
                  if (result.canceled || !result.assets || result.assets.length === 0) return;
                  const file = result.assets[0];
                  const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
                  const dataUri = `data:image/${file.name?.split('.').pop() || 'png'};base64,${b64}`;
                  setSettings({ ...settings, conversation: { ...settings.conversation, splashImageDark: dataUri } });
                } catch (e: any) {
                  Alert.alert('错误', '导入图片失败：' + (e?.message || ''));
                }
              }}
            >
              <Text style={{ color: '#fff', textAlign: 'center' }}>导入夜间图片</Text>
            </TouchableOpacity>
            {settings.conversation.splashImageDark && (
              <TouchableOpacity
                style={{ marginTop: 4 }}
                onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashImageDark: undefined } })}
              >
                <Text style={{ color: theme.accentColor, fontSize: 12, textAlign: 'center' }}>移除夜间图片</Text>
              </TouchableOpacity>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {['#0d0d1a', '#1a0a1e', '#0a0a0f', '#1a1a2e', '#16213e'].map((color) => (
                <TouchableOpacity
                  key={`dark-bg-${color}`}
                  style={[styles.colorDot, { backgroundColor: color, borderColor: settings.conversation.splashBackgroundColorDark === color ? theme.accentColor : '#666', borderWidth: 2 }]}
                  onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashBackgroundColorDark: color } })}
                />
              ))}
            </View>
          </View>
        )}

        {/* 显示时长 */}
        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 8 }]}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>显示时长(ms)</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashDuration: Math.max(500, (settings.conversation.splashDuration || 2000) - 200) } })}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {settings.conversation.splashDuration || 2000}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => setSettings({ ...settings, conversation: { ...settings.conversation, splashDuration: Math.min(8000, (settings.conversation.splashDuration || 2000) + 200) } })}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ThemedCard>

      <ThemedCard title="按钮样式">
        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>按钮样式</Text>
        <View style={styles.buttonPatternRow}>
          {buttonPatternOptions.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.buttonPatternChip,
                {
                  backgroundColor: theme.buttonPattern === opt.value ? theme.accentColor : theme.inputBgColor,
                  borderColor: theme.buttonPattern === opt.value ? theme.accentColor : theme.borderColor,
                },
              ]}
              onPress={() => updateTheme({ buttonPattern: opt.value })}
            >
              <Text style={{
                color: theme.buttonPattern === opt.value ? '#fff' : theme.textColor,
                fontWeight: theme.buttonPattern === opt.value ? '600' : '400',
              }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 4 }]}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>按钮圆角</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateTheme({ buttonBorderRadius: Math.max(0, (theme.buttonBorderRadius || 0) - 2) })}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {theme.buttonBorderRadius || 0}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateTheme({ buttonBorderRadius: Math.min(30, (theme.buttonBorderRadius || 0) + 2) })}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 4 }]}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>边框宽度</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateTheme({ buttonBorderWidth: Math.max(0, (theme.buttonBorderWidth || 0) - 1) })}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 40, textAlign: 'center' }}>
              {theme.buttonBorderWidth || 0}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateTheme({ buttonBorderWidth: Math.min(5, (theme.buttonBorderWidth || 0) + 1) })}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>边框颜色</Text>
        <View style={styles.colorRow}>
          {buttonBorderColorPresets.map((color) => (
            <TouchableOpacity
              key={`btn-border-${color}`}
              style={[
                styles.colorDot,
                { backgroundColor: color, borderColor: theme.buttonBorderColor === color ? theme.accentColor : '#666', borderWidth: 2 },
              ]}
              onPress={() => updateTheme({ buttonBorderColor: color })}
            />
          ))}
          <TouchableOpacity
            style={[styles.customColorBtn, { borderColor: theme.accentColor }]}
            onPress={() => {
              setCustomColorKey('buttonBorderColor');
              setCustomColorValue(theme.buttonBorderColor || '#e0e0e0');
              setShowColorPicker(true);
            }}
          >
            <Text style={{ color: theme.accentColor, fontSize: 18 }}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 4 }]}>
          <Text style={{ color: theme.textColor, fontWeight: '500' }}>按钮阴影</Text>
          <TouchableOpacity
            style={[
              styles.toggleSwitch,
              { backgroundColor: theme.buttonHasShadow ? theme.accentColor : theme.secondaryColor },
            ]}
            onPress={() => updateTheme({ buttonHasShadow: !theme.buttonHasShadow })}
          >
            <View style={[
              styles.toggleThumb,
              { transform: [{ translateX: theme.buttonHasShadow ? 16 : 0 }] },
            ]} />
          </TouchableOpacity>
        </View>

        {theme.buttonPattern === 'gradient' && (
          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.borderColor, paddingTop: 12, marginTop: 4 }]}>
            <Text style={{ color: theme.textColor, fontWeight: '500' }}>渐变颜色</Text>
            <TouchableOpacity
              style={[styles.gradientColorBtn, { backgroundColor: theme.buttonGradientColor || '#ff9ec4', borderColor: theme.borderColor }]}
              onPress={() => {
                setCustomColorKey('buttonGradientColor');
                setCustomColorValue(theme.buttonGradientColor || '#ff9ec4');
                setShowColorPicker(true);
              }}
            />
          </View>
        )}
      </ThemedCard>

      <ThemedCard title="快捷指令">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ThemedButton title="添加" onPress={openAddCommand} variant="secondary" style={{ flex: 1 }} />
          <ThemedButton title="导入" onPress={handleImportCommands} variant="secondary" style={{ flex: 1 }} />
          <ThemedButton title="导出" onPress={handleExportCommands} variant="secondary" style={{ flex: 1 }} />
        </View>
        <View style={{ marginTop: 12 }}>
          {settings.quickCommands.length === 0 ? (
            <Text style={{ color: theme.subTextColor, textAlign: 'center', padding: 10 }}>
              暂无快捷指令
            </Text>
          ) : (
            settings.quickCommands.map((cmd, index) => (
              <View
                key={cmd.id}
                style={[styles.commandItem, { borderBottomColor: theme.borderColor }]}
              >
                <TouchableOpacity
                  style={styles.commandInfo}
                  onPress={() => openEditCommand(cmd)}
                >
                  <Text style={{ color: theme.textColor, fontWeight: '600' }}>{cmd.name}</Text>
                  <Text style={{ color: theme.subTextColor, fontSize: 12 }} numberOfLines={1}>
                    {cmd.content}
                  </Text>
                </TouchableOpacity>
                <View style={styles.commandActions}>
                  <TouchableOpacity onPress={() => moveCommand(index, -1)} style={styles.actionBtn}>
                    <Text>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => moveCommand(index, 1)} style={styles.actionBtn}>
                    <Text>↓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteCommand(cmd.id)}
                    style={styles.actionBtn}
                  >
                    <Text>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ThemedCard>

      <ThemedCard title="基础指令设置">
        <Text style={[styles.sectionLabel, { color: theme.textColor }]}>基础系统指令</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={settings.baseSystemPrompt}
          onChangeText={(text) => setSettings({ ...settings, baseSystemPrompt: text })}
          multiline
          numberOfLines={4}
          placeholder="输入基础系统指令..."
          placeholderTextColor={theme.subTextColor}
        />
        <Text style={[styles.sectionLabel, { color: theme.textColor, marginTop: 12 }]}>统一前置指令</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={settings.unifiedPrePrompt}
          onChangeText={(text) => setSettings({ ...settings, unifiedPrePrompt: text })}
          multiline
          numberOfLines={4}
          placeholder="所有对话都会添加的前置指令..."
          placeholderTextColor={theme.subTextColor}
        />
        <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 8 }}>
          这些指令会在每个对话中生效
        </Text>
      </ThemedCard>

      <ThemedCard title="加入交流群">
        <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '600' }}>
          幻想入界（东方Project AI模拟交流群）
        </Text>
        <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 4 }}>
          群号：1101925715
        </Text>
        <TouchableOpacity
          style={{
            marginTop: 12,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
            backgroundColor: theme.accentColor,
          }}
          onPress={handleJoinQQGroup}
        >
          <Text style={{ color: theme.buttonTextColor, fontSize: 14, fontWeight: '600' }}>
            一键加群（自动打开 QQ）
          </Text>
        </TouchableOpacity>
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 8 }}>
          打不开 QQ 时会自动把群号复制到剪贴板，手动在 QQ 里搜索即可。
        </Text>
      </ThemedCard>

      <View style={{ height: 40 }} />

      <Modal
        visible={showProviderModal}
        animationType="slide"
        onRequestClose={() => setShowProviderModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundColor }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 30) + 12 }]}>
            <TouchableOpacity onPress={() => setShowProviderModal(false)}>
              <Text style={{ color: theme.textColor }}>取消</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.textColor }]}>
              {editingProvider ? providerForm.name || '编辑 AI' : '添加 AI'}
            </Text>
            <TouchableOpacity onPress={saveProvider}>
              <Text style={{ color: theme.accentColor, fontWeight: '600' }}>保存</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16, flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 60 + modalKeyboardHeight }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {/* AI 头像选择 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 }}>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const result = await DocumentPicker.getDocumentAsync({
                      type: 'image/*',
                      copyToCacheDirectory: true,
                    });
                    if (result.canceled || !result.assets || result.assets.length === 0) return;
                    const file = result.assets[0];
                    // 读取为 base64 以便持久化
                    const b64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
                    const dataUri = `data:image/${file.name?.split('.').pop() || 'png'};base64,${b64}`;
                    setProviderForm({ ...providerForm, avatar: dataUri });
                  } catch (e: any) {
                    showAlert('提示', '选择头像失败：' + (e?.message || ''));
                  }
                }}
              >
                {providerForm.avatar ? (
                  <Image source={{ uri: providerForm.avatar }} style={{ width: 56, height: 56, borderRadius: 28 }} />
                ) : (
                  <View style={{
                    width: 56, height: 56, borderRadius: 28,
                    backgroundColor: theme.secondaryColor,
                    borderWidth: 2, borderColor: theme.borderColor,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <IconAI size={24} color={theme.subTextColor} />
                  </View>
                )}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '500' }}>AI 头像</Text>
                <Text style={{ color: theme.subTextColor, fontSize: 12 }}>点击选择图片，将在聊天界面显示</Text>
                {providerForm.avatar && (
                  <TouchableOpacity onPress={() => setProviderForm({ ...providerForm, avatar: '' })}>
                    <Text style={{ color: '#ff4444', fontSize: 12, marginTop: 4 }}>移除头像</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={[styles.providerHeader, { borderBottomColor: theme.borderColor }]}>
              <TextInput
                style={[styles.providerNameInput, { color: theme.textColor }]}
                value={providerForm.name}
                onChangeText={(text) => setProviderForm({ ...providerForm, name: text })}
                placeholder="给这个 AI 起个名字"
                placeholderTextColor={theme.subTextColor}
              />
              {editingProvider && (
                <TouchableOpacity
                  style={[styles.deleteHeaderBtn, { borderColor: '#ff4444' }]}
                  onPress={() => {
                    setShowProviderModal(false);
                    deleteProvider(editingProvider.id);
                  }}
                >
                  <Text style={{ color: '#ff4444' }}>删除</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.guideLink, { backgroundColor: theme.secondaryColor }]}
              onPress={() => Alert.alert('设置指南', '1. 选择 API 模式\n2. 填写 API 主机地址\n3. 粘贴 API 密钥\n4. 获取或手动添加模型\n5. 保存即可使用')}
            >
              <Text style={{ color: theme.textColor, marginRight: 8 }}>?</Text>
              <Text style={{ color: theme.textColor }}>设置指南</Text>
            </TouchableOpacity>

            <Text style={[styles.inputLabel, { color: theme.textColor }]}>常见服务商预设</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
              <View style={styles.presetList}>
                {aiService.getPresets().map((preset: any) => (
                  <TouchableOpacity
                    key={preset.id}
                    style={[
                      styles.presetChip,
                      { backgroundColor: theme.inputBgColor, borderColor: theme.borderColor },
                    ]}
                    onPress={() => {
                      const basePathMatch = preset.baseUrl.match(/^(https?:\/\/[^/]+)(\/.*)$/);
                      const host = basePathMatch ? basePathMatch[1] : preset.baseUrl;
                      const path = basePathMatch ? basePathMatch[2] : '';
                      const apiPath = path && path !== '/v1' ? (preset.apiPath || '') : (preset.apiPath || '/chat/completions');
                      const finalBase = path && path !== '/v1' ? host : preset.baseUrl;
                      const finalPath = path && path !== '/v1' ? path : apiPath;
                      setProviderForm({
                        ...providerForm,
                        name: preset.name,
                        baseUrl: finalBase,
                        apiPath: finalPath,
                        capabilities: preset.capabilities,
                        mode: preset.format,
                        format: preset.format,
                        model: preset.defaultModel,
                      });
                      if (preset.defaultModel) {
                        setModelList([preset.defaultModel]);
                      } else {
                        setModelList([]);
                      }
                    }}
                  >
                    <Text style={[styles.presetChipText, { color: theme.textColor }]}>
                      {preset.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={{ color: theme.subTextColor, fontSize: 12, marginBottom: 16 }}>
              选择后只需填写 API 密钥即可
            </Text>

            <Text style={[styles.inputLabel, { color: theme.textColor }]}>API 模式</Text>
            <View style={styles.modeButtons}>
              {Object.keys(modeLabels).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.modeButton,
                    {
                      backgroundColor: providerForm.mode === mode ? theme.accentColor : theme.inputBgColor,
                      borderWidth: 1,
                      borderColor: providerForm.mode === mode ? theme.accentColor : theme.borderColor,
                    },
                  ]}
                  onPress={() => setProviderForm({ ...providerForm, mode, format: mode as any })}
                >
                  <Text style={{ 
                    color: providerForm.mode === mode ? theme.buttonTextColor : theme.textColor, 
                    fontSize: 13,
                    fontWeight: providerForm.mode === mode ? '600' : '500',
                  }}>{modeLabels[mode]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: theme.textColor }]}>API 密钥</Text>
            <View style={styles.apiKeyRow}>
              <View style={styles.apiKeyInputWrapper}>
                <TextInput
                  style={[styles.apiKeyInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                  value={providerForm.apiKey}
                  onChangeText={(text) => setProviderForm({ ...providerForm, apiKey: text })}
                  placeholder="sk-..."
                  placeholderTextColor={theme.subTextColor}
                  secureTextEntry={!showApiKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={styles.showKeyBtn}
                  onPress={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <IconEyeOff size={18} color={theme.subTextColor} />
                  ) : (
                    <IconEye size={18} color={theme.subTextColor} />
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.checkBtn, { backgroundColor: theme.accentColor }]}
                onPress={checkApi}
                disabled={checkingApi}
              >
                <Text style={{ color: theme.buttonTextColor }}>
                  {checkingApi ? '检查中' : '检查'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.urlRow}>
              <View style={styles.urlField}>
                <Text style={[styles.inputLabel, { color: theme.textColor }]}>API 主机</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                  value={providerForm.baseUrl}
                  onChangeText={(text) => setProviderForm({ ...providerForm, baseUrl: text })}
                  placeholder="https://api.example.com"
                  placeholderTextColor={theme.subTextColor}
                />
              </View>
              <View style={styles.urlField}>
                <Text style={[styles.inputLabel, { color: theme.textColor }]}>API 路径</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                  value={providerForm.apiPath}
                  onChangeText={(text) => setProviderForm({ ...providerForm, apiPath: text })}
                  placeholder="/chat/completions"
                  placeholderTextColor={theme.subTextColor}
                />
              </View>
            </View>

            <Text style={{ color: theme.subTextColor, fontSize: 12, marginBottom: 16 }}>
              {buildBaseUrl(providerForm.baseUrl, providerForm.apiPath)}
            </Text>

            <View style={styles.modelSection}>
              <View style={styles.modelSectionHeader}>
                <Text style={[styles.inputLabel, { color: theme.textColor, marginTop: 0 }]}>模型</Text>
                <View style={styles.modelActions}>
                  <TouchableOpacity
                    style={[styles.modelActionBtn, { backgroundColor: theme.inputBgColor, borderWidth: 1, borderColor: theme.borderColor }]}
                    onPress={resetModels}
                  >
                    <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500' }}>重置</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modelActionBtn, { backgroundColor: theme.inputBgColor, borderWidth: 1, borderColor: theme.borderColor }]}
                    onPress={fetchModels}
                  >
                    <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500' }}>获取</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modelActionBtn, { backgroundColor: theme.accentColor }]}
                    onPress={() => setShowModelForm(true)}
                  >
                    <Text style={{ color: theme.buttonTextColor, fontSize: 13, fontWeight: '600' }}>+ 新建</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {modelList.length === 0 ? (
                <Text style={{ color: theme.subTextColor, padding: 12 }}>
                  暂无模型，点击"获取"或"新建"添加
                </Text>
              ) : (
                modelList.map((model) => (
                  <TouchableOpacity
                    key={model}
                    style={[
                      styles.modelItem,
                      {
                        backgroundColor: providerForm.model === model ? theme.accentColor : theme.secondaryColor,
                        borderColor: providerForm.model === model ? theme.accentColor : 'transparent',
                      },
                    ]}
                    onPress={() => setProviderForm({ ...providerForm, model })}
                  >
                    <Text
                      style={{
                        color: providerForm.model === model ? theme.buttonTextColor : theme.textColor,
                        flex: 1,
                        fontSize: 15,
                        fontWeight: providerForm.model === model ? '600' : '400',
                      }}
                      numberOfLines={1}
                    >
                      {model}
                    </Text>
                    <TouchableOpacity
                      style={styles.modelRemoveBtn}
                      onPress={() => removeModel(model)}
                    >
                      <Text style={{ color: '#ff4444', fontSize: 14, fontWeight: '500' }}>删除</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.inputLabel, { color: theme.textColor, marginBottom: 0 }]}>支持的能力（可多选）</Text>
              <TouchableOpacity
                style={{
                  marginLeft: 'auto',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: theme.accentColor,
                }}
                onPress={async () => {
                  const fullUrl = buildBaseUrl(providerForm.baseUrl, providerForm.apiPath);
                  if (!fullUrl || !providerForm.apiKey) {
                    Alert.alert('提示', '请先填写API主机和密钥');
                    return;
                  }
                  const result = await aiService.fetchModels(fullUrl, providerForm.apiKey, providerForm.format);
                  if (result.error || result.models.length === 0) {
                    Alert.alert('检测失败', result.error || '未获取到模型列表');
                    return;
                  }
                  const detected = aiService.detectCapabilities(result.models, providerForm.format);
                  setProviderForm({ ...providerForm, capabilities: detected });
                  if (result.models.length > 0 && !providerForm.model) {
                    setProviderForm({ ...providerForm, capabilities: detected, model: result.models[0] });
                    setModelList(result.models);
                  }
                  Alert.alert('检测完成', `检测到能力：${detected.map((c) => typeLabels[c]).join('、')}\n发现 ${result.models.length} 个模型`);
                }}
              >
                <Text style={{ color: theme.buttonTextColor, fontSize: 12, fontWeight: '600' }}>自动检测</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.capabilityRow}>
              {(Object.keys(typeLabels) as AIType[]).map((type) => {
                const isSelected = providerForm.capabilities.includes(type);
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.capabilityChip,
                      {
                        backgroundColor: isSelected ? theme.accentColor : theme.inputBgColor,
                        borderColor: isSelected ? theme.accentColor : theme.borderColor,
                      },
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        if (providerForm.capabilities.length > 1) {
                          setProviderForm({
                            ...providerForm,
                            capabilities: providerForm.capabilities.filter((c) => c !== type),
                          });
                        }
                      } else {
                        setProviderForm({
                          ...providerForm,
                          capabilities: [...providerForm.capabilities, type],
                        });
                      }
                    }}
                  >
                    <Text style={{ 
                      color: isSelected ? theme.buttonTextColor : theme.textColor, 
                      fontSize: 13,
                      fontWeight: isSelected ? '600' : '500',
                    }}>
                      {isSelected ? '✓ ' : ''}{typeLabels[type]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showModelForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModelForm(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModelForm(false)}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
            <Text style={[styles.modalContentTitle, { color: theme.textColor }]}>新建模型</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
              value={newModelName}
              onChangeText={setNewModelName}
              placeholder="输入模型名称"
              placeholderTextColor={theme.subTextColor}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={() => setShowModelForm(false)}
              >
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accentColor }]}
                onPress={addModel}
              >
                <Text style={{ color: theme.buttonTextColor }}>添加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showCommandModal}
        animationType="slide"
        onRequestClose={() => setShowCommandModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundColor }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 30) + 12 }]}>
            <TouchableOpacity onPress={() => setShowCommandModal(false)}>
              <Text style={{ color: theme.textColor }}>取消</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.textColor }]}>
              {editingCommand ? '编辑快捷指令' : '添加快捷指令'}
            </Text>
            <TouchableOpacity onPress={saveCommand}>
              <Text style={{ color: theme.accentColor, fontWeight: '600' }}>保存</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
            <Text style={[styles.inputLabel, { color: theme.textColor }]}>名称</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
              value={commandForm.name}
              onChangeText={(text) => setCommandForm({ ...commandForm, name: text })}
              placeholder="指令名称（显示在按钮上）"
              placeholderTextColor={theme.subTextColor}
            />

            <Text style={[styles.inputLabel, { color: theme.textColor }]}>内容</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
              value={commandForm.content}
              onChangeText={(text) => setCommandForm({ ...commandForm, content: text })}
              placeholder="点击后插入到输入框的内容"
              placeholderTextColor={theme.subTextColor}
              multiline
              numberOfLines={6}
            />
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showFontFamilyModal}
        animationType="slide"
        onRequestClose={() => setShowFontFamilyModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: theme.backgroundColor }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 30) + 12 }]}>
            <TouchableOpacity onPress={() => setShowFontFamilyModal(false)}>
              <Text style={{ color: theme.textColor }}>取消</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.textColor }]}>选择字体</Text>
            <TouchableOpacity onPress={() => setShowFontFamilyModal(false)}>
              <Text style={{ color: theme.accentColor, fontWeight: '600' }}>完成</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
            {fontFamilyOptions.map((opt) => {
              const isSelected = theme.fontFamily === opt.value;
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.fontFamilyItem,
                    {
                      backgroundColor: isSelected ? theme.accentColor : theme.inputBgColor,
                      borderColor: isSelected ? theme.accentColor : theme.borderColor,
                    },
                  ]}
                  onPress={() => {
                    updateTheme({ fontFamily: opt.value });
                    setShowFontFamilyModal(false);
                  }}
                >
                  <View style={styles.fontFamilyItemInfo}>
                    <Text style={[
                      styles.fontFamilyItemLabel,
                      { color: isSelected ? '#fff' : theme.textColor },
                    ]}>
                      {opt.label}
                    </Text>
                    <Text
                      style={[
                        styles.fontFamilyItemPreview,
                        { color: isSelected ? '#fff' : theme.subTextColor },
                      ]}
                    >
                      {opt.preview}
                    </Text>
                  </View>
                  {isSelected && (
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showColorPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowColorPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowColorPicker(false)}
        >
          <TouchableOpacity
            style={[styles.colorPickerDialog, { backgroundColor: theme.primaryColor }]}
            activeOpacity={1}
          >
            <Text style={[styles.colorPickerTitle, { color: theme.textColor }]}>自定义颜色</Text>
            <Text style={[styles.colorPickerSubtitle, { color: theme.subTextColor }]}>
              {customColorKey === 'accentColor' && '设置主题强调色'}
              {customColorKey === 'buttonColor' && '设置按钮颜色'}
              {customColorKey === 'backgroundColor' && '设置背景颜色'}
              {customColorKey === 'textColor' && '设置文字颜色'}
              {customColorKey === 'primaryColor' && '设置卡片背景色'}
              {customColorKey === 'secondaryColor' && '设置次级背景色'}
              {customColorKey === 'borderColor' && '设置边框颜色'}
              {customColorKey === 'inputBorderColor' && '设置输入框边框颜色'}
              {customColorKey === 'inputBgColor' && '设置输入框背景颜色'}
              {customColorKey === 'buttonBorderColor' && '设置按钮边框颜色'}
              {customColorKey === 'buttonGradientColor' && '设置按钮渐变颜色'}
              {customColorKey === 'splashBackgroundColor' && '设置开屏背景颜色'}
            </Text>

            <View
              style={[
                styles.colorPreview,
                {
                  backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(customColorValue) || /^#[0-9A-Fa-f]{3}$/.test(customColorValue)
                    ? customColorValue
                    : '#ccc',
                  borderColor: theme.borderColor,
                },
              ]}
            />

            <Text style={[styles.inputLabel, { color: theme.textColor, marginTop: 16 }]}>颜色值（HEX）</Text>
            <View style={styles.hexInputRow}>
              <Text style={[styles.hexPrefix, { color: theme.subTextColor }]}>#</Text>
              <TextInput
                style={[styles.hexInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                value={customColorValue.replace('#', '')}
                onChangeText={(text) => setCustomColorValue('#' + text.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6))}
                placeholder="ff6b35"
                placeholderTextColor={theme.subTextColor}
                maxLength={6}
                autoCapitalize="characters"
              />
            </View>

            <Text style={[styles.colorPickerHint, { color: theme.subTextColor }]}>
              例如：ff6b35 或 #ff6b35
            </Text>

            <View style={styles.colorPickerActions}>
              <TouchableOpacity
                style={[styles.colorPickerBtn, styles.colorPickerCancel, { backgroundColor: theme.secondaryColor }]}
                onPress={() => setShowColorPicker(false)}
              >
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.colorPickerBtn, styles.colorPickerConfirm, { backgroundColor: theme.accentColor }]}
                onPress={saveCustomColor}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>确定</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
    <ThemedAlert
      visible={alertVisible}
      title={alertConfig.title}
      message={alertConfig.message}
      confirmText={alertConfig.confirmText}
      cancelText={alertConfig.cancelText}
      onConfirm={() => { setAlertVisible(false); alertConfig.onConfirm?.(); }}
      onCancel={() => { setAlertVisible(false); alertConfig.onCancel?.(); }}
      theme={theme}
    />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginVertical: 8,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 6,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconTile: {
    width: '48.5%',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  iconTileLabel: {
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '75%',
  },
  iconPreviewRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconPreviewImg: {
    width: 34,
    height: 34,
    borderRadius: 6,
  },
  iconPickBtn: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  iconResetAllBtn: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },

  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  wallpaperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wallpaperPreview: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  wallpaperImage: {
    width: '100%',
    height: '100%',
  },
  removeWallpaperBtn: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 2,
  },
  wallpaperBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thinkingTextInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 4,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  weightBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtn: {
    width: 44,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: {
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '600',
  },
  providerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  providerInfo: {
    flex: 1,
  },
  providerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionBtn: {
    padding: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  textArea: {
    maxHeight: 240,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  commandItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  commandInfo: {
    flex: 1,
  },
  commandActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 16,
  },
  providerNameInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    paddingVertical: 8,
  },
  deleteHeaderBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    marginLeft: 12,
  },
  guideLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  presetScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  presetList: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  inputLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '600',
    fontSize: 14,
  },
  textInput: {
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
  },
  apiKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  apiKeyInput: {
    flex: 1,
    borderRadius: 10,
    padding: 14,
    paddingRight: 40,
    fontSize: 15,
  },
  apiKeyInputWrapper: {
    flex: 1,
    position: 'relative',
  },
  showKeyBtn: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  checkBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 10,
  },
  urlRow: {
    flexDirection: 'row',
    gap: 10,
  },
  urlField: {
    flex: 1,
  },
  modeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  capabilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  capabilityChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  modelSection: {
    marginTop: 8,
    marginBottom: 16,
  },
  modelSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modelActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modelActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
  },
  modelRemoveBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 12,
    padding: 20,
  },
  modalContentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  customColorBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorPickerDialog: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
  },
  colorPickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  colorPickerSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
  },
  colorPreview: {
    width: '100%',
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
  },
  hexInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  hexPrefix: {
    fontSize: 16,
    fontWeight: '600',
  },
  hexInput: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    letterSpacing: 2,
  },
  colorPickerHint: {
    fontSize: 12,
    marginTop: 6,
  },
  colorPickerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  colorPickerBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  colorPickerCancel: {
  },
  colorPickerConfirm: {
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '700',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  usernameDisplay: {
    paddingVertical: 4,
  },
  usernameText: {
    fontSize: 17,
    fontWeight: '600',
  },
  usernameEditHint: {
    fontSize: 11,
    marginTop: 2,
  },
  usernameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  usernameInput: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    borderWidth: 2,
  },
  usernameSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  userIdText: {
    fontSize: 12,
    marginTop: 2,
  },
  fontSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  fontFamilyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  fontFamilyItemInfo: {
    flex: 1,
  },
  fontFamilyItemLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  fontFamilyItemPreview: {
    fontSize: 13,
    marginTop: 4,
  },
  borderStyleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  borderStyleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  buttonPatternRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  buttonPatternChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  gradientColorBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
  },
  dayNightRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginTop: 8,
    gap: 4,
    alignSelf: 'flex-start',
  },
  dayNightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  bubbleStyleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  bubbleStyleCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  bubblePreview: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  bubblePreviewDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
