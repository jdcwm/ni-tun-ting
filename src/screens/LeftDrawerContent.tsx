import React, { useState, ReactNode, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Image, Switch, PanResponder, Animated, Share, Modal, TextInput, Pressable, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { Chat } from '../types';
import { generateId } from '../constants/defaults';
import { Ionicons } from '@expo/vector-icons';
import { imageUtils } from '../utils/imageUtils';
import { isConversationHistoryChat } from '../utils/chatFilters';
import { backupService } from '../services/backupService';
import { storage } from '../utils/storage';
import { exportService } from '../services/exportService';
import { communityService } from '../services/communityService';
import { MessageActionSheet, MessageAction, ThemedAlert } from '../components/MessageActionSheet';
import {
  IconChevronRight,
  IconChevronDown,
  IconClose,
  IconCharacters,
  IconCommunity,
  IconChatHistory,
  IconFavoriteMsg,
  IconFavoriteChat,
  IconToolbox,
  IconImage,
  IconWorldBook,
  IconTrash,
  IconTheme,
  IconSettings,
  IconSun,
  IconMoon,
  IconPlus,
  IconUser,
  IconAI,
  IconDatabase,
  IconPalette,
  IconBook,
  IconPin,
  IconStar,
  IconStarOutline,
  IconMenuDots,
  IconFolder,
  IconFile,
  IconFont,
  IconGlobe,
  IconZap,
  IconGame,
  IconShare,
  IconDownload,
  IconImport,
  IconExport,
  IconEdit,
} from '../components/Icons';

const SCREEN_W = Dimensions.get('window').width;

interface LeftDrawerContentProps {
  onClose: () => void;
  onNavigate: (screen: string, focusSection?: string) => void;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onImport: () => void;
}

interface MenuItem {
  key: string;
  title: string;
  icon: (color: string, size: number) => ReactNode;
  expandable: boolean;
  onPress?: () => void;
  expandedContent?: ReactNode;
  disabled?: boolean;
  rightText?: string;
}

export const LeftDrawerContent: React.FC<LeftDrawerContentProps> = ({ onClose, onNavigate, onSelectChat, onNewChat, onImport }) => {
  const theme = useTheme();
  const { settings, toggleTheme, chats, currentChatId, setSettings, isLoggedIn, currentUser, logout, characters, userProfile, toggleChatFavorite, toggleChatPin, setChats, exportAllData, exportAllDataWithMedia, importAllData, updateTheme, setDarkMode, isDarkMode, getFullBackups, restoreFullFromBackup, createManualBackup, updateCurrentUser } = useApp();
  const [activeTab, setActiveTab] = useState<'menu' | 'server' | 'settings'>('menu');
  // 默认全部收起（之前默认展开「对话历史」，一拉开抽屉就是一大片列表，太吵）
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showChatActions, setShowChatActions] = useState(false);
  const [actionChat, setActionChat] = useState<Chat | null>(null);
  const [showBackupPicker, setShowBackupPicker] = useState(false);
  const [backupPickerList, setBackupPickerList] = useState<{ key: string; label: string; timestamp: number; chatCount: number }[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  // 主题化弹窗（替代 Alert.alert 系统弹窗）
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


  // 设置封面：系统自由裁剪，不压画质，直接保存
  const setChatCover = async (chat: Chat) => {
    try {
      const picked = await imageUtils.pickCoverFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'chat_cover');
      setChats((prev: Chat[]) => prev.map((c) =>
        c.id === chat.id ? { ...c, coverImage: savedUri, coverConfig: undefined, updatedAt: Date.now() } : c
      ));
      showAlert('设置成功', '封面已更新');
    } catch (error: any) {
      showAlert('设置失败', error.message || '未知错误');
    }
  };

  // 对话编辑 Modal 状态
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingChat, setEditingChat] = useState<Chat | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const setChatWallpaper = async (chat: Chat) => {
    try {
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'chat_wallpaper');
      setChats((prev: Chat[]) => prev.map((c) => c.id === chat.id ? { ...c, wallpaper: savedUri, updatedAt: Date.now() } : c));
      showAlert('设置成功', '背景图片已更新');
    } catch (error: any) {
      showAlert('设置失败', error.message || '未知错误');
    }
  };

  const setChatUserAvatar = async (chat: Chat) => {
    try {
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'avatars');
      setChats((prev: Chat[]) => prev.map((c) => c.id === chat.id ? { ...c, userAvatar: savedUri, updatedAt: Date.now() } : c));
      showAlert('设置成功', '用户头像已更新');
    } catch (error: any) {
      showAlert('设置失败', error.message || '未知错误');
    }
  };

  const setChatAssistantAvatar = async (chat: Chat) => {
    try {
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'avatars');
      setChats((prev: Chat[]) => prev.map((c) => c.id === chat.id ? { ...c, assistantAvatar: savedUri, updatedAt: Date.now() } : c));
      showAlert('设置成功', 'AI头像已更新');
    } catch (error: any) {
      showAlert('设置失败', error.message || '未知错误');
    }
  };

  const openEditModal = (chat: Chat) => {
    setEditingChat(chat);
    setEditTitle(chat.title || '');
    setShowEditModal(true);
  };

  const saveEditChat = () => {
    if (!editingChat) return;
    if (!editTitle.trim()) { showAlert('提示', '请输入对话标题'); return; }
    setChats((prev: Chat[]) => prev.map((c) => c.id === editingChat.id ? { ...c, title: editTitle.trim(), updatedAt: Date.now() } : c));
    setShowEditModal(false);
    setEditingChat(null);
  };

  const toggleConversationTypeLocal = (chat: Chat) => {
    const currentType = chat.conversationType;
    if (currentType === 'parent') {
      const childIds = chats.filter((c) => c.parentId === chat.id && c.conversationType === 'child').map((c) => c.id);
      const updated = chats.map((c) => {
        if (c.id === chat.id) return { ...c, conversationType: undefined, updatedAt: Date.now() };
        if (childIds.includes(c.id)) return { ...c, conversationType: undefined, parentId: undefined, updatedAt: Date.now() };
        return c;
      });
      setChats(updated);
      showAlert('设置成功', childIds.length > 0 ? `已取消母对话设置，${childIds.length} 个子对话已独立` : '已取消母对话设置');
    } else if (currentType === 'child') {
      setChats(chats.map((c) => c.id === chat.id ? { ...c, conversationType: undefined, parentId: undefined, updatedAt: Date.now() } : c));
      showAlert('设置成功', '已取消子对话设置，对话已独立');
    } else {
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
      const parentChat = { ...chat, conversationType: 'parent' as const, messages: [], updatedAt: Date.now() };
      const next = chats.map((c) => (c.id === chat.id ? parentChat : c));
      next.splice(next.findIndex((c) => c.id === chat.id) + 1, 0, childChat);
      setChats(next);
      showAlert('设置成功', '已设为母对话，原历史已转为子对话');
    }
  };

  // 社区服务器地址（左菜单「服务器」tab 直填，不需要登录也能改）
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [serverStatus, setServerStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  useEffect(() => {
    setServerUrlInput(communityService.getBaseUrl());
  }, []);
  const handleSaveServerUrl = async () => {
    const url = serverUrlInput.trim().replace(/\/$/, '');
    if (!url) { showAlert('提示', '请输入服务器地址'); return; }
    if (!/^https?:\/\//.test(url)) { showAlert('格式错误', '地址需以 http:// 或 https:// 开头'); return; }
    await communityService.setBaseUrl(url);
    setServerStatus('idle');
    showAlert('已保存', '社区服务器地址已设为：\\n' + url);
  };
  const handleTestServerUrl = async () => {
    const url = serverUrlInput.trim().replace(/\/$/, '');
    if (!url) { showAlert('提示', '请先输入服务器地址'); return; }
    setServerStatus('testing');
    try {
      await communityService.setBaseUrl(url);
      const ok = await communityService.testConnection();
      setServerStatus(ok ? 'ok' : 'fail');
    } catch { setServerStatus('fail'); }
  };

    const [currentTime] = useState(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
  // 用户积分 + 签到（左菜单头像区显示）
  const [todayChecked, setTodayChecked] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);
  useEffect(() => {
    if (!isLoggedIn || !currentUser || currentUser.isGuest) return;
    communityService.getCheckInStatus()
      .then((r: any) => setTodayChecked(!!r.todayChecked))
      .catch(() => {});
  }, [isLoggedIn, currentUser]);
  const handleCheckIn = async () => {
    if (!isLoggedIn || currentUser?.isGuest) return;
    setCheckInLoading(true);
    try {
      const r = await communityService.checkIn();
      const newPoints = r.points as number;
      if (typeof newPoints === 'number') await updateCurrentUser({ points: newPoints });
      setTodayChecked(true);
      showAlert('签到成功', `连续签到 ${r.record?.streak ?? 1} 天，获得积分 +${r.bonusPoints ?? 10}`, { confirmText: '好的' });
    } catch (err: any) {
      if (err.message?.includes('今日已签到')) {
        setTodayChecked(true);
      } else {
        showAlert('签到失败', err.message || '请稍后再试', { confirmText: '好的' });
      }
    } finally {
      setCheckInLoading(false);
    }
  };

  // 左右滑动切换菜单/设置标签
  const swipeX = useRef(new Animated.Value(0)).current;
  const isHorizontal = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      // capture 阶段：水平位移明显时抢占 responder
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_evt, g) => {
        const dxAbs = Math.abs(g.dx);
        const dyAbs = Math.abs(g.dy);
        // 水平滑动：dx 大于 dy，且位移足够（阈值放宽确保轻滑也能触发）
        const horiz = dxAbs > dyAbs * 1.2 && dxAbs > 10;
        isHorizontal.current = horiz;
        return horiz;
      },
      // 当是水平手势时，不允许子组件（ScrollView）抢走 responder
      onPanResponderTerminationRequest: () => !isHorizontal.current,
      // 真正作为 responder 后，处理释放逻辑
      onPanResponderRelease: (_evt, gestureState) => {
        // 双向滑动切换标签：超过阈值即切换到对面标签
        // 用函数式更新避免 activeTab 闭包旧值问题（panResponder 在 useRef 中只创建一次）
        if (Math.abs(gestureState.dx) > 40) {
          setActiveTab(prev => prev === 'menu' ? 'server' : prev === 'server' ? 'settings' : 'menu');
        }
        isHorizontal.current = false;
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => {
        isHorizontal.current = false;
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const toggleItem = (key: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 左菜单对话更多操作：点击直接弹出操作，每项在本界面执行（不必跳转到对话主界面）
  const getChatActions = (chat: Chat): MessageAction[] => {
    const actions: MessageAction[] = [];
    actions.push({ label: '编辑对话', onPress: () => { openEditModal(chat); } });
    // 「选择角色」从右菜单挪到这里（右菜单不再重复）
    if (onNavigate) {
      actions.push({ label: '选择角色 / 更换角色卡', onPress: () => { onNavigate('characterPicker'); } });
    }
    actions.push({ label: chat.isFavorite ? '取消收藏' : '收藏对话', onPress: () => toggleChatFavorite(chat.id) });
    actions.push({ label: chat.isPinned ? '取消置顶' : '置顶对话', onPress: () => toggleChatPin(chat.id) });
    actions.push({ label: '设置封面', onPress: () => { setChatCover(chat); } });
    actions.push({ label: '设置对话背景', onPress: () => { setChatWallpaper(chat); } });
    actions.push({ label: '设置用户头像', onPress: () => { setChatUserAvatar(chat); } });
    actions.push({ label: '设置AI头像', onPress: () => { setChatAssistantAvatar(chat); } });
    const isParent = chat.conversationType === 'parent';
    const isChild = chat.conversationType === 'child';
    // 群聊/群内私聊不允许转成母/子对话：那会让群聊以 parent 身份混进「对话历史」，
    // 也会破坏「群聊记录只在群聊界面」的约定。
    const isGroupLike = chat.conversationType === 'group' || chat.conversationType === 'group_private';
    if (!isGroupLike) {
      const ctLabel = isParent ? '取消母对话' : (isChild ? '取消子对话' : '切换为母对话');
      actions.push({ label: `${ctLabel}（${chat.conversationType || '普通'}）`, onPress: () => { toggleConversationTypeLocal(chat); } });
    }
    actions.push({
      label: '导出为JSON',
      onPress: async () => {
        try {
          const json = await exportService.exportChatToJSON(chat, [], undefined);
          const dir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
          const safeTitle = (chat.title || 'chat').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
          const fileUri = `${dir}export_${safeTitle}_${chat.id}_${Date.now()}.json`;
          await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: chat.title || '导出对话', UTI: 'public.json' });
          } else {
            showAlert('导出成功', `已导出到：${fileUri}`);
          }
        } catch (e: any) { showAlert('导出失败', e?.message || '未知错误'); }
      },
    });
    actions.push({
      label: '复制为Markdown',
      onPress: async () => {
        try {
          const md = exportService.exportChatToMarkdown(chat);
          await Clipboard.setStringAsync(md);
          showAlert('已复制', '对话内容已复制为Markdown');
        } catch (e: any) { showAlert('复制失败', e?.message || '未知错误'); }
      },
    });
    actions.push({
      label: '复制对话',
      onPress: () => {
        const newId = `chat_${Date.now()}`;
        setChats((prev: Chat[]) => [...prev, { ...chat, id: newId, title: (chat.title || '对话') + ' (副本)', createdAt: Date.now(), updatedAt: Date.now(), isPinned: false, isFavorite: false }]);
        showAlert('操作成功', '对话副本已生成');
      },
    });
    if (chat.conversationType !== 'manual') {
      actions.push({
        label: '删除对话',
        onPress: () => {
          showAlert(`删除对话`, `确定删除「${chat.title}」吗？此操作不可撤销。`, {
            confirmText: '删除',
            cancelText: '取消',
            onConfirm: () => setChats((prev: Chat[]) => prev.filter((c) => c.id !== chat.id)),
          });
        },
        destructive: true,
      });
    }
    return actions;
  };

  const isDark = settings.theme.backgroundColor === '#0d0d1a';

  const renderChatList = () => {
    // Task 2.3: manual 永远最前 → 置顶 → 更新时间倒序
    // 只显示母对话和普通对话，子对话不单独显示（在母对话内部管理）
    // 群聊 / 群内私聊不进对话历史（由「群聊」界面管理），避免重复
    const sortedChats = [...chats]
      .filter((c) => c.conversationType !== 'child' && isConversationHistoryChat(c))
      .sort((a, b) => {
        if (a.conversationType === 'manual' && b.conversationType !== 'manual') return -1;
        if (a.conversationType !== 'manual' && b.conversationType === 'manual') return 1;
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
      });
    return (
      <View style={[styles.chatListContainer, { backgroundColor: theme.secondaryColor }]}>
        <View style={[styles.chatListHeader, { borderBottomColor: theme.borderColor }]}>
          <Text style={[styles.chatListTitle, { color: theme.subTextColor }]}>
            共 {sortedChats.length} 个对话
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={styles.newChatBtn}
              onPress={() => { onImport(); onClose(); }}
            >
              <IconImport size={16} color={theme.accentColor} />
              <Text style={[styles.newChatBtnText, { color: theme.accentColor }]}>导入</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.newChatBtn}
              onPress={() => { onNewChat(); onClose(); }}
            >
              <IconPlus size={16} color={theme.accentColor} />
              <Text style={[styles.newChatBtnText, { color: theme.accentColor }]}>新对话</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* 直接渲染列表（不嵌套 ScrollView），由外层 menuList ScrollView 统一滚动 */}
        <View style={styles.chatListInner}>
          {sortedChats.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.subTextColor }]}>
              暂无对话，点击上方「新对话」创建
            </Text>
          ) : (
            sortedChats.map((chat) => {
              const isActive = chat.id === currentChatId;
              const isManual = chat.conversationType === 'manual';
              const isParent = chat.conversationType === 'parent';
              const isChild = chat.conversationType === 'child';
              const character = characters?.find((c) => c && c.id === chat.characterId);
              const hasCover = !!chat.coverImage;
              const hasWallpaper = !!chat.wallpaper;
              const hasBg = hasCover || hasWallpaper;
              const bgUri = chat.coverImage || chat.wallpaper;
              const avatarUri = chat.assistantAvatar || character?.avatar;
              const userAvatarUri = chat.userAvatar || userProfile?.avatar;
              const messageCount = (chat.messages || []).length;
              const lastMessage = chat.messages && chat.messages.length > 0
                ? chat.messages[chat.messages.length - 1]
                : null;
              const previewText = lastMessage
                ? (lastMessage.content || '').replace(/[>#*_`~\-]/g, '').slice(0, 50) || '（空消息）'
                : isParent ? '点击创建子对话开始聊天' : '暂无消息';

              return (
                <TouchableOpacity
                  key={chat.id}
                  style={[
                    styles.chatItem,
                    { borderBottomColor: theme.borderColor },
                  ]}
                  onPress={() => { onSelectChat(chat.id); onClose(); }}
                  activeOpacity={0.7}
                >
                  {hasCover && (
                    <Image
                      source={{ uri: chat.coverImage }}
                      style={styles.chatCoverBg}
                      resizeMode="cover"
                    />
                  )}
                  {hasWallpaper && !hasCover && (
                    <Image source={{ uri: chat.wallpaper }} style={styles.chatCoverBg} resizeMode="cover" />
                  )}
                  {hasBg && <View style={styles.chatCoverOverlay} />}
                  <View style={[
                    styles.chatItemInner,
                    { backgroundColor: isActive ? theme.accentColor + '20' : 'transparent' },
                  ]}>
                    <View style={styles.chatAvatarContainer}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.chatAvatar} resizeMode="cover" />
                      ) : (
                        <View style={[styles.chatAvatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                          <Text style={[styles.chatAvatarPlaceholderText, { color: theme.subTextColor }]}>
                            {(chat.title && chat.title.length ? chat.title.charAt(0) : '新')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.chatItemContent}>
                      <View style={styles.chatItemHeader}>
                        {chat.isPinned && <IconPin size={13} color={hasBg ? '#fff' : theme.accentColor} />}
                        {isManual && <IconBook size={13} color={hasBg ? 'rgba(255,255,255,0.8)' : theme.subTextColor} />}
                        {isParent && <IconFolder size={13} color={hasBg ? 'rgba(255,255,255,0.8)' : theme.subTextColor} />}
                        {isChild && <IconFile size={13} color={hasBg ? '#fff' : theme.accentColor} />}
                        <Text
                          style={[
                            styles.chatTitle,
                            {
                              color: hasBg ? '#fff' : (isActive ? theme.accentColor : theme.textColor),
                              fontWeight: isManual || isParent ? '600' : '500',
                            },
                          ]}
                          numberOfLines={1}
                        >
                          {chat.title || '新对话'}
                        </Text>
                      </View>
                      <Text
                        style={[styles.chatPreview, { color: hasBg ? 'rgba(255,255,255,0.85)' : theme.subTextColor }]}
                        numberOfLines={2}
                      >
                        {previewText}
                      </Text>
                      <View style={styles.chatItemFooter}>
                        <Text style={[styles.chatDate, { color: hasBg ? 'rgba(255,255,255,0.65)' : theme.subTextColor }]}>
                          {new Date(chat.updatedAt || chat.createdAt).toLocaleDateString()}
                        </Text>
                        <Text style={[styles.chatCount, { color: hasBg ? 'rgba(255,255,255,0.65)' : theme.subTextColor }]}>
                          {messageCount} 条
                        </Text>
                        {!isManual && (
                          <View style={styles.userAvatarWrapper}>
                            {userAvatarUri ? (
                              <Image source={{ uri: userAvatarUri }} style={styles.userAvatar} resizeMode="cover" />
                            ) : (
                              <View style={[styles.userAvatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                                <Text style={[styles.userAvatarPlaceholderText, { color: theme.subTextColor }]}>
                                  {(userProfile?.username && userProfile.username.length ? userProfile.username.charAt(0) : 'U')}
                                </Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                    {!isManual && (
                      <View style={styles.chatItemRightBtns}>
                        <TouchableOpacity
                          style={styles.chatItemStarBtn}
                          onPress={(e) => { e.stopPropagation?.(); toggleChatFavorite(chat.id); }}
                          activeOpacity={0.7}
                        >
                          {chat.isFavorite ? (
                            <IconStar size={15} color="#ff6b9d" />
                          ) : (
                            <IconStarOutline size={15} color={hasBg ? 'rgba(255,255,255,0.8)' : theme.subTextColor} />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.chatItemMenuBtn}
                          onPress={(e) => { e.stopPropagation?.();
                            setActionChat(chat);
                            setShowChatActions(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <IconMenuDots size={15} color={hasBg ? 'rgba(255,255,255,0.8)' : theme.subTextColor} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>
    );
  };

  const manualChat = chats.find((c) => c.conversationType === 'manual');

  const menuItems: MenuItem[] = [
    {
      key: 'manual',
      title: '使用说明书',
      icon: (color: string, size: number) => <IconBook size={size} color={color} />,
      expandable: false,
      onPress: () => { if (manualChat) { onSelectChat(manualChat.id); onClose(); } },
    },
    {
      key: 'chatHistory',
      title: '对话历史',
      icon: (color: string, size: number) => <IconChatHistory size={size} color={color} />,
      expandable: true,
      rightText: `${chats.filter((c) => c.conversationType !== 'child' && isConversationHistoryChat(c)).length}`,
      expandedContent: renderChatList(),
    },
    {
      key: 'characterCards',
      title: '角色卡获取',
      icon: (color: string, size: number) => <IconCharacters size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          <TouchableOpacity 
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { toggleItem('characterCards'); onNavigate('characterBrowser'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>浏览角色卡库</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.expandedItem}
            onPress={() => { toggleItem('characterCards'); onNavigate('browser'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>内置浏览器获取</Text>
          </TouchableOpacity>
        </View>
      ),
    },
    {
      key: 'groupChat',
      title: '群聊',
      icon: (color: string, size: number) => <IconCommunity size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('groupChat'),
    },
    {
      key: 'favoriteMessages',
      title: '收藏消息',
      icon: (color: string, size: number) => <IconFavoriteMsg size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('favoriteMessages'),
    },
    {
      key: 'favoriteChats',
      title: '收藏对话',
      icon: (color: string, size: number) => <IconFavoriteChat size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('favoriteChats'),
    },
    {
      key: 'worldBookOrganizer',
      title: '世界观整理工具',
      icon: (color: string, size: number) => <IconWorldBook size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { toggleItem('worldBookOrganizer'); onNavigate('worldbookEditor'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>世界书管理（增删改条目）</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.expandedItem}
            onPress={() => { toggleItem('worldBookOrganizer'); onNavigate('worldBookOrganizer'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>对话世界观整理</Text>
          </TouchableOpacity>
        </View>
      ),
    },
    {
      key: 'fancyToolBox',
      title: '花式工具箱',
      icon: (color: string, size: number) => <IconToolbox size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('fancyToolBox'),
    },
    {
      key: 'mediaLibrary',
      title: '素材库',
      icon: (color: string, size: number) => <IconImage size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('mediaLibrary'),
    },
    {
      key: 'customInterface',
      title: '自定义界面',
      icon: (color: string, size: number) => <IconEdit size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('customInterface'),
    },
    {
      key: 'community',
      title: '鲵吞亭社区',
      icon: (color: string, size: number) => <IconCommunity size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('community'),
    },
    {
      key: 'importCard',
      title: '导入对话卡片',
      icon: (color: string, size: number) => <IconImport size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('importCard'),
    },
    {
      key: 'eraGame',
      title: 'ERA 游戏库',
      icon: (color: string, size: number) => <IconGame size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('eraGame'),
    },
    {
      key: 'profile',
      title: '个人资料',
      icon: (color: string, size: number) => <IconUser size={size} color={color} />,
      expandable: false,
      onPress: () => onNavigate('profile'),
    },
  ];

  const settingsItems: MenuItem[] = [
    {
      key: 'appearance',
      title: '主题与外观',
      icon: (color: string, size: number) => <IconPalette size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={toggleTheme}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.expandedItemText, { color: theme.textColor }]}>
                切换{isDark ? '日间' : '夜间'}模式
              </Text>
              {isDark ? <IconMoon size={16} color={theme.accentColor} /> : <IconSun size={16} color={theme.accentColor} />}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { onClose(); onNavigate('themeSettings'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>主题颜色配置</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { onClose(); onNavigate('settings', 'appearance'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>外观模式</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { onClose(); onNavigate('settings', 'buttons'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>按钮图标自定义</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { onClose(); onNavigate('settings', 'aiThinking'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>AI思考中自定义</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { onClose(); onNavigate('settings', 'display'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>显示设置</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { onClose(); onNavigate('settings', 'input'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>输入框美化</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem]}
            onPress={() => { onClose(); onNavigate('settings', 'splash'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>开屏动画</Text>
          </TouchableOpacity>
        </View>
      ),
    },
    {
      key: 'quickCommands',
      title: '快捷指令',
      icon: (color: string, size: number) => <IconZap size={size} color={color} />,
      expandable: false,
      onPress: () => { onClose(); onNavigate('settings'); },
    },
    {
      key: 'webSearch',
      title: '联网搜索',
      icon: (color: string, size: number) => <IconGlobe size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          <View style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.expandedItemText, { color: theme.textColor }]}>启用联网搜索</Text>
              <Switch
                value={settings.webSearchEnabled}
                onValueChange={(v) => setSettings({ ...settings, webSearchEnabled: v })}
                trackColor={{ false: theme.borderColor, true: theme.accentColor }}
              />
            </View>
          </View>
        </View>
      ),
    },
    {
      key: 'user',
      title: '用户与隐私',
      icon: (color: string, size: number) => <IconUser size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          <TouchableOpacity
            style={[styles.expandedItem]}
            onPress={async () => {
              try { await exportAllDataWithMedia(); showAlert('导出成功', '所有数据（含素材）已导出'); } catch { showAlert('导出失败', '请重试'); }
            }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>导出所有数据</Text>
          </TouchableOpacity>
        </View>
      ),
    },
    {
      key: 'ai',
      title: 'AI 与模型',
      icon: (color: string, size: number) => <IconAI size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          <TouchableOpacity 
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { onClose(); onNavigate('aiProvider'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>AI 提供商管理</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.expandedItem}
            onPress={() => { onClose(); onNavigate('settings'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>模型参数配置</Text>
          </TouchableOpacity>
        </View>
      ),
    },
    {
      key: 'display',
      title: '显示与聊天气泡',
      icon: (color: string, size: number) => <IconGlobe size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          {/* 气泡皮肤选择 */}
          <Text style={[styles.sectionLabel, { color: theme.subTextColor, marginBottom: 6 }]}>气泡皮肤</Text>
          <TouchableOpacity
            style={[
              styles.expandedItem,
              { borderBottomColor: theme.borderColor },
              settings.display.bubbleStyle === 'default' && { backgroundColor: theme.accentColor + '20' },
            ]}
            onPress={() => setSettings({ ...settings, display: { ...settings.display, bubbleStyle: 'default' } })}
          >
            <View style={styles.bubbleOptionRow}>
              <Text style={[styles.expandedItemText, { color: theme.textColor }]}>默认</Text>
              {settings.display.bubbleStyle === 'default' && <IconChevronRight size={16} color={theme.accentColor} />}
            </View>
            <Text style={[styles.bubbleOptionDesc, { color: theme.subTextColor }]}>简洁纯色气泡，沉浸阅读</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.expandedItem,
              { borderBottomColor: theme.borderColor },
              settings.display.bubbleStyle === 'fresh_green' && { backgroundColor: theme.accentColor + '20' },
            ]}
            onPress={() => setSettings({ ...settings, display: { ...settings.display, bubbleStyle: 'fresh_green' } })}
          >
            <View style={styles.bubbleOptionRow}>
              <Text style={[styles.expandedItemText, { color: theme.textColor }]}>清新绿</Text>
              {settings.display.bubbleStyle === 'fresh_green' && <IconChevronRight size={16} color={theme.accentColor} />}
            </View>
            <Text style={[styles.bubbleOptionDesc, { color: theme.subTextColor }]}>绿色系气泡，清新自然</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.expandedItem,
              settings.display.bubbleStyle === 'transparent' && { backgroundColor: theme.accentColor + '20' },
            ]}
            onPress={() => setSettings({ ...settings, display: { ...settings.display, bubbleStyle: 'transparent' } })}
          >
            <View style={styles.bubbleOptionRow}>
              <Text style={[styles.expandedItemText, { color: theme.textColor }]}>透明</Text>
              {settings.display.bubbleStyle === 'transparent' && <IconChevronRight size={16} color={theme.accentColor} />}
            </View>
            <Text style={[styles.bubbleOptionDesc, { color: theme.subTextColor }]}>完全透明背景，极简风格</Text>
          </TouchableOpacity>

          {/* 显示选项 */}
          <Text style={[styles.sectionLabel, { color: theme.subTextColor, marginTop: 12, marginBottom: 6 }]}>显示选项</Text>
          <View style={[styles.settingRow, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingRowText, { color: theme.textColor }]}>显示头像</Text>
            <Switch
              value={settings.display.showAvatar}
              onValueChange={(v) => setSettings({ ...settings, display: { ...settings.display, showAvatar: v } })}
            />
          </View>
          <View style={[styles.settingRow, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingRowText, { color: theme.textColor }]}>显示时间戳</Text>
            <Switch
              value={settings.display.showTimestamp}
              onValueChange={(v) => setSettings({ ...settings, display: { ...settings.display, showTimestamp: v } })}
            />
          </View>
          <View style={[styles.settingRow, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingRowText, { color: theme.textColor }]}>显示首 Token 时间</Text>
            <Switch
              value={settings.display.showFirstTokenTime}
              onValueChange={(v) => setSettings({ ...settings, display: { ...settings.display, showFirstTokenTime: v } })}
            />
          </View>
          <View style={[styles.settingRow, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingRowText, { color: theme.textColor }]}>显示消息字数</Text>
            <Switch
              value={settings.display.showMessageWordCount}
              onValueChange={(v) => setSettings({ ...settings, display: { ...settings.display, showMessageWordCount: v } })}
            />
          </View>
          <View style={[styles.settingRow, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingRowText, { color: theme.textColor }]}>显示 Token 用量</Text>
            <Switch
              value={settings.display.showTokenUsage}
              onValueChange={(v) => setSettings({ ...settings, display: { ...settings.display, showTokenUsage: v } })}
            />
          </View>
          <View style={[styles.settingRow]}>
            <Text style={[styles.settingRowText, { color: theme.textColor }]}>显示模型名称</Text>
            <Switch
              value={settings.display.showModelName}
              onValueChange={(v) => setSettings({ ...settings, display: { ...settings.display, showModelName: v } })}
            />
          </View>

          {/* 手势设置 */}
          <Text style={[styles.sectionLabel, { color: theme.subTextColor, marginTop: 12, marginBottom: 6 }]}>手势</Text>
          <View style={[styles.settingRow, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.settingRowText, { color: theme.textColor }]}>左右滑开启菜单</Text>
            <Switch
              value={settings.swipeGesturesEnabled}
              onValueChange={(v) => setSettings({ ...settings, swipeGesturesEnabled: v })}
              trackColor={{ false: theme.borderColor, true: theme.accentColor }}
            />
          </View>
        </View>
      ),
    },
    {
      key: 'data',
      title: '数据与备份',
      icon: (color: string, size: number) => <IconDatabase size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={async () => {
              try {
                // 用 */* 兜底：Android 文件管理器对 .json 的 MIME 识别不一致，数组格式在部分机型选不到文件
                const result = await DocumentPicker.getDocumentAsync({
                  type: '*/*',
                  copyToCacheDirectory: true,
                });
                if (result.canceled || !result.assets || result.assets.length === 0) return;
                const file = result.assets[0];
                // expo-file-system/legacy 保证所有 API 可用（含 readAsStringAsync / copyAsync）
                let content: string;
                try {
                  content = await FileSystem.readAsStringAsync(file.uri);
                } catch (readErr) {
                  // content:// URI 情况下 fallback：手动复制到 cache 再读
                  try {
                    const cacheUri = `${(FileSystem as any).cacheDirectory}import_temp_${Date.now()}.json`;
                    await FileSystem.copyAsync({ from: file.uri, to: cacheUri });
                    content = await FileSystem.readAsStringAsync(cacheUri);
                    FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
                  } catch (copyErr) {
                    showAlert('导入失败', '无法读取文件：' + ((copyErr as Error)?.message || (readErr as Error)?.message || '未知错误'));
                    return;
                  }
                }
                if (!content || content.trim().length === 0) {
                  showAlert('导入失败', '文件内容为空');
                  return;
                }
                const beforeCount = chats.length;
                const success = await importAllData(content);
                // 导入后从存储重新读取确认实际对话数
                const afterChats = await storage.getChats();
                showAlert(
                  success ? '导入完成' : '导入失败',
                  success
                    ? `导入前: ${beforeCount} 条对话\n当前: ${afterChats.length} 条对话\n数据已保存，重启后仍会保留`
                    : '文件格式不正确或缺少 version 字段',
                );
              } catch (e: any) {
                showAlert('导入失败', e?.message || '未知错误');
              }
            }}
          >
            <View style={styles.bubbleOptionRow}>
              <Text style={[styles.expandedItemText, { color: theme.textColor }]}>导入数据文件</Text>
              <IconImport size={16} color={theme.accentColor} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={async () => {
              try {
                const data = await exportAllDataWithMedia();
                const documentDir = (FileSystem as any).documentDirectory || '';
                const fileUri = documentDir + `ai_tavern_backup_${Date.now()}.json`;
                await FileSystem.writeAsStringAsync(fileUri, data, { encoding: FileSystem.EncodingType.UTF8 });
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(fileUri);
                } else {
                  showAlert('导出成功', `已导出到: ${fileUri}`);
                }
              } catch (e: any) {
                showAlert('导出失败', e?.message || '未知错误');
              }
            }}
          >
            <View style={styles.bubbleOptionRow}>
              <Text style={[styles.expandedItemText, { color: theme.textColor }]}>导出全部数据</Text>
              <IconDownload size={16} color={theme.accentColor} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={() => { onClose(); onNavigate('recycleBin'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>回收站</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.expandedItem]}
            onPress={() => { onClose(); onNavigate('systemCheck'); }}
          >
            <Text style={[styles.expandedItemText, { color: theme.textColor }]}>系统检查</Text>
          </TouchableOpacity>
        </View>
      ),
    },
    {
      key: 'backup',
      title: '本地备份与恢复',
      icon: (color: string, size: number) => <IconDatabase size={size} color={color} />,
      expandable: true,
      expandedContent: (
        <View style={[styles.expandedContent, { backgroundColor: theme.secondaryColor }]}>
          <TouchableOpacity
            style={[styles.expandedItem, { borderBottomColor: theme.borderColor }]}
            onPress={async () => {
              if (backupLoading) return;
              try {
                setBackupLoading(true);
                const backups = await getFullBackups();
                if (!backups || backups.length === 0) {
                  setBackupLoading(false);
                  showAlert('暂无备份', '还没有任何本地备份文件。每次对话结束后会自动创建备份，也可以点击「立即创建备份」。');
                  return;
                }
                const list = backups.map((b: any) => {
                  const cnt = typeof b.chatCount === 'number' ? b.chatCount : ((b.chats || [])?.length || 0);
                  const srcTag = b.source === 'file' ? '[文件]' : (b.source === 'asyncstorage' ? '[内置]' : '');
                  const sizeTag = typeof b.size === 'number' && b.size > 0 ? ` · ${(b.size / 1024).toFixed(1)}KB` : '';
                  return {
                    key: String(b.timestamp),
                    timestamp: b.timestamp,
                    chatCount: cnt,
                    label: `${srcTag} ${new Date(b.timestamp).toLocaleString('zh-CN')} · ${cnt} 对话${sizeTag}`,
                  };
                });
                setBackupPickerList(list);
                setShowBackupPicker(true);
                setBackupLoading(false);
              } catch (e: any) {
                setBackupLoading(false);
                showAlert('错误', '无法读取备份列表：' + (e?.message || ''));
              }
            }}
          >
            <View style={styles.bubbleOptionRow}>
              <Text style={[styles.expandedItemText, { color: theme.textColor }]}>
                {backupLoading ? '正在读取备份列表...' : '从本地备份恢复'}
              </Text>
              <IconFolder size={16} color={theme.accentColor} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.expandedItem}
            disabled={backupLoading}
            onPress={async () => {
              if (backupLoading) return;
              try {
                setBackupLoading(true);
                const success = await createManualBackup();
                setBackupLoading(false);
                if (success) {
                  showAlert('备份成功', '当前数据已完整备份到本地（包含对话/主题/供应商/世界书/角色卡/预设）。');
                } else {
                  showAlert('备份失败', '请重试');
                }
              } catch {
                setBackupLoading(false);
                showAlert('备份失败', '请重试');
              }
            }}
          >
            <Text style={[styles.expandedItemText, { color: backupLoading ? theme.subTextColor : theme.textColor }]}>
              {backupLoading ? '正在备份...' : '立即创建备份'}
            </Text>
          </TouchableOpacity>
        </View>
      ),
    },
    {
      key: 'about',
      title: '关于',
      icon: (color: string, size: number) => <IconBook size={size} color={color} />,
      expandable: false,
      onPress: () => {
        showAlert('鲵吞亭 AI', '版本 3.8.0\n\n一个本地化的 AI 角色扮演应用\n\n所有数据存储在本地设备');
      },
    },
  ];

  return (
    <>
    <View style={[styles.container, { backgroundColor: theme.menuBgColor }]} {...panResponder.panHandlers}>
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.headerTabs}>
          <TouchableOpacity 
            style={[styles.headerTab, activeTab === 'menu' && { borderBottomColor: theme.accentColor }]}
            onPress={() => setActiveTab('menu')}
          >
            <Text style={{ color: activeTab === 'menu' ? theme.accentColor : theme.textColor, fontSize: 16, fontWeight: activeTab === 'menu' ? '600' : '400' }}>菜单</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerTab, activeTab === 'settings' && { borderBottomColor: theme.accentColor }]}
            onPress={() => setActiveTab('settings')}
          >
            <Text style={{ color: activeTab === 'settings' ? theme.accentColor : theme.textColor, fontSize: 16, fontWeight: activeTab === 'settings' ? '600' : '400' }}>设置</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerTab, activeTab === 'server' && { borderBottomColor: theme.accentColor }]}
            onPress={() => setActiveTab('server')}
            activeOpacity={0.7}
          >
            <Ionicons name="cloud-outline" size={18} color={activeTab === 'server' ? theme.accentColor : theme.textColor} />
            <Text style={{ color: activeTab === 'server' ? theme.accentColor : theme.textColor, fontSize: 16, fontWeight: activeTab === 'server' ? '600' : '400' }}>服务器</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconClose size={22} color={theme.textColor} />
        </TouchableOpacity>
      </View>

      <View style={[styles.userSection, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.avatarContainer}>
          {settings.userProfile?.avatar ? (
            <Image source={{ uri: settings.userProfile.avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.avatarText, { color: theme.accentColor }]}>
                {isLoggedIn && currentUser ? (currentUser.nickname && currentUser.nickname.length ? currentUser.nickname.charAt(0) : '昵') : (settings.userProfile?.username && settings.userProfile.username.length ? settings.userProfile.username.charAt(0) : '用')}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: theme.textColor }]}>
            {isLoggedIn && currentUser ? currentUser.nickname : (settings.userProfile?.username || '用户')}
            {isLoggedIn && currentUser?.isGuest && (
              <Text style={{ color: theme.subTextColor, fontSize: 12 }}> （游客）</Text>
            )}
            {isLoggedIn && currentUser?.isAdmin && !currentUser?.isGuest && (
              <Text style={{ color: theme.accentColor, fontSize: 12, marginLeft: 4 }}> 管理员</Text>
            )}
          </Text>
          {isLoggedIn && currentUser && !currentUser.isGuest && (
            <View style={styles.userMetaRow}>
              <View style={[styles.userBadge, { backgroundColor: theme.secondaryColor }]}>
                <Text style={[styles.userBadgeText, { color: theme.subTextColor }]}>UID </Text>
                <Text style={[styles.userBadgeText, { color: theme.textColor, fontWeight: 'bold' }]}>{currentUser.uid ?? '-'}</Text>
              </View>
              <View style={[styles.pointsBadge, { backgroundColor: '#ffe9b0' }]}>
                <Text style={[styles.userBadgeText, { color: '#8a5a00', fontWeight: 'bold' }]}>
                  ♦ {typeof currentUser.points === 'number' ? currentUser.points : 0}
                </Text>
              </View>
            </View>
          )}
          <Text style={[styles.userNumber, { color: theme.subTextColor }]}>
            {isLoggedIn && currentUser
              ? `账号: ${currentUser.username}`
              : '未登录 · 需登录后使用社区/好友/积分等功能'}
          </Text>
          {isLoggedIn && currentUser && !currentUser.isGuest && (
            <TouchableOpacity
              style={[
                styles.checkInBtn,
                {
                  backgroundColor: todayChecked ? theme.secondaryColor : theme.accentColor,
                  borderColor: todayChecked ? theme.borderColor : theme.accentColor,
                },
              ]}
              onPress={handleCheckIn}
              disabled={todayChecked || checkInLoading}
            >
              <Text style={{ color: todayChecked ? theme.subTextColor : '#fff', fontSize: 12, fontWeight: '600' }}>
                {checkInLoading ? '签到中...' : todayChecked ? '今日已签到' : '每日签到'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {isLoggedIn && (
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: theme.borderColor }]}
            onPress={() => {
              showAlert('退出登录', '确认要退出当前账号吗？', {
                confirmText: '确认退出',
                cancelText: '取消',
                onConfirm: async () => {
                  try { await logout(); } catch { /* ignore */ }
                },
              });
            }}
          >
            <IconClose size={14} color={theme.subTextColor} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.menuList} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" nestedScrollEnabled={true}>
        {activeTab === 'menu' ? (
          <View>
            {menuItems.map((item) => (
              <View key={item.key}>
                <TouchableOpacity 
                  style={[
                    styles.menuItem,
                    { borderBottomColor: theme.borderColor },
                    item.disabled && { opacity: 0.5 }
                  ]}
                  onPress={() => {
                    if (item.expandable) {
                      toggleItem(item.key);
                    } else if (item.onPress) {
                      item.onPress();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIconWrap}>
                      {item.icon(theme.textColor, 22)}
                    </View>
                    <Text style={[styles.menuTitle, { color: item.disabled ? theme.subTextColor : theme.textColor }]}>
                      {item.title}
                    </Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    {item.rightText && (
                      <Text style={[styles.menuRightText, { color: theme.subTextColor }]}>{item.rightText}</Text>
                    )}
                    {item.expandable && (
                      expandedItems.has(item.key) 
                        ? <IconChevronDown size={18} color={theme.subTextColor} />
                        : <IconChevronRight size={18} color={theme.subTextColor} />
                    )}
                  </View>
                </TouchableOpacity>
                {item.expandable && expandedItems.has(item.key) && item.expandedContent}
              </View>
            ))}

            <TouchableOpacity 
              style={[styles.menuItem, { borderBottomColor: theme.borderColor }]}
              onPress={() => onNavigate('recycleBin')}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View style={styles.menuIconWrap}>
                  <IconTrash size={22} color={theme.textColor} />
                </View>
                <Text style={[styles.menuTitle, { color: theme.textColor }]}>回收站</Text>
              </View>
              <IconChevronRight size={18} color={theme.subTextColor} />
            </TouchableOpacity>
          </View>
        ) : activeTab === 'server' ? (
          <View>
            {/* 社区服务器设置 */}
            <View style={[styles.serverSettingSection, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
              <View style={styles.serverSettingHeader}>
                <Ionicons name="cloud-outline" size={18} color={theme.accentColor} />
                <Text style={[styles.serverSettingTitle, { color: theme.textColor }]}>社区服务器</Text>
                {serverStatus === 'ok' && <Text style={{ color: '#4caf50', fontSize: 12 }}>● 已连接</Text>}
                {serverStatus === 'fail' && <Text style={{ color: '#f44336', fontSize: 12 }}>● 连接失败</Text>}
                {serverStatus === 'testing' && <Text style={{ color: theme.subTextColor, fontSize: 12 }}>测试中…</Text>}
              </View>
              <TextInput
                style={[styles.serverUrlInput, { color: theme.textColor, borderColor: theme.borderColor, backgroundColor: theme.primaryColor }]}
                value={serverUrlInput}
                onChangeText={setServerUrlInput}
                placeholder="http://192.168.x.x:3000"
                placeholderTextColor={theme.subTextColor}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={[styles.serverUrlHint, { color: theme.subTextColor }]}>
                同WiFi填局域网IP；异地填Tailscale地址。端口默认3000。
              </Text>
              <View style={styles.serverBtnRow}>
                <TouchableOpacity
                  style={[styles.serverTestBtn, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                  onPress={handleTestServerUrl}
                >
                  <Text style={{ color: theme.textColor, fontSize: 13 }}>测试连接</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.serverSaveBtn, { backgroundColor: theme.accentColor }]}
                  onPress={handleSaveServerUrl}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>保存地址</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 连接状态详情 */}
            <View style={[styles.serverSettingSection, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor, marginTop: 12 }]}>
              <View style={styles.serverSettingHeader}>
                <Ionicons name="information-circle-outline" size={18} color={theme.accentColor} />
                <Text style={[styles.serverSettingTitle, { color: theme.textColor }]}>连接说明</Text>
              </View>
              <Text style={[styles.serverUrlHint, { color: theme.subTextColor, lineHeight: 22 }]}>
                1. 同 WiFi：填局域网 IP（如 192.168.1.x:3000）
                {"\n"}2. 异地：填 Tailscale 地址（如 100.x.x.x:3000）
                {"\n"}3. 电脑需先运行 打开服务器.bat
              </Text>
            </View>
          </View>
        ) : (
          <View>
            {settingsItems.map((item) => (
              <View key={item.key}>
                <TouchableOpacity 
                  style={[
                    styles.menuItem,
                    { borderBottomColor: theme.borderColor },
                  ]}
                  onPress={() => {
                    if (item.expandable) {
                      toggleItem(item.key);
                    } else if (item.onPress) {
                      item.onPress();
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuItemLeft}>
                    <View style={styles.menuIconWrap}>
                      {item.icon(theme.textColor, 22)}
                    </View>
                    <Text style={[styles.menuTitle, { color: theme.textColor }]}>
                      {item.title}
                    </Text>
                  </View>
                  <View style={styles.menuItemRight}>
                    {item.expandable && (
                      expandedItems.has(item.key) 
                        ? <IconChevronDown size={18} color={theme.subTextColor} />
                        : <IconChevronRight size={18} color={theme.subTextColor} />
                    )}
                  </View>
                </TouchableOpacity>
                {item.expandable && expandedItems.has(item.key) && item.expandedContent}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.statusBar, { borderTopColor: theme.borderColor }]}>
        <View style={styles.statusItem}>
          <Text style={[styles.statusValue, { color: theme.textColor }]}>{currentTime}</Text>
          <Text style={[styles.statusLabel, { color: theme.subTextColor }]}>时间</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={[styles.statusValue, { color: theme.textColor }]}>{chats.length}</Text>
          <Text style={[styles.statusLabel, { color: theme.subTextColor }]}>对话</Text>
        </View>
        <View style={styles.statusItem}>
          <Text style={[styles.statusValue, { color: theme.textColor }]}>正常</Text>
          <Text style={[styles.statusLabel, { color: theme.subTextColor }]}>状态</Text>
        </View>
        <TouchableOpacity 
          style={styles.statusItem}
          onPress={toggleTheme}
          activeOpacity={0.7}
        >
          <View style={{ marginBottom: 2 }}>
            {isDark ? <IconMoon size={16} color={theme.accentColor} /> : <IconSun size={16} color={theme.accentColor} />}
          </View>
          <Text style={[styles.statusLabel, { color: theme.subTextColor }]}>
            {isDark ? '夜间' : '日间'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
    {/* 对话更多操作弹窗 — 与 ChatScreen 一致 */}
    <MessageActionSheet
      visible={showChatActions}
      onClose={() => setShowChatActions(false)}
      title="更多操作"
      actions={actionChat ? getChatActions(actionChat) : []}
      theme={theme}
    />
    {/* 备份列表选择弹窗 */}
    <MessageActionSheet
      visible={showBackupPicker}
      onClose={() => setShowBackupPicker(false)}
      title={`选择备份 · 共 ${backupPickerList.length} 份`}
      actions={backupPickerList.map((b) => ({
        label: b.label,
        onPress: async () => {
          setShowBackupPicker(false);
          setBackupLoading(true);
          try {
            const ok = await restoreFullFromBackup(b.timestamp);
            setBackupLoading(false);
            if (ok) {
              showAlert(
                '恢复成功',
                `已恢复 ${b.chatCount} 条对话，以及主题设置、供应商配置、世界书、角色卡、预设数据。\n\n建议完全退出 App 再打开以确保所有缓存刷新。`,
              );
            } else {
              showAlert('恢复失败', '备份可能损坏或版本不匹配');
            }
          } catch (err: any) {
            setBackupLoading(false);
            showAlert('恢复失败', err?.message || '请重试');
          }
        },
      }))}
      theme={theme}
    />
    {/* 编辑对话：直接改标题 */}
    <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
      <View style={styles.editModalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowEditModal(false)} />
        <View style={[styles.editModalSheet, { backgroundColor: theme.backgroundColor }]}>
          <View style={[styles.editModalHeader, { borderBottomColor: theme.borderColor }]}>
            <Text style={[styles.editModalTitle, { color: theme.textColor }]}>编辑对话</Text>
            <TouchableOpacity onPress={() => setShowEditModal(false)} style={{ padding: 6 }}>
              <IconClose size={20} color={theme.subTextColor} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16 }}>
            <Text style={[styles.editModalLabel, { color: theme.subTextColor }]}>标题</Text>
            <TextInput
              style={[styles.editModalInput, { color: theme.textColor, borderColor: theme.borderColor, backgroundColor: theme.secondaryColor }]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="输入对话标题"
              placeholderTextColor={theme.subTextColor + 'aa'}
            />
            <TouchableOpacity
              style={[styles.editModalSaveBtn, { backgroundColor: theme.accentColor, marginTop: 16 }]}
              onPress={saveEditChat}
            >
              <Text style={{ color: theme.buttonTextColor, fontWeight: '600' }}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>


    {/* 主题化弹窗（替代 Alert.alert） */}
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
    width: SCREEN_W * 0.85,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTabs: {
    flex: 1,
    flexDirection: 'row',
    gap: 24,
  },
  headerTab: {
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
    gap: 4,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
  },
  userNumber: {
    fontSize: 13,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  userBadgeText: {
    fontSize: 12,
  },
  pointsBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  checkInBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
  },
  logoutBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuList: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuIconWrap: {
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuRightText: {
    fontSize: 12,
  },
  expandedContent: {
    paddingLeft: 20,
    paddingVertical: 4,
  },
  expandedItem: {
    paddingVertical: 12,
    // 图标/文字之前贴着抽屉左边缘，太靠外；加一点内缩
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  expandedItemText: {
    fontSize: 14,
  },
  chatListContainer: {
    marginHorizontal: 0,
    marginVertical: 0,
    borderRadius: 0,
    overflow: 'hidden',
  },
  chatListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  chatListTitle: {
    fontSize: 12,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newChatBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  chatListInner: {
    // 不设 maxHeight，由外层 ScrollView 统一滚动
  },
  chatItem: {
    borderBottomWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  chatCoverBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  chatCoverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  chatItemInner: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  chatAvatarContainer: {
    marginRight: 12,
  },
  chatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  chatAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatAvatarPlaceholderText: {
    fontSize: 16,
    fontWeight: '600',
  },
  chatItemContent: {
    flex: 1,
    minWidth: 0,
  },
  chatItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 3,
  },
  chatTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  chatPreview: {
    fontSize: 12,
    marginBottom: 5,
    lineHeight: 17,
  },
  chatItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chatDate: {
    fontSize: 11,
  },
  chatCount: {
    fontSize: 11,
  },
  userAvatarWrapper: {
    marginLeft: 'auto',
  },
  userAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  userAvatarPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarPlaceholderText: {
    fontSize: 10,
    fontWeight: '600',
  },
  chatItemRightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  chatItemStarBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chatItemMenuBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
  emptyText: {
    fontSize: 13,
    padding: 20,
    textAlign: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 4,
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusLabel: {
    fontSize: 10,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  settingRowText: {
    fontSize: 14,
  },
  bubbleOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bubbleOptionDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  // 对话编辑 Modal
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  editModalSheet: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  editModalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  editModalLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  editModalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  editModalSaveBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  // 社区服务器设置区块
  serverSettingSection: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  serverSettingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  serverSettingTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  serverUrlInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  serverUrlHint: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  serverBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  serverTestBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  serverSaveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },

});
