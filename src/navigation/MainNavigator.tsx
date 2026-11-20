import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Animated,
  PanResponder,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp, createChatFromCharacter, applyCharacterToChat } from '../context/AppContext';
import { ChatScreen } from '../screens/ChatScreen';
import { ChatHistoryScreen } from '../screens/ChatHistoryScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { RightDrawerContent } from '../screens/RightDrawerContent';
import { LeftDrawerContent } from '../screens/LeftDrawerContent';
import { GroupChatListScreen } from '../screens/GroupChatListScreen';
import { FavoriteMessagesScreen } from '../screens/FavoriteMessagesScreen';
import { CharacterBrowserScreen } from '../screens/CharacterBrowserScreen';
import { RecycleBinScreen } from '../screens/RecycleBinScreen';
import { ThemeSettingsScreen } from '../screens/ThemeSettingsScreen';
import { BrowserScreen } from '../screens/BrowserScreen';
import { FancyToolBoxScreen } from '../screens/FancyToolBoxScreen';
import { WorldOrganizerScreen } from '../screens/WorldOrganizerScreen';
import { WorldBookScreen } from '../screens/WorldBookScreen';
import { AIProviderScreen } from '../screens/AIProviderScreen';
import { PythonEditorScreen } from '../screens/PythonEditorScreen';
import { UserSettingsScreen } from '../screens/UserSettingsScreen';
import { SystemCheckScreen } from '../screens/SystemCheckScreen';
import { CommunityScreen } from '../screens/CommunityScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ImportCardScreen } from '../screens/ImportCardScreen';
import { EraGameScreen } from '../screens/EraGameScreen';
import { MediaLibraryScreen } from '../screens/MediaLibraryScreen';
import { CustomInterfaceScreen } from '../screens/CustomInterfaceScreen';
import { inferBackgroundKind } from '../components/VideoBackground';
import { communityService } from '../services/communityService';
import { IconBack, IconClose, IconMenu } from '../components/Icons';
import { generateId, defaultChatSettings } from '../constants/defaults';
import { Chat, GroupMember, ChatMessage, Character } from '../types';
import { macroService } from '../services/macroService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;

/**
 * 侧栏宽度。
 * 之前是 SCREEN_WIDTH * 0.85 —— 手机上可以，但在平板/横屏上会变成一个几乎占满屏幕的
 * 巨型抽屉，把主界面整块盖住。这里改为「跟随屏幕但封顶」，让侧栏始终是一个明确的
 * 侧边栏而不是全屏面板。
 */
const RAIL_MAX_WIDTH = 320;
const DRAWER_WIDTH = Math.min(RAIL_MAX_WIDTH, Math.round(SCREEN_WIDTH * 0.8));

/** 非对话类的「面板」界面：它们不再用整屏 Modal 顶掉侧栏，而是替换右侧主界面。 */
const PANEL_TITLES: Record<string, string> = {
  characterBrowser: '角色卡库',
  characterPicker: '添加角色',
  recycleBin: '回收站',
  themeSettings: '主题设置',
  settings: '设置',
  chatHistory: '对话历史',
  favoriteMessages: '收藏消息',
  favoriteChats: '收藏对话',
  worldBookOrganizer: '世界观整理工具',
  worldbookEditor: '世界书管理',
  fancyToolBox: '花式工具箱',
  browser: '内置浏览器',
  aiProvider: 'AI 模型设置',
  userSettings: '用户设置',
  systemCheck: '系统自检',
  pythonEditor: 'Python 脚本',
  groupChat: '群聊',
  auth: '登录',
  profile: '个人资料',
  community: '鲵吞亭社区',
  eraGame: 'ERA 游戏库',
  importCard: '导入卡片',
  mediaLibrary: '素材库',
  customInterface: '自定义界面',
};

/**
 * 面板宿主：在主界面区域内渲染一个面板界面，并给它加一条统一的「返回对话」标题栏。
 * 这样左侧栏保持可用，切换菜单只是替换右侧内容，而不是把整个应用顶掉。
 */
const PanelHost: React.FC<{
  title: string;
  onBack: () => void;
  onOpenMenu: () => void;
  children: React.ReactNode;
}> = ({ title, onBack, onOpenMenu, children }) => {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.borderColor,
          backgroundColor: theme.menuBgColor,
          gap: 4,
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="返回对话"
        >
          <IconBack size={22} color={theme.textColor} />
        </TouchableOpacity>
        <Text
          style={{ flex: 1, color: theme.textColor, fontSize: 17, fontWeight: '600' }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {/* 顶部栏常驻菜单入口：面板里也能唤出左侧菜单，不用先返回对话 */}
        <TouchableOpacity
          onPress={onOpenMenu}
          style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="打开菜单"
        >
          <IconMenu size={22} color={theme.textColor} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onBack}
          style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="关闭面板"
        >
          <IconClose size={20} color={theme.subTextColor} />
        </TouchableOpacity>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
};

