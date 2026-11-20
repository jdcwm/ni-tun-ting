import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
  Keyboard,
  Dimensions,
  TextInput,
  Animated,
  Modal,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { ChatMessage, Chat, AIProvider, AIType, WorldBookImage, MessageVersion, WorldBook, AIModel, InlineFile, GroupMember, ConversationPlan, CSSEntry } from '../types';
import { generateId, defaultChatSettings } from '../constants/defaults';
import { mergeChatSettings } from '../utils/chatSettingsMerge';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { captureRef } from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { MessageBubble } from '../components/MessageBubble';
import { MessageBubbleItem, MessageBubbleItemActions, MessageBubbleItemEnv } from '../components/MessageBubbleItem';
import { GlobalCSSRenderer } from '../components/MarkdownRenderer';
import { ChatInput } from '../components/ChatInput';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import { StatusBarComponent } from '../components/StatusBarComponent';
import { MessageActionSheet, MessageAction } from '../components/MessageActionSheet';
import { ActionMenu, ActionMenuItem } from '../components/ActionMenu';
import { ConfirmModal } from '../components/ConfirmModal';
import { FancyWorkRenderer } from '../components/FancyWorkRenderer';
import { AIJSRenderer } from '../components/AIJSRenderer';
import { CustomScrollbar } from '../components/CustomScrollbar';
import { ModelSelector } from '../components/ModelSelector';
import {
  IconCopy, IconStar, IconRefresh, IconSummarize,
  IconEye, IconTrash, IconPlus, IconSettings,
  IconDown, IconShare, IconExport, IconImport,
  IconEdit, IconMore, IconMenuDots,
  IconBack, IconUser, IconAI, IconClose,
} from '../components/Icons';
import { aiService } from '../services/aiService';
import { webSearchService } from '../services/webSearchService';
import { statusVarService } from '../services/statusVarService';
import { macroService } from '../services/macroService';
import { mediaLibraryService } from '../services/mediaLibraryService';
import { VideoBackground, inferBackgroundKind } from '../components/VideoBackground';
import { UserInterfaceHost } from '../components/UserInterfaceHost';
import { normalizeCustomInterface } from '../services/customInterface';
import { contentNeedsRenderLayer } from '../services/userInterfaceBridge';
import {
  parseUiDirectives,
  extractInlineImages,
  applyDirectives,
  emptyUiState,
  buildUiStateCss,
  DECORATIONS,
  type UiState,
} from '../services/uiDirectiveService';
import { worldBookService } from '../services/worldBookService';
import { characterMemoryService } from '../services/characterMemoryService';
import { pngCardService } from '../services/pngCardService';
import { exportService } from '../services/exportService';
import { ApiError, getErrorMessage } from '../utils/networkUtils';
import { imageUtils } from '../utils/imageUtils';

interface ChatScreenProps {
  chatId: string;
  onOpenLeftMenu: () => void;
  onOpenRightMenu: () => void;
  onNewChat: () => void;
  onSelectChat?: (chatId: string) => void;
  /** 视频背景播放状态（由外层提升，便于右侧菜单控制） */
  videoBgState?: { muted: boolean; paused: boolean };
  onVideoBgStateChange?: (state: { muted: boolean; paused: boolean }) => void;
  /** 打开内置面板（自定义界面调用 Aurora.openPanel 时用） */
  onOpenPanel?: (screen: string, section?: string) => void;
}

const { width: SCREEN_W, height: screenHeight } = Dimensions.get('window');

const getExportDir = async (): Promise<string> => {
  const docDir = (FileSystem as any).documentDirectory;
  const cacheDir = (FileSystem as any).cacheDirectory;
  let dir = docDir || cacheDir || '';
  if (!dir) {
    // Fallback: try to get app-specific directory
    dir = (FileSystem as any).bundledAssets || '';
  }
  // Ensure trailing slash
  if (dir && !dir.endsWith('/')) dir += '/';
  return dir;
};

const formatErrorMessage = (error: any, prefix: string): string => {
  const friendlyMessages: Record<string, string> = {
    network: '无法连接到服务器，请检查网络',
    dns: '域名解析失败，请检查 API 地址',
    ssl: 'SSL 证书错误',
    cors: '跨域访问被拒绝',
    auth: 'API 密钥无效',
    rate_limit: '请求过于频繁，请稍后再试',
    quota: 'API 余额不足',
    server: '服务器错误，请稍后重试',
    parse: '响应数据格式错误',
    no_api_key: '未配置 API 密钥',
    no_base_url: '未配置 API 地址',
  };

  const kind = error?.kind;
  if (kind && friendlyMessages[kind]) {
    return `${prefix}：${friendlyMessages[kind]}`;
  }
  return `${prefix}：${getErrorMessage(error)}`;
};