export const MainNavigator: React.FC = () => {
  const theme = useTheme();
  const { chats, setChats, currentChatId, setCurrentChatId, settings, characters, setCharacters, isLoading, currentUser, updateCurrentUser, logout: appLogout } = useApp();
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  /** 正在拖拽侧栏手势（用于在拖拽期间才挂载抽屉） */
  const [drawerDragging, setDrawerDragging] = useState(false);
  const [showWorldBookEditor, setShowWorldBookEditor] = useState(false);
  const [worldBookEditorId, setWorldBookEditorId] = useState<string | undefined>(undefined);
  const [leftTab, setLeftTab] = useState<'history' | 'favorites' | 'messageFavorites' | 'settings' | 'group'>('history');
  const isMountedRef = useRef(true);

  const translateX = useRef(new Animated.Value(0)).current;
  const panStartX = useRef(0);
  const currentTranslateX = useRef(0);
  const leftDrawerRef = useRef<any>(null);
  const mainContentRef = useRef<any>(null);

  // 社区/用户状态：合并登录后，communityUser 派生自 AppContext.currentUser（游客不可访问社区）
  const communityUser = (currentUser && !currentUser.isGuest) ? currentUser : null;

  /** 当前打开的「面板」界面（非对话类界面）：替换主界面内容，侧栏可随时划出或关闭 */
  const [modalScreen, setModalScreen] = useState<string | null>(null);
  const [modalFocusSection, setModalFocusSection] = useState<string | undefined>(undefined);
  /**
   * 视频背景播放状态（提升到这里，让右侧菜单能控制它）。
   * 默认静音 + 播放：用户要求「默认都是关闭」指的是声音，所以 muted 从 true 起步。
   */
  const [videoBgState, setVideoBgState] = useState<{ muted: boolean; paused: boolean }>({
    muted: true,
    paused: false,
  });
  /** 面板状态用 ref 暴露给 useCallback 里的抽屉开关，避免闭包过期 */
  const modalScreenRef = useRef<string | null>(null);

  // 用 ref 追踪最新状态，避免 PanResponder 闭包过期
  const swipeEnabledRef = useRef(settings.swipeGesturesEnabled);
  const leftDrawerOpenRef = useRef(leftDrawerOpen);
  const rightDrawerOpenRef = useRef(rightDrawerOpen);

  useEffect(() => {
    swipeEnabledRef.current = settings.swipeGesturesEnabled;
  }, [settings.swipeGesturesEnabled]);

  useEffect(() => {
    leftDrawerOpenRef.current = leftDrawerOpen;
  }, [leftDrawerOpen]);

  useEffect(() => {
    rightDrawerOpenRef.current = rightDrawerOpen;
  }, [rightDrawerOpen]);

  useEffect(() => {
    modalScreenRef.current = modalScreen;
  }, [modalScreen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const listener = translateX.addListener(({ value }) => {
      currentTranslateX.current = value;
    });
    return () => translateX.removeListener(listener);
  }, [translateX]);

  useEffect(() => {
    // 挂载时强制归零：任何残留位移都会让侧栏露出、主界面被顶偏
    translateX.setOffset(0);
    translateX.setValue(0);
    currentTranslateX.current = 0;
  }, []);

  useEffect(() => {
    // 打开面板时强制归零并关掉抽屉：
    // 否则残留位移会把面板整体顶偏（实测能偏出整整一个 DRAWER_WIDTH）。
    if (modalScreen) {
      setLeftDrawerOpen(false);
      setRightDrawerOpen(false);
      translateX.setOffset(0);
      translateX.setValue(0);
      currentTranslateX.current = 0;
    }
  }, [modalScreen]);

  useEffect(() => {
    // 数据加载期间不做任何路由决策，避免 chats 为空时误建假的「新对话」覆盖上次打开的会话
    if (isLoading) return;
    if (chats.length === 0) {
      createNewChat();
    } else if (!currentChatId || !chats.find((c) => c.id === currentChatId)) {
      // 按更新时间倒序：优先选择最近有消息的非 manual 对话
      const nonManual = chats
        .filter(c => c.conversationType !== 'manual' && (c.messages?.length ?? 0) > 0)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      const target = (nonManual.length > 0 ? nonManual[0] : null)
        || chats.filter(c => c.conversationType !== 'manual').sort((a,b)=>(b.updatedAt??0)-(a.updatedAt??0))[0]
        || chats[0];
      setCurrentChatId(target.id);
    }
  }, [chats, currentChatId, isLoading]);

  const createNewChat = useCallback(() => {
    const currentChat = chats.find((c) => c.id === currentChatId);
    
    if (currentChat?.conversationType === 'parent') {
      const greetingEnabled = currentChat.settings?.greetingEnabled;
      const greetingText = currentChat.settings?.greeting || '';
      const initialMessages: ChatMessage[] = [];
      if (greetingEnabled && greetingText.trim()) {
        const character = characters.find((c) => c.id === currentChat.characterId);
        const userName = currentChat.settings?.userName || settings?.userProfile?.username || '用户';
        const context = macroService.buildContext({
          character,
          userName,
          messages: [],
          chatTitle: currentChat.title,
          systemPrompt: currentChat.settings?.systemPrompt,
        });
        const renderedGreeting = macroService.render(greetingText, context);
        initialMessages.push({
          id: generateId(),
          role: 'assistant',
          content: renderedGreeting,
          images: [],
          timestamp: Date.now(),
        });
      }
      const childChat: Chat = {
        id: generateId(),
        title: `${currentChat.title} - 子对话`,
        messages: initialMessages,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        worldBookIds: [...currentChat.worldBookIds],
        settings: { ...currentChat.settings },
        parentId: currentChat.id,
        conversationType: 'child',
      };
      const updated = [childChat, ...chats];
      setChats(updated);
      setCurrentChatId(childChat.id);
      closeDrawers();
    } else {
      const newChat: Chat = {
        id: generateId(),
        title: '新对话',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        worldBookIds: [],
        settings: { ...defaultChatSettings },
        conversationType: 'parent',
      };
      const updated = [newChat, ...chats];
      setChats(updated);
      setCurrentChatId(newChat.id);
      closeDrawers();
    }
  }, [chats, currentChatId]);

  const selectChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    closeDrawers();
  }, []);

  // 统一导入：角色卡（PNG/JSON/JPG/GIF/WebP）或对话 JSON
  const handleImport = useCallback(async () => {
    try {
      const { importCharacterCardFile } = await import('../utils/characterCardImport');
      const result = await importCharacterCardFile();
      if (!result) return;

      if (result.chatImported) {
        // 对话 JSON 导入
        const { chat: importedChat } = result.chatImported;
        const newChat = {
          ...importedChat,
          id: generateId(),
          title: importedChat.title + ' (导入)',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setChats([newChat, ...chats]);
        setCurrentChatId(newChat.id);
      } else if (result.characters.length > 0) {
        // 角色卡导入：加入角色库 + 创建对话
        const existingNames = characters.map(c => c.name);
        result.characters.forEach((c, i) => {
          if (existingNames.includes(c.name)) {
            c.name = `${c.name} (${existingNames.filter(n => n === c.name).length + 1})`;
          }
        });
        await setCharacters([...characters, ...result.characters]);
        setChats([...result.chats, ...chats]);
        if (result.chats.length === 1) {
          setCurrentChatId(result.chats[0].id);
        }
      }
    } catch (e: any) {
      // 静默失败，用户取消选择不算错误
      if (!e?.message?.includes('canceled')) {
        console.warn('Import error:', e);
      }
    }
  }, [chats, characters, setChats, setCharacters]);

  const createNewGroupChat = useCallback(() => {
    const newChat: Chat = {
      id: generateId(),
      title: '新群聊',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      worldBookIds: [],
      settings: { ...defaultChatSettings },
      conversationType: 'group',
      groupMembers: [],
    };
    const updated = [newChat, ...chats];
    setChats(updated);
    setCurrentChatId(newChat.id);
    closeDrawers();
  }, [chats]);

  /**
   * ⚠️ 打开/关闭抽屉时**不要再跑 useNativeDriver 动画**。
   *
   * 抽屉和主界面的位置现在完全由「静态样式」精确给出（见下面的 staticXxxDrawerStyle /
   * resolvedMainStyle）。而 translateX 这个 Animated.Value 只在**手指拖拽过程中**才被样式引用。
   * 如果开关时还额外 start() 一个原生动画，原生侧会继续往那个已经被静态 transform 接管的
   * 节点写值，两者打架 —— 表现就是「关掉右菜单后界面卡住、只剩半截侧栏」。
   * 所以这里只把动画停掉、把值同步过去。
   */
  const syncDrawerTranslate = useCallback(
    (v: number) => {
      try {
        translateX.stopAnimation();
      } catch {
        /* ignore */
      }
      translateX.setValue(v);
    },
    [translateX],
  );

  const openLeftDrawer = useCallback(() => {
    if (!isMountedRef.current) return;
    setLeftDrawerOpen(true);
    setRightDrawerOpen(false);
    syncDrawerTranslate(DRAWER_WIDTH);
  }, [syncDrawerTranslate]);

  const openRightDrawer = useCallback(() => {
    if (!isMountedRef.current) return;
    if (modalScreenRef.current) {
      // 面板模式下不打开右侧对话设置抽屉（它属于对话，不属于面板）
      return;
    }
    setRightDrawerOpen(true);
    setLeftDrawerOpen(false);
    syncDrawerTranslate(-DRAWER_WIDTH);
  }, [syncDrawerTranslate]);

  const closeDrawers = useCallback(() => {
    if (!isMountedRef.current) return;
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
    syncDrawerTranslate(0);
  }, [syncDrawerTranslate]);

  const currentChat = chats.find((c) => c.id === currentChatId);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // 使用 capture 阶段：先于子组件（ChatScreen 的 ScrollView/FlatList）拦截
      // 否则水平滑动会被子组件的 ScrollView 抢走，导致无法左右滑打开菜单
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        // 用 pageX（屏幕绝对坐标）判断触摸位置，locationX 在 capture 阶段是相对于深层子 View 的，不可靠
        const touchX = evt.nativeEvent.pageX ?? evt.nativeEvent.locationX ?? 0;
        const dx = gestureState.dx;
        const dxAbs = Math.abs(dx);
        const dyAbs = Math.abs(gestureState.dy);

        // 左菜单已打开：菜单内（x <= DRAWER_WIDTH）不拦截，留给 LeftDrawerContent 切换标签；菜单外拦截用于关闭
        if (leftDrawerOpenRef.current) {
          if (touchX <= DRAWER_WIDTH) return false;
          return dxAbs > 15 && dxAbs > dyAbs * 1.5;
        }
        // 右菜单已打开：菜单内（x >= SCREEN_WIDTH - DRAWER_WIDTH）不拦截；菜单外拦截用于关闭
        if (rightDrawerOpenRef.current) {
          if (touchX >= SCREEN_WIDTH - DRAWER_WIDTH) return false;
          return dxAbs > 15 && dxAbs > dyAbs * 1.5;
        }
        // 菜单关闭时：需 swipeGesturesEnabled 开启，且水平位移明显大于垂直（阈值 20 避免误触按钮）
        if (!swipeEnabledRef.current) return false;
        return dxAbs > 20 && dxAbs > dyAbs * 1.8;
      },
      // 捕获后不允许子组件抢走 responder
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        panStartX.current = currentTranslateX.current;
        setDrawerDragging(true);
      },
      onPanResponderMove: (_, gestureState) => {
        // 绝对赋值（不使用 setOffset/flattenOffset）：
        // 之前的 offset 机制会残留位移，导致抽屉在静止时仍露出一截、主界面被顶偏。
        let target: number;
        if (leftDrawerOpenRef.current) {
          target = Math.min(DRAWER_WIDTH, Math.max(0, DRAWER_WIDTH + gestureState.dx));
        } else if (rightDrawerOpenRef.current) {
          target = Math.max(-DRAWER_WIDTH, Math.min(0, -DRAWER_WIDTH + gestureState.dx));
        } else {
          target = Math.min(DRAWER_WIDTH, Math.max(-DRAWER_WIDTH, gestureState.dx));
        }
        translateX.setValue(target);
      },
      onPanResponderRelease: (_, gestureState) => {
        // 等归位/关闭动画播完再卸载抽屉
        setTimeout(() => setDrawerDragging(false), 300);
        const currentX = currentTranslateX.current;
        const velocity = gestureState.vx;

        if (leftDrawerOpenRef.current) {
          if (currentX < DRAWER_WIDTH - SWIPE_THRESHOLD || velocity < -0.5) {
            closeDrawers();
          } else {
            Animated.spring(translateX, {
              toValue: DRAWER_WIDTH,
              useNativeDriver: true,
              tension: 65,
              friction: 10,
            }).start();
          }
        } else if (rightDrawerOpenRef.current) {
          if (currentX > -DRAWER_WIDTH + SWIPE_THRESHOLD || velocity > 0.5) {
            closeDrawers();
          } else {
            Animated.spring(translateX, {
              toValue: -DRAWER_WIDTH,
              useNativeDriver: true,
              tension: 65,
              friction: 10,
            }).start();
          }
        } else {
          if (currentX > SWIPE_THRESHOLD || velocity > 0.8) {
            openLeftDrawer();
          } else if (currentX < -SWIPE_THRESHOLD || velocity < -0.8) {
            openRightDrawer();
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              tension: 65,
              friction: 10,
            }).start();
          }
        }
      },
    })
  ).current;

  const mainAnimatedStyle = {
    transform: [{ translateX }],
  };

  const leftDrawerAnimatedStyle = {
    transform: [
      {
        translateX: translateX.interpolate({
          inputRange: [-DRAWER_WIDTH, 0, DRAWER_WIDTH],
          outputRange: [-DRAWER_WIDTH, -DRAWER_WIDTH, 0],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  const rightDrawerAnimatedStyle = {
    transform: [
      {
        translateX: translateX.interpolate({
          inputRange: [-DRAWER_WIDTH, 0, DRAWER_WIDTH],
          outputRange: [0, DRAWER_WIDTH, DRAWER_WIDTH],
          extrapolate: 'clamp',
        }),
      },
    ],
  };

  /** 从内置浏览器页面里提取到的角色卡数据 → 解析、入库、建对话 */
  const handleBrowserExtractCharacter = React.useCallback(
    async (raw: string, _pageUrl: string) => {
      try {
        const { normalizeCharacterCard } = await import('../utils/characterCardImport');
        const jsonText = String(raw || '').trim();
        if (!jsonText) {
          Alert.alert('导入失败', '页面里没有可解析的角色卡数据');
          return;
        }
        // 页面里的数据可能是纯 JSON，也可能是 base64 编码的 JSON
        let parsed: any;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          try {
            const { b64Decode } = await import('../utils/characterCardImport');
            const bytes = b64Decode(jsonText);
            parsed = JSON.parse(new TextDecoder().decode(bytes));
          } catch {
            Alert.alert('导入失败', '识别到角色卡数据，但格式无法解析');
            return;
          }
        }
        const card = normalizeCharacterCard(parsed);
        const nameTaken = characters.some((c) => c.name === card.name);
        if (nameTaken) {
          card.name = `${card.name} (${characters.filter((c) => c.name.startsWith(card.name)).length + 1})`;
        }
        await setCharacters([...characters, card]);
        const newChat = createChatFromCharacter(card);
        setChats([newChat, ...chats]);
        setCurrentChatId(newChat.id);
        closeModalScreen();
        Alert.alert('导入成功', `已添加角色「${card.name}」并创建对话`);
      } catch (e: any) {
        console.warn('[browser] 解析角色卡失败', e);
        Alert.alert('导入失败', e?.message || '角色卡数据无法解析');
      }
    },
    [characters, chats, setCharacters, setChats],
  );

  const updateChatSettings = (newSettings: any) => {
    if (!currentChatId) return;
    const now = Date.now();
    const current = chats.find((c) => c.id === currentChatId);
    setChats((prev) =>
      prev.map((c) => {
        if (c.id === currentChatId) return { ...c, settings: newSettings, updatedAt: now };
        // 母对话设定修改时，同步到所有子对话（与 updateChatWorldBooks 逻辑一致）
        if (
          current &&
          (current.conversationType === 'parent' || current.conversationType === 'group') &&
          c.parentId === currentChatId
        ) {
          return { ...c, settings: newSettings, updatedAt: now };
        }
        return c;
      })
    );
  };

  const handleApplyPromptPreset = (preset: any) => {
    if (!currentChatId || !currentChat) return;
    const existingPrompt = currentChat.settings.systemPrompt || '';
    const presetPrompt = preset.systemPrompt || '';
    // 在原系统设定基础上另起一行追加
    const newPrompt = existingPrompt
      ? presetPrompt
        ? `${existingPrompt}\n${presetPrompt}`
        : existingPrompt
      : presetPrompt;
    const newSettings = {
      ...currentChat.settings,
      systemPrompt: newPrompt,
    };
    updateChatSettings(newSettings);
  };

  const handleAddSystemPrompt = (prompt: string) => {
    if (!currentChatId || !currentChat) return;
    const existingPrompt = currentChat.settings.systemPrompt || '';
    const newPrompt = existingPrompt
      ? `${existingPrompt}\n\n---\n\n${prompt}`
      : prompt;
    updateChatSettings({
      ...currentChat.settings,
      systemPrompt: newPrompt,
    });
  };

  const updateChatWallpaper = (wallpaper?: string) => {
    if (!currentChatId) return;
    setChats(
      chats.map((c) =>
        c.id === currentChatId ? { ...c, wallpaper, updatedAt: Date.now() } : c
      )
    );
  };

  const updateChatWorldBooks = (worldBookIds: string[]) => {
    if (!currentChatId) return;
    const now = Date.now();
    setChats(
      chats.map((c) => {
        if (c.id === currentChatId) return { ...c, worldBookIds, updatedAt: now };
        // 若当前对话是母对话，则同步到所有子对话
        const current = chats.find((x) => x.id === currentChatId);
        if (current && (current.conversationType === 'parent' || current.conversationType === 'group') && c.parentId === currentChatId) {
          return { ...c, worldBookIds, updatedAt: now };
        }
        return c;
      })
    );
  };

  const updateChatUserAvatar = (userAvatar?: string) => {
    if (!currentChatId) return;
    const now = Date.now();
    setChats(
      chats.map((c) => {
        if (c.id === currentChatId) return { ...c, userAvatar, updatedAt: now };
        const current = chats.find((x) => x.id === currentChatId);
        if (current && c.parentId === currentChatId) {
          return { ...c, userAvatar, updatedAt: now };
        }
        return c;
      })
    );
  };

  const updateChatAssistantAvatar = (assistantAvatar?: string) => {
    if (!currentChatId) return;
    const now = Date.now();
    setChats(
      chats.map((c) => {
        if (c.id === currentChatId) return { ...c, assistantAvatar, updatedAt: now };
        const current = chats.find((x) => x.id === currentChatId);
        if (current && c.parentId === currentChatId) {
          return { ...c, assistantAvatar, updatedAt: now };
        }
        return c;
      })
    );
  };

  const handleNavigate = (screen: string, focusSection?: string) => {
    setModalScreen(screen);
    setModalFocusSection(focusSection as any);
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
    // 面板在主界面内替换显示，而不是盖住侧栏；关掉抽屉让出主界面，但侧栏仍可随时划出/点开
    Animated.timing(translateX, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  /** 从面板返回对话主界面 */
  const closeModalScreen = () => {
    setModalScreen(null);
    setModalFocusSection(undefined);
    // 回到对话后主界面会重新启用平移动画，必须把位移归零，否则对话会被顶偏一个侧栏宽度
    setLeftDrawerOpen(false);
    setRightDrawerOpen(false);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const isDrawerOpen = leftDrawerOpen || rightDrawerOpen;
  /** 面板打开时侧栏常驻：主界面让出侧栏宽度，侧栏不再盖住面板，也不再拦截点击 */
  const panelOpen = !!modalScreen;

  /**
   * 非拖拽时用「静态定位」而不是 Animated 插值。
   * 实测在 Android 上插值会出现残留位移：关闭时侧栏露出一截、打开时只开一半、面板被顶偏。
   * 现在：关闭=不渲染，打开=精确 DRAWER_WIDTH，只有拖拽过程才交给动画值。
   */
  const staticLeftDrawerStyle = { transform: [{ translateX: 0 }] as any };
  const staticRightDrawerStyle = { transform: [{ translateX: 0 }] as any };
  const resolvedLeftDrawerStyle = drawerDragging ? leftDrawerAnimatedStyle : staticLeftDrawerStyle;
  const resolvedRightDrawerStyle = drawerDragging ? rightDrawerAnimatedStyle : staticRightDrawerStyle;
  /**
   * 面板打开时也**必须给显式的 translateX: 0**，不能给 null。
   * 原因：transform 走的是 useNativeDriver，样式里把 transform 整段去掉时，
   * 原生侧不会自动复位，会残留上一次的 +DRAWER_WIDTH —— 表现就是整个面板被顶偏一个侧栏宽度。
   */
  const resolvedMainStyle = panelOpen
    ? { transform: [{ translateX: 0 }] as any }
    : drawerDragging
      ? mainAnimatedStyle
      : { transform: [{ translateX: leftDrawerOpen ? DRAWER_WIDTH : rightDrawerOpen ? -DRAWER_WIDTH : 0 }] as any };

  // 合并登录后：游客访问社区/个人资料时显示登录提示，点击后登出触发启动门控 LoginModal
  const renderLoginRequired = () => {
    return (
      <View style={{ flex: 1, backgroundColor: theme.backgroundColor, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: theme.accentColor, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: 'bold' }}>鲵</Text>
        </View>
        <Text style={{ color: theme.textColor, fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>需要登录</Text>
        <Text style={{ color: theme.subTextColor, fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
          社区与个人资料功能需要登录账号。{'\n'}游客模式下不可使用。
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: theme.accentColor, paddingVertical: 12, paddingHorizontal: 40, borderRadius: 12 }}
          onPress={() => {
            appLogout();
            closeModalScreen();
          }}
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>去登录</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderModalScreen = () => {
    switch (modalScreen) {
      case 'characterBrowser':
        return <CharacterBrowserScreen onClose={closeModalScreen} />;
      case 'recycleBin':
        return <RecycleBinScreen onClose={closeModalScreen} />;
      case 'themeSettings':
        return <ThemeSettingsScreen onClose={closeModalScreen} />;
      case 'settings':
        return <SettingsScreen onClose={closeModalScreen} focusSection={modalFocusSection as 'input' | 'theme' | 'display' | 'splash' | 'appearance' | 'aiThinking' | 'buttons' | undefined} />;
      case 'chatHistory':
        return (
          <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
            <ChatHistoryScreen onSelectChat={(id) => { selectChat(id); closeModalScreen(); }} currentChatId={currentChatId || undefined} onClose={closeModalScreen} />
          </View>
        );
      case 'favoriteMessages':
        return (
          <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
            <FavoriteMessagesScreen onSelectChat={(id) => { selectChat(id); closeModalScreen(); }} onClose={closeModalScreen} />
          </View>
        );
      case 'favoriteChats':
        return (
          <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
            <ChatHistoryScreen onSelectChat={(id) => { selectChat(id); closeModalScreen(); }} currentChatId={currentChatId || undefined} filter="favorites" onClose={closeModalScreen} />
          </View>
        );
      case 'worldbookEditor':
        return (
          <WorldBookScreen
            onClose={closeModalScreen}
            worldBookIds={currentChat?.worldBookIds}
            onWorldBookIdsChange={updateChatWorldBooks}
            onAddToChat={handleAddSystemPrompt}
          />
        );
      case 'worldBookOrganizer':
        return (
          <WorldOrganizerScreen
            onClose={closeModalScreen}
            onCreated={(chatId) => { selectChat(chatId); closeModalScreen(); }}
          />
        );
      case 'fancyToolBox':
        return <FancyToolBoxScreen onClose={closeModalScreen} />;
      case 'browser':
        return (
          <BrowserScreen
            onClose={closeModalScreen}
            mode="character-hunter"
            onExtractCharacter={handleBrowserExtractCharacter}
          />
        );
      case 'aiProvider':
        return <AIProviderScreen onClose={closeModalScreen} onNavigate={handleNavigate} />;
      case 'userSettings':
        return <UserSettingsScreen onClose={closeModalScreen} />;
      case 'systemCheck':
        return <SystemCheckScreen onClose={closeModalScreen} />;
      case 'pythonEditor':
        return (
          <PythonEditorScreen
            onClose={closeModalScreen}
            onSave={() => { closeModalScreen(); }}
          />
        );
      case 'groupChat':
        return (
          <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
            <GroupChatListScreen
              onSelectChat={(id) => { selectChat(id); closeModalScreen(); }}
              currentChatId={currentChatId || undefined}
              onCreateGroup={() => { createNewGroupChat(); closeModalScreen(); }}
            />
          </View>
        );
      case 'auth':
      case 'profile':
        return communityUser ? (
          <ProfileScreen
            onClose={closeModalScreen}
            user={communityUser}
            onUserUpdate={(user) => updateCurrentUser(user)}
            onLogout={() => {
              appLogout();
              closeModalScreen();
            }}
          />
        ) : renderLoginRequired();
      case 'community':
        return communityUser ? (
          <CommunityScreen
            onClose={closeModalScreen}
            user={communityUser}
            onLogout={() => {
              appLogout();
              closeModalScreen();
            }}
            onUserUpdate={(user) => updateCurrentUser(user)}
            currentChat={chats.find(c => c.id === currentChatId)}
            characters={characters}
          />
        ) : renderLoginRequired();
      case 'eraGame':
        return (
          <EraGameScreen navigation={{ goBack: closeModalScreen }} />
        );
      case 'importCard':
        return (
          <ImportCardScreen
            onClose={closeModalScreen}
            onImported={() => closeModalScreen()}
          />
        );
      case 'mediaLibrary':
        return <MediaLibraryScreen onClose={closeModalScreen} />;
      case 'customInterface':
        return <CustomInterfaceScreen onClose={closeModalScreen} />;
      case 'characterPicker': {
        const chat = currentChatId ? chats.find(c => c.id === currentChatId) : undefined;
        return (
          <CharacterBrowserScreen
            mode="picker"
            onClose={closeModalScreen}
            currentCharacterId={chat?.characterId}
            onSelectCharacter={(character) => {
              const target = chat ?? (currentChatId ? chats.find(c => c.id === currentChatId) : undefined);
              if (target) {
                // 「添加角色」：把角色的系统指令/人设/前后置提示等真正复制进这条对话，
                // 而不只是改一个 characterId（旧实现只改了 id，对话实际没有采用角色设定）
                setChats(prev => prev.map(c => (c.id === target.id ? applyCharacterToChat(c, character) : c)));
              } else {
                const c = createChatFromCharacter(character);
                setChats(prev => [c, ...prev]);
                selectChat(c.id);
              }
              closeModalScreen();
            }}
            onGoToCommunity={() => { closeModalScreen(); setTimeout(() => handleNavigate('community'), 200); }}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 抽屉只在「打开」或「正在拖拽」时挂载：
          关闭状态完全不渲染，避免任何位移残留把侧栏露出来、把主界面顶偏。 */}
      {leftDrawerOpen || drawerDragging ? (
        <Animated.View
          ref={leftDrawerRef}
          style={[
            styles.drawer,
            styles.leftDrawer,
            { backgroundColor: theme.menuBgColor, width: DRAWER_WIDTH },
            resolvedLeftDrawerStyle,
          ]}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: theme.menuBgColor }} edges={['top', 'left', 'bottom']}>
            <LeftDrawerContent
              onClose={panelOpen ? closeModalScreen : closeDrawers}
              onNavigate={handleNavigate}
              onSelectChat={panelOpen ? (id: string) => { closeModalScreen(); setCurrentChatId(id); } : selectChat}
              onNewChat={panelOpen ? () => { closeModalScreen(); createNewChat(); } : createNewChat}
              onImport={panelOpen ? () => { closeModalScreen(); handleImport(); } : handleImport}
            />
          </SafeAreaView>
        </Animated.View>
      ) : null}

      {rightDrawerOpen || drawerDragging ? (
      <Animated.View
        style={[
          styles.drawer,
          styles.rightDrawer,
          { backgroundColor: theme.menuBgColor, width: DRAWER_WIDTH },
          resolvedRightDrawerStyle,
        ]}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.menuBgColor }} edges={['top', 'right', 'bottom']}>
          {currentChat && (
            <RightDrawerContent
              chatId={currentChat.id}
              chatSettings={currentChat.settings}
              onSettingsChange={updateChatSettings}
              wallpaper={currentChat.wallpaper}
              onWallpaperChange={updateChatWallpaper}
              worldBookIds={currentChat.worldBookIds}
              onWorldBookIdsChange={updateChatWorldBooks}
              isChildConversation={currentChat.conversationType === 'child'}
              onSelectPromptPreset={handleApplyPromptPreset}
              characterId={currentChat.characterId}
              userAvatar={
                currentChat.userAvatar ?? (
                  currentChat.parentId
                    ? chats.find((c) => c.id === currentChat.parentId)?.userAvatar
                    : undefined
                )
              }
              onUserAvatarChange={updateChatUserAvatar}
              assistantAvatar={
                currentChat.assistantAvatar ?? (
                  currentChat.parentId
                    ? chats.find((c) => c.id === currentChat.parentId)?.assistantAvatar
                    : undefined
                )
              }
              onAssistantAvatarChange={updateChatAssistantAvatar}
              onNavigateToChat={selectChat}
              messages={currentChat.messages}
              onAddSystemPrompt={handleAddSystemPrompt}
              onRequestOpenWorldBookEditor={(wbId) => {
                setWorldBookEditorId(wbId);
                setShowWorldBookEditor(true);
              }}
              isSharedCard={currentChat.isSharedCard}
              cardHideFlags={currentChat.cardHideFlags}
              extraSystemPrompt={currentChat.extraSystemPrompt}
              onExtraSystemPromptChange={(text) => {
                setChats((prev: Chat[]) =>
                  prev.map((c) =>
                    c.id === currentChat.id ? { ...c, extraSystemPrompt: text } : c
                  )
                );
              }}
              onOpenCharacterPicker={() => handleNavigate('characterPicker')}
              videoBgState={videoBgState}
              onVideoBgStateChange={(s) => setVideoBgState((prev) => ({ ...prev, ...s }))}
              isVideoBackground={
                inferBackgroundKind(currentChat.wallpaper || settings.theme.wallpaper) === 'video'
              }
            />
          )}
        </SafeAreaView>
      </Animated.View>
      ) : null}

      <Animated.View
        ref={mainContentRef}
        key={modalScreen ? `panel_${modalScreen}` : 'chat'}
        style={[
          styles.mainContent,
          resolvedMainStyle,
          { backgroundColor: theme.backgroundColor },
        ]}
        {...panResponder.panHandlers}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.backgroundColor,
          }}
        >
          {isDrawerOpen && (
            <TouchableOpacity
              style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
              onPress={closeDrawers}
              activeOpacity={1}
            />
          )}
          {modalScreen ? (
            /* 面板界面：替换主界面内容，侧栏常驻可用 */
            <PanelHost
              key={`${modalScreen}:${modalFocusSection || ''}`}
              title={PANEL_TITLES[modalScreen] || ''}
              onBack={closeModalScreen}
              onOpenMenu={openLeftDrawer}
            >
              {renderModalScreen()}
            </PanelHost>
          ) : (
            currentChatId && (
              <ChatScreen
                chatId={currentChatId}
                onOpenLeftMenu={openLeftDrawer}
                onOpenRightMenu={openRightDrawer}
                onNewChat={createNewChat}
                onSelectChat={selectChat}
                videoBgState={videoBgState}
                onVideoBgStateChange={(s) => setVideoBgState((prev) => ({ ...prev, ...s }))}
                onOpenPanel={handleNavigate}
              />
            )
          )}
        </View>
      </Animated.View>

      <Modal
        visible={showWorldBookEditor}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowWorldBookEditor(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.backgroundColor }} edges={['top', 'right', 'left', 'bottom']}>
          <WorldBookScreen
            onClose={() => { setShowWorldBookEditor(false); setWorldBookEditorId(undefined); }}
            worldBookIds={currentChat?.worldBookIds}
            onWorldBookIdsChange={updateChatWorldBooks}
            initialBookId={worldBookEditorId}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    height: '100%',
    zIndex: 1,
  },
  leftDrawer: {
    left: 0,
  },
  rightDrawer: {
    right: 0,
  },
  mainContent: {
    flex: 1,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
  leftTabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingTop: 12,
  },
  leftTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
});