export const ChatScreen: React.FC<ChatScreenProps> = ({ chatId, onOpenLeftMenu, onOpenRightMenu, onNewChat, onSelectChat, videoBgState: videoBgStateProp, onVideoBgStateChange, onOpenPanel }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { chats, setChats, providers, settings, worldBooks, setWorldBooks, fancyWorks, characters, toggleChatPin, toggleChatFavorite } = useApp();
  const flatListRef = useRef<FlatList>(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingTick, setStreamingTick] = useState(0);
  const streamingTickRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetMessage, setActionSheetMessage] = useState<ChatMessage | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [lastElapsed, setLastElapsed] = useState<number | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editText, setEditText] = useState('');
  const [editRole, setEditRole] = useState<'user' | 'assistant'>('user');
  const [editSheetMaxHeight, setEditSheetMaxHeight] = useState<'75%' | number>('75%');
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentHeightRef = useRef(0);
  const [scrollY, setScrollY] = useState(0);
  const scrollYRef = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [flatListHeight, setFlatListHeight] = useState(0);
  const userIsScrollingRef = useRef(false);
  const lastScrollEndTime = useRef(0);
  const lastScrollToEndTime = useRef(0);
  const [hasRestoredScroll, setHasRestoredScroll] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [modelSelectorType, setModelSelectorType] = useState<AIType>('text');
  const [showActionMenu, setShowActionMenuState] = useState(false);
  const [actionMenuTitle, setActionMenuTitle] = useState('');
  const [actionMenuSubtitle, setActionMenuSubtitle] = useState('');
  const [actionMenuItems, setActionMenuItems] = useState<ActionMenuItem[]>([]);
  /** 群聊设定编辑弹窗（群聊总设定 / 单角色设定 共用） */
  const [textEditor, setTextEditor] = useState<{
    title: string;
    hint?: string;
    onSave: (v: string) => void;
  } | null>(null);
  const [textEditorDraft, setTextEditorDraft] = useState('');
  const openTextEditor = (title: string, value: string, onSave: (v: string) => void, hint?: string) => {
    setTextEditor({ title, hint, onSave });
    setTextEditorDraft(value);
  };
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const forceStopRef = useRef(false);
  /** 群聊自动推进中：防止并发重入 */
  const autoAdvancingRef = useRef(false);
  const loadingDot1 = useRef(new Animated.Value(0.3)).current;
  const loadingDot2 = useRef(new Animated.Value(0.3)).current;
  const loadingDot3 = useRef(new Animated.Value(0.3)).current;
  const [currentRespondingMember, setCurrentRespondingMember] = useState<string | null>(null);
  const [showParentChildren, setShowParentChildren] = useState(false);
  const [usageTime, setUsageTime] = useState(0);
  const [networkSpeed, setNetworkSpeed] = useState<string>('检测中...');
  const [isOnline, setIsOnline] = useState(true);
  const usageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const networkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStartTimeRef = useRef<number>(Date.now());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [chatEditTitle, setChatEditTitle] = useState('');
  const [showChatEditPrompt, setShowChatEditPrompt] = useState(false);
  const chatEditInputRef = useRef<any>(null);
  /** 消息 ID -> 当前累计思考内容 */
  const thinkingByMessageRef = useRef<Record<string, string>>({});
  /** 消息 ID -> 思考过程最后刷新时间（节流） */
  const thinkingLastUpdateRef = useRef<Record<string, number>>({});
  /** 自动总结：距离上次总结后「未压缩的用户/助手消息」增量计数（达到 threshold 只总结 1 次，然后归零重新累积） */
  const autoSummarizeCounterRef = useRef<Record<string, number>>({});
  /** 自动总结：运行中互斥锁，避免同 chat 并发多次总结 */
  const autoSummarizeRunningRef = useRef<Record<string, boolean>>({});

  const chat = chats.find((c) => c.id === chatId);

  useEffect(() => {
    isMountedRef.current = true;
    
    // 启动使用时长计时器
    usageTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - appStartTimeRef.current) / 1000);
      setUsageTime(elapsed);
    }, 1000);

    // 启动网速检测
    const testNetwork = async () => {
      try {
        const start = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch('https://www.gstatic.com/generate_204', {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const latency = Date.now() - start;
        if (response.ok || response.status === 204) {
          setIsOnline(true);
          if (latency < 100) {
            setNetworkSpeed(`${latency}ms 极快`);
          } else if (latency < 300) {
            setNetworkSpeed(`${latency}ms 快速`);
          } else if (latency < 600) {
            setNetworkSpeed(`${latency}ms 正常`);
          } else {
            setNetworkSpeed(`${latency}ms 较慢`);
          }
        } else {
          setIsOnline(true);
          setNetworkSpeed('已连接');
        }
      } catch {
        setIsOnline(false);
        setNetworkSpeed('离线');
      }
    };
    
    testNetwork();
    networkTimerRef.current = setInterval(testNetwork, 30000);

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (scrollYRef.current > 0) {
        updateChat({ scrollPosition: scrollYRef.current });
      }
      if (usageTimerRef.current) {
        clearInterval(usageTimerRef.current);
      }
      if (networkTimerRef.current) {
        clearInterval(networkTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setHasRestoredScroll(false);
  }, [chatId]);

  useEffect(() => {
    if (hasRestoredScroll) return;
    if (!flatListRef.current) return;
    if (!chat) return;
    const timer = setTimeout(() => {
      if (!flatListRef.current) return;
      // 默认跳到最新一条消息（底部），除非用户之前有滚动位置且不是对话切换
      const position = chat.scrollPosition;
      if (position !== undefined && position > 0 && chat.messages.length > 20) {
        flatListRef.current?.scrollToOffset({ offset: position, animated: false });
      } else {
        flatListRef.current?.scrollToEnd({ animated: false });
      }
      setHasRestoredScroll(true);
      isAtBottomRef.current = true;
      setIsAtBottom(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [chat?.id, hasRestoredScroll]);

  useEffect(() => {
    if (!isLoading) return;
    const anim = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    anim(loadingDot1, 0).start();
    anim(loadingDot2, 200).start();
    anim(loadingDot3, 400).start();
    return () => {
      loadingDot1.stopAnimation();
      loadingDot2.stopAnimation();
      loadingDot3.stopAnimation();
    };
  }, [isLoading, loadingDot1, loadingDot2, loadingDot3]);

  useEffect(() => {
    if (!editingMessage) {
      setEditSheetMaxHeight('75%');
      return;
    }
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      const kbHeight = e.endCoordinates.height;
      const screenH = Dimensions.get('window').height;
      const statusBarH = insets.top || 30;
      const navBarH = 88;
      const available = screenH - kbHeight - statusBarH - navBarH;
      const maxH = Math.max(200, available);
      setEditSheetMaxHeight(maxH);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setEditSheetMaxHeight('75%');
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [editingMessage, insets.top]);

  const chatRef = useRef<Chat | null>(null);
  chatRef.current = chat || null;
  if (chat && chat.messages !== messagesRef.current) {
    messagesRef.current = chat.messages;
  }
  const childChats = chat?.conversationType === 'parent'
    ? chats.filter((c) => c.parentId === chatId && c.conversationType === 'child').sort((a, b) => b.updatedAt - a.updatedAt)
    : [];
  const parentChat = chat?.parentId ? chats.find((c) => c.id === chat.parentId) : undefined;
  const isChildConversation = !!chat?.parentId;

  const handleTitlePress = () => {
    if (isChildConversation && parentChat && onSelectChat) {
      onSelectChat(parentChat.id);
    } else {
      openModelSelector('text');
    }
  };

  const safeSetState = <T,>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) => {
    if (isMountedRef.current) {
      setter(value);
    }
  };

  const statusBarConfig = chat?.settings.statusBar;
  const hasStatusBar = statusBarConfig?.enabled && statusBarConfig.vars.length > 0;

  const updateChat = useCallback((updates: Partial<Chat>) => {
    if (!isMountedRef.current) return;
    const now = Date.now();
    if (chatRef.current) {
      chatRef.current = { ...chatRef.current, ...updates, updatedAt: now };
    }
    // 从当前更新中识别可「继承到子对话」的字段（不含 messages / title / 时间等独立字段）
    // R-A 用户人设独立：母对话 settings.userPersona 不再下推给子对话，每个分支保留自己的用户人设
    const INHERIT_SETTINGS_EXCLUDE = new Set<string>(['userPersona']);
    const inheritableKeys: string[] = [
      'characterId',
      'settings',
      'worldBookIds',
      'assistantAvatar',
      'userAvatar',
      'greeting',
      'alternateGreetings',
      'personalitySummary',
      'scenario',
      'exampleMessages',
      'firstMessage',
      'systemPrompt',
      'jailbreakPrompt',
      'postHistoryInstructions',
      'impersonationPrompt',
      'descriptionBasePrompt',
      'mainPrompt',
      'jshSetup',
      'triggerScript',
      'extenderScript',
      'statusBar',
    ];
    const inheritableUpdate: any = {};
    for (const k of inheritableKeys) {
      if ((updates as any)[k] !== undefined) inheritableUpdate[k] = (updates as any)[k];
    }
    const parentType = chatRef.current?.conversationType;
    const parentId = chatId;
    const hasInherit = Object.keys(inheritableUpdate).length > 0;
    const isParent = parentType === 'parent' || parentType === 'group';

    setChats((prev) => {
      let base = prev.map((c) =>
        c.id === chatId ? { ...c, ...updates, updatedAt: now } : c
      );
      if (isParent && hasInherit) {
        base = base.map((c) => {
          if (c.parentId !== parentId) return c;
          // 子对话仅合并 settings / worldBookIds（其他字段按 inheritableUpdate 原样合并）
          let next: Partial<Chat> = { ...inheritableUpdate };
          // settings 合并而非覆盖，避免子对话自己的个性化被覆盖
          if (inheritableUpdate.settings && c.settings) {
            const parentSettingsPatch: any = { ...inheritableUpdate.settings };
            // R-A 对子对话独立：排除 userPersona 下推，让每个分支保留自己的用户人设
            for (const k of INHERIT_SETTINGS_EXCLUDE) delete parentSettingsPatch[k];
            next.settings = { ...c.settings, ...parentSettingsPatch };
          }
          // worldBookIds 覆盖（保证世界书一致）
          return { ...c, ...next, updatedAt: now };
        });
      }
      return base;
    });
  }, [chatId, setChats]);

  const updateStreamingMessage = useCallback((messageId: string, patch: Partial<ChatMessage>) => {
    if (!isMountedRef.current) return;
    const msgs = messagesRef.current;
    if (!msgs) return;
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx >= 0) {
      msgs[idx] = { ...msgs[idx], ...patch };
    }
    streamingTickRef.current += 1;
    setStreamingTick(streamingTickRef.current);
  }, []);

  const statusVars = useMemo(() => {
    if (!chat?.statusVars || !hasStatusBar) return [];
    return statusVarService.getDisplayVars(statusBarConfig!, chat.statusVars);
  }, [chat?.statusVars, hasStatusBar, statusBarConfig]);

  useEffect(() => {
    if (shouldScrollToBottom && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
        setShouldScrollToBottom(false);
        isAtBottomRef.current = true;
        setIsAtBottom(true);
      }, 100);
    }
  }, [shouldScrollToBottom, chat?.messages.length]);

  const handleScroll = ({ nativeEvent }: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
    const currentScrollY = contentOffset.y;
    scrollYRef.current = currentScrollY;
    const bottomOffset = contentSize.height - layoutMeasurement.height;
    if (bottomOffset > 0) {
      const atBottom = currentScrollY >= bottomOffset - 50;
      if (isAtBottomRef.current !== atBottom) {
        isAtBottomRef.current = atBottom;
        setIsAtBottom(atBottom);
      }
    }
  };

  const handleContentSizeChange = (_: number, height: number) => {
    const prevHeight = contentHeightRef.current;
    setContentHeight(height);
    contentHeightRef.current = height;
    if (!streamingMessageId) return;
    if (!isAtBottomRef.current) return;
    // 只有内容高度增加时才滚动，避免高度波动导致的上下跳动
    if (height <= prevHeight) return;
    const now = Date.now();
    const recentlyDragged = userIsScrollingRef.current || (now - lastScrollEndTime.current < 1000);
    if (!recentlyDragged && flatListRef.current) {
      // 流式输出时使用节流，避免频繁滚动导致跳动
      if (now - lastScrollToEndTime.current > 100) {
        lastScrollToEndTime.current = now;
        flatListRef.current.scrollToEnd({ animated: false });
      }
    }
  };

  const handleScrollBeginDrag = () => {
    userIsScrollingRef.current = true;
  };

  const handleScrollEndDrag = () => {
    userIsScrollingRef.current = false;
    lastScrollEndTime.current = Date.now();
    setScrollY(scrollYRef.current);
  };

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
        if (isAtBottomRef.current && flatListRef.current) {
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (chat && hasStatusBar && !chat.statusVars) {
      const initVars = statusVarService.initVarsFromConfig(statusBarConfig!);
      updateChat({ statusVars: initVars });
    }
  }, [chat?.id, hasStatusBar]);

  /**
   * 修复「状态栏修改后无变化」。
   *
   * 原来的时序是：打开对话时用配置初始化一次 chat.statusVars，之后配置里改初始值/范围/类型
   * 只写进 chat.settings.statusBar，而渲染取的是 chat.statusVars（旧值优先），所以界面毫无反应。
   *
   * 现在记下每个变量的「定义签名」。当用户在状态栏设置里改动某个变量的定义（初始值/范围/类型/标签）
   * 时，清掉该变量在运行时存储里的值，让新定义立刻生效；AI 通过 {{setvar}} 写入的值在定义未变时不受影响。
   */
  const statusDefSigRef = useRef('');
  useEffect(() => {
    const c = chatRef.current;
    if (!c || !hasStatusBar || !statusBarConfig) return;
    const sig = JSON.stringify(
      statusBarConfig.vars.map((v) => [v.name, v.value, v.min, v.max, v.type, v.label]),
    );
    if (statusDefSigRef.current === '') {
      statusDefSigRef.current = sig;
      return;
    }
    if (statusDefSigRef.current === sig) return;
    statusDefSigRef.current = sig;
    const seeded = statusVarService.initVarsFromConfig(statusBarConfig);
    const next = { ...seeded, ...(c.statusVars || {}) };
    for (const v of statusBarConfig.vars) {
      next[v.name] = v.value;
    }
    updateChat({ statusVars: next });
  }, [chat?.id, hasStatusBar, statusBarConfig]);

  const getMacroContext = () => {
    const c = chatRef.current;
    const chatUserName = c?.settings?.userName;
    const globalUserName = settings?.userProfile?.username;
    // {{char}} 之前恒为字面量 'AI'，这里取真实角色名，取不到再退回 'AI'
    const charName =
      characters.find((ch) => ch.id === c?.characterId)?.name ||
      (c?.groupMembers || []).find((m) => m.id === c?.activeMemberId)?.name ||
      'AI';
    return {
      vars: c?.statusVars || {},
      userName: chatUserName || globalUserName || '用户',
      charName,
      charTitle: c?.title || charName,
      chatTitle: c?.title || '',
      messageCount: c?.messages.length || 0,
    };
  };

  /**
   * 渲染宏变量。
   *
   * 这里把两套此前互不相通的宏系统接起来：
   *  1. statusVarService.renderPromptMacros —— 直接字符串替换 {{user}}/{{char}}/{{getvar::x}} 等，
   *     变量取自 statusVars；
   *  2. macroService —— 完整的模板引擎（Handlebars/EJS/Nunjucks 自动识别）+ 可持久化变量作用域，
   *     支持 {{setvar}}/{{getvar}}/{{#if}}/{{#each}} 等。
   * 之前只用了第 1 套，导致宏"只是被替换"，setvar 写入无处可存、getvar 永远拿不到值。
   */
  const renderMacros = (text: string) => {
    const c = chatRef.current;
    const ctx = getMacroContext();
    if (!text || text.indexOf('{{') === -1) return text;

    // 进对话/切对话时把该对话持久化的宏变量灌回作用域
    const stored = c?.macroVars as
      | { global?: Record<string, any>; chat?: Record<string, any>; session?: Record<string, any> }
      | undefined;
    macroService.hydrateVariables(stored);

    // 让 {{getvar hp}} 这类写法也能读到状态栏变量（statusVars 只有字符串/数字，转成字符串）
    const statusVarsForTemplate: Record<string, string> = {};
    for (const [k, v] of Object.entries(c?.statusVars || {})) {
      if (typeof v === 'string' || typeof v === 'number') statusVarsForTemplate[k] = String(v);
    }

    const macroContext = macroService.buildContext({
      character: undefined,
      userName: ctx.userName,
      messages: (c?.messages || []).map((m: any) => ({ role: m.role, content: m.content })),
      chatTitle: ctx.chatTitle,
      systemPrompt: c?.settings?.systemPrompt,
      extra: statusVarsForTemplate,
    });

    // 先交给 statusVarService（处理 {{setvar::x::v}} 这类旧式写法与随机宏），再过完整模板引擎
    const stage1 = statusVarService.renderPromptMacros(text, ctx);
    try {
      return macroService.render(stage1, macroContext);
    } catch (e) {
      console.warn('[macros] 模板渲染失败，回退到简单替换', e);
      return stage1;
    }
  };

  const updateStatusVars = (updates: Parameters<typeof statusVarService.applyUpdates>[1]) => {
    const c = chatRef.current;
    if (!c) return;
    const currentVars = c.statusVars || {};
    const newVars = statusVarService.applyUpdates(currentVars, updates);
    updateChat({ statusVars: newVars });
  };

  /**
   * 持久化宏变量。
   * 模板渲染过程中 {{setvar}}/{{setchatvar}}/{{setglobalvar}} 会把值写进 macroService 的内存作用域，
   * 之前写完就丢了（重启即空）。这里把作用域快照写回 Chat.macroVars，随对话一起保存。
   */
  const macroVarsSigRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const c = chatRef.current;
    if (!c) return;
    const snap = macroService.snapshotVariables();
    const sig = JSON.stringify(snap);
    if (macroVarsSigRef.current[c.id] === sig) return;
    const storedSig = JSON.stringify(c.macroVars || {});
    if (storedSig === sig) {
      // 内存作用域与已存的一致（例如刚 hydrate 完），只记签名，不触发写入
      macroVarsSigRef.current[c.id] = sig;
      return;
    }
    macroVarsSigRef.current[c.id] = sig;
    updateChat({ macroVars: snap } as any);
  });

  const generateChatTitle = async (firstMessage: string) => {
    const c = chatRef.current;
    if (!c || c.title !== '新对话') return;

    const textProvider = getProvider('text');
    if (!textProvider) {
      const defaultTitle = firstMessage.substring(0, 20) + (firstMessage.length > 20 ? '...' : '');
      updateChat({ title: defaultTitle || '新对话' });
      return;
    }

    try {
      const title = await aiService.chat(
        textProvider,
        [{ id: '1', role: 'user', content: firstMessage, images: [], timestamp: Date.now() }],
        '请用一句话（不超过20字）概括以下内容的主题，只返回标题，不要其他内容。',
      );
      const cleanTitle = title.replace(/["'"]/g, '').trim().substring(0, 30);
      if (cleanTitle) {
        updateChat({ title: cleanTitle });
      }
    } catch {
      const defaultTitle = firstMessage.substring(0, 20) + (firstMessage.length > 20 ? '...' : '');
      updateChat({ title: defaultTitle || '新对话' });
    }
  };

  const updateChatSettings = (newSettings: Partial<typeof defaultChatSettings>) => {
    const c = chatRef.current;
    if (!c) return;
    updateChat({
      settings: { ...c.settings, ...newSettings },
    });
  };

  const getProvider = (type: AIType): AIProvider | undefined => {
    const c = chatRef.current;
    const providerId = c?.settings[`${type}ProviderId` as keyof typeof c.settings] as string | undefined;
    if (providerId) {
      const p = providers.find((p) => p.id === providerId);
      if (p && p.capabilities.includes(type)) return p;
    }
    return providers.find((p) => p.capabilities.includes(type));
  };

  const getCurrentModel = (type: AIType): AIModel | undefined => {
    const c = chatRef.current;
    const provider = getProvider(type);
    if (!provider || !provider.models || provider.models.length === 0) return undefined;
    const modelId = c?.settings[`${type}ModelId` as keyof typeof c.settings] as string | undefined;
    if (modelId) {
      const m = provider.models.find((m) => m.id === modelId);
      if (m) return m;
    }
    return provider.models.find((m) => m.modelId === provider.model) || provider.models[0];
  };

  const getCurrentModelDisplay = (type: AIType): string => {
    const provider = getProvider(type);
    const model = getCurrentModel(type);
    if (model) return `${provider?.name || ''} · ${model.name}`.replace(/^ · /, '');
    if (provider) return provider.name;
    return '未选择AI';
  };

  const handleSelectModel = (type: AIType, provider: AIProvider, model: AIModel) => {
    const c = chatRef.current;
    if (!c) return;
    const key = `${type}ProviderId` as keyof typeof c.settings;
    const modelKey = `${type}ModelId` as keyof typeof c.settings;
    updateChat({
      settings: {
        ...c.settings,
        [key]: provider.id,
        [modelKey]: model.id,
      },
    });
    setShowModelSelector(false);
  };

  const openModelSelector = (type: AIType) => {
    setModelSelectorType(type);
    setShowModelSelector(true);
  };

  // 扮演模式：返回玩家正在扮演的角色信息（通讯录「扮演」后，覆盖用户人设）
  const getPlayedCharacterInfo = (): { name: string; persona: string } | null => {
    const playedId = settings.conversation?.playingAsCharacterId;
    if (!playedId) return null;
    const ch = characters.find((c) => c && c.id === playedId);
    if (!ch) return null;
    const persona = [ch.description, ch.personality, ch.scenario]
      .filter((s) => s && String(s).trim())
      .join('\n');
    return { name: ch.name, persona: persona || ch.systemPrompt || '' };
  };

  // ====== 对话预测（收到用户消息后预测本次对话内容） ======
  const buildDefaultPredictionPrompt = (characterName: string): string => {
    return `你是一个对话规划助手。请根据下面的信息，预测「${characterName}」接下来这段对话会怎么发展。\n\n要求：\n1. 输出 2~4 个关键词（角色可能关注的话题/情绪/事件）。\n2. 输出 2~4 句剧情走向（角色接下来可能的反应、话题推进）。\n\n严格按以下格式输出，不要输出其他内容：\n关键词：词1、词2、词3\n剧情：第一句。第二句。第三句。`;
  };

  const parseConversationPlan = (text: string, userMessage: string): ConversationPlan | null => {
    const keywords: string[] = [];
    const beats: string[] = [];
    const kwMatch = text.match(/关键词\s*[:：]\s*([^\n]*)/i);
    if (kwMatch) {
      keywords.push(...kwMatch[1].split(/[、,，;；]/).map((s) => s.trim()).filter(Boolean));
    }
    const beatMatch = text.match(/剧情\s*[:：]\s*([\s\S]*)/i);
    if (beatMatch) {
      beats.push(...beatMatch[1].split(/[。.!！?？；;]/).map((s) => s.trim()).filter(Boolean));
    }
    if (keywords.length === 0 && beats.length === 0) return null;
    return { keywords, beats, predictedAt: Date.now(), basedOnUserMessage: userMessage };
  };

  const predictConversationPlan = async (userMessage: string, characterName: string): Promise<ConversationPlan | null> => {
    const c = chatRef.current;
    const cfg = c?.settings?.predictionConfig;
    if (!cfg || !cfg.enabled) return null;
    const provider = providers.find((p) => p.capabilities.includes('text'));
    if (!provider) return null;
    try {
      const sysPrompt = cfg.prompt?.trim() ? cfg.prompt : buildDefaultPredictionPrompt(characterName);
      const ctxMsg: ChatMessage = { id: generateId(), role: 'user', content: userMessage, images: [], timestamp: Date.now() };
      const response = await aiService.chat(provider, [ctxMsg], sysPrompt, undefined, {});
      const plan = parseConversationPlan(response, userMessage);
      return plan;
    } catch {
      return null;
    }
  };

  /** 把对话规划注入系统提示（本段对话内 AI 遵循） */
  const injectPlanIntoPrompt = (prompt: string, plan?: ConversationPlan | null): string => {
    if (!plan || (plan.keywords.length === 0 && plan.beats.length === 0)) return prompt;
    const kw = plan.keywords.join('、');
    const beats = plan.beats.join('；');
    const planText = `【本次对话规划（请围绕以下关键词和剧情走向进行回复，不要偏离）】\n关键词：${kw}\n剧情走向：${beats}`;
    return `${planText}\n\n${prompt}`;
  };

  const buildSystemPrompt = (): string => {
    const c = chatRef.current;
    if (!c) return '';
    const parts: string[] = [];

    if (settings.baseSystemPrompt) {
      parts.push(renderMacros(settings.baseSystemPrompt));
    }

    if (settings.unifiedPrePrompt) {
      parts.push(renderMacros(settings.unifiedPrePrompt));
    }

    const chatSystemPrompt = c.settings?.systemPrompt;
    if (chatSystemPrompt) {
      parts.push(renderMacros(chatSystemPrompt));
    }

    // 额外系统设定（分享卡片且原系统设定被隐藏时，用户添加的额外设定）
    if (c.extraSystemPrompt) {
      parts.push(renderMacros(c.extraSystemPrompt));
    }

    const played = getPlayedCharacterInfo();
    const userPersona = played
      ? `【你正在扮演「${played.name}」，这是用户当前的身份/人设】\n${played.persona}`
      : c.settings?.userPersona;
    if (userPersona) {
      parts.push(renderMacros(`【用户人设（以下描述的是用户/人类扮演的角色，不是你（AI）的角色设定，请不要将其作为你自己的身份或性格）】\n用户扮演的角色如下：\n${userPersona}\n请始终以此设定为用户的身份进行互动，你（AI）应保持自己的角色设定，不要混淆。`));
    }

    const activeWorldBookIds = c.worldBookIds ?? [];
    const activeWorldBooks = worldBooks.filter((wb) => activeWorldBookIds.includes(wb.id));

    // 世界书的系统提示
    for (const wb of activeWorldBooks) {
      if (wb.systemPrompt) {
        parts.push(renderMacros(`【${wb.name}·系统设定】${wb.systemPrompt}`));
      }
    }

    // 使用worldBookService进行关键词扫描，只注入匹配的条目
    if (activeWorldBooks.length > 0) {
      const scanText = worldBookService.buildScanTextFromMessages(
        c.messages.map((m) => ({ role: m.role, content: m.content })),
        20
      );

      const scanResults = worldBookService.scanWorldBooks(activeWorldBooks, scanText, {
        scanDepth: 100,
        maxEntries: 50,
        tokenBudget: 0,
      });

      // 按位置分组插入
      const positionGroups: Record<string, string[]> = {
        top: [],
        before_char: [],
        before_persona: [],
        before_history: [],
        after_history: [],
        after_persona: [],
        after_char: [],
        at_depth: [],
        bottom: [],
      };

      for (const result of scanResults) {
        const pos = result.position || 'after_char';
        if (!positionGroups[pos]) {
          positionGroups[pos] = [];
        }
        positionGroups[pos].push(renderMacros(result.content));
      }

      // top 位置
      if (positionGroups.top.length > 0) {
        parts.push(positionGroups.top.join('\n\n'));
      }

      // before_char 位置
      if (positionGroups.before_char.length > 0) {
        parts.push(positionGroups.before_char.join('\n\n'));
      }

      // before_persona 位置
      if (positionGroups.before_persona.length > 0) {
        parts.push(positionGroups.before_persona.join('\n\n'));
      }

      // before_history 位置
      if (positionGroups.before_history.length > 0) {
        parts.push(positionGroups.before_history.join('\n\n'));
      }

      // after_history 位置
      if (positionGroups.after_history.length > 0) {
        parts.push(positionGroups.after_history.join('\n\n'));
      }

      // after_persona 位置
      if (positionGroups.after_persona.length > 0) {
        parts.push(positionGroups.after_persona.join('\n\n'));
      }

      // after_char 位置（默认位置）
      if (positionGroups.after_char.length > 0) {
        parts.push(positionGroups.after_char.join('\n\n'));
      }

      // at_depth 位置
      if (positionGroups.at_depth.length > 0) {
        parts.push(positionGroups.at_depth.join('\n\n'));
      }

      // bottom 位置
      if (positionGroups.bottom.length > 0) {
        parts.push(positionGroups.bottom.join('\n\n'));
      }
    }

    // 对话级用户名显式注入：让 AI 即使用户名宏变量没写对也知道怎么称呼用户
    const chatUserName = c.settings?.userName;
    if (chatUserName) {
      parts.push(renderMacros(`【重要·用户称呼】\n在本次对话中，用户的称呼/名字是："{{user}}"。请你在回复和互动中优先使用这个称呼来称呼用户（除非用户另有要求）。`));
    }

    if (hasStatusBar && statusBarConfig && statusBarConfig.vars.length > 0) {
      const statusPrompt = statusVarService.generateSystemPrompt(statusBarConfig);
      if (statusPrompt) {
        parts.push(renderMacros(statusPrompt));
      }
    }

    // AI 输出前置词/后置词（要求 AI 的回复以这些内容开头/结尾）
    if (c.settings?.prePrompt?.trim()) {
      parts.push(renderMacros(`【回复格式要求】你的回复必须以「${c.settings.prePrompt}」开头。`));
    }
    if (c.settings?.postPrompt?.trim()) {
      parts.push(renderMacros(`【回复格式要求】你的回复必须以「${c.settings.postPrompt}」结尾。`));
    }

    // 多条回复（可选）：开启时告诉 AI 可以用 <<MORE>> 自己决定「还想再说一条」
    const predCfg = c.settings?.predictionConfig;
    if (predCfg?.enabled === true && (predCfg.maxMessages ?? 1) > 1) {
      parts.push(
        `【多条回复（可选）】像真人连发消息一样，你可以一次说好几条。\n` +
          `如果这条说完还有话想接着说，就在**本条回复的最末尾**加上 <<MORE>> 标记（半角，独占也行、跟在句尾也行），` +
          `系统会立刻让你发下一条（本次最多 ${predCfg.maxMessages} 条）。\n` +
          `不想继续、或者话说完了，就正常结尾、**不要**加这个标记。`,
      );
    }

    // 注入对话规划（AI 预测的本次聊天内容，本段对话内遵循）
    return injectPlanIntoPrompt(parts.join('\n\n'), c.conversationPlan);
  };

  const getWorldBookInjections = (): { prePromptAdditions: string; postPromptAdditions: string } => {
    const c = chatRef.current;
    if (!c) return { prePromptAdditions: '', postPromptAdditions: '' };

    const activeWorldBookIds = c.worldBookIds ?? [];
    const activeWorldBooks = worldBooks.filter((wb) => activeWorldBookIds.includes(wb.id));
    if (activeWorldBooks.length === 0) return { prePromptAdditions: '', postPromptAdditions: '' };

    const messagesForScan = c.messages.map((m) => ({ role: m.role, content: m.content }));
    const scanResults = worldBookService.scanWorldBooksFromMessages(activeWorldBooks, messagesForScan, {
      scanDepth: 100,
      maxEntries: 50,
      tokenBudget: 0,
    });

    const groups = worldBookService.groupByInjectTarget(scanResults);
    const prePromptAdditions = groups.pre_prompt.map((r) => renderMacros(r.content)).join('\n\n');
    const postPromptAdditions = groups.post_prompt.map((r) => renderMacros(r.content)).join('\n\n');

    return { prePromptAdditions, postPromptAdditions };
  };

  const getMessagesWithContext = (): ChatMessage[] => {
    const c = chatRef.current;
    if (!c) return [];
    const memoryLength = c.settings?.memoryLength ?? 10;

    // 过滤掉已压缩(且不是总结消息)的消息，保留压缩总结消息注入上下文
    // summary 消息也算作上下文，不会被 memoryLength 截断（放在最前）
    const allMsgs = c.messages;

    // 1) 找出所有压缩总结消息，作为上下文前缀
    const summaryMsgs = allMsgs.filter(m =>
      m.role === 'system' && (m.type === 'summary' || m.isCompressedSummary)
    );

    // 2) 找出未被压缩的用户/助手消息（参与 memoryLength 计算）
    const aliveNonSystem = allMsgs.filter(
      m => !!(m && ((m.role === 'user' || m.role === 'assistant') && !(m as any).isCompressed))
    );

    // 3) 取最近 memoryLength 条用户/助手消息
    const recentMsgs = aliveNonSystem.slice(-memoryLength);

    // 4) 合并：总结消息（最早的在前）+ 最近消息
    //    注意：要保持时间顺序
    const result = [
      ...summaryMsgs.sort((a, b) => a.timestamp - b.timestamp),
      ...recentMsgs,
    ];

    return result;
  };

  const applyRegex = (text: string, scope: 'input' | 'output'): string => {
    const c = chatRef.current;
    if (!c) return text;
    const rules = c.settings?.regexRules || [];
    if (rules.length === 0) return text;

    let result = text;
    const sortedRules = [...rules].filter(r => r.enabled).sort((a, b) => a.order - b.order);

    for (const rule of sortedRules) {
      if (rule.scope !== scope && rule.scope !== 'both') continue;
      try {
        const regex = new RegExp(rule.pattern, 'g');
        result = result.replace(regex, rule.replacement);
      } catch (e) {
        console.warn(`正则 "${rule.name}" 执行失败:`, e);
      }
    }

    return result;
  };

  const getMemberProvider = (member: GroupMember): AIProvider | undefined => {
    const providerId = member.settings.textProviderId as string | undefined;
    if (providerId) {
      const p = providers.find((p) => p.id === providerId);
      if (p && p.capabilities.includes('text')) return p;
    }
    return providers.find((p) => p.capabilities.includes('text'));
  };

  const getMemberModel = (member: GroupMember): AIModel | undefined => {
    const provider = getMemberProvider(member);
    if (!provider || !provider.models || provider.models.length === 0) return undefined;
    const modelId = member.settings.textModelId as string | undefined;
    if (modelId) {
      const m = provider.models.find((m) => m.id === modelId);
      if (m) return m;
    }
    return provider.models.find((m) => m.modelId === provider.model) || provider.models[0];
  };

  const buildMemberSystemPrompt = (member: GroupMember): string => {
    const c = chatRef.current;
    const parts: string[] = [];
    if (settings.baseSystemPrompt) parts.push(renderMacros(settings.baseSystemPrompt));
    if (settings.unifiedPrePrompt) parts.push(renderMacros(settings.unifiedPrePrompt));
    // 群聊总设定：群级共享的基础指令（所有成员都遵循）
    if (c?.settings?.systemPrompt) {
      parts.push(renderMacros(`【群聊总设定（所有成员共同遵循）】\n${c.settings.systemPrompt}`));
    }
    // 单角色设定：该成员自己的角色卡/独立指令
    if (member.settings.systemPrompt) parts.push(renderMacros(member.settings.systemPrompt));

    const activeWorldBookIds = c?.worldBookIds ?? [];
    const activeWorldBooks = worldBooks.filter((wb) => activeWorldBookIds.includes(wb.id));
    for (const wb of activeWorldBooks) {
      if (wb.systemPrompt) parts.push(renderMacros(`【${wb.name}·系统设定】${wb.systemPrompt}`));
    }

    const played = getPlayedCharacterInfo();
    const memberUserPersona = played
      ? `【你正在扮演「${played.name}」，这是用户当前的身份/人设】\n${played.persona}`
      : member.settings.userPersona;
    if (memberUserPersona) {
      parts.push(renderMacros(`【用户人设（以下描述的是用户/人类扮演的角色，不是你（AI）的角色设定，请不要将其作为你自己的身份或性格）】\n用户扮演的角色如下：\n${memberUserPersona}\n请始终以此设定为用户的身份进行互动，你（AI）应保持自己的角色设定，不要混淆。`));
    }

    const memberStatusBar = member.settings.statusBar;
    if (memberStatusBar?.enabled && memberStatusBar.vars.length > 0) {
      const statusPrompt = statusVarService.generateSystemPrompt(memberStatusBar);
      if (statusPrompt) parts.push(renderMacros(statusPrompt));
    }

    parts.push(`【重要提示】你正在参与一个群聊，群里有多个AI角色和用户。请以"${member.name}"的身份回复，保持角色设定的一致性。只输出你自己的回复，不要替其他角色说话。`);

    // 群聊里历史消息带说话人前缀，否则角色分不清「谁说了什么」
    const otherNames = (c?.groupMembers || [])
      .filter((m) => m.isActive && m.id !== member.id)
      .map((m) => m.name)
      .slice(0, 20);
    if (otherNames.length > 0) {
      parts.push(
        `【群聊消息格式】历史记录里，其他人的发言会写成「【名字】内容」，老师的发言写成「【老师】内容」，**你自己说过的话没有前缀**。
当前群里的其他成员有：${otherNames.join('、')}。
看到「【某某】…」时，那是**别人**说的话，你要像真人接话一样回应、附和、吐槽或反驳，**不要**把别人的话当成自己说过的。`,
      );
    }

    // AI 输出前置词/后置词（群聊里用成员自己的设置）
    if (member.settings.prePrompt?.trim()) {
      parts.push(renderMacros(`【回复格式要求】你的回复必须以「${member.settings.prePrompt}」开头。`));
    }
    if (member.settings.postPrompt?.trim()) {
      parts.push(renderMacros(`【回复格式要求】你的回复必须以「${member.settings.postPrompt}」结尾。`));
    }

    // 注入对话规划（群聊里每个成员都遵循同一份预测）
    return injectPlanIntoPrompt(parts.join('\n\n'), c?.conversationPlan);
  };

  const getGroupContextForMember = (memberId: string): ChatMessage[] => {
    const c = chatRef.current;
    if (!c) return [];
    const memoryLength = c.settings?.memoryLength ?? 10;

    const allMsgs = c.messages;
    const summaryMsgs = allMsgs.filter(m =>
      m.role === 'system' && (m.type === 'summary' || m.isCompressedSummary)
    );

    // 群聊上下文：所有消息（用户消息 + 所有成员的回复）
    const aliveNonSystem = allMsgs.filter(
      m => !!m && ((m.role === 'user' || m.role === 'assistant') && !(m as any).isCompressed)
    );

    return [
      ...summaryMsgs.sort((a, b) => a.timestamp - b.timestamp),
      ...aliveNonSystem.slice(-memoryLength),
    ];
  };

  const getPrivateChatContext = (): ChatMessage[] => {
    const c = chatRef.current;
    if (!c || c.conversationType !== 'group_private' || !c.parentId || !c.activeMemberId) {
      return getMessagesWithContext();
    }
    const parentChat = chats.find((ch) => ch.id === c.parentId);
    if (!parentChat) return getMessagesWithContext();

    const memoryLength = c.settings?.memoryLength ?? 10;

    // 合并群聊中该成员参与的消息（过滤已压缩）和私聊消息
    const parentSummaryMsgs = (parentChat.messages || []).filter(m =>
      m.role === 'system' && (m.type === 'summary' || m.isCompressedSummary)
    );
    const selfSummaryMsgs = (c.messages || []).filter(m =>
      m.role === 'system' && (m.type === 'summary' || m.isCompressedSummary)
    );
    const allSummaryMsgs = [...parentSummaryMsgs, ...selfSummaryMsgs]
      .sort((a, b) => a.timestamp - b.timestamp);

    const groupMemberMessages = (parentChat.messages || []).filter(
      m => !!m && ((m.role === 'user' || (m.role === 'assistant' && m.senderMemberId === c.activeMemberId)) && !(m as any).isCompressed)
    );
    const selfMsgs = (c.messages || []).filter(
      m => !!m && (m.role !== 'system' && !(m as any).isCompressed)
    );
    const allMessages = [...groupMemberMessages, ...selfMsgs]
      .sort((a, b) => a.timestamp - b.timestamp);

    return [
      ...allSummaryMsgs,
      ...allMessages.slice(-memoryLength),
    ];
  };

  const checkTriggerImages = (text: string): WorldBookImage[] => {
    const c = chatRef.current;
    if (!c) return [];
    const triggered: WorldBookImage[] = [];
    const activeWorldBookIds = c.worldBookIds ?? [];
    const activeWorldBooks = worldBooks.filter((wb) => activeWorldBookIds.includes(wb.id));
    const lowerText = text.toLowerCase();

    for (const wb of activeWorldBooks) {
      for (const entry of wb.entries) {
        if (!entry.enabled) continue;

        let entryTriggered = false;

        if (entry.constant || entry.injectWhen === 'always') {
          entryTriggered = true;
        } else {
          for (const key of entry.keys) {
            if (!key || !key.trim()) continue;
            const lowerKey = key.toLowerCase();
            if (lowerText.includes(lowerKey)) {
              entryTriggered = true;
              break;
            }
          }
        }

        if (entryTriggered && entry.probability !== undefined && entry.probability < 1 && entry.probability > 0) {
          if (Math.random() > entry.probability) {
            entryTriggered = false;
          }
        }

        if (entryTriggered) {
          for (const img of entry.images) {
            if (!triggered.find((t) => t.id === img.id)) {
              triggered.push(img);
            }
          }
        }

        for (const img of entry.images) {
          for (const keyword of img.triggerKeywords) {
            if (!keyword || !keyword.trim()) continue;
            const lowerKw = keyword.toLowerCase();
            if (lowerText.includes(lowerKw) && !triggered.find((t) => t.id === img.id)) {
              triggered.push(img);
            }
          }
        }
      }
    }

    const maxImagesPerMessage = c.settings?.maxImagesPerMessage ?? 5;
    return triggered.slice(0, maxImagesPerMessage);
  };

  const handleGroupSend = async (text: string, allMessages: ChatMessage[], userMessage: ChatMessage) => {
    const c = chatRef.current;
    if (!c) return;
    const members = (c.groupMembers || []).filter((m) => m.isActive);
    if (members.length === 0) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('群聊中没有活跃成员，请先添加成员');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    const firstTextProvider = getMemberProvider(members[0]);
    if (!firstTextProvider) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('请先在设置中添加对话AI提供商');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    forceStopRef.current = false;
    setIsLoading(true);

    let enhancedText = renderMacros(text);
    enhancedText = applyRegex(enhancedText, 'input');

    const prePrompt = c.settings?.userPrePrompt || '';
    const postPrompt = c.settings?.userPostPrompt || '';
    const { prePromptAdditions, postPromptAdditions } = getWorldBookInjections();
    const fullPrePrompt = prePromptAdditions ? `${prePromptAdditions}\n\n${prePrompt}` : prePrompt;
    const fullPostPrompt = postPromptAdditions ? `${postPrompt}\n\n${postPromptAdditions}` : postPrompt;
    if (fullPrePrompt || fullPostPrompt) {
      enhancedText = `${fullPrePrompt}${enhancedText}${fullPostPrompt}`;
    }

    // 更新用户消息为处理过 macros/regex/pre/post 的版本
    let currentMessages = allMessages.map((m) =>
      m.id === userMessage.id ? { ...m, content: enhancedText } : m
    );
    updateChat({ messages: currentMessages });

    // 对话预测：群聊收到用户消息后预测一次，所有成员遵循同一份规划
    if (c.settings?.predictionConfig?.enabled !== false) {
      const plan = await predictConversationPlan(enhancedText, c.title || '群聊');
      if (plan) {
        updateChat({ conversationPlan: plan });
      }
    }

    const memoryLength = c.settings?.memoryLength ?? 10;
    // 本轮开始时间（用于「角色见闻」只扫描本轮新产生的回复）
    const roundStart = Date.now();

    for (const member of members) {
      if (forceStopRef.current) break;
      if (!isMountedRef.current) break;

      const provider = getMemberProvider(member);
      if (!provider) continue;

      setCurrentRespondingMember(member.id);

      const aiMessageId = generateId();
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        images: [],
        timestamp: Date.now(),
        providerId: provider.id,
        senderMemberId: member.id,
      };

      currentMessages = [...currentMessages, aiMessage];
      updateChat({ messages: currentMessages });

      // 上下文：包含用户消息 + 之前所有AI的回复（接力式）
      // 不额外追加用户消息，因为 currentMessages 已经包含
      // 过滤已压缩的用户/助手消息，保留压缩总结system消息注入最前
      const gSummaryMsgs = currentMessages.filter(m =>
        m.role === 'system' && (m.type === 'summary' || m.isCompressedSummary)
      );
      const gAliveMsgs = currentMessages.filter(
        m => !!m && ((m.role === 'user' || m.role === 'assistant') && !(m as any).isCompressed)
      );
      // 记忆互通：合并该成员的私聊消息（私聊/群聊记忆共享）
      const memberPrivateChat = chats.find(ch =>
        ch.conversationType === 'group_private' && ch.parentId === c.id && ch.activeMemberId === member.id
      );
      const memberPrivateMsgs = memberPrivateChat
        ? (memberPrivateChat.messages || []).filter(m => !!m && m.role !== 'system' && !(m as any).isCompressed)
        : [];
      const mergedAliveMsgs = [...gAliveMsgs, ...memberPrivateMsgs].sort((a, b) => a.timestamp - b.timestamp);
      // 给历史消息标注说话人：别人的发言转成 user 并加【名字】前缀，
      // 否则模型会把别人的话当成自己说过的（群聊「认不出别人」的根因）。
      const memberById = new Map((c.groupMembers || []).map((m) => [m.id, m]));
      const annotateSpeaker = (m: ChatMessage): ChatMessage => {
        if (!m || m.role === 'system') return m;
        if (m.role === 'user') return { ...m, content: `【老师】${m.content}` };
        const speaker = m.senderMemberId ? memberById.get(m.senderMemberId) : undefined;
        if (!speaker || speaker.id === member.id) return m; // 自己说的保持 assistant 原样
        return { ...m, role: 'user', content: `【${speaker.name}】${m.content}` };
      };
      const msgsToSend = [
        ...gSummaryMsgs.sort((a, b) => a.timestamp - b.timestamp),
        ...mergedAliveMsgs.slice(-memoryLength).map(annotateSpeaker),
      ];

      const memberModel = getMemberModel(member);
      const modelOverride = memberModel?.modelId;
      const streamOutput = c.settings?.streamOutput ?? true;

      try {
        let finalContent = '';
        let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
        let firstTokenTime: number | undefined;
        const startTime = Date.now();
        thinkingByMessageRef.current[aiMessageId] = '';
        thinkingLastUpdateRef.current[aiMessageId] = 0;

        if (streamOutput) {
          setStreamingMessageId(aiMessageId);
          let fullContent = '';
          let lastUpdateTime = 0;
          let firstChunkReceived = false;

          await aiService.chat(
            provider,
            msgsToSend,
            buildMemberSystemPrompt(member),
            (chunk) => {
              if (forceStopRef.current) return;
              if (!firstChunkReceived) {
                firstChunkReceived = true;
                firstTokenTime = Date.now() - startTime;
              }
              fullContent += chunk;
              finalContent = fullContent;
              const now = Date.now();
              if (now - lastUpdateTime >= 140) {
                lastUpdateTime = now;
                if (isMountedRef.current) {
                  updateStreamingMessage(aiMessageId, {
                    content: fullContent,
                    thinkingContent: thinkingByMessageRef.current[aiMessageId],
                    firstTokenTime,
                  });
                }
              }
            },
            {
              modelOverride,
              onTokenUsage: (usage) => { tokenUsage = usage; },
              onThinkingChunk: (thinking) => {
                if (forceStopRef.current) return;
                thinkingByMessageRef.current[aiMessageId] = (thinkingByMessageRef.current[aiMessageId] || '') + thinking;
                const now = Date.now();
                if (now - (thinkingLastUpdateRef.current[aiMessageId] || 0) >= 140) {
                  thinkingLastUpdateRef.current[aiMessageId] = now;
                  if (isMountedRef.current) {
                    updateStreamingMessage(aiMessageId, {
                      thinkingContent: thinkingByMessageRef.current[aiMessageId],
                    });
                  }
                }
              },
            }
          );

          const totalElapsedTime = Date.now() - startTime;
          if (isMountedRef.current) {
            currentMessages = currentMessages.map((m) =>
              m.id === aiMessageId
                ? {
                    ...m,
                    content: fullContent,
                    thinkingContent: thinkingByMessageRef.current[aiMessageId] || m.thinkingContent,
                    tokenUsage,
                    firstTokenTime,
                    totalElapsedTime,
                  }
                : m
            );
            updateChat({ messages: currentMessages });
          }
          setStreamingMessageId(null);
        } else {
          const response = await aiService.chat(provider, msgsToSend, buildMemberSystemPrompt(member), undefined, {
            modelOverride,
            onTokenUsage: (usage) => { tokenUsage = usage; },
            onThinkingChunk: (thinking) => {
              thinkingByMessageRef.current[aiMessageId] = (thinkingByMessageRef.current[aiMessageId] || '') + thinking;
            },
          });
          if (forceStopRef.current) break;
          finalContent = response;
          const totalElapsedTime = Date.now() - startTime;
          currentMessages = currentMessages.map((m) =>
            m.id === aiMessageId
              ? {
                  ...m,
                  content: response,
                  thinkingContent: thinkingByMessageRef.current[aiMessageId] || m.thinkingContent,
                  tokenUsage,
                  totalElapsedTime,
                }
              : m
          );
          updateChat({ messages: currentMessages });
        }
      } catch (error: any) {
        const errorMsg = formatErrorMessage(error, `${member.name}回复失败`);
        const errorDetail = error?.message || error?.toString() || '';
        currentMessages = currentMessages.map((m) =>
          m.id === aiMessageId ? { ...m, content: errorMsg, isError: true, errorDetail } : m
        );
        updateChat({ messages: currentMessages });
      }
    }

    setCurrentRespondingMember(null);
    setIsLoading(false);
    setStreamingMessageId(null);

    // ── 群聊「角色见闻」 ──
    // 把这一轮里 A 说到的、关于 B 的内容，记进 B 自己那本世界书（关键词命中才注入）。
    // B 只知道这件事，不知道是 A 跟用户说的 —— 所以词条只客观陈述事实、不写来源。
    try {
      const members = (c.groupMembers || []).map((m) => ({ characterId: m.characterId, name: m.name }));
      const hits: ReturnType<typeof characterMemoryService.collectMentions> = [];
      for (const msg of currentMessages) {
        if (!msg || msg.role !== 'assistant' || !msg.senderMemberId || (msg as any).isError) continue;
        if ((msg.timestamp || 0) < roundStart) continue;
        const speaker = (c.groupMembers || []).find((m) => m.id === msg.senderMemberId);
        hits.push(
          ...characterMemoryService.collectMentions({
            text: msg.content || '',
            speakerCharacterId: speaker?.characterId,
            members,
          }),
        );
      }
      if (hits.length > 0) {
        setWorldBooks(characterMemoryService.applyMentions(worldBooks, hits));
        // 把这些「见闻世界书」挂到对应角色的私聊上，保证跟她们私聊时能命中
        const bookIds = Array.from(new Set(hits.map((h) => characterMemoryService.bookIdFor(h.characterId))));
        setChats((prev) =>
          prev.map((ch) => {
            if (ch.conversationType !== 'group_private') return ch;
            const member = (c.groupMembers || []).find((m) => m.id === ch.activeMemberId);
            if (!member?.characterId) return ch;
            if (!bookIds.includes(characterMemoryService.bookIdFor(member.characterId))) return ch;
            const existing = ch.worldBookIds || [];
            const merged = Array.from(new Set([...existing, characterMemoryService.bookIdFor(member.characterId)]));
            return merged.length === existing.length ? ch : { ...ch, worldBookIds: merged };
          }),
        );
      }
    } catch (e) {
      console.warn('[characterMemory] 记录失败', e);
    }

    // 群聊自动推进：老师发言后，按设置让她们自己再聊几轮
    const autoCfg = c.settings?.groupAutoAdvance;
    if (autoCfg?.enabled && !forceStopRef.current && isMountedRef.current) {
      const rounds = Math.max(1, Math.min(5, autoCfg.rounds ?? 1));
      for (let r = 0; r < rounds; r++) {
        if (forceStopRef.current || !isMountedRef.current) break;
        await runGroupAutoRound();
      }
    }
  };

  /**
   * 群聊自动推进：老师没说话时，让活跃成员自己接着聊。
   * 每个成员依次发言一次，历史照旧带说话人前缀，保证她们知道在回应谁。
   */
  const runGroupAutoRound = async (): Promise<void> => {
    const c = chatRef.current;
    if (!c || autoAdvancingRef.current) return;
    const active = (c.groupMembers || []).filter((m) => m.isActive);
    if (active.length === 0) return;

    autoAdvancingRef.current = true;
    forceStopRef.current = false;
    setIsLoading(true);

    try {
      let msgs = [...(c.messages || [])];
      const memoryLength = c.settings?.memoryLength ?? 10;
      const memberById = new Map(active.map((m) => [m.id, m]));

      for (const member of active) {
        if (forceStopRef.current || !isMountedRef.current) break;
        const provider = getMemberProvider(member);
        if (!provider) continue;

        setCurrentRespondingMember(member.id);

        const aiMessageId = generateId();
        const aiMessage: ChatMessage = {
          id: aiMessageId,
          role: 'assistant',
          content: '',
          images: [],
          timestamp: Date.now(),
          providerId: provider.id,
          senderMemberId: member.id,
        };
        msgs = [...msgs, aiMessage];
        updateChat({ messages: msgs });

        // 与 handleGroupSend 相同的说话人标注
        const annotate = (m: ChatMessage): ChatMessage => {
          if (!m || m.role === 'system') return m;
          if (m.role === 'user') return { ...m, content: `【老师】${m.content}` };
          const speaker = m.senderMemberId ? memberById.get(m.senderMemberId) : undefined;
          if (!speaker || speaker.id === member.id) return m;
          return { ...m, role: 'user', content: `【${speaker.name}】${m.content}` };
        };
        const alive = msgs.filter(
          (m) => !!m && m.role !== 'system' && m.id !== aiMessageId && !(m as any).isCompressed,
        );
        const msgsToSend = alive.slice(-memoryLength).map(annotate);

        const sys =
          buildMemberSystemPrompt(member) +
          `\n\n【继续聊】老师暂时没说话，现在轮到群里自己聊下去。请主动接话：回应刚才别人说的内容、@某个同学、抛出新的小话题、分享日常，或者朝老师喊话撒娇等他回来。` +
          `\n不要重复自己刚说过的话，不要总结前面聊了什么，不要问「接下来要做什么」，直接像平时发桃信一样发消息。` +
          `\n\n【你可以选择不说话】如果你觉得以你的性格现在没什么想说的、或者别人已经把话接住了、或者你正在忙/在睡觉，` +
          `就**只输出** [跳过] 这四个半角字符（不要输出别的内容）。没人接话时也不用勉强，偶尔沉默才像真人。`;

        try {
          const response = await aiService.chat(provider, msgsToSend, sys, undefined, {
            modelOverride: getMemberModel(member)?.modelId,
          });
          if (forceStopRef.current) break;
          // AI 自己决定不说话：把占位消息撤掉
          if (/^\s*[\[【]\s*跳过\s*[\]】]\s*$/.test(response || '')) {
            msgs = msgs.filter((m) => m.id !== aiMessageId);
            updateChat({ messages: msgs });
            continue;
          }
          msgs = msgs.map((m) => (m.id === aiMessageId ? { ...m, content: response, totalElapsedTime: 0 } : m));
          updateChat({ messages: msgs });
        } catch (e: any) {
          msgs = msgs.map((m) =>
            m.id === aiMessageId ? { ...m, content: formatErrorMessage(e, `${member.name}回复失败`), isError: true } : m,
          );
          updateChat({ messages: msgs });
        }
      }
    } finally {
      autoAdvancingRef.current = false;
      setCurrentRespondingMember(null);
      setIsLoading(false);
    }
  };

  // 群聊定时自动推进：开启后即使老师不说话，群里也会自己聊下去
  useEffect(() => {
    const c = chat;
    const cfg = c?.settings?.groupAutoAdvance;
    const intervalSec = cfg?.autoIntervalSec ?? 0;
    if (!c || c.conversationType !== 'group' || !cfg?.enabled || intervalSec <= 0) return;
    const timer = setInterval(() => {
      if (isLoading || autoAdvancingRef.current || forceStopRef.current) return;
      runGroupAutoRound().catch(() => {});
    }, Math.max(15, intervalSec) * 1000);
    return () => clearInterval(timer);
  }, [chat?.id, chat?.settings?.groupAutoAdvance?.enabled, chat?.settings?.groupAutoAdvance?.autoIntervalSec, isLoading]);

  /**
   * 处理 AI 回复里的界面指令（与主对话路径同一套逻辑）。
   *
   * {{ui:img=名字}} → 解析成素材库/网络图片，并记下插入位置（就地显示）
   * 换色/装饰/背景   → 累积进对话级 uiState
   * 指令本身从正文里剔除，用户和编辑界面都看不到。
   *
   * 之前「群内私聊」(group_private) 走的是 handlePrivateSend，完全没有这段处理，
   * 所以在那里面 AI 发表情包会石沉大海 —— 抽成公共函数后两条路径都走这里。
   */
  const applyUiDirectivesToReply = async (
    aiMessageId: string,
    content: string,
    currentMessages: ChatMessage[],
  ): Promise<ChatMessage[]> => {
    const directiveResult = parseUiDirectives(content);
    if (directiveResult.directives.length === 0) return currentMessages;

    const resolvedImages: string[] = [];
    const inlineImagePositions: Array<{ uri: string; at: number }> = [];
    const inlineScan = extractInlineImages(content);
    for (const slot of inlineScan.images) {
      const uri = await mediaLibraryService.resolveToUri(slot.name);
      if (!uri) continue;
      resolvedImages.push(uri);
      inlineImagePositions.push({ uri, at: slot.at });
    }

    const prevUi = (chatRef.current?.uiState || {}) as any;
    const accumulated = applyDirectives(
      {
        ...emptyUiState(),
        ...prevUi,
        colors: { ...(prevUi.colors || {}) },
        images: [],
      } as UiState,
      directiveResult.directives.filter((d) => d.key !== 'img'),
    );

    const next = currentMessages.map((m) =>
      m.id === aiMessageId
        ? {
            ...m,
            content: inlineImagePositions.length > 0 ? inlineScan.content : directiveResult.content,
            images:
              resolvedImages.length > 0
                ? Array.from(new Set([...(m.images || []), ...resolvedImages]))
                : m.images,
            inlineImagePositions:
              inlineImagePositions.length > 0 ? inlineImagePositions : m.inlineImagePositions,
          }
        : m,
    );

    updateChat({
      messages: next,
      uiState: {
        bg: accumulated.bg,
        bgm: accumulated.bgm,
        decor: accumulated.decor,
        theme: accumulated.theme,
        colors: accumulated.colors,
        images: [],
      },
    } as any);

    return next;
  };

  const handlePrivateSend = async (text: string, allMessages: ChatMessage[], userMessage: ChatMessage, member: GroupMember) => {
    const c = chatRef.current;
    if (!c) return;

    const provider = getMemberProvider(member);
    if (!provider) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('请先在设置中添加对话AI提供商');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    forceStopRef.current = false;
    setIsLoading(true);

    let enhancedText = renderMacros(text);
    enhancedText = applyRegex(enhancedText, 'input');

    const prePrompt = c.settings?.userPrePrompt || '';
    const postPrompt = c.settings?.userPostPrompt || '';
    const { prePromptAdditions, postPromptAdditions } = getWorldBookInjections();
    const fullPrePrompt = prePromptAdditions ? `${prePromptAdditions}\n\n${prePrompt}` : prePrompt;
    const fullPostPrompt = postPromptAdditions ? `${postPrompt}\n\n${postPromptAdditions}` : postPrompt;
    if (fullPrePrompt || fullPostPrompt) {
      enhancedText = `${fullPrePrompt}${enhancedText}${fullPostPrompt}`;
    }

    // 对话预测：私聊收到用户消息后预测一次，存进私聊的 conversationPlan
    if (c.settings?.predictionConfig?.enabled !== false) {
      const plan = await predictConversationPlan(enhancedText, member.name);
      if (plan) {
        updateChat({ conversationPlan: plan });
      }
    }

    const aiMessageId = generateId();
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      images: [],
      timestamp: Date.now(),
      providerId: provider.id,
      senderMemberId: member.id,
    };

    let currentMessages = [...allMessages, aiMessage];
    updateChat({ messages: currentMessages });

    const contextMessages = getPrivateChatContext();
    const userMsgWithContext = { ...userMessage, content: enhancedText };
    const msgsToSend = [...contextMessages, userMsgWithContext];

    const memberModel = getMemberModel(member);
    const modelOverride = memberModel?.modelId;
    const streamOutput = c.settings?.streamOutput ?? true;

    try {
      let finalContent = '';
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
      let firstTokenTime: number | undefined;
      const startTime = Date.now();
      thinkingByMessageRef.current[aiMessageId] = '';
      thinkingLastUpdateRef.current[aiMessageId] = 0;

      if (streamOutput) {
        setStreamingMessageId(aiMessageId);
        let fullContent = '';
        let lastUpdateTime = 0;
        let firstChunkReceived = false;

        await aiService.chat(
          provider,
          msgsToSend,
          buildMemberSystemPrompt(member),
          (chunk) => {
            if (forceStopRef.current) return;
            if (!firstChunkReceived) {
              firstChunkReceived = true;
              firstTokenTime = Date.now() - startTime;
            }
            fullContent += chunk;
            finalContent = fullContent;
            const now = Date.now();
            if (now - lastUpdateTime >= 140) {
              lastUpdateTime = now;
              if (isMountedRef.current) {
                updateStreamingMessage(aiMessageId, {
                  content: fullContent,
                  thinkingContent: thinkingByMessageRef.current[aiMessageId],
                  firstTokenTime,
                });
              }
            }
          },
          {
            modelOverride,
            onTokenUsage: (usage) => { tokenUsage = usage; },
            onThinkingChunk: (thinking) => {
              if (forceStopRef.current) return;
              thinkingByMessageRef.current[aiMessageId] = (thinkingByMessageRef.current[aiMessageId] || '') + thinking;
              const now = Date.now();
              if (now - (thinkingLastUpdateRef.current[aiMessageId] || 0) >= 140) {
                thinkingLastUpdateRef.current[aiMessageId] = now;
                if (isMountedRef.current) {
                  updateStreamingMessage(aiMessageId, { thinkingContent: thinkingByMessageRef.current[aiMessageId] });
                }
              }
            },
          }
        );

        const totalElapsedTime = Date.now() - startTime;
        if (isMountedRef.current) {
          currentMessages = currentMessages.map((m) =>
            m.id === aiMessageId
              ? {
                  ...m,
                  content: fullContent,
                  thinkingContent: thinkingByMessageRef.current[aiMessageId] || m.thinkingContent,
                  tokenUsage,
                  firstTokenTime,
                  totalElapsedTime,
                }
              : m
          );
          updateChat({ messages: currentMessages });
        }
        setStreamingMessageId(null);
      } else {
        const response = await aiService.chat(provider, msgsToSend, buildMemberSystemPrompt(member), undefined, {
          modelOverride,
          onTokenUsage: (usage) => { tokenUsage = usage; },
          onThinkingChunk: (thinking) => {
            thinkingByMessageRef.current[aiMessageId] = (thinkingByMessageRef.current[aiMessageId] || '') + thinking;
          },
        });
        finalContent = response;
        const totalElapsedTime = Date.now() - startTime;
        currentMessages = currentMessages.map((m) =>
          m.id === aiMessageId
            ? {
                ...m,
                content: response,
                thinkingContent: thinkingByMessageRef.current[aiMessageId] || m.thinkingContent,
                tokenUsage,
                totalElapsedTime,
              }
            : m
        );
        updateChat({ messages: currentMessages });
      }

      // 群内私聊也要处理界面指令（表情包、换色等），否则 AI 发的表情会丢
      currentMessages = await applyUiDirectivesToReply(aiMessageId, finalContent, currentMessages);
    } catch (error: any) {
      const errorMsg = formatErrorMessage(error, '回复失败');
      const errorDetail = error?.message || error?.toString() || '';
      currentMessages = currentMessages.map((m) =>
        m.id === aiMessageId ? { ...m, content: errorMsg, isError: true, errorDetail } : m
      );
      updateChat({ messages: currentMessages });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setStreamingMessageId(null);
      }
    }
  };

  const handleSend = async (text: string, images: string[], type: 'text' | 'image', regenerateFromId?: string, existingVersions?: MessageVersion[], inlineFiles: InlineFile[] = []) => {
    const c = chatRef.current;
    if (!c) return;
    if (!text.trim() && images.length === 0 && inlineFiles.length === 0) return;

    // ⚠️ 必须在每次发送开始时复位「强制停止」标记。
    // 之前只有 handleGroupSend / handlePrivateSend / runGroupAutoRound 复位，
    // handleSend（普通 1 对 1）从来不清 —— 一旦超时或用户点过一次「停止」，
    // 这个标记就永远是 true，之后每次发送都会被流式回调里的
    // `if (forceStopRef.current) return;` 吞掉，表现就是「一直加载、不回复」。
    forceStopRef.current = false;

    const blockWords = c.settings?.blockWords || [];
    if (blockWords.length > 0 && text.trim()) {
      const lowerText = text.toLowerCase();
      const hit = blockWords.find((w) => w && lowerText.includes(w.toLowerCase()));
      if (hit) {
        setActionMenuTitle('包含屏蔽词');
        setActionMenuSubtitle(`消息中包含屏蔽词：${hit}，无法发送`);
        setActionMenuItems([{ label: '确定', onPress: () => {} }]);
        setShowActionMenuState(true);
        return;
      }
    }

    const isFirstMessage = c.messages.length === 0;

    // ── 自导模式：玩家扮演某个角色给自己发消息，不触发 AI 回复 ──
    const puppetId = c.settings?.puppetCharacterId;
    if (puppetId && !regenerateFromId) {
      const puppet =
        characters.find((ch) => ch.id === puppetId) ||
        (c.groupMembers || []).find((m) => m.characterId === puppetId);
      const puppetMsg: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: text,
        images: images.length > 0 ? images : [],
        inlineFiles: inlineFiles.length > 0 ? inlineFiles : undefined,
        timestamp: Date.now(),
        senderName: (puppet as any)?.name,
      } as any;
      setChats((prev) =>
        prev.map((ch) =>
          ch.id === c.id ? { ...ch, messages: [...ch.messages, puppetMsg], updatedAt: Date.now() } : ch,
        ),
      );
      return;
    }

    // 重新生成模式：复用已有的用户消息，避免重复创建
    // regenerateFromId 用于"重新生成"和"编辑并重新发送"场景，此时 c.messages 已包含用户消息
    let userMessage: ChatMessage;
    let newMessages: ChatMessage[];

    if (regenerateFromId) {
      // 找到要重新生成的消息位置，取其前面的用户消息
      const idx = c.messages.findIndex((m) => m.id === regenerateFromId);
      if (idx >= 0) {
        // 如果 regenerateFromId 指向 AI 消息，用户消息在 idx-1
        // 如果 regenerateFromId 指向 user 消息，用户消息在 idx
        const userIdx = c.messages[idx].role === 'user' ? idx : idx - 1;
        if (userIdx >= 0 && c.messages[userIdx].role === 'user') {
          userMessage = c.messages[userIdx];
          // 保留到用户消息为止，丢弃之后的所有消息（AI 回复等）
          newMessages = c.messages.slice(0, userIdx + 1);
        } else {
          // 找不到用户消息，退回到新建模式
          userMessage = {
            id: generateId(),
            role: 'user',
            content: text,
            images,
            inlineFiles,
            timestamp: Date.now(),
            type,
          };
          newMessages = [...c.messages, userMessage];
        }
      } else {
        // regenerateFromId 不在消息列表中，退回到新建模式
        userMessage = {
          id: generateId(),
          role: 'user',
          content: text,
          images,
          inlineFiles,
          timestamp: Date.now(),
          type,
        };
        newMessages = [...c.messages, userMessage];
      }
    } else {
      userMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        images,
        inlineFiles,
        timestamp: Date.now(),
        type,
      };
      newMessages = [...c.messages, userMessage];
    }

    updateChat({ messages: newMessages });
    setShouldScrollToBottom(true);

    if (isFirstMessage && text.trim()) {
      generateChatTitle(text.trim());
    }

    if (type === 'image') {
      await handleGenerateImage(text, newMessages);
      return;
    }

    // 群聊模式：多个成员轮流回复
    if (c.conversationType === 'group') {
      await handleGroupSend(text, newMessages, userMessage);
      return;
    }

    // 私聊模式：使用成员独立设置 + 共享记忆
    if (c.conversationType === 'group_private' && c.activeMemberId) {
      const parentChat = chats.find((ch) => ch.id === c.parentId);
      const member = parentChat?.groupMembers?.find((m) => m.id === c.activeMemberId);
      if (member) {
        await handlePrivateSend(text, newMessages, userMessage, member);
        return;
      }
    }

    const textProvider = getProvider('text');
    if (!textProvider) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('请先在设置中添加并选择对话AI提供商');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    setIsLoading(true);

    // 创建新的 AbortController 用于本次请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    // 超时保护：原来是 30 分钟 —— 一旦请求挂住，用户要对着「加载中」干等半小时，
    // 而且什么提示都没有。改成 2 分钟，超时就中断并给出明确错误。
    const requestTimeout = setTimeout(() => {
      if (!forceStopRef.current) {
        forceStopRef.current = true;
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
        if (isMountedRef.current) {
          setIsLoading(false);
          setStreamingMessageId(null);
        }
      }
    }, 120 * 1000);

    const aiMessageId = generateId();
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      images: [],
      timestamp: Date.now(),
      providerId: textProvider.id,
      versions: existingVersions,
      currentVersionIndex: existingVersions ? existingVersions.length : 0,
    };

    let currentMessages = [...newMessages, aiMessage];
    updateChat({ messages: currentMessages });

    let enhancedText = renderMacros(text);
    enhancedText = applyRegex(enhancedText, 'input');

    const prePrompt = c.settings?.userPrePrompt || '';
    const postPrompt = c.settings?.userPostPrompt || '';
    const { prePromptAdditions, postPromptAdditions } = getWorldBookInjections();
    const fullPrePrompt = prePromptAdditions ? `${prePromptAdditions}\n\n${prePrompt}` : prePrompt;
    const fullPostPrompt = postPromptAdditions ? `${postPrompt}\n\n${postPromptAdditions}` : postPrompt;
    if (fullPrePrompt || fullPostPrompt) {
      enhancedText = `${fullPrePrompt}${enhancedText}${fullPostPrompt}`;
    }

    if (webSearchEnabled) {
      try {
        const searchResults = await webSearchService.search(
          enhancedText,
          settings.webSearchProvider,
          settings.webSearchApiKey,
          settings.webSearchMaxResults
        );
        if (searchResults.length > 0) {
          const formattedResults = webSearchService.formatResults(searchResults);
          enhancedText = `${enhancedText}\n\n【联网搜索结果】\n${formattedResults}`;
        }
      } catch (e) {
        console.error('搜索失败:', e);
      }
    }

    const contextMessages = getMessagesWithContext();
    const userMsgWithContext = { ...userMessage, content: enhancedText };
    let msgsToSend = [...contextMessages, userMsgWithContext];

    // 自动压缩：如果消息总字符数超过阈值，压缩旧消息
    const autoCompress = settings.contextManagement?.autoCompress ?? false;
    const compressThreshold = settings.contextManagement?.compressThreshold ?? 8000;
    if (autoCompress && msgsToSend.length > 6) {
      const totalChars = msgsToSend.reduce((sum, m) => sum + (m.content?.length || 0), 0);
      if (totalChars > compressThreshold) {
        try {
          const summaryProvider = getProvider('summary') || getProvider('text');
          if (summaryProvider) {
            // 保留最后4条消息不压缩
            const keepCount = 4;
            const toCompress = msgsToSend.slice(0, msgsToSend.length - keepCount);
            const toKeep = msgsToSend.slice(msgsToSend.length - keepCount);

            const summary = await aiService.summarize(
              summaryProvider,
              toCompress,
              '请简洁地总结以下对话内容，保留关键信息：'
            );

            const summaryMsg: ChatMessage = {
              id: generateId(),
              role: 'system',
              content: `【上下文压缩总结】\n${summary}`,
              images: [],
              timestamp: Date.now(),
            };

            msgsToSend = [summaryMsg, ...toKeep];
          }
        } catch (e) {
          console.error('自动压缩失败:', e);
        }
      }
    }

    // 对话预测：收到用户消息后，让 AI 预测本次对话内容（关键词/几句话），存进 conversationPlan
    if (c.settings?.predictionConfig?.enabled !== false) {
      const charName = c.characterId ? (characters.find((ch) => ch.id === c.characterId)?.name || '角色') : '角色';
      const plan = await predictConversationPlan(enhancedText, charName);
      if (plan) {
        updateChat({ conversationPlan: plan });
      }
    }

    try {
      let finalContent = '';
      let tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
      let firstTokenTime: number | undefined;
      const startTime = Date.now();
      thinkingByMessageRef.current[aiMessageId] = '';
      thinkingLastUpdateRef.current[aiMessageId] = 0;

      const currentModel = getCurrentModel('text');
      const modelOverride = currentModel?.modelId;

      const streamOutput = c.settings?.streamOutput ?? true;
      if (streamOutput) {
        setStreamingMessageId(aiMessageId);
        let fullContent = '';
        let lastUpdateTime = 0;
        const THROTTLE_MS = 140;
        let firstChunkReceived = false;

        await aiService.chat(
          textProvider,
          msgsToSend,
          buildSystemPrompt(),
          (chunk) => {
            if (forceStopRef.current) return;
            if (!firstChunkReceived) {
              firstChunkReceived = true;
              firstTokenTime = Date.now() - startTime;
            }
            fullContent += chunk;
            finalContent = fullContent;
            const now = Date.now();
            if (now - lastUpdateTime >= THROTTLE_MS) {
              lastUpdateTime = now;
              if (isMountedRef.current && !forceStopRef.current) {
                updateStreamingMessage(aiMessageId, {
                  content: fullContent,
                  thinkingContent: thinkingByMessageRef.current[aiMessageId],
                  firstTokenTime,
                });
              }
            }
          },
          { 
            modelOverride,
            signal: controller.signal,
            onTokenUsage: (usage) => {
              tokenUsage = usage;
            },
            onThinkingChunk: (thinking) => {
              if (forceStopRef.current) return;
              thinkingByMessageRef.current[aiMessageId] = (thinkingByMessageRef.current[aiMessageId] || '') + thinking;
              const now = Date.now();
              if (now - (thinkingLastUpdateRef.current[aiMessageId] || 0) >= 140) {
                thinkingLastUpdateRef.current[aiMessageId] = now;
                if (isMountedRef.current && !forceStopRef.current) {
                  updateStreamingMessage(aiMessageId, { thinkingContent: thinkingByMessageRef.current[aiMessageId] });
                }
              }
            },
          }
        );

        // 请求完成，清除超时
        clearTimeout(requestTimeout);

        const totalElapsedTime = Date.now() - startTime;
        // 修复: AI 明明响应了但不显示 -> 如果 fullContent 为空但有 reasoning 内容，用推理作为兜底显示
        const displayContent = fullContent || thinkingByMessageRef.current[aiMessageId] || '...';

        if (isMountedRef.current) {
          currentMessages = currentMessages.map((m) =>
            m.id === aiMessageId
              ? {
                  ...m,
                  content: displayContent,
                  thinkingContent: thinkingByMessageRef.current[aiMessageId] || m.thinkingContent,
                  tokenUsage,
                  firstTokenTime,
                  totalElapsedTime,
                }
              : m
          );
          updateChat({ messages: currentMessages });
        }

        const triggeredImages = checkTriggerImages(fullContent);
        if (triggeredImages.length > 0) {
          currentMessages = currentMessages.map((m) =>
            m.id === aiMessageId ? { ...m, images: triggeredImages.map((i) => i.uri) } : m
          );
          updateChat({ messages: currentMessages });
        }
      } else {
        const response = await aiService.chat(textProvider, msgsToSend, buildSystemPrompt(), undefined, { 
          modelOverride,
          signal: controller.signal,
          onTokenUsage: (usage) => {
            tokenUsage = usage;
          },
          onThinkingChunk: (thinking) => {
            thinkingByMessageRef.current[aiMessageId] = (thinkingByMessageRef.current[aiMessageId] || '') + thinking;
          },
        });
        // 请求完成，清除超时
        clearTimeout(requestTimeout);
        finalContent = response;
        const totalElapsedTime = Date.now() - startTime;
        const displayContent = response || thinkingByMessageRef.current[aiMessageId] || '...';
        const triggeredImages = checkTriggerImages(response);
        currentMessages = currentMessages.map((m) =>
          m.id === aiMessageId
            ? {
                ...m,
                content: displayContent,
                thinkingContent: thinkingByMessageRef.current[aiMessageId] || m.thinkingContent,
                images: triggeredImages.map((i) => i.uri),
                tokenUsage,
                totalElapsedTime,
              }
            : m
        );
        updateChat({ messages: currentMessages });
      }

      finalContent = applyRegex(finalContent, 'output');
      const aiMessageAfterRegex = currentMessages.find((m) => m.id === aiMessageId);
      if (aiMessageAfterRegex && aiMessageAfterRegex.content !== finalContent) {
        currentMessages = currentMessages.map((m) =>
          m.id === aiMessageId ? { ...m, content: finalContent } : m
        );
        updateChat({ messages: currentMessages });
      }

      if (hasStatusBar) {
        const varUpdates = statusVarService.parseVarCommands(finalContent);
        if (varUpdates.length > 0) {
          updateStatusVars(varUpdates);
        }

        const cleanContent = statusVarService.stripStatusCommands(finalContent);
        if (cleanContent !== finalContent) {
          currentMessages = currentMessages.map((m) =>
            m.id === aiMessageId ? { ...m, content: cleanContent } : m
          );
          updateChat({ messages: currentMessages });
        }
      }

      if (statusVarService.hasAIJSCode(finalContent)) {
        const codes = statusVarService.extractAIJSCode(finalContent);
        if (codes.length > 0) {
          const combinedCode = codes.join('\n');
          currentMessages = currentMessages.map((m) =>
            m.id === aiMessageId ? { ...m, aijsCode: combinedCode, content: statusVarService.stripAIJSCode(m.content) } : m
          );
          updateChat({ messages: currentMessages });
        }
      }

      /**
       * AI 界面指令：{{ui:bg=...}} / {{ui:img=...}} / {{ui:decor=...}} / {{ui:color-*}} …
       *
       * 指令从正文剔除（用户看不到），效果分两处落地：
       *  · {{ui:img=名字}} → 解析成素材库里的图片挂到这条回复（"通过指令发图"）
       *  · 换色/装饰/背景 → 累积进对话级 uiState，由渲染层统一生效
       */
      const directiveResult = parseUiDirectives(finalContent);
      if (directiveResult.directives.length > 0) {
        const resolvedImages: string[] = [];
        const inlineImagePositions: Array<{ uri: string; at: number }> = [];
        // 记下每张表情应插入到正文的哪个字符位置，渲染时就会「就地」插在
        // 指令原本写的地方；正文本身保持干净，编辑界面看不到任何指令。
        const inlineScan = extractInlineImages(finalContent);

        for (const slot of inlineScan.images) {
          const uri = await mediaLibraryService.resolveToUri(slot.name);
          if (!uri) continue;
          resolvedImages.push(uri);
          inlineImagePositions.push({ uri, at: slot.at });
        }

        const prevUi = (chatRef.current?.uiState || {}) as any;
        const accumulated = applyDirectives(
          {
            ...emptyUiState(),
            ...prevUi,
            colors: { ...(prevUi.colors || {}) },
            images: [],
          } as UiState,
          directiveResult.directives.filter((d) => d.key !== 'img'),
        );

        currentMessages = currentMessages.map((m) =>
          m.id === aiMessageId
            ? {
                ...m,
                content:
                  inlineImagePositions.length > 0 ? inlineScan.content : directiveResult.content,
                images:
                  resolvedImages.length > 0
                    ? Array.from(new Set([...(m.images || []), ...resolvedImages]))
                    : m.images,
                inlineImagePositions:
                  inlineImagePositions.length > 0 ? inlineImagePositions : m.inlineImagePositions,
              }
            : m
        );

        updateChat({
          messages: currentMessages,
          uiState: {
            bg: accumulated.bg,
            bgm: accumulated.bgm,
            decor: accumulated.decor,
            theme: accumulated.theme,
            colors: accumulated.colors,
            images: [],
          },
        } as any);
      }

      const finalAiMessage = currentMessages.find((m) => m.id === aiMessageId);
      if (finalAiMessage) {
        const newVersion: MessageVersion = {
          id: generateId(),
          content: finalAiMessage.content,
          images: finalAiMessage.images,
          timestamp: finalAiMessage.timestamp,
          providerId: finalAiMessage.providerId,
        };
        const existingVersions = finalAiMessage.versions || [];
        currentMessages = currentMessages.map((m) => {
          if (m.id === aiMessageId) {
            return {
              ...m,
              versions: [...existingVersions, newVersion],
              currentVersionIndex: existingVersions.length,
            };
          }
          return m;
        });
        updateChat({ messages: currentMessages });
      }

      // 多句回复：用户一句，AI 连续回复多条。
      // 必须在 predictionConfig.enabled 打开时才生效（默认关闭），上限受 maxMessages 限制；
      // 并且**由 AI 自己决定**要不要接着说 —— 只有上一条以 <<MORE>> 结尾才继续。
      const predCfg = chatRef.current?.settings?.predictionConfig;
      const multiReplyOn = predCfg?.enabled === true;
      const maxMsgs = Math.max(1, Math.min(6, predCfg?.maxMessages ?? 1));
      if (multiReplyOn && maxMsgs > 1) {
        for (let i = 1; i < maxMsgs; i++) {
          if (forceStopRef.current || !isMountedRef.current) break;

          // AI 自己决定不再继续说：上一条没有 <<MORE>> 标记就停
          const lastMsg = currentMessages[currentMessages.length - 1];
          const lastContent = String(lastMsg?.content || '');
          if (!/<<\s*MORE\s*>>/i.test(lastContent)) break;

          // 去掉标记本身，别让用户看到
          currentMessages = currentMessages.map((m, idx) =>
            idx === currentMessages.length - 1
              ? { ...m, content: lastContent.replace(/<<\s*MORE\s*>>/gi, '').trimEnd() }
              : m,
          );
          updateChat({ messages: currentMessages });

          const followUpId = generateId();
          const followUpMsg: ChatMessage = {
            id: followUpId,
            role: 'assistant',
            content: '',
            images: [],
            timestamp: Date.now(),
            providerId: textProvider.id,
          };
          currentMessages = [...currentMessages, followUpMsg];
          updateChat({ messages: currentMessages });
          try {
            const ctx = currentMessages.slice(-Math.max(1, c.settings?.memoryLength ?? 20));
            const followContent = await aiService.chat(textProvider, ctx, buildSystemPrompt(), undefined, {
              modelOverride,
            });
            if (forceStopRef.current) break;
            currentMessages = currentMessages.map((m) =>
              m.id === followUpId ? { ...m, content: followContent } : m,
            );
            updateChat({ messages: currentMessages });
          } catch {
            // 后续这条失败就静默撤掉，不要影响已经发出去的内容
            currentMessages = currentMessages.filter((m) => m.id !== followUpId);
            updateChat({ messages: currentMessages });
            break;
          }
        }
      }

      const autoSummarize = c.settings?.autoSummarize ?? false;
      const autoSummarizeThreshold = Math.max(2, c.settings?.autoSummarizeThreshold ?? 10);
      if (autoSummarize) {
        const aliveNonSys = currentMessages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && !(m as any).isCompressed);
        const cur = (autoSummarizeCounterRef.current[c.id] ?? 0) + 1;
        autoSummarizeCounterRef.current[c.id] = cur;
        if (aliveNonSys.length >= autoSummarizeThreshold && cur >= autoSummarizeThreshold) {
          void handleAutoSummarize(currentMessages);
        }
      }
    } catch (error: any) {
      // 请求出错，清除超时
      clearTimeout(requestTimeout);
      // 超时/被中断时给一句人话，别只说「对话失败」
      const aborted =
        error?.name === 'AbortError' ||
        /abort|timeout|timed out|超时/i.test(String(error?.message || ''));
      const errorMsg = aborted
        ? '请求超时（2 分钟没有响应）。可能是网络不稳或模型服务卡住了：点「重试」，或换个模型/稍后再试。'
        : formatErrorMessage(error, '对话失败');
      const errorDetail = error?.message || error?.toString() || '';
      currentMessages = currentMessages.map((m) =>
        m.id === aiMessageId ? { ...m, content: errorMsg, isError: true, errorDetail } : m
      );
      updateChat({ messages: currentMessages });
    } finally {
      // 确保超时被清除
      clearTimeout(requestTimeout);
      if (isMountedRef.current) {
        setIsLoading(false);
        setStreamingMessageId(null);
      }
    }
  };

  const handleGenerateImage = async (prompt: string, currentMessages: ChatMessage[]) => {
    const c = chatRef.current;
    if (!c) return;

    const imageProvider = getProvider('image');
    if (!imageProvider) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('请先在设置中添加并选择生图AI提供商');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    setIsLoading(true);

    const aiMessageId = generateId();
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '正在生成图片...',
      images: [],
      timestamp: Date.now(),
      providerId: imageProvider.id,
      type: 'image',
    };

    let newMessages = [...currentMessages, aiMessage];
    updateChat({ messages: newMessages });

    try {
      const imageGenerationPrompt = c.settings?.imageGenerationPrompt ?? '';
      const fullPrompt = imageGenerationPrompt + prompt;
      const imageUrls = await aiService.generateImage(imageProvider, fullPrompt);

      newMessages = newMessages.map((m) =>
        m.id === aiMessageId
          ? { ...m, content: prompt, images: imageUrls }
          : m
      );
      updateChat({ messages: newMessages });
    } catch (error: any) {
      newMessages = newMessages.map((m) =>
        m.id === aiMessageId
          ? { ...m, content: formatErrorMessage(error, '图片生成失败') }
          : m
      );
      updateChat({ messages: newMessages });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleAutoSummarize = async (messages: ChatMessage[]) => {
    const c = chatRef.current;
    if (!c) return;
    // Single-chat mutex to prevent concurrent repeated auto-summarize
    if (autoSummarizeRunningRef.current[c.id]) return;
    autoSummarizeRunningRef.current[c.id] = true;
    try {
      const summaryProvider = getProvider('summary') || getProvider('text');
      const autoSummarizeSetting = c.settings?.autoSummarize ?? false;
      const threshold = Math.max(2, c.settings?.autoSummarizeThreshold ?? 10);
      if (!summaryProvider || !autoSummarizeSetting) return;

      // Only consider non-compressed user/assistant messages.
      const nonSystemAll = messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant'));
      const nonSystemAlive = nonSystemAll.filter((m) => !(m as any).isCompressed);
      if (nonSystemAlive.length <= threshold) return;

      // Keep the most recent minRecentKeep messages, compress the earliest rest.
      const minRecentKeep = Math.max(3, Math.floor(threshold * 0.4));
      const toCompress = nonSystemAlive.slice(0, nonSystemAlive.length - minRecentKeep);
      if (toCompress.length < 3) return;

      let summaryPrompt = c.settings?.summaryPrompt || '请简洁地总结以下对话内容，保留关键信息、角色设定、事件和名字。';
      const activeWorldBookIds = c.worldBookIds ?? [];
      const activeWorldBooks = worldBooks.filter((wb) => activeWorldBookIds.includes(wb.id));
      for (const wb of activeWorldBooks) {
        if (wb.summaryPrompt) {
          summaryPrompt = summaryPrompt
            ? `${summaryPrompt}

【${wb.name}·总结设定】${wb.summaryPrompt}`
            : wb.summaryPrompt;
        }
      }

      // Include system settings so AI reads character SP + chat SP + user persona when summarizing.
      const autoSysPromptParts: string[] = [];
      if (c.characterId) {
        const character = characters.find((ch: any) => ch.id === c.characterId);
        if (character?.systemPrompt && String(character.systemPrompt).trim()) {
          autoSysPromptParts.push(`【角色系统设定】
${character.systemPrompt.trim()}`);
        }
      }
      if (c.settings?.systemPrompt && String(c.settings.systemPrompt).trim()) {
        autoSysPromptParts.push(`【对话系统设定】
${c.settings.systemPrompt.trim()}`);
      }
      if (c.settings?.userPersona && String(c.settings.userPersona).trim()) {
        autoSysPromptParts.push(`【用户人设】
${c.settings.userPersona.trim()}`);
      }
      const autoSysPrompt = autoSysPromptParts.length > 0 ? autoSysPromptParts.join('\n\n') : undefined;

      const sumRes = await aiService.summarize(
        summaryProvider,
        toCompress,
        summaryPrompt,
        { systemPrompt: autoSysPrompt }
      );
      const summary = (sumRes && sumRes.content) ? sumRes.content : '';
      const tokenUsage = (sumRes && sumRes.tokenUsage) || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      if (!summary || summary.trim().length === 0) return;

      const newSummary = {
        id: generateId(),
        content: summary,
        timestamp: Date.now(),
        messageCount: toCompress.length,
        isAuto: true,
        tokenUsage,
        compressedRange: {
          fromTimestamp: toCompress[0]?.timestamp,
          toTimestamp: toCompress[toCompress.length - 1]?.timestamp,
        },
      };
      const currentSummaries = (c as any)?.summaries || [];
      const updatedSummaries = [newSummary, ...currentSummaries];

      const compressedIds = new Set(toCompress.map((m) => m.id));
      const summaryMsgId = generateId();
      const summaryMarkerMsg: ChatMessage = {
        id: summaryMsgId,
        role: 'system',
        content: `【历史对话总结（${toCompress.length}条消息已压缩）】\n${summary}`,
        images: [],
        timestamp: Date.now(),
        type: 'summary',
        isCompressedSummary: true,
      };

      const firstCompressIdx = toCompress[0] ? messages.findIndex((m) => m.id === toCompress[0].id) : -1;
      let nextMessages = [...messages];
      if (firstCompressIdx >= 0) {
        nextMessages.splice(firstCompressIdx, 0, summaryMarkerMsg);
      } else {
        nextMessages = [summaryMarkerMsg, ...nextMessages];
      }
      nextMessages = nextMessages.map((m) =>
        compressedIds.has(m.id) ? { ...m, isCompressed: true } : m
      );

      // Reset the per-chat counter after a successful summarize — accumulate from zero again.
      autoSummarizeCounterRef.current[c.id] = 0;

      updateChat({
        messages: nextMessages,
        summaries: updatedSummaries,
      } as any);
    } catch (error) {
      console.error('总结失败:', error);
    } finally {
      if (c) autoSummarizeRunningRef.current[c.id] = false;
    }
  };

  const handleSelectProvider = (type: AIType, provider: AIProvider) => {
    updateChatSettings({ [`${type}ProviderId`]: provider.id } as any);
  };

  const handleMessageLongPress = (message: ChatMessage) => {
    setActionSheetMessage(message);
    setShowActionSheet(true);
  };

  const getMessageActions = (message: ChatMessage | null): MessageAction[] => {
    if (!message) return [];
    const actions: MessageAction[] = [];

    if (message.content) {
      actions.push({
        icon: <IconCopy size={20} color={theme.subTextColor} />,
        label: '复制文本',
        onPress: () => {
          Clipboard.setStringAsync(message.content);
          setActionMenuTitle('已复制');
          setActionMenuSubtitle('文本已复制到剪贴板');
          setActionMenuItems([{ label: '确定', onPress: () => {} }]);
          setShowActionMenuState(true);
        },
      });
    }

    actions.push({
      icon: <IconEdit size={20} color={theme.subTextColor} />,
      label: '编辑',
      onPress: () => {
        setEditingMessage(message);
        setEditText(message.content);
        setEditRole(message.role === 'assistant' ? 'assistant' : 'user');
        setShowActionSheet(false);
      },
    });

    if (message.role === 'assistant' && message.versions && message.versions.length > 1) {
      actions.push({
        icon: <IconRefresh size={20} color={theme.subTextColor} />,
        label: `切换版本 (${message.versions.length})`,
        onPress: () => {
          handleSwitchVersion(message);
          setShowActionSheet(false);
        },
      });
    }

    actions.push({
      icon: <IconStar size={20} color={message.isFavorite ? theme.accentColor : theme.subTextColor} />,
      label: message.isFavorite ? '取消收藏' : '收藏',
      onPress: () => toggleMessageFavorite(message.id),
    });

    if (message.role === 'assistant') {
      actions.push({
        icon: <IconRefresh size={20} color={theme.subTextColor} />,
        label: '重新生成',
        onPress: () => handleRegenerateMessage(message),
      });
    }

    if (message.role === 'assistant' && message.content) {
      actions.push({
        icon: <IconSummarize size={20} color={theme.subTextColor} />,
        label: '总结这段话',
        onPress: () => handleSummarizeMessage(message),
      });
    }

    if (message.role === 'user' && message.images && message.images.length > 0) {
      const visionProvider = getProvider('vision');
      if (visionProvider) {
        actions.push({
          icon: <IconEye size={20} color={theme.subTextColor} />,
          label: '识别图片内容',
          onPress: () => handleVisionAnalyze(message),
        });
      }
    }

    actions.push({
      icon: <IconTrash size={20} color='#ff4444' />,
      label: '删除',
      destructive: true,
      onPress: () => handleDeleteMessage(message.id),
    });

    return actions;
  };

  const toggleMessageFavorite = (messageId: string) => {
    const c = chatRef.current;
    if (!c) return;
    const newMessages = c.messages.map((m) =>
      m.id === messageId ? { ...m, isFavorite: !m.isFavorite } : m
    );
    updateChat({ messages: newMessages });
  };

  const handleRegenerateMessage = (message: ChatMessage) => {
    const c = chatRef.current;
    if (!c) return;
    const messageIndex = c.messages.findIndex((m) => m.id === message.id);
    if (messageIndex <= 0) return;

    const userMessage = c.messages[messageIndex - 1];
    if (userMessage.role !== 'user') return;

    const currentAiMessage = c.messages[messageIndex];
    const existingVersions = currentAiMessage.versions || [];
    const newVersion: MessageVersion = {
      id: generateId(),
      content: currentAiMessage.content,
      images: currentAiMessage.images,
      timestamp: currentAiMessage.timestamp,
      providerId: currentAiMessage.providerId,
    };

    // 不再手动删除 AI 消息，由 handleSend 通过 regenerateFromId 自动处理
    // 这样可以避免重复创建用户消息的 bug
    setTimeout(() => {
      handleSend(userMessage.content, userMessage.images || [], 'text', message.id, [...existingVersions, newVersion]);
    }, 100);
  };

  const handleSwitchReply = useCallback((message: ChatMessage) => {
    const c = chatRef.current;
    if (!c || isLoading) return;
    const messageIndex = c.messages.findIndex((m) => m.id === message.id);
    if (messageIndex <= 0) return;

    const userMessage = c.messages[messageIndex - 1];
    if (userMessage.role !== 'user') return;

    const currentAiMessage = c.messages[messageIndex];
    const existingVersions = currentAiMessage.versions || [];
    const newVersion: MessageVersion = {
      id: generateId(),
      content: currentAiMessage.content,
      images: currentAiMessage.images,
      timestamp: currentAiMessage.timestamp,
      providerId: currentAiMessage.providerId,
    };

    const switchPrompt = `${userMessage.content} (换个回答方式)`;

    setTimeout(() => {
      handleSend(switchPrompt, userMessage.images || [], 'text', message.id, [...existingVersions, newVersion]);
    }, 100);
  }, [isLoading]);

  const handlePrevVersion = useCallback((message: ChatMessage) => {
    const c = chatRef.current;
    if (!c || isLoading) return;
    if (!message.versions || message.versions.length <= 1) return;
    const currentIdx = message.currentVersionIndex ?? 0;
    if (currentIdx <= 0) return;
    const newIdx = currentIdx - 1;
    const selectedVersion = message.versions[newIdx];
    const newMessages = c.messages.map((m) => {
      if (m.id === message.id) {
        return {
          ...m,
          content: selectedVersion.content,
          images: selectedVersion.images,
          providerId: selectedVersion.providerId,
          currentVersionIndex: newIdx,
        };
      }
      return m;
    });
    updateChat({ messages: newMessages });
  }, [isLoading]);

  const handleNextVersion = useCallback((message: ChatMessage) => {
    const c = chatRef.current;
    if (!c || isLoading) return;
    if (!message.versions || message.versions.length <= 1) return;
    const currentIdx = message.currentVersionIndex ?? 0;
    if (currentIdx >= message.versions.length - 1) return;
    const newIdx = currentIdx + 1;
    const selectedVersion = message.versions[newIdx];
    const newMessages = c.messages.map((m) => {
      if (m.id === message.id) {
        return {
          ...m,
          content: selectedVersion.content,
          images: selectedVersion.images,
          providerId: selectedVersion.providerId,
          currentVersionIndex: newIdx,
        };
      }
      return m;
    });
    updateChat({ messages: newMessages });
  }, [isLoading]);

  const handleContinue = async () => {
    const c = chatRef.current;
    if (!c || isLoading) return;
    const textProvider = getProvider('text');
    if (!textProvider) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('请先在设置中添加并选择对话AI提供商');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    const lastMsg = c.messages[c.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    setIsLoading(true);
    const aiMessageId = generateId();
    const startTime = Date.now();
    const aiMessage: ChatMessage = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      images: [],
      timestamp: Date.now(),
      providerId: textProvider.id,
    };

    let currentMessages = [...c.messages, aiMessage];
    updateChat({ messages: currentMessages });

    try {
      const contextMessages = getMessagesWithContext();
      const streamOutput = c.settings?.streamOutput ?? true;
      thinkingByMessageRef.current[aiMessageId] = '';
      thinkingLastUpdateRef.current[aiMessageId] = 0;
      if (streamOutput) {
        setStreamingMessageId(aiMessageId);
        let fullContent = '';

        await aiService.chat(
          textProvider,
          contextMessages,
          buildSystemPrompt(),
          (chunk) => {
            fullContent += chunk;
            updateStreamingMessage(aiMessageId, {
              content: fullContent,
              thinkingContent: thinkingByMessageRef.current[aiMessageId],
            });
          },
          {
            onThinkingChunk: (thinking) => {
              thinkingByMessageRef.current[aiMessageId] = (thinkingByMessageRef.current[aiMessageId] || '') + thinking;
              const now = Date.now();
              if (now - (thinkingLastUpdateRef.current[aiMessageId] || 0) >= 140) {
                thinkingLastUpdateRef.current[aiMessageId] = now;
                updateStreamingMessage(aiMessageId, { thinkingContent: thinkingByMessageRef.current[aiMessageId] });
              }
            },
          }
        );

        // 收尾时保存 thinkingContent，且 content 为空时用 reasoning 兜底
        currentMessages = currentMessages.map((m) =>
          m.id === aiMessageId
            ? {
                ...m,
                content: fullContent || thinkingByMessageRef.current[aiMessageId] || m.content,
                thinkingContent: thinkingByMessageRef.current[aiMessageId] || m.thinkingContent,
              }
            : m
        );
        updateChat({ messages: currentMessages });

        const finalContent = fullContent;
        const triggeredImages = checkTriggerImages(finalContent);
        if (triggeredImages.length > 0) {
          currentMessages = currentMessages.map((m) =>
            m.id === aiMessageId ? { ...m, images: triggeredImages.map((i) => i.uri) } : m
          );
          updateChat({ messages: currentMessages });
        }

        if (hasStatusBar) {
          const varUpdates = statusVarService.parseVarCommands(finalContent);
          if (varUpdates.length > 0) {
            updateStatusVars(varUpdates);
          }
          const cleanContent = statusVarService.stripStatusCommands(finalContent);
          if (cleanContent !== finalContent) {
            currentMessages = currentMessages.map((m) =>
              m.id === aiMessageId ? { ...m, content: cleanContent } : m
            );
            updateChat({ messages: currentMessages });
          }
        }

        if (statusVarService.hasAIJSCode(finalContent)) {
          const codes = statusVarService.extractAIJSCode(finalContent);
          if (codes.length > 0) {
            const combinedCode = codes.join('\n');
            currentMessages = currentMessages.map((m) =>
              m.id === aiMessageId ? { ...m, aijsCode: combinedCode, content: statusVarService.stripAIJSCode(m.content) } : m
            );
            updateChat({ messages: currentMessages });
          }
        }

        const autoSummarize = c.settings?.autoSummarize ?? false;
        const autoSummarizeThreshold = Math.max(2, c.settings?.autoSummarizeThreshold ?? 10);
        if (autoSummarize) {
          const aliveNonSys = currentMessages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && !(m as any).isCompressed);
          const cur = (autoSummarizeCounterRef.current[c.id] ?? 0) + 1;
          autoSummarizeCounterRef.current[c.id] = cur;
          if (aliveNonSys.length >= autoSummarizeThreshold && cur >= autoSummarizeThreshold) {
            void handleAutoSummarize(currentMessages);
          }
        }
      }
    } catch (error: any) {
      const errorMsg = formatErrorMessage(error, '生成失败');
      currentMessages = currentMessages.map((m) =>
        m.id === aiMessageId ? { ...m, content: errorMsg } : m
      );
      updateChat({ messages: currentMessages });
    } finally {
      setLastElapsed((Date.now() - startTime) / 1000);
      setIsLoading(false);
      setStreamingMessageId(null);
    }
  };

  const handleExportChat = async () => {
    const c = chatRef.current;
    if (!c) return;
    try {
      const attachedWorldBooks = worldBooks.filter(wb => c.worldBookIds?.includes(wb.id));
      const exportData = {
        title: c.title,
        messages: c.messages.map((m) => ({
          role: m.role,
          content: m.content,
          images: m.images,
          timestamp: m.timestamp,
          providerId: m.providerId,
        })),
        settings: c.settings,
        worldBookIds: c.worldBookIds,
        attachedWorldBooks: attachedWorldBooks,
        conversationType: c.conversationType,
        parentId: c.parentId,
        isPinned: c.isPinned,
        characterId: c.characterId,
        wallpaper: c.wallpaper,
        exportedAt: Date.now(),
        version: '1.1',
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const safeTitle = c.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
      const dir = await getExportDir();
      const fileUri = `${dir}chat_${safeTitle}_${Date.now()}.json`;

      await FileSystem.writeAsStringAsync(fileUri, jsonStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `导出对话：${c.title}`,
          UTI: 'public.json',
        });
      } else {
        setActionMenuTitle('导出成功');
        setActionMenuSubtitle(`对话已保存到：${fileUri}`);
        setActionMenuItems([{ label: '确定', onPress: () => {} }]);
        setShowActionMenuState(true);
      }
    } catch (error) {
      setActionMenuTitle('导出失败');
      setActionMenuSubtitle(formatErrorMessage(error, '导出对话时出错'));
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  const handleImportChat = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) return;

      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const data = JSON.parse(content);
      if (!data.messages || !Array.isArray(data.messages)) {
        setActionMenuTitle('导入失败');
        setActionMenuSubtitle('文件格式不正确，缺少 messages 字段');
        setActionMenuItems([{ label: '确定', onPress: () => {} }]);
        setShowActionMenuState(true);
        return;
      }

      const importedMessages: ChatMessage[] = data.messages.map((m: any) => ({
        id: generateId(),
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content || '',
        images: m.images || [],
        timestamp: m.timestamp || Date.now(),
        providerId: m.providerId,
      }));

      const importedWorldBooks: WorldBook[] = data.attachedWorldBooks || [];
      let newWorldBookIds = [...(data.worldBookIds || [])];
      let importedWbCount = 0;

      if (importedWorldBooks.length > 0) {
        const updatedWorldBooks = [...worldBooks];
        
        for (const wb of importedWorldBooks) {
          const existingIndex = updatedWorldBooks.findIndex(w => w.name === wb.name);
          if (existingIndex >= 0) {
            const newId = generateId();
            const newWb = { ...wb, id: newId, name: wb.name + ' (导入)' };
            updatedWorldBooks.push(newWb);
            newWorldBookIds = newWorldBookIds.map(id => id === wb.id ? newId : id);
            importedWbCount++;
          } else {
            const newId = generateId();
            const newWb = { ...wb, id: newId };
            updatedWorldBooks.push(newWb);
            newWorldBookIds = newWorldBookIds.map(id => id === wb.id ? newId : id);
            importedWbCount++;
          }
        }
        
        setWorldBooks(updatedWorldBooks);
      }

      const newChat: Chat = {
        id: generateId(),
        title: data.title || '导入的对话',
        messages: importedMessages,
        settings: mergeChatSettings(data.settings),
        worldBookIds: newWorldBookIds,
        wallpaper: data.wallpaper || chat?.wallpaper,
        conversationType: data.conversationType,
        parentId: data.parentId,
        isPinned: data.isPinned || false,
        characterId: data.characterId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setChats([newChat, ...chats]);
      
      const msg = importedWbCount > 0 
        ? `已导入对话：${newChat.title}\n同时导入了 ${importedWbCount} 本世界书`
        : `已导入对话：${newChat.title}`;
      setActionMenuTitle('导入成功');
      setActionMenuSubtitle(msg);
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } catch (error) {
      setActionMenuTitle('导入失败');
      setActionMenuSubtitle(formatErrorMessage(error, '导入对话时出错'));
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  const handleShareChat = async () => {
    const c = chatRef.current;
    if (!c) return;
    try {
      const textContent = c.messages
        .map((m) => {
          const role = m.role === 'user' ? '我' : m.role === 'assistant' ? 'AI' : '系统';
          const time = new Date(m.timestamp).toLocaleString();
          return `[${role}] ${time}\n${m.content}`;
        })
        .join('\n\n');

      const shareText = `【${c.title}】\n\n${textContent}`;
      Clipboard.setStringAsync(shareText);
      setActionMenuTitle('已复制');
      setActionMenuSubtitle('对话内容已复制到剪贴板，可以粘贴到其他应用分享');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } catch (error) {
      setActionMenuTitle('分享失败');
      setActionMenuSubtitle(formatErrorMessage(error, '分享对话时出错'));
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  const handleExportChatImage = async () => {
    const c = chatRef.current;
    if (!c) return;
    setShowMoreMenu(false);

    setActionMenuTitle('导出聊天记录');
    setActionMenuSubtitle('选择导出方式：');
    setActionMenuItems([
      {
        label: '分享HTML文件',
        onPress: async () => {
          try {
            const html = generateChatHTML(c);
            const dir = await getExportDir();
            const safeTitle = c.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
            const htmlFile = `${dir}chat_${safeTitle}_${Date.now()}.html`;
            await FileSystem.writeAsStringAsync(htmlFile, html, { encoding: FileSystem.EncodingType.UTF8 });
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(htmlFile, {
                mimeType: 'text/html',
                dialogTitle: `分享聊天记录：${c.title}`,
                UTI: 'public.html',
              });
            } else {
              setActionMenuTitle('导出成功');
              setActionMenuSubtitle(`聊天记录已保存到：${htmlFile}`);
              setActionMenuItems([{ label: '确定', onPress: () => {} }]);
              setShowActionMenuState(true);
            }
          } catch (err: any) {
            setActionMenuTitle('导出失败');
            setActionMenuSubtitle(err.message || '未知错误');
            setActionMenuItems([{ label: '确定', onPress: () => {} }]);
            setShowActionMenuState(true);
          }
        },
      },
      {
        label: '分享Markdown文件',
        onPress: async () => {
          try {
            const md = exportService.exportChatToMarkdown(c);
            const dir = await getExportDir();
            const safeTitle = c.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
            const mdFile = `${dir}chat_${safeTitle}_${Date.now()}.md`;
            await FileSystem.writeAsStringAsync(mdFile, md, { encoding: FileSystem.EncodingType.UTF8 });
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(mdFile);
            } else {
              setActionMenuTitle('导出成功');
              setActionMenuSubtitle(`已保存到：${mdFile}`);
              setActionMenuItems([{ label: '确定', onPress: () => {} }]);
              setShowActionMenuState(true);
            }
          } catch (err: any) {
            setActionMenuTitle('导出失败');
            setActionMenuSubtitle(err.message || '未知错误');
            setActionMenuItems([{ label: '确定', onPress: () => {} }]);
            setShowActionMenuState(true);
          }
        },
      },
      { label: '取消', onPress: () => {} },
    ]);
    setShowActionMenuState(true);
  };

  // 导出当前角色卡片为PNG
  const handleExportCharacterCard = async () => {
    const c = chatRef.current;
    if (!c) return;
    setShowMoreMenu(false);

    const character =
    (c.characterId && characters?.find((ch) => ch && ch.id === c.characterId)) || null;

    if (!character) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('当前对话没有关联角色卡片');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    setActionMenuTitle('导出角色卡片');
    setActionMenuSubtitle('选择导出格式：');
    setActionMenuItems([
      {
        label: '导出为PNG图片（与TavernAI互通）',
        onPress: async () => {
          try {
            const PLACEHOLDER_PNG =
              'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABGdBTUEAALGPC/xhBQAAAAlwSFlz' +
              'AAAOwgAADsIBFShKgAAAABl0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC4xNkNpr0UAAAAWSURB' +
              'VHhe7cEBAQAAAIIg/69uSEABAQEBAQEBAQEBIF1Wi2EBCcVwAAAAAElFTkSuQmCC';

            let pngBase64 = PLACEHOLDER_PNG;
            if (character.avatar) {
              try {
                const avatarInfo = await FileSystem.getInfoAsync(character.avatar);
                if (avatarInfo.exists) {
                  pngBase64 = await FileSystem.readAsStringAsync(character.avatar, {
                    encoding: FileSystem.EncodingType.Base64,
                  });
                }
              } catch {
                // 用占位图
              }
            }

            const cardPNG = pngCardService.embedCardIntoPNG(pngBase64, character);
            const dir = await getExportDir();
            const safeName = character.name.replace(/[^\w\u4e00-\u9fa5]/g, '_').slice(0, 30);
            const fileUri = `${dir}${safeName}_${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(fileUri, cardPNG, {
              encoding: FileSystem.EncodingType.Base64,
            });

            setActionMenuTitle('导出成功');
            setActionMenuSubtitle('角色卡片PNG已生成');
            setActionMenuItems([
              {
                label: '保存到相册',
                onPress: async () => {
                  try {
                    const permission = await MediaLibrary.requestPermissionsAsync();
                    if (!permission.granted) {
                      setActionMenuTitle('权限不足');
                      setActionMenuSubtitle('需要相册权限才能保存图片');
                      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
                      return;
                    }
                    await MediaLibrary.saveToLibraryAsync(fileUri);
                    setActionMenuTitle('保存成功');
                    setActionMenuSubtitle('角色卡片已保存到相册');
                    setActionMenuItems([{ label: '确定', onPress: () => {} }]);
                  } catch (err: any) {
                    setActionMenuTitle('保存失败');
                    setActionMenuSubtitle(err.message || '未知错误');
                    setActionMenuItems([{ label: '确定', onPress: () => {} }]);
                  }
                },
              },
              {
                label: '分享',
                onPress: async () => {
                  if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri);
                  }
                  setShowActionMenuState(false);
                },
              },
              { label: '关闭', onPress: () => {} },
            ]);
            setShowActionMenuState(true);
          } catch (error: any) {
            setActionMenuTitle('导出失败');
            setActionMenuSubtitle(error.message || '未知错误');
            setActionMenuItems([{ label: '确定', onPress: () => {} }]);
            setShowActionMenuState(true);
          }
        },
      },
      { label: '取消', onPress: () => {} },
    ]);
    setShowActionMenuState(true);
  };

  const generateChatHTML = (chat: Chat): string => {
    const bgColor = theme.backgroundColor;
    const textColor = theme.textColor;
    const subTextColor = theme.subTextColor;
    const userBubbleColor = theme.accentColor;
    const userTextColor = theme.buttonTextColor;
    const aiBubbleColor = theme.secondaryColor;

    const messagesHTML = chat.messages.map((m) => {
      const isUser = m.role === 'user';
      const roleName = isUser ? '我' : m.role === 'assistant' ? 'AI' : '系统';
      const time = new Date(m.timestamp).toLocaleString();
      const content = m.content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      if (isUser) {
        return `
          <div style="display:flex;justify-content:flex-end;margin:8px 0;">
            <div style="max-width:75%;background:${userBubbleColor};color:${userTextColor};padding:10px 14px;border-radius:16px 16px 4px 16px;word-break:break-word;">
              <div style="font-size:14px;line-height:1.5;">${content}</div>
              <div style="font-size:10px;opacity:0.7;text-align:right;margin-top:4px;">${time}</div>
            </div>
          </div>
        `;
      } else {
        return `
          <div style="display:flex;justify-content:flex-start;margin:8px 0;">
            <div style="max-width:75%;background:${aiBubbleColor};color:${textColor};padding:10px 14px;border-radius:16px 16px 16px 4px;word-break:break-word;">
              <div style="font-size:11px;color:${subTextColor};margin-bottom:4px;">${roleName}</div>
              <div style="font-size:14px;line-height:1.5;">${content}</div>
              <div style="font-size:10px;color:${subTextColor};text-align:left;margin-top:4px;">${time}</div>
            </div>
          </div>
        `;
      }
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; padding: 0; background: ${bgColor}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { padding: 16px; background: ${bgColor}; }
          .header { text-align: center; padding: 12px 0 20px; border-bottom: 1px solid ${theme.borderColor}; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 600; color: ${textColor}; }
          .subtitle { font-size: 12px; color: ${subTextColor}; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="title">${chat.title}</div>
            <div class="subtitle">${chat.messages.length} 条消息 · ${new Date(chat.updatedAt).toLocaleString()}</div>
          </div>
          ${messagesHTML}
        </div>
      </body>
      </html>
    `;
  };

  const handleSummarizeMessage = async (message: ChatMessage) => {
    const summaryProvider = getProvider('summary') || getProvider('text');
    if (!summaryProvider) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('请先配置总结AI或对话AI');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    setIsLoading(true);
    try {
      const summary = await aiService.summarize(
        summaryProvider,
        [message],
        '请用一句话总结这段话的内容。'
      );
      setActionMenuTitle('总结结果');
      setActionMenuSubtitle((summary && summary.content) ? summary.content : "");
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } catch (error: any) {
      setActionMenuTitle('总结失败');
      setActionMenuSubtitle(error.message || '未知错误');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVisionAnalyze = async (message: ChatMessage) => {
    const visionProvider = getProvider('vision');
    if (!visionProvider || !message.images || message.images.length === 0) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await aiService.visionAnalyze(
        visionProvider,
        message.images[0],
        '请描述这张图片的内容'
      );

      const aiMessageId = generateId();
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        role: 'assistant',
        content: result,
        images: [],
        timestamp: Date.now(),
        providerId: visionProvider.id,
      };

      const newMessages = [...chat!.messages, aiMessage];
      updateChat({ messages: newMessages });
    } catch (error: any) {
      setActionMenuTitle('识图失败');
      setActionMenuSubtitle(error.message || '未知错误');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    const c = chatRef.current;
    if (!c) return;
    updateChat({
      messages: c.messages.filter((m) => m.id !== messageId),
    });
  };

  const handleSwitchVersion = (message: ChatMessage) => {
    const c = chatRef.current;
    if (!c || !message.versions || message.versions.length <= 1) return;

    const currentIdx = message.currentVersionIndex ?? 0;
    const versions = message.versions;
    const options = versions.map((v, idx) => ({
      label: `版本 ${idx + 1}`,
      description: v.content.substring(0, 30) + (v.content.length > 30 ? '...' : ''),
      value: idx,
    }));

    setActionMenuTitle('选择版本');
    setActionMenuSubtitle(`当前版本: ${currentIdx + 1}/${versions.length}`);
    setActionMenuItems([
      ...options.map((opt) => ({
        label: opt.label,
        onPress: () => {
          if (opt.value !== currentIdx) {
            const cc = chatRef.current;
            if (!cc) return;
            const newMessages = cc.messages.map((m) => {
              if (m.id === message.id) {
                const selectedVersion = versions[opt.value];
                return {
                  ...m,
                  content: selectedVersion.content,
                  images: selectedVersion.images,
                  providerId: selectedVersion.providerId,
                  currentVersionIndex: opt.value,
                };
              }
              return m;
            });
            updateChat({ messages: newMessages });
          }
        },
      })),
    ]);
    setShowActionMenuState(true);
  };

  const handleSaveEdit = (andResend: boolean = false) => {
    const c = chatRef.current;
    if (!c || !editingMessage) return;

    const msgId = editingMessage.id;
    // 允许空内容保存（方便用户清空后继续编辑或删除）；仅重发时需要非空
    const finalText = editText ?? '';
    const trimmedText = finalText.trim();
    if (andResend && !trimmedText) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('请输入消息内容');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    // 母对话和手动对话不支持重新发送
    if (andResend && (c.conversationType === 'parent' || c.conversationType === 'manual')) {
      setActionMenuTitle('提示');
      setActionMenuSubtitle('母对话和手动对话不支持重新发送，仅支持保存编辑');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }

    // 仅保存：更新消息内容，不重新发送
    if (!andResend) {
      const newMessages = c.messages.map((m) => {
        if (m.id === msgId) {
          return { ...m, content: finalText, role: editRole, timestamp: Date.now() };
        }
        return m;
      });
      updateChat({ messages: newMessages });
      setEditingMessage(null);
      setEditText('');
      return;
    }

    // 保存并重新发送
    // 收集 AI 消息的版本历史（仅对 AI 消息分支有效）
    // 版本应保存编辑后的内容，因为该内容即将被新生成的回复替换
    let existingVersions: MessageVersion[] = [];
    if (editRole === 'assistant') {
      const aiMsg = c.messages.find((m) => m.id === msgId);
      if (aiMsg) {
        existingVersions = aiMsg.versions || [];
        const newVersion: MessageVersion = {
          id: generateId(),
          content: finalText, // 使用编辑后的内容作为版本
          images: aiMsg.images,
          timestamp: Date.now(),
          providerId: aiMsg.providerId,
        };
        existingVersions = [...existingVersions, newVersion];
      }
    }

    // 先更新消息内容到 edited text
    const editedMessages = c.messages.map((m) => {
      if (m.id === msgId) {
        return { ...m, content: finalText, role: editRole, timestamp: Date.now() };
      }
      return m;
    });
    updateChat({ messages: editedMessages });

    setEditingMessage(null);
    setEditText('');

    // 调用 handleSend 并传入 regenerateFromId，让其复用已有用户消息，避免重复
    setTimeout(() => {
      const currentChat = chatRef.current;
      if (!currentChat) return;
      const targetMsg = currentChat.messages.find((m) => m.id === msgId);
      if (!targetMsg) return;
      // 用户消息：直接以其 id 作为 regenerateFromId，handleSend 会保留到该消息并重新生成
      // AI 消息：以其 id 作为 regenerateFromId，handleSend 会找到前一条用户消息并重新生成
      let contentToSend: string;
      let imagesToSend: string[];
      if (editRole === 'user') {
        contentToSend = targetMsg.content;
        imagesToSend = targetMsg.images || [];
      } else {
        // AI 消息：取前一条用户消息的内容和图片
        const aiIdx = currentChat.messages.findIndex((m) => m.id === msgId);
        const userMsg = aiIdx > 0 ? currentChat.messages[aiIdx - 1] : null;
        contentToSend = userMsg?.content || targetMsg.content;
        imagesToSend = userMsg?.images || [];
      }
      handleSend(contentToSend, imagesToSend, 'text', msgId, editRole === 'assistant' ? existingVersions : undefined);
    }, 150);
  };

  const handleCopyChat = () => {
    const c = chatRef.current;
    if (!c) return;
    const newChat = {
      ...c,
      id: generateId(),
      title: `${c.title} (副本)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: c.messages.map((m) => ({ ...m, id: generateId(), timestamp: Date.now() })),
    };
    setChats([newChat, ...chats]);
    setShowMoreMenu(false);
    setActionMenuTitle('复制成功');
    setActionMenuSubtitle('已创建对话副本');
    setActionMenuItems([{ label: '确定', onPress: () => {} }]);
    setShowActionMenuState(true);
  };

  const handleSetUserAvatar = async () => {
    const uri = await imageUtils.pickImageFromGallery();
    if (!uri) return;
    const savedUri = await imageUtils.saveImageToAppDir(uri, 'avatars');
    updateChat({ userAvatar: savedUri });
    setShowMoreMenu(false);
  };

  const handleSetAssistantAvatar = async () => {
    const uri = await imageUtils.pickImageFromGallery();
    if (!uri) return;
    const savedUri = await imageUtils.saveImageToAppDir(uri, 'avatars');
    updateChat({ assistantAvatar: savedUri });
    setShowMoreMenu(false);
  };

  const handleClearUserAvatar = () => {
    updateChat({ userAvatar: undefined });
    setShowMoreMenu(false);
  };

  const handleClearAssistantAvatar = () => {
    updateChat({ assistantAvatar: undefined });
    setShowMoreMenu(false);
  };

  const openUserAvatarMenu = () => {
    setShowMoreMenu(false);
    const c = chatRef.current;
    const hasAvatar = c?.userAvatar;
    setActionMenuTitle('设置用户头像');
    setActionMenuSubtitle(hasAvatar ? '当前已设置头像' : '当前使用默认头像');
    setActionMenuItems([
      {
        label: '从相册选择',
        onPress: () => {
          handleSetUserAvatar();
        },
      },
      ...(hasAvatar ? [
        {
          label: '清除头像',
          onPress: () => {
            handleClearUserAvatar();
          },
        },
      ] : []),
      { label: '取消', onPress: () => {} },
    ]);
    setShowActionMenuState(true);
  };

  const openAssistantAvatarMenu = () => {
    setShowMoreMenu(false);
    const c = chatRef.current;
    const hasAvatar = c?.assistantAvatar;
    setActionMenuTitle('设置AI头像');
    setActionMenuSubtitle(hasAvatar ? '当前已设置头像' : '当前使用默认头像');
    setActionMenuItems([
      {
        label: '从相册选择',
        onPress: () => {
          handleSetAssistantAvatar();
        },
      },
      ...(hasAvatar ? [
        {
          label: '清除头像',
          onPress: () => {
            handleClearAssistantAvatar();
          },
        },
      ] : []),
      { label: '取消', onPress: () => {} },
    ]);
    setShowActionMenuState(true);
  };

  const handleChildAction = (child: Chat) => {
    setActionMenuTitle('子对话操作');
    setActionMenuSubtitle(child.title);
    setActionMenuItems([
      {
        label: '进入对话',
        onPress: () => {
          if (onSelectChat) onSelectChat(child.id);
        },
      },
      {
        label: '独立为对话',
        onPress: () => {
          setChats(
            chats.map((c) =>
              c.id === child.id
                ? { ...c, conversationType: undefined, parentId: undefined, updatedAt: Date.now() }
                : c
            )
          );
          setActionMenuTitle('操作成功');
          setActionMenuSubtitle('子对话已独立为普通对话');
          setActionMenuItems([{ label: '确定', onPress: () => {} }]);
          setShowActionMenuState(true);
        },
      },
      {
        label: '重命名',
        onPress: () => {
          Alert.prompt
            ? Alert.prompt(
                '重命名子对话',
                '',
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '确定',
                    onPress: (text?: string) => {
                      if (text?.trim()) {
                        setChats(
                          chats.map((c) =>
                            c.id === child.id ? { ...c, title: text.trim(), updatedAt: Date.now() } : c
                          )
                        );
                      }
                    },
                  },
                ],
                'plain-text',
                child.title
              )
            : null;
        },
      },
      {
        label: '删除',
        onPress: () => {
          setActionMenuTitle('删除子对话');
          setActionMenuSubtitle('确定要删除这个子对话吗？此操作不可撤销。');
          setActionMenuItems([
            {
              label: '删除',
              onPress: () => {
                setChats(chats.filter((c) => c.id !== child.id));
              },
            },
            { label: '取消', onPress: () => {} },
          ]);
          setShowActionMenuState(true);
        },
      },
      { label: '取消', onPress: () => {} },
    ]);
    setShowActionMenuState(true);
  };

  // ========== 对话操作函数（与 ChatHistoryScreen 对齐） ==========

  // 判断是否是说明书/手动对话（不允许删除）
  const isManualChat = chat?.conversationType === 'manual' || chat?.id === 'manual_chat_system';

  // 编辑对话（标题）
  const openChatEdit = () => {
    setShowMoreMenu(false);
    if (Alert && (Alert as any).prompt) {
      (Alert as any).prompt(
        '编辑对话',
        '修改对话标题：',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '保存',
            onPress: (text?: string) => {
              if (text && text.trim()) {
                updateChat({ title: text.trim() });
              }
            },
          },
        ],
        'plain-text',
        chat?.title || ''
      );
    } else {
      setChatEditTitle(chat?.title || '');
      setShowChatEditPrompt(true);
    }
  };

  // 设置封面
  const handleSetCover = async () => {
    try {
      setShowMoreMenu(false);
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'chat_cover');
      updateChat({ coverImage: savedUri });
      setActionMenuTitle('设置成功');
      setActionMenuSubtitle('封面图片已更新');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } catch (error: any) {
      setActionMenuTitle('设置失败');
      setActionMenuSubtitle(error.message || '未知错误');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  // 设置对话背景（支持静态图 / GIF / 视频）
  const handleSetWallpaper = async () => {
    try {
      setShowMoreMenu(false);
      // 用素材库导入：它按类型分流，图片/GIF/视频都收，并把名字登记下来供自定义界面引用
      const imported = await mediaLibraryService.importFromGallery(false).catch(() => []);
      const asset = imported[0];
      if (asset) {
        updateChat({ wallpaper: asset.uri });
        setActionMenuTitle('设置成功');
        setActionMenuSubtitle(
          asset.kind === 'video' ? '视频背景已设置（默认静音）' : '背景已更新',
        );
        setActionMenuItems([{ label: '确定', onPress: () => {} }]);
        setShowActionMenuState(true);
        return;
      }
      // 素材库路线取消时，退回原来的图片选择
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'chat_wallpaper');
      updateChat({ wallpaper: savedUri });
      setActionMenuTitle('设置成功');
      setActionMenuSubtitle('背景图片已更新');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } catch (error: any) {
      setActionMenuTitle('设置失败');
      setActionMenuSubtitle(error.message || '未知错误');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  // 子对话独立
  const handleIndependentChild = () => {
    if (!chat || chat.conversationType !== 'child') return;
    setChats(
      chats.map((c) =>
        c.id === chat.id
          ? { ...c, conversationType: undefined, parentId: undefined, updatedAt: Date.now() }
          : c
      )
    );
    setShowMoreMenu(false);
    setActionMenuTitle('操作成功');
    setActionMenuSubtitle('子对话已独立为普通对话');
    setActionMenuItems([{ label: '确定', onPress: () => {} }]);
    setShowActionMenuState(true);
  };

  // 切换母/子对话类型
  const handleToggleConversationType = () => {
    if (!chat) return;
    const currentType = chat.conversationType;
    setShowMoreMenu(false);

    if (currentType === 'parent') {
      // 取消母对话：同时将子对话一并解放
      const childIds = chats
        .filter((c) => c.parentId === chat.id && c.conversationType === 'child')
        .map((c) => c.id);
      const updatedChats = chats.map((c) => {
        if (c.id === chat.id) {
          return { ...c, conversationType: undefined, updatedAt: Date.now() };
        }
        if (childIds.includes(c.id)) {
          return { ...c, conversationType: undefined, parentId: undefined, updatedAt: Date.now() };
        }
        return c;
      });
      setChats(updatedChats);
      setActionMenuTitle('设置成功');
      setActionMenuSubtitle(
        childIds.length > 0
          ? `已取消母对话设置，${childIds.length} 个子对话已变为独立对话`
          : '已取消母对话设置，现在可以正常聊天'
      );
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } else if (currentType === 'child') {
      // 取消子对话：独立
      setChats(
        chats.map((c) =>
          c.id === chat.id
            ? { ...c, conversationType: undefined, parentId: undefined, updatedAt: Date.now() }
            : c
        )
      );
      setActionMenuTitle('设置成功');
      setActionMenuSubtitle('已取消子对话设置，对话已独立');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } else {
      // 普通 -> 设为母对话，原历史保留在一个新的子对话里
      const childChat = {
        ...chat,
        id: generateId(),
        conversationType: 'child' as const,
        parentId: chat.id,
        title: chat.title || '子对话 1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [...chat.messages],
      };
      const parentChat = {
        ...chat,
        conversationType: 'parent' as const,
        messages: [],
        updatedAt: Date.now(),
      };
      const newChats = chats.map((c) => (c.id === chat.id ? parentChat : c));
      const idx = newChats.findIndex((c) => c.id === chat.id);
      newChats.splice(idx + 1, 0, childChat);
      setChats(newChats);
      setActionMenuTitle('设置成功');
      setActionMenuSubtitle('已设为母对话，原对话历史已转为子对话');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  // 导出 JSON
  const handleExportJSON = async () => {
    const c = chatRef.current;
    if (!c) return;
    setShowMoreMenu(false);
    try {
      const json = await exportService.exportChatToJSON(c, worldBooks);
      const dir = await getExportDir();
      const safeTitle = c.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
      const fileUri = `${dir}chat_${safeTitle}_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `导出JSON：${c.title}`,
          UTI: 'public.json',
        });
      } else {
        setActionMenuTitle('导出成功');
        setActionMenuSubtitle(`已导出到: ${fileUri}`);
        setActionMenuItems([{ label: '确定', onPress: () => {} }]);
        setShowActionMenuState(true);
      }
    } catch (error: any) {
      setActionMenuTitle('导出失败');
      setActionMenuSubtitle(error.message || '未知错误');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  // 导出 Markdown
  const handleExportMarkdown = async () => {
    const c = chatRef.current;
    if (!c) return;
    setShowMoreMenu(false);
    try {
      const md = exportService.exportChatToMarkdown(c);
      const dir = await getExportDir();
      const safeTitle = c.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
      const fileUri = `${dir}chat_${safeTitle}_${Date.now()}.md`;
      await FileSystem.writeAsStringAsync(fileUri, md);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        setActionMenuTitle('导出成功');
        setActionMenuSubtitle(`已导出到: ${fileUri}`);
        setActionMenuItems([{ label: '确定', onPress: () => {} }]);
        setShowActionMenuState(true);
      }
    } catch (error: any) {
      setActionMenuTitle('导出失败');
      setActionMenuSubtitle(error.message || '未知错误');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  // 复制为 Markdown
  const handleCopyAsMarkdown = () => {
    const c = chatRef.current;
    if (!c) return;
    try {
      const md = exportService.exportChatToMarkdown(c);
      Clipboard.setStringAsync(md);
      setShowMoreMenu(false);
      setActionMenuTitle('已复制');
      setActionMenuSubtitle('对话内容已复制为Markdown格式');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    } catch (error: any) {
      setActionMenuTitle('复制失败');
      setActionMenuSubtitle(error.message || '未知错误');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
    }
  };

  // 删除当前对话：触发 ConfirmModal，确认后切到下一个 chat
  const requestDeleteChat = () => {
    if (isManualChat) {
      setShowMoreMenu(false);
      setActionMenuTitle('提示');
      setActionMenuSubtitle('说明书对话不可删除');
      setActionMenuItems([{ label: '确定', onPress: () => {} }]);
      setShowActionMenuState(true);
      return;
    }
    setShowMoreMenu(false);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteChat = () => {
    const c = chatRef.current;
    if (!c) return;
    const remaining = chats.filter((ch) => ch.id !== c.id);
    setChats(remaining);
    setShowDeleteConfirm(false);
    if (remaining.length > 0) {
      if (onSelectChat) {
        onSelectChat(remaining[0].id);
      }
    } else {
      onNewChat();
    }
  };

  const getMoreActions = (): MessageAction[] => {
    const isFav = chat?.isFavorite || false;
    const isPinned = chat?.isPinned || false;
    const isChild = chat?.conversationType === 'child';
    const isParent = chat?.conversationType === 'parent';
    const convTypeLabel = isParent ? '切换为普通对话' : isChild ? '切换为普通对话' : '设为母对话';

    return [
      {
        icon: <IconEdit size={20} color={theme.subTextColor} />,
        label: '编辑对话',
        onPress: () => {
          openChatEdit();
        },
      },
      {
        icon: <IconStar size={20} color={isFav ? '#ffcc33' : theme.subTextColor} />,
        label: isFav ? '取消收藏' : '收藏对话',
        onPress: () => {
          if (chat) toggleChatFavorite?.(chat.id);
          setShowMoreMenu(false);
        },
      },
      {
        icon: <IconEdit size={20} color={theme.subTextColor} />,
        label: '设置封面',
        onPress: () => {
          handleSetCover();
        },
      },
      {
        icon: <IconEdit size={20} color={theme.subTextColor} />,
        label: '设置对话背景',
        onPress: () => {
          handleSetWallpaper();
        },
      },
      {
        icon: <IconEdit size={20} color={theme.subTextColor} />,
        label: '设置用户头像',
        onPress: () => {
          openUserAvatarMenu();
        },
      },
      {
        icon: <IconEdit size={20} color={theme.subTextColor} />,
        label: '设置AI头像',
        onPress: () => {
          openAssistantAvatarMenu();
        },
      },
      isChild ? {
        icon: <IconShare size={20} color={theme.subTextColor} />,
        label: '子对话独立为对话',
        onPress: () => {
          handleIndependentChild();
        },
      } : null,
      {
        icon: <IconRefresh size={20} color={theme.subTextColor} />,
        label: convTypeLabel,
        onPress: () => {
          handleToggleConversationType();
        },
      },
      {
        icon: <IconStar size={20} color={isPinned ? theme.accentColor : theme.subTextColor} />,
        label: isPinned ? '取消置顶' : '置顶对话',
        onPress: () => {
          if (chat) toggleChatPin?.(chat.id);
          setShowMoreMenu(false);
        },
      },
      {
        icon: <IconShare size={20} color={theme.subTextColor} />,
        label: '分享对话',
        onPress: () => {
          handleShareChat();
          setShowMoreMenu(false);
        },
      },
      {
        icon: <IconExport size={20} color={theme.subTextColor} />,
        label: '导出对话',
        onPress: () => {
          handleExportChat();
          setShowMoreMenu(false);
        },
      },
      {
        icon: <IconExport size={20} color={theme.subTextColor} />,
        label: '导出为长图片',
        onPress: () => {
          handleExportChatImage();
        },
      },
      {
        icon: <IconExport size={20} color={theme.subTextColor} />,
        label: '导出角色卡片',
        onPress: () => {
          handleExportCharacterCard();
        },
      },
      {
        icon: <IconExport size={20} color={theme.subTextColor} />,
        label: '导出JSON',
        onPress: () => {
          handleExportJSON();
        },
      },
      {
        icon: <IconExport size={20} color={theme.subTextColor} />,
        label: '导出Markdown',
        onPress: () => {
          handleExportMarkdown();
        },
      },
      {
        icon: <IconCopy size={20} color={theme.subTextColor} />,
        label: '复制为Markdown',
        onPress: () => {
          handleCopyAsMarkdown();
        },
      },
      {
        icon: <IconImport size={20} color={theme.subTextColor} />,
        label: '导入对话',
        onPress: () => {
          handleImportChat();
          setShowMoreMenu(false);
        },
      },
      {
        icon: <IconCopy size={20} color={theme.subTextColor} />,
        label: '复制对话',
        onPress: () => {
          handleCopyChat();
          setShowMoreMenu(false);
        },
      },
      {
        icon: <IconRefresh size={20} color={theme.subTextColor} />,
        label: '重新生成最后回复',
        destructive: false,
        onPress: () => {
          const c = chatRef.current;
          const lastMsg = c?.messages.filter((m) => m.role === 'assistant').pop();
          if (lastMsg) {
            handleRegenerateMessage(lastMsg);
          }
          setShowMoreMenu(false);
        },
      },
      !isManualChat
        ? {
            icon: <IconTrash size={20} color="#ff6b6b" />,
            label: '删除对话',
            destructive: true,
            onPress: () => {
              requestDeleteChat();
            },
          }
        : null,
    ].filter(Boolean) as MessageAction[];
  };

  const wallpaper = chat?.wallpaper || settings.theme.wallpaper;

  /**
   * 视频背景播放状态由 MainNavigator 提升管理（这样右侧菜单也能控制）。
   * 没传时退回本地默认：静音 + 播放。
   */
  const [localVideoBgState, setLocalVideoBgState] = useState<{ muted: boolean; paused: boolean }>({
    muted: true,
    paused: false,
  });
  const videoBgState = videoBgStateProp ?? localVideoBgState;
  const handleVideoBgStateChange = (s: { muted?: boolean; paused?: boolean }) => {
    const next = { ...videoBgState, ...s };
    if (onVideoBgStateChange) onVideoBgStateChange(next);
    else setLocalVideoBgState(next);
  };

  const messagesWithLoading = useMemo(() => {
    return messagesRef.current;
  }, [streamingTick, chat?.messages]);

  /**
   * AI 界面指令推导出的界面状态。
   *
   * 思路：整个对话的指令按时间顺序累积（{{ui:clear}} 清零），
   * 所以"显示出来的样子"是历史的函数，不需要额外维护一份会失同步的状态。
   * 顺便把指令从正文里剔除 —— 用户不该看到 {{ui:bg=...}} 这种东西。
   *
   * 注意：这个 memo 必须放在任何读取 uiState 的地方之前（背景、气泡配色都依赖它）。
   */
  const { messagesForDisplay, uiState } = useMemo(() => {
    const msgs = messagesWithLoading || [];
    const looksLikeDirective = (s: any) =>
      typeof s === 'string' && (s.indexOf('{{ui') !== -1 || /\[\s*ui\s*[:：]/i.test(s));
    if (!msgs.some((m: any) => looksLikeDirective(m?.content))) {
      return { messagesForDisplay: msgs, uiState: emptyUiState() };
    }
    let state: UiState = emptyUiState();
    const out = msgs.map((m: any) => {
      if (!looksLikeDirective(m?.content)) return m;
      const { content, directives } = parseUiDirectives(m.content);
      if (directives.length === 0) return m;
      state = applyDirectives(state, directives);
      return content === m.content ? m : { ...m, content };
    });
    return { messagesForDisplay: out, uiState: state };
  }, [messagesWithLoading]);

  /** 装饰层 CSS：叠加到气泡渲染里，让"加装饰"这类指令真的能看到效果 */
  const decorCss = useMemo(() => {
    if (!uiState.decor) return '';
    const hit = DECORATIONS[uiState.decor];
    return hit ? hit.css : '';
  }, [uiState.decor]);

  /**
   * 背景优先级：AI 指令指定的 > 对话壁纸 > 主题壁纸。
   * 指令里的背景名可能是素材库名字，需要异步解析成 uri。
   */
  const [directiveBgUri, setDirectiveBgUri] = useState<string | null>(null);
  const directiveBgRaw = uiState.bgm || uiState.bg || '';
  useEffect(() => {
    let cancelled = false;
    if (!directiveBgRaw) {
      setDirectiveBgUri(null);
      return;
    }
    // 纯颜色 / http(s) / file:// 直接用
    if (
      /^#([0-9a-f]{3,8})$/i.test(directiveBgRaw) ||
      /^rgba?\(/i.test(directiveBgRaw) ||
      /^https?:\/\//i.test(directiveBgRaw) ||
      /^file:\/\//i.test(directiveBgRaw)
    ) {
      setDirectiveBgUri(directiveBgRaw);
      return;
    }
    mediaLibraryService
      .resolveToUri(directiveBgRaw)
      .then((uri) => {
        if (!cancelled) setDirectiveBgUri(uri || null);
      })
      .catch(() => {
        if (!cancelled) setDirectiveBgUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [directiveBgRaw]);

  /** 最终用于渲染的背景 */
  const effectiveWallpaper = directiveBgUri || wallpaper;

  /** 自定义界面配置（未启用时为空壳，走原生界面） */
  const customIface = useMemo(
    () => normalizeCustomInterface(settings.customInterface),
    [settings.customInterface],
  );

  /**
   * 「内置 CSS」里全局作用域、且**含 HTML/JS** 的内容 → 用它开一个覆盖层渲染。
   * 只写纯 CSS 的条目走 GlobalCSSRenderer，不进这里，避免两条路打架。
   */
  const globalScopeLayerCSS = useMemo(() => {
    const entries = (chatRef.current ?? chat)?.settings?.cssEntries || [];
    return entries
      .filter((e) => e.enabled && e.scope === 'global' && !e.widget && e.css.trim())
      .map((e) => e.css)
      .filter((css) => contentNeedsRenderLayer(css))
      .join('\n')
      .trim();
  }, [chat?.settings?.cssEntries, streamingTick]);

  /** 正在流式生成的那条 AI 消息 id，供自定义界面做边收边渲染 */  const streamingAssistantId = useMemo(() => {
    if (!isLoading) return null;
    const msgs = messagesRef.current || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m: any = msgs[i];
      if (m?.role === 'assistant' && !m?.isCompressedSummary) return m.id as string;
    }
    return null;
  }, [isLoading, streamingTick, chat?.messages]);


  // ===== 自定义界面（方案B）：把用户界面的动作接回 App 现有流程 =====
  /** 重新生成最后一条 AI 回复 */
  const handleRegenerateLast = useCallback(() => {
    const msgs = messagesRef.current || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m: any = msgs[i];
      if (m?.role === 'assistant' && !m?.isCompressedSummary) {
        handleRegenerateMessage(m);
        return;
      }
    }
  }, [handleRegenerateMessage]);

  /** 内置 CSS 悬浮窗一次性插入到输入框的文本（用完即清） */
  const [pendingInputInsert, setPendingInputInsert] = useState<string | null>(null);

  /** 悬浮窗位置（按条目 id 记；拖动时更新） */
  const [widgetPos, setWidgetPos] = useState<Record<string, { x: number; y: number }>>({});

  /** 需要以「悬浮窗」形式渲染的内置 CSS 条目 */
  const widgetEntries = useMemo(
    () => ((chat?.settings?.cssEntries || []) as CSSEntry[]).filter((e) => e.enabled && !!e.widget),
    [chat?.settings?.cssEntries],
  );

  /** 悬浮窗默认位置（由 anchor 决定） */
  const defaultWidgetPos = useCallback(
    (anchor: string | undefined, w: number, h: number): { x: number; y: number } => {
      const right = Math.max(8, SCREEN_W - w - 10);
      const bottom = Math.max(8, screenHeight - h - 120);
      switch (anchor) {
        case 'top-left':
          return { x: 10, y: 8 };
        case 'bottom-left':
          return { x: 10, y: bottom };
        case 'bottom-right':
          return { x: right, y: bottom };
        default:
          return { x: right, y: 8 };
      }
    },
    [screenHeight],
  );

  const customInterfaceActions = useMemo(
    () => ({
      onSend: (text: string) => {
        const t = (text || '').trim();
        if (t) handleSend(t, [], 'text');
      },
      onStop: () => handleForceStop(),
      onRegenerate: () => handleRegenerateLast(),
      onInputChanged: (_v: string) => {
        /* 输入框内容由用户界面自己持有，这里只用于需要联动时扩展 */
      },
      onSetVar: (key: string, value: any) => {
        if (!key) return;
        updateChat({ statusVars: { ...(chatRef.current?.statusVars || {}), [key]: value } });
      },
      onInjectCss: () => {
        /* 全局 CSS 注入由界面内部处理；这里保留钩子以便将来持久化到主题 */
      },
      onSetBackground: (value: string, opts: { kind: string; muted: boolean; loop: boolean }) => {
        updateChat({ wallpaper: value || undefined });
        handleVideoBgStateChange({ muted: opts.muted, paused: false });
      },
      onToggleSidebar: () => onOpenLeftMenu(),
      /** 内置 CSS 悬浮窗（如地点窗）点一下 → 把文字插进聊天输入框 */
      onInsertToChatInput: (text: string) => {
        if (text) setPendingInputInsert(text);
      },
      onOpenRightMenu: () => onOpenRightMenu(),
      onOpenPanel: (screen: string, section?: string) => onOpenPanel?.(screen, section),
      onToast: (text: string) => {
        if (text) console.log('[Aurora toast]', text);
      },
      onToggleBackgroundPlay: () => {
        handleVideoBgStateChange({ paused: !videoBgState.paused });
      },
      onSetBackgroundMuted: (muted: boolean) => handleVideoBgStateChange({ muted }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleSend, handleRegenerateLast, videoBgState.paused, videoBgState.muted],
  );

  // ===== 气泡消息：稳定的 actions 引用（所有回调通过 useCallback/内部 chatRef 路由）=====
  const bubbleActionImagePress = useCallback((uri: string) => {
    setPreviewImage(uri);
  }, []);

  const bubbleActionEdit = useCallback((msg: ChatMessage) => {
    setEditingMessage(msg);
    setEditText(msg.content);
    setEditRole(msg.role === 'assistant' ? 'assistant' : 'user');
  }, []);

  const bubbleActionCopy = useCallback((msg: ChatMessage) => {
    if (!msg.content) return;
    Clipboard.setStringAsync(msg.content);
    setActionMenuTitle('已复制');
    setActionMenuSubtitle('文本已复制到剪贴板');
    setActionMenuItems([{ label: '确定', onPress: () => {} }]);
    setShowActionMenuState(true);
  }, []);

  const bubbleActionMore = useCallback((msg: ChatMessage) => {
    setActionSheetMessage(msg);
    setShowActionSheet(true);
  }, []);

  const bubbleActionSuggested = useCallback((text: string) => {
    if (!text?.trim()) return;
    handleSend(text, [], 'text');
  }, [handleSend]);

  const bubbleActionChangeContent = useCallback((msgId: string, next: string) => {
    const c = chatRef.current;
    if (!c) return;
    const msgs = c.messages.map((m) => (m.id === msgId ? { ...m, content: next } : m));
    updateChat({ messages: msgs });
  }, [updateChat]);

  const bubbleActionChangeThinking = useCallback((msgId: string, next: string) => {
    const c = chatRef.current;
    if (!c) return;
    const msgs = c.messages.map((m) => (m.id === msgId ? { ...m, thinkingContent: next } : m));
    updateChat({ messages: msgs });
  }, [updateChat]);

  const bubbleActionVarUpdate = useCallback((vars: Record<string, number | string>) => {
    const c = chatRef.current;
    if (!c) return;
    const merged = { ...c.statusVars, ...vars };
    updateChat({ statusVars: merged });
  }, [updateChat]);

  // actions 对象保持引用稳定：env 承担动态数据变化
  const bubbleActions: MessageBubbleItemActions = useMemo(() => ({
    handleLongPress: handleMessageLongPress,
    handleImagePress: bubbleActionImagePress,
    handleRegenerate: handleRegenerateMessage,
    handlePrevVersion,
    handleNextVersion,
    handleContinue,
    handleEdit: bubbleActionEdit,
    handleCopy: bubbleActionCopy,
    handleMore: bubbleActionMore,
    handleSuggestedQuestion: bubbleActionSuggested,
    handleChangeContent: bubbleActionChangeContent,
    handleChangeThinkingContent: bubbleActionChangeThinking,
    handleVarUpdate: bubbleActionVarUpdate,
  }), [
    handleMessageLongPress,
    bubbleActionImagePress,
    handleRegenerateMessage,
    handlePrevVersion,
    handleNextVersion,
    handleContinue,
    bubbleActionEdit,
    bubbleActionCopy,
    bubbleActionMore,
    bubbleActionSuggested,
    bubbleActionChangeContent,
    bubbleActionChangeThinking,
    bubbleActionVarUpdate,
  ]);

  // ===== 气泡消息：环境派生值 memoize，避免每条消息重复计算 =====
  const bubbleEnv: MessageBubbleItemEnv = useMemo(() => {
    const userAvatar = ((chat as any)?.userAvatar || (parentChat as any)?.userAvatar || settings.conversation.userAvatar);
    const assistantAvatar = ((chat as any)?.assistantAvatar || (parentChat as any)?.assistantAvatar || settings.conversation.defaultAssistantAvatar);
    let textProviderAvatar: string | undefined;
    if (!assistantAvatar) {
      const t = getProvider('text');
      if (t?.avatar) textProviderAvatar = t.avatar;
    }
    const entries = chat?.settings?.cssEntries || [];
    const messageCustomCSS = entries
      .filter((e) => e.enabled && e.scope === 'message')
      .map((e) => e.css)
      .join('\n');
    // 指令推导出的气泡配色与装饰层：拼进每条消息的渲染样式里，
    // 这样 {{ui:color-bubble=...}} / {{ui:decor=雪花}} 才真的看得见。
    // 转换逻辑已抽到 uiDirectiveService.buildUiStateCss（可单测）。
    const messageCustomCSSWithUi = [
      messageCustomCSS,
      buildUiStateCss({ colors: uiState.colors, decor: uiState.decor }),
    ]
      .filter(Boolean)
      .join('\n');
    const msgs = chat?.messages || [];
    return {
      chat,
      parentChat,
      chats,
      providers,
      settings,
      userAvatar,
      assistantAvatar,
      textProviderAvatar,
      messageCustomCSS: messageCustomCSSWithUi,
      isLoading,
      streamingMessageId,
      chatMessagesLength: msgs.length,
      lastMessageId: msgs.length > 0 ? msgs[msgs.length - 1].id : null,
      conversationType: chat?.conversationType,
      bubbleStyle: settings.display.bubbleStyle || 'classic',
    };
  }, [
    chat,
    parentChat,
    chats,
    providers,
    settings,
    isLoading,
    streamingMessageId,
    uiState.colors,
    decorCss,
  ]);
  if (!chat) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundColor, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.subTextColor }}>对话不存在</Text>
      </View>
    );
  }

  const handleForceStop = () => {
    forceStopRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
    setStreamingMessageId(null);
    setCurrentRespondingMember(null);
  };

  const getRespondingMemberName = (): string | null => {
    const c = chatRef.current;
    if (!c || !currentRespondingMember) return null;
    if (c.conversationType === 'group') {
      const member = c.groupMembers?.find((m) => m.id === currentRespondingMember);
      return member?.name || null;
    }
    if (c.conversationType === 'group_private' && c.parentId) {
      const parentChat = chats.find((ch) => ch.id === c.parentId);
      const member = parentChat?.groupMembers?.find((m) => m.id === c.activeMemberId);
      return member?.name || null;
    }
    return null;
  };

  // 格式化时长为 HH:MM:SS
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatUsageTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  };

  // 网速 chip 颜色分级
  const getNetworkChipStyle = () => {
    if (networkSpeed === '检测中...') {
      return { bg: '#888888', color: '#ffffff' };
    }
    if (!isOnline || networkSpeed === '离线') {
      return { bg: '#ff5151', color: '#ffffff' };
    }
    if (networkSpeed.includes('较慢')) {
      return { bg: '#ff9a3c', color: '#ffffff' };
    }
    if (networkSpeed.includes('极快')) {
      return { bg: '#5aa0ff', color: '#ffffff' };
    }
    // 正常/快速/已连接
    return { bg: '#3ccf7a', color: '#ffffff' };
  };

  const renderFooter = () => {
    if (!isLoading) return null;
    const memberName = getRespondingMemberName();
    return (
      <View style={[styles.loadingInline, { backgroundColor: theme.secondaryColor + '80' }]}>
        <View style={styles.loadingAnimation}>
          <Animated.View style={[styles.loadingDot, { backgroundColor: theme.accentColor, opacity: loadingDot1 }]} />
          <Animated.View style={[styles.loadingDot, { backgroundColor: theme.accentColor, opacity: loadingDot2 }]} />
          <Animated.View style={[styles.loadingDot, { backgroundColor: theme.accentColor, opacity: loadingDot3 }]} />
        </View>
        <Text style={{ color: theme.subTextColor, fontSize: 12, marginLeft: 8, flex: 1 }}>
          {memberName ? `${memberName} ${streamingMessageId ? '正在输出' : '思考中'}` : (streamingMessageId ? '正在输出' : '思考中')}
        </Text>
        <TouchableOpacity
          style={[styles.stopBtn, { backgroundColor: '#ff5a5a' }]}
          onPress={handleForceStop}
          activeOpacity={0.7}
        >
          <IconClose size={14} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 12, marginLeft: 4, fontWeight: '600' }}>停止</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { backgroundColor: theme.backgroundColor },
        Platform.OS === 'android' && keyboardHeight > 0 ? { paddingBottom: keyboardHeight } : null,
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {effectiveWallpaper && (
        <VideoBackground
          uri={effectiveWallpaper}
          kind={inferBackgroundKind(effectiveWallpaper)}
          opacity={0.3}
          loop
          videoState={videoBgState}
          onVideoStateChange={handleVideoBgStateChange}
        />
      )}

      <View style={[styles.header, { backgroundColor: theme.primaryColor + 'ee', borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 8) + 4 }]}>
        <TouchableOpacity onPress={onOpenLeftMenu} style={styles.headerBtn}>
          <IconSettings size={22} color={theme.textColor} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerCenter} onPress={handleTitlePress}>
          {isChildConversation && parentChat ? (
            <View style={styles.childHeaderRow}>
              <IconBack size={16} color={theme.accentColor} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.headerTitle, { color: theme.textColor }]} numberOfLines={1}>
                  {chat?.title || '子对话'}
                </Text>
                <Text style={[styles.headerSubtitle, { color: theme.accentColor }]} numberOfLines={1}>
                  ← 返回：{parentChat.title || '母对话'}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={[styles.headerTitle, { color: theme.textColor }]} numberOfLines={1}>
                {chat?.title || '新对话'}
              </Text>
              <Text style={[styles.headerSubtitle, { color: theme.accentColor }]} numberOfLines={1}>
                {getCurrentModelDisplay('text')} <IconDown size={12} color={theme.accentColor} />
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onNewChat} style={styles.headerBtn}>
            <IconPlus size={22} color={theme.textColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onOpenRightMenu} style={styles.headerBtn}>
            <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '500' }}>设置</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowMoreMenu(true)} style={styles.headerBtn}>
            <IconMenuDots size={18} color={theme.textColor} />
          </TouchableOpacity>
        </View>
      </View>

      {hasStatusBar && statusBarConfig!.position === 'top' && statusVars.length > 0 && (
        <StatusBarComponent
          vars={statusVars}
          config={statusBarConfig!}
        />
      )}

      <View style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {(() => {
          const entries = chat.settings?.cssEntries || [];
          // 只把**纯 CSS**条目注入全局样式表；带 HTML/JS 的走覆盖层，悬浮窗条目也不进来，
          // 否则那些 <div>/<script> 会被当成 CSS 塞进来。
          const globalCSS = entries
            .filter(
              (e) =>
                e.enabled &&
                e.scope === 'global' &&
                !e.widget &&
                e.css.trim() &&
                !contentNeedsRenderLayer(e.css),
            )
            .map((e) => e.css)
            .join('\n');
          if (globalCSS) return <GlobalCSSRenderer css={globalCSS} />;
          return null;
        })()}

        {/*
          悬浮窗条目（CSSEntry.widget）：叠一块**只有这么大**的可交互 WebView。
          里面的 HTML/JS 能做拖动、滚动、点击；拖动时把位移上报给 RN，
          由这里移动这块区域 —— 所以不像全屏覆盖层那样挡住整个聊天列表。
        */}
        {widgetEntries.map((entry) => {
          const w = entry.widget!.width ?? 172;
          const h = entry.widget!.height ?? 430;
          const pos = widgetPos[entry.id] ?? defaultWidgetPos(entry.widget!.anchor, w, h);
          return (
            <View
              key={entry.id}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: w,
                height: h,
                zIndex: 40,
                // Android 靠 elevation 决定真正的叠放层级，否则会被后渲染的消息列表盖住
                elevation: 40,
              }}
            >
              <UserInterfaceHost
                bare
                template={{ html: entry.css, css: '', js: '' }}
                theme={theme as any}
                state={{
                  chat: { id: chat.id, title: chat.title, characterId: chat.characterId },
                  settings: {
                    userName: chat.settings?.userName || settings.userProfile?.username || '用户',
                  },
                  characters: characters.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })),
                  vars: chat.statusVars || {},
                  theme: theme as any,
                }}
                messages={[]}
                streaming={null}
                actions={{
                  ...customInterfaceActions,
                  onMoveWidget: (dx: number, dy: number) =>
                    setWidgetPos((prev) => {
                      const cur = prev[entry.id] ?? defaultWidgetPos(entry.widget!.anchor, w, h);
                      return {
                        ...prev,
                        [entry.id]: {
                          x: Math.min(Math.max(0, cur.x + dx), Math.max(0, SCREEN_W - w)),
                          y: Math.min(Math.max(0, cur.y + dy), Math.max(0, screenHeight - h - 80)),
                        },
                      };
                    }),
                }}
              />
            </View>
          );
        })}
        {/*
          「内置 CSS」全局作用域里如果写了 HTML/JS，就在这里开一个真正的覆盖层渲染：
          纯 CSS 走上面的 GlobalCSSRenderer，含结构的走覆盖层，两条路互不干扰。
          覆盖层内可以用 window.Aurora（发消息、切背景、注入样式、打开面板…）。
        */}
        {globalScopeLayerCSS ? (
          <UserInterfaceHost
            bare
            template={{ html: globalScopeLayerCSS, css: '', js: '' }}
            theme={theme as any}
            state={{
              chat: { id: chat.id, title: chat.title, characterId: chat.characterId },
              settings: {
                userName: chat.settings?.userName || settings.userProfile?.username || '用户',
              },
              characters: characters.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })),
              vars: chat.statusVars || {},
              theme: theme as any,
            }}
            messages={[]}
            streaming={null}
            actions={customInterfaceActions}
          />
        ) : null}
        {customIface.enabled ? (
          /* 自定义界面模式：消息列表与输入区交给用户模板渲染，通过 window.Aurora 驱动 */
          <UserInterfaceHost
            template={{
              html: customIface.html,
              css: customIface.css,
              js: customIface.js,
              splashHtml: customIface.splashHtml,
              splashCss: customIface.splashCss,
              sidebarHtml: customIface.sidebarHtml,
              sidebarCss: customIface.sidebarCss,
              floatingHtml: customIface.floatingHtml,
              floatingCss: customIface.floatingCss,
              splashDuration: customIface.splashDuration,
            }}
            theme={theme as any}
            state={{
              chat: { id: chat.id, title: chat.title, characterId: chat.characterId },
              settings: {
                userName: chat.settings?.userName || settings.userProfile?.username || '用户',
                displayMode: settings.display.displayMode,
              },
              characters: characters.map((c) => ({ id: c.id, name: c.name, avatar: c.avatar })),
              vars: chat.statusVars || {},
              theme: theme as any,
            }}
            messages={messagesForDisplay.map((m: any) => ({
              id: m.id,
              role: m.role,
              content: m.content || '',
              images: m.images,
            }))}
            streaming={
              isLoading && streamingAssistantId
                ? {
                    messageId: streamingAssistantId,
                    content:
                      messagesWithLoading.find((m: any) => m.id === streamingAssistantId)?.content || '',
                  }
                : null
            }
            actions={customInterfaceActions}
          />
        ) : (
        <>
        <FlatList
          ref={flatListRef}
          style={{ flex: 1 }}
          data={messagesForDisplay}
          keyExtractor={(item) => item.id}
          extraData={streamingTick}
          scrollEventThrottle={16}
          onLayout={(e) => setFlatListHeight(e.nativeEvent.layout.height)}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollBegin={handleScrollBeginDrag}
          onMomentumScrollEnd={handleScrollEndDrag}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          updateCellsBatchingPeriod={64}
          removeClippedSubviews={Platform.OS !== 'web'}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          getItemLayout={undefined}
          renderItem={({ item, index }) => (
            <MessageBubbleItem item={item} index={index} actions={bubbleActions} env={bubbleEnv} />
          )}
          contentContainerStyle={[
            styles.messagesContainer,
            (chat.messages.length === 0) && { flexGrow: 1 },
          ]}
          ListEmptyComponent={
            <View style={[styles.emptyChat, { paddingHorizontal: 16 }]}>
              {(() => {
                const displayWorks = fancyWorks.filter((w) => w.type === 'greeting' || w.type === 'guide');
                if (displayWorks.length > 0) {
                  return (
                    <View style={{ width: '100%', alignItems: 'center' }}>
                      {displayWorks.slice(0, 1).map((work) => (
                        <FancyWorkRenderer key={work.id} work={work} width={SCREEN_W - 32} />
                      ))}
                    </View>
                  );
                }
                return (
                  <>
                    <Text style={{ color: theme.subTextColor, fontSize: 16 }}>
                      开始与AI对话吧
                    </Text>
                    <Text style={{ color: theme.subTextColor, marginTop: 8, fontSize: 14 }}>
                      在设置中配置AI提供商后即可使用
                    </Text>
                    <Text style={{ color: theme.subTextColor, marginTop: 4, fontSize: 12 }}>
                      左滑查看历史 | 右滑查看设置
                    </Text>
                  </>
                );
              })()}
            </View>
          }
          ListFooterComponent={
            isLoading ? (
              <>{renderFooter()}<View style={{ height: 16 }} /></>
            ) : (
              <View style={{ height: 16 }} />
            )
          }
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          showsVerticalScrollIndicator={false}
        />
        <CustomScrollbar
          scrollViewRef={flatListRef}
          contentHeight={contentHeight}
          visibleHeight={flatListHeight || (Dimensions.get('window').height - insets.top - insets.bottom - 150)}
          scrollY={scrollY}
        />
        </>
        )}
      </View>

      {hasStatusBar && statusBarConfig!.position === 'bottom' && statusVars.length > 0 && (
        <StatusBarComponent
          vars={statusVars}
          config={statusBarConfig!}
        />
      )}

      {chat.conversationType === 'manual' ? (
        <View style={[
          styles.parentConversationAction,
          {
            backgroundColor: theme.inputBgColor,
            borderTopColor: theme.borderColor,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}>
          <Text style={{ color: theme.subTextColor, fontSize: 14, textAlign: 'center' }}>
            使用说明书
          </Text>
          <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
            此为系统说明记录，不可对话
          </Text>
        </View>
      ) : chat.conversationType === 'parent' ? (
        <View style={[
          styles.parentConversationAction,
          {
            backgroundColor: theme.inputBgColor,
            borderTopColor: theme.borderColor,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}>
          {showParentChildren && childChats.length > 0 && (
            <View style={[styles.childrenList, { borderBottomColor: theme.borderColor }]}>
              <Text style={[styles.childrenListTitle, { color: theme.subTextColor }]}>子对话 ({childChats.length})</Text>
              {childChats.map((child) => (
                <View
                  key={child.id}
                  style={[styles.childItem, { backgroundColor: theme.secondaryColor }]}
                >
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => onSelectChat ? onSelectChat(child.id) : onNewChat()}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: theme.textColor, fontSize: 14 }} numberOfLines={1}>
                      {child.title}
                    </Text>
                    <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                      {child.messages.length} 条 · {new Date(child.updatedAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleChildAction(child)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <IconMore size={18} color={theme.subTextColor} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={styles.parentActionRow}>
            {childChats.length > 0 && (
              <TouchableOpacity
                style={[styles.parentActionButton, { backgroundColor: theme.secondaryColor, borderWidth: 1, borderColor: theme.accentColor }]}
                onPress={() => setShowParentChildren(!showParentChildren)}
                activeOpacity={0.7}
              >
                <Text style={{ color: theme.accentColor, fontSize: 16, fontWeight: '600' }}>
                  {showParentChildren ? '收起' : `展开 ${childChats.length}`}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.parentActionButton, { backgroundColor: theme.accentColor }]}
              onPress={onNewChat}
              activeOpacity={0.7}
            >
              <IconPlus size={18} color={theme.buttonTextColor} />
              <Text style={{ color: theme.buttonTextColor, fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
                新建
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
            母对话用于编辑设定，点击新建创建子对话进行实际聊天
          </Text>
        </View>
      ) : (
        <View style={styles.inputArea}>
          {chat.conversationType === 'group' && ((chat.groupMembers || []).length > 0) && (
            <View style={[styles.groupInfoBar, { backgroundColor: theme.secondaryColor, borderTopColor: theme.borderColor }]}>
              {/* 群聊总设定：所有成员共同遵循的基础指令 */}
              <TouchableOpacity
                style={{ paddingLeft: 12, paddingRight: 6, paddingVertical: 8 }}
                onPress={() =>
                  openTextEditor(
                    '群聊总设定',
                    chat.settings?.systemPrompt || '',
                    (v) => updateChat({ settings: { ...chat.settings, systemPrompt: v } }),
                    '所有成员共同遵循的基础指令（世界观、群规、共同语气等）',
                  )
                }
              >
                <Text style={{ color: theme.accentColor, fontSize: 11, fontWeight: '700' }}>⚙ 总设定</Text>
              </TouchableOpacity>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 6, paddingRight: 12, paddingVertical: 6 }}>
                {(chat.groupMembers || []).filter((m) => m.isActive).map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    delayLongPress={300}
                    onLongPress={() =>
                      openTextEditor(
                        `角色设定 · ${m.name}`,
                        m.settings.systemPrompt || '',
                        (v) =>
                          updateChat({
                            groupMembers: (chat.groupMembers || []).map((x) =>
                              x.id === m.id ? { ...x, settings: { ...x.settings, systemPrompt: v } } : x,
                            ),
                          }),
                        '这个角色自己的独立设定（叠加在群聊总设定之上）',
                      )
                    }
                    style={[styles.memberChip, { backgroundColor: currentRespondingMember === m.id ? theme.accentColor + '30' : theme.inputBgColor }]}
                  >
                    {m.avatar ? (
                      <Image source={{ uri: m.avatar }} style={styles.memberChipAvatar} />
                    ) : (
                      <View style={[styles.memberChipAvatarPlaceholder, { backgroundColor: theme.accentColor + '30' }]}>
                        <Text style={{ fontSize: 10, color: theme.textColor }}>{m.name.charAt(0)}</Text>
                      </View>
                    )}
                    <Text style={{ color: theme.textColor, fontSize: 11, marginRight: 4 }}>{m.name}</Text>
                    {currentRespondingMember === m.id && (
                      <View style={[styles.respondingDot, { backgroundColor: theme.accentColor }]} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
          {chat.conversationType === 'group_private' && chat.activeMemberId && (() => {
            const parentChat = chats.find((ch) => ch.id === chat.parentId);
            const member = parentChat?.groupMembers?.find((m) => m.id === chat.activeMemberId);
            if (!member) return null;
            return (
              <View style={[styles.groupInfoBar, { backgroundColor: theme.secondaryColor, borderTopColor: theme.borderColor }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, gap: 8 }}>
                  {member.avatar ? (
                    <Image source={{ uri: member.avatar }} style={styles.memberChipAvatar} />
                  ) : (
                    <View style={[styles.memberChipAvatarPlaceholder, { backgroundColor: theme.accentColor + '30' }]}>
                      <Text style={{ fontSize: 10, color: theme.textColor }}>{member.name.charAt(0)}</Text>
                    </View>
                  )}
                  <Text style={{ color: theme.textColor, fontSize: 12 }}>与 {member.name} 私聊</Text>
                  <Text style={{ color: theme.subTextColor, fontSize: 11 }}>· 记忆与群聊互通</Text>
                </View>
              </View>
            );
          })()}
          {!customIface.enabled && (
          <ChatInput
            onSend={handleSend}
            onSendWithFiles={(text, images, inlineFiles, type) => handleSend(text, images, type, undefined, undefined, inlineFiles)}
            onInputFocus={() => {
              // 点击输入框时自动跳到最新一条
              if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: false });
                isAtBottomRef.current = true;
                setIsAtBottom(true);
              }
            }}
            webSearchEnabled={webSearchEnabled}
            onWebSearchToggle={setWebSearchEnabled}
            showContinueChat={chat.conversationType === 'group' && (chat.groupMembers || []).some((m) => m.isActive)}
            continueChatBusy={!!isLoading}
            insertText={pendingInputInsert}
            onInsertConsumed={() => setPendingInputInsert(null)}
            onContinueChat={() => {
              runGroupAutoRound().catch(() => {});
            }}
            selectedTextProvider={getProvider('text')}
            selectedImageProvider={getProvider('image')}
            selectedVisionProvider={getProvider('vision')}
            selectedSummaryProvider={getProvider('summary')}
            onSelectProvider={handleSelectProvider}
            onOpenModelSelector={openModelSelector}
            quickCommands={settings.quickCommands}
            maxImages={chat.settings?.maxImagesPerMessage ?? 5}
            pasteLongTextAsFile={chat.settings?.pasteLongTextAsFile ?? false}
          />
          )}
        </View>
      )}

      <Modal
        visible={!!editingMessage}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setEditingMessage(null);
          setEditText('');
        }}
      >
        <TouchableOpacity
          style={styles.editModalOverlay}
          activeOpacity={1}
          onPress={() => {
            setEditingMessage(null);
            setEditText('');
          }}
        >
          <View 
            style={[
              styles.editSheetContainer, 
              { 
                paddingTop: insets.top,
                paddingBottom: keyboardHeight > 0
                  ? keyboardHeight
                  : Math.max(insets.bottom, 0),
              }
            ]} 
          >
            <View 
              style={[styles.editSheet, { backgroundColor: theme.backgroundColor, height: editSheetMaxHeight, maxHeight: editSheetMaxHeight }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.editDragHandle}>
                <View style={[styles.editDragBar, { backgroundColor: theme.borderColor }]} />
              </View>

              <View style={styles.editRoleRow}>
                <Text style={[styles.editRoleLabel, { color: theme.subTextColor }]}>发送者</Text>
                <View style={styles.editRoleSelector}>
                  <TouchableOpacity
                    style={[
                      styles.editRoleBtn,
                      editRole === 'assistant' && [styles.editRoleBtnActive, { borderColor: theme.accentColor }],
                    ]}
                    onPress={() => setEditRole('assistant')}
                  >
                    <IconAI size={22} color={theme.accentColor} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.editRoleBtn,
                      editRole === 'user' && [styles.editRoleBtnActive, { borderColor: theme.accentColor }],
                    ]}
                    onPress={() => setEditRole('user')}
                  >
                    <IconUser size={22} color={theme.accentColor} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView style={styles.editScrollView} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} nestedScrollEnabled>
                <TextInput
                  style={[
                    styles.editInput,
                    {
                      backgroundColor: theme.secondaryColor,
                      color: theme.textColor,
                    },
                  ]}
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  placeholder="编辑消息内容..."
                  placeholderTextColor={theme.subTextColor}
                  textAlignVertical="top"
                  autoFocus
                  keyboardAppearance="default"
                />
              </ScrollView>

              <View style={styles.editButtonRow}>
                <TouchableOpacity
                  style={[styles.editCancelBtn, { backgroundColor: theme.secondaryColor }]}
                  onPress={() => {
                    setEditingMessage(null);
                    setEditText('');
                  }}
                >
                  <Text style={[styles.editCancelBtnText, { color: theme.textColor }]}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editSaveBtn, { backgroundColor: theme.accentColor }]}
                  onPress={() => handleSaveEdit(false)}
                >
                  <Text style={[styles.editSaveBtnText, { color: theme.buttonTextColor }]}>保存</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[styles.editResendBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={() => handleSaveEdit(true)}
              >
                <Text style={[styles.editResendBtnText, { color: theme.accentColor }]}>保存并重新发送</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <ImagePreviewModal
        visible={!!previewImage}
        imageUri={previewImage || ''}
        onClose={() => setPreviewImage(null)}
      />

      <MessageActionSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        title={actionSheetMessage?.content?.substring(0, 40) + (actionSheetMessage && actionSheetMessage.content && actionSheetMessage.content.length > 40 ? '...' : '')}
        actions={getMessageActions(actionSheetMessage)}
        theme={theme}
      />

      <MessageActionSheet
        visible={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        title="更多操作"
        actions={getMoreActions()}
        theme={theme}
      />

      <ModelSelector
        visible={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        providers={providers}
        selectedModelId={getCurrentModel(modelSelectorType)?.id}
        selectedProviderId={getProvider(modelSelectorType)?.id}
        onSelect={(provider, model) => handleSelectModel(modelSelectorType, provider, model)}
        capabilityFilter={modelSelectorType}
        title={`选择${modelSelectorType === 'text' ? '对话' : modelSelectorType === 'image' ? '生图' : modelSelectorType === 'vision' ? '识图' : '总结'}AI`}
      />

      <ActionMenu
        visible={showActionMenu}
        onClose={() => setShowActionMenuState(false)}
        title={actionMenuTitle}
        subtitle={actionMenuSubtitle}
        items={actionMenuItems}
        theme={theme}
      />

      {/* 地点悬浮窗已改为「内置 CSS」实现（BLUE_ARCHIVE_CSS_SIDEBAR 的 body::after），
          这里不再用原生组件画悬浮球。 */}

      {/* 群聊总设定 / 单角色设定 编辑弹窗 */}
      <Modal
        visible={!!textEditor}
        transparent
        animationType="fade"
        onRequestClose={() => setTextEditor(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: theme.menuBgColor, borderRadius: 14, padding: 16 }}>
            <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: '700' }}>{textEditor?.title}</Text>
            {textEditor?.hint ? (
              <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>{textEditor.hint}</Text>
            ) : null}
            <TextInput
              style={{
                color: theme.textColor,
                backgroundColor: theme.inputBgColor,
                borderRadius: 8,
                padding: 10,
                minHeight: 140,
                // 上限：内容很长时不要让输入框顶满整屏，否则按钮会被挤出可视区
                maxHeight: 320,
                marginTop: 10,
                textAlignVertical: 'top',
              }}
              value={textEditorDraft}
              onChangeText={setTextEditorDraft}
              multiline
              scrollEnabled
              placeholder="输入设定内容…"
              placeholderTextColor={theme.subTextColor}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: theme.borderColor, alignItems: 'center' }}
                onPress={() => setTextEditor(null)}
              >
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: theme.accentColor, alignItems: 'center' }}
                onPress={() => {
                  textEditor?.onSave(textEditorDraft);
                  setTextEditor(null);
                }}
              >
                <Text style={{ color: theme.buttonTextColor, fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmModal
        visible={showDeleteConfirm}
        title="删除对话"
        message={
          (chat?.conversationType === 'parent')
            ? '删除母对话会同时删除所有子对话。\n确定要删除吗？此操作不可撤销。'
            : '确定要删除这个对话吗？此操作不可撤销。'
        }
        actions={[
          { label: '取消', onPress: () => {} },
          { label: '删除', destructive: true, onPress: confirmDeleteChat },
        ]}
        type="warning"
        onClose={() => setShowDeleteConfirm(false)}
        theme={theme}
      />

      {/* 编辑对话标题 Modal（Android 无 Alert.prompt fallback） */}
      {showChatEditPrompt && (
        <Modal
          transparent
          visible={showChatEditPrompt}
          animationType="fade"
          onRequestClose={() => setShowChatEditPrompt(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.modalBackdrop}
            onPress={() => setShowChatEditPrompt(false)}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: theme.primaryColor,
                  paddingTop: 18,
                  paddingHorizontal: 18,
                  paddingBottom: Math.max(insets.bottom, 88 + Math.abs(Dimensions.get('screen').height - Dimensions.get('window').height)) + 18,
                },
              ]}
              onStartShouldSetResponder={() => true}
            >
              <Text style={[styles.modalTitle, { color: theme.textColor, marginBottom: 8 }]}>
                编辑对话
              </Text>
              <Text style={{ color: theme.subTextColor, fontSize: 13, marginBottom: 12 }}>
                修改对话标题：
              </Text>
              <TextInput
                ref={chatEditInputRef}
                value={chatEditTitle}
                onChangeText={setChatEditTitle}
                autoFocus
                placeholder="对话标题"
                placeholderTextColor={theme.subTextColor + '88'}
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: theme.secondaryColor,
                    color: theme.textColor,
                    borderColor: theme.borderColor,
                    marginBottom: 16,
                  },
                ]}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { flex: 1, backgroundColor: theme.secondaryColor },
                  ]}
                  onPress={() => setShowChatEditPrompt(false)}
                >
                  <Text style={{ color: theme.subTextColor }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { flex: 1, backgroundColor: theme.accentColor }]}
                  onPress={() => {
                    if (chatEditTitle.trim()) {
                      updateChat({ title: chatEditTitle.trim() });
                    }
                    setShowChatEditPrompt(false);
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  headerBtn: {
    padding: 8,
    minWidth: 44,
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  childHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: '100%',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
  },
  statusDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginHorizontal: 8,
  },
  messagesContainer: {
    padding: 12,
    flexGrow: 1,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  loadingAnimation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  forceStopBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  groupInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    maxHeight: 50,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 4,
  },
  memberChipAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  memberChipAvatarPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  respondingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  continueButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  continueButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  footerSpacing: {
    height: 12,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  editSheetContainer: {
    justifyContent: 'flex-end',
    width: '100%',
  },
  editSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '75%',
    flexDirection: 'column',
  },
  editScrollView: {
    flex: 1,
    minHeight: 80,
  },
  editDragHandle: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  editDragBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    opacity: 0.4,
  },
  editRoleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  editRoleLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  editRoleSelector: {
    flexDirection: 'row',
    gap: 10,
  },
  editRoleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: 'rgba(128,128,128,0.15)',
  },
  editRoleBtnActive: {
    borderWidth: 2,
  },
  editInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 120,
    marginBottom: 12,
  },
  editButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  editCancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  editSaveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  editSaveBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  editResendBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  editResendBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  parentConversationAction: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  parentActionRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  parentActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  childrenList: {
    width: '100%',
    maxHeight: 200,
    borderBottomWidth: 1,
    marginBottom: 12,
    paddingBottom: 12,
  },
  childrenListTitle: {
    fontSize: 12,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  childItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
    flexShrink: 0,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  chipPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 14,
    flexShrink: 0,
  },
  chipPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  actionBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginLeft: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },

});
