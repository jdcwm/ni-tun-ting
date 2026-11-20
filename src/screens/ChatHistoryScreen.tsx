import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Dimensions,
  Switch as RNSwitch,
  Alert,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('screen');
const { width: WINDOW_W, height: WINDOW_H } = Dimensions.get('window');
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { createChatFromCharacter } from '../context/AppContext';
import { Chat, Character } from '../types';
import { generateId, defaultChatSettings } from '../constants/defaults';
import { exportService } from '../services/exportService';
import { ActionSheet, ActionSheetAction } from '../components/ActionSheet';
import { ConfirmModal, ConfirmModalAction } from '../components/ConfirmModal';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import {
  IconStar, IconStarOutline, IconPin, IconBook, IconFolder, IconFile,
  IconSearch, IconClose, IconMenuDots,
} from '../components/Icons';
import { imageUtils } from '../utils/imageUtils';
import { isConversationHistoryChat } from '../utils/chatFilters';

const getExportDir = async (): Promise<string> => {
  const docDir = (FileSystem as any).documentDirectory;
  const cacheDir = (FileSystem as any).cacheDirectory;
  let dir = docDir || cacheDir || '';
  if (dir && !dir.endsWith('/')) dir += '/';
  return dir;
};

interface ChatHistoryProps {
  onSelectChat: (chatId: string) => void;
  currentChatId?: string;
  onNewChat?: () => void;
  filter?: 'all' | 'favorites';
  onClose?: () => void;
}

export const ChatHistoryScreen: React.FC<ChatHistoryProps> = ({ onSelectChat, currentChatId, onNewChat, filter = 'all', onClose }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { chats, setChats, toggleChatPin, toggleChatFavorite, fancyWorks, setFancyWorks, worldBooks, setWorldBooks, characters, setCharacters, userProfile } = useApp();
  const [editingChat, setEditingChat] = useState<Chat | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [longPressChatId, setLongPressChatId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [actionSheetActions, setActionSheetActions] = useState<ActionSheetAction[]>([]);
  const [actionSheetTitle, setActionSheetTitle] = useState('');
  const [actionSheetMessage, setActionSheetMessage] = useState('');

  const [showAlert, setShowAlert] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<'info' | 'warning' | 'error' | 'success'>('info');
  const [alertActions, setAlertActions] = useState<ConfirmModalAction[]>([]);

  // 封面编辑状态
  const [coverEditChat, setCoverEditChat] = useState<Chat | null>(null);
  const [coverEditUri, setCoverEditUri] = useState<string>('');
  const [coverCfg, setCoverCfg] = useState<{ offsetX: number; offsetY: number; scale: number }>({ offsetX: 0, offsetY: 0, scale: 1 });
  const [showCoverEditModal, setShowCoverEditModal] = useState(false);

  const showConfirm = (title: string, message: string, actions: ConfirmModalAction[], type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertActions(actions);
    setAlertType(type);
    setShowAlert(true);
  };

  const showInfo = (title: string, message: string) => {
    showConfirm(title, message, [{ label: '确定', onPress: () => {} }], 'info');
  };

  const showSuccess = (title: string, message: string) => {
    showConfirm(title, message, [{ label: '确定', onPress: () => {} }], 'success');
  };

  const showError = (title: string, message: string) => {
    showConfirm(title, message, [{ label: '确定', onPress: () => {} }], 'error');
  };

  const toggleParentExpand = (parentId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  const sortedChats = useMemo(() => {
    // 群聊 / 群内私聊不进对话历史（防御性兜底，白名单已在下一行排除）
    const sourceChats = (filter === 'favorites'
      ? chats.filter((c) => c.isFavorite)
      : chats
    ).filter(isConversationHistoryChat);
    const parentChats = sourceChats.filter((c) => c.conversationType === 'parent' || !c.conversationType || c.conversationType === 'manual');
    const childChats = sourceChats.filter((c) => c.conversationType === 'child');
    
    const result: Chat[] = [];
    const sortedParents = [...parentChats].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
    
    for (const parent of sortedParents) {
      result.push(parent);
      if (parent.conversationType === 'parent') {
        const children = childChats
          .filter((c) => c.parentId === parent.id)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        result.push(...children);
      }
    }
    
    return result;
  }, [chats]);

  const filteredChats = useMemo(() => {
    if (!searchText.trim()) return sortedChats;
    const query = searchText.toLowerCase();
    return sortedChats.filter((chat) => {
      if (chat.title.toLowerCase().includes(query)) return true;
      return chat.messages.some((m) => m.content.toLowerCase().includes(query));
    });
  }, [sortedChats, searchText]);

  const displayChats = useMemo(() => {
    const result: Chat[] = [];
    for (const chat of filteredChats) {
      if (chat.conversationType === 'child') {
        const parent = chats.find((c) => c.id === chat.parentId);
        if (parent && expandedParents.has(parent.id)) {
          result.push(chat);
        }
      } else {
        result.push(chat);
      }
    }
    return result;
  }, [filteredChats, expandedParents, chats]);

  // 预计算每个 parent 的子对话数量，避免 renderChatItem 中 O(n) filter
  const childCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of chats) {
      if (c.parentId) {
        map.set(c.parentId, (map.get(c.parentId) || 0) + 1);
      }
    }
    return map;
  }, [chats]);

  // 预计算 characterId → character 的查找映射
  const characterMap = useMemo(() => {
    const map = new Map<string, Character>();
    for (const c of characters || []) {
      if (c?.id) map.set(c.id, c);
    }
    return map;
  }, [characters]);

  const createNewChat = () => {
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
    setChats([newChat, ...chats]);
    onSelectChat(newChat.id);
  };

  const handleLongPress = (chat: Chat) => {
    setLongPressChatId(chat.id);
    const isParent = chat.conversationType === 'parent';
    const isChild = chat.conversationType === 'child';
    const isManual = chat.conversationType === 'manual';
    const conversationTypeText = isParent ? '取消母对话' : (isChild ? '取消子对话' : '设为母对话');

    const actions: ActionSheetAction[] = [
      { label: '编辑', onPress: () => openEditModal(chat) },
      { label: chat.isFavorite ? '取消收藏' : '收藏', onPress: () => toggleChatFavorite(chat.id) },
      { label: '设置封面', onPress: () => setChatCover(chat) },
      { label: '设置背景', onPress: () => setChatWallpaper(chat) },
      { label: '设置用户头像', onPress: () => setChatUserAvatar(chat) },
      { label: '设置AI头像', onPress: () => setChatAssistantAvatar(chat) },
      ...(isChild ? [{ label: '独立为对话', onPress: () => independentChildChat(chat) }] : []),
      ...(isManual ? [] : [{ label: conversationTypeText, onPress: () => toggleConversationType(chat) }]),
      ...(isManual ? [] : [{ label: chat.isPinned ? '取消置顶' : '置顶', onPress: () => toggleChatPin(chat.id) }]),
      { label: '导出为JSON', onPress: () => exportChatAsJSON(chat) },
      { label: '导出为Markdown', onPress: () => exportChatAsMarkdown(chat) },
      { label: '复制为Markdown', onPress: () => copyChatAsMarkdown(chat) },
      ...(isManual ? [] : [{ label: '删除', onPress: () => deleteChat(chat.id), destructive: true }]),
    ];
    
    setActionSheetTitle('操作');
    setActionSheetMessage(`对话：${chat.title}`);
    setActionSheetActions(actions);
    setShowActionSheet(true);
  };

  const setChatCover = async (chat: Chat) => {
    try {
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      setCoverEditChat(chat);
      setCoverEditUri(picked);
      setCoverCfg(chat.coverConfig || { offsetX: 0, offsetY: 0, scale: 1 });
      setShowCoverEditModal(true);
    } catch (error: any) {
      showError('设置失败', error.message || '未知错误');
    }
  };

  const saveCoverEdit = async () => {
    if (!coverEditChat || !coverEditUri) return;
    try {
      const savedUri = await imageUtils.saveImageToAppDir(coverEditUri, 'chat_cover');
      setChats(
        chats.map((c) =>
          c.id === coverEditChat.id ? { ...c, coverImage: savedUri, coverConfig: { ...coverCfg }, updatedAt: Date.now() } : c
        )
      );
      setShowCoverEditModal(false);
      setCoverEditChat(null);
      setCoverEditUri('');
      showSuccess('设置成功', '封面图片及显示区域已更新');
    } catch (error: any) {
      showError('保存失败', error.message || '未知错误');
    }
  };

  const setChatWallpaper = async (chat: Chat) => {
    try {
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'chat_wallpaper');
      setChats(
        chats.map((c) =>
          c.id === chat.id ? { ...c, wallpaper: savedUri, updatedAt: Date.now() } : c
        )
      );
      showSuccess('设置成功', '背景图片已更新');
    } catch (error: any) {
      showError('设置失败', error.message || '未知错误');
    }
  };

  const setChatUserAvatar = async (chat: Chat) => {
    try {
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'avatars');
      setChats(
        chats.map((c) =>
          c.id === chat.id ? { ...c, userAvatar: savedUri, updatedAt: Date.now() } : c
        )
      );
      showSuccess('设置成功', '用户头像已更新');
    } catch (error: any) {
      showError('设置失败', error.message || '未知错误');
    }
  };

  const setChatAssistantAvatar = async (chat: Chat) => {
    try {
      const picked = await imageUtils.pickImageFromGallery();
      if (!picked) return;
      const savedUri = await imageUtils.saveImageToAppDir(picked, 'avatars');
      setChats(
        chats.map((c) =>
          c.id === chat.id ? { ...c, assistantAvatar: savedUri, updatedAt: Date.now() } : c
        )
      );
      showSuccess('设置成功', 'AI头像已更新');
    } catch (error: any) {
      showError('设置失败', error.message || '未知错误');
    }
  };

  const independentChildChat = (chat: Chat) => {
    setChats(
      chats.map((c) =>
        c.id === chat.id
          ? { ...c, conversationType: undefined, parentId: undefined, updatedAt: Date.now() }
          : c
      )
    );
    setShowActionSheet(false);
    showSuccess('操作成功', '子对话已独立为普通对话');
  };

  const toggleConversationType = (chat: Chat) => {
    const currentType = chat.conversationType;
    let message: string;
    
    if (currentType === 'parent') {
      const childIds = chats.filter((c) => c.parentId === chat.id && c.conversationType === 'child').map((c) => c.id);
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
      message = childIds.length > 0
        ? `已取消母对话设置，${childIds.length} 个子对话已变为独立对话`
        : '已取消母对话设置，现在可以正常聊天';
    } else if (currentType === 'child') {
      setChats(
        chats.map((c) =>
          c.id === chat.id
            ? { ...c, conversationType: undefined, parentId: undefined, updatedAt: Date.now() }
            : c
        )
      );
      message = '已取消子对话设置，对话已独立';
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
      const parentChat = {
        ...chat,
        conversationType: 'parent' as const,
        messages: [],
        updatedAt: Date.now(),
      };
      const newChats = chats.map((c) => (c.id === chat.id ? parentChat : c));
      newChats.splice(newChats.findIndex((c) => c.id === chat.id) + 1, 0, childChat);
      setChats(newChats);
      message = '已设为母对话，原对话历史已转为子对话';
    }
    
    setShowActionSheet(false);
    showSuccess('设置成功', message);
  };

  const exportChatAsJSON = async (chat: Chat) => {
    try {
      const json = await exportService.exportChatToJSON(chat, worldBooks);
      const dir = await getExportDir();
      const safeTitle = chat.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
      const fileUri = `${dir}chat_${safeTitle}_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `导出对话：${chat.title}`,
          UTI: 'public.json',
        });
      } else {
        showSuccess('导出成功', `已导出到: ${fileUri}`);
      }
    } catch (error: any) {
      showError('导出失败', error.message || '未知错误');
    }
  };

  const exportChatAsMarkdown = async (chat: Chat) => {
    try {
      const md = exportService.exportChatToMarkdown(chat);
      const dir = await getExportDir();
      const safeTitle = chat.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
      const fileUri = `${dir}chat_${safeTitle}_${Date.now()}.md`;
      await FileSystem.writeAsStringAsync(fileUri, md);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        showSuccess('导出成功', `已导出到: ${fileUri}`);
      }
    } catch (error: any) {
      showError('导出失败', error.message || '未知错误');
    }
  };

  const copyChatAsMarkdown = (chat: Chat) => {
    const md = exportService.exportChatToMarkdown(chat);
    Clipboard.setStringAsync(md);
    showSuccess('已复制', '对话内容已复制为Markdown格式');
  };

  const handleImportChat = async () => {
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
      const imported = await exportService.importChatFromJSON(content);

      if (!imported) {
        showError('导入失败', '文件格式不正确');
        return;
      }

      const { chat: importedChat, worldBooks: importedWorldBooks } = imported;

      const newChat: Chat = {
        ...importedChat,
        id: generateId(),
        title: importedChat.title + ' (导入)',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      let newWorldBookIds = [...(newChat.worldBookIds || [])];
      let importedCount = 0;

      if (importedWorldBooks && importedWorldBooks.length > 0) {
        const updatedWorldBooks = [...worldBooks];
        
        for (const wb of importedWorldBooks) {
          const existingIndex = updatedWorldBooks.findIndex(w => w.name === wb.name);
          if (existingIndex >= 0) {
            const newId = generateId();
            const newWb = { ...wb, id: newId, name: wb.name + ' (导入)' };
            updatedWorldBooks.push(newWb);
            newWorldBookIds = newWorldBookIds.map(id => id === wb.id ? newId : id);
            importedCount++;
          } else {
            const newId = generateId();
            const newWb = { ...wb, id: newId };
            updatedWorldBooks.push(newWb);
            newWorldBookIds = newWorldBookIds.map(id => id === wb.id ? newId : id);
            importedCount++;
          }
        }
        
        newChat.worldBookIds = newWorldBookIds;
        setWorldBooks(updatedWorldBooks);
      }

      setChats([newChat, ...chats]);
      
      const msg = importedCount > 0 
        ? `已导入对话: ${newChat.title}\n同时导入了 ${importedCount} 本世界书`
        : `已导入对话: ${newChat.title}`;
      showSuccess('导入成功', msg);
    } catch (error: any) {
      showError('导入失败', error.message || '未知错误');
    }
  };

  // ============ 角色卡（JSON/PNG）导入 ============
  // 简化版 zlib inflate，用于解析 PNG zTXt/iTXt 压缩块
  const simpleInflateSync = (compressed: Uint8Array): Uint8Array => {
    let src = compressed;
    if (compressed.length >= 2 && compressed[0] === 0x78) {
      src = compressed.slice(2);
      if (src.length >= 4) src = src.slice(0, src.length - 4);
    }
    const output: number[] = [];
    let pos = 0;
    let bFinal = 0;
    while (pos < src.length && bFinal === 0) {
      if (pos >= src.length) break;
      const byte = src[pos];
      bFinal = byte & 0x01;
      const bType = (byte >> 1) & 0x03;
      pos++;
      if (bType === 0) {
        if (pos + 3 >= src.length) break;
        const len = src[pos] | (src[pos + 1] << 8);
        pos += 4;
        for (let i = 0; i < len && pos < src.length; i++, pos++) output.push(src[pos]);
        continue;
      }
      if (bType === 1) {
        // Fixed Huffman
        while (pos < src.length) {
          // collect 24 bits into bit buffer
          let bits = 0; let nbits = 0;
          for (let i = 0; i < 3 && pos + i < src.length; i++) { bits |= src[pos + i] << (i * 8); nbits += 8; }
          let bitPos = 0;
          let consumedWholeBytes = 0;
          const advance = (n: number) => { bitPos += n; while (bitPos >= 8) { bitPos -= 8; bits >>= 8; nbits -= 8; consumedWholeBytes++; } };
          let readBits = (n: number): number => {
            // load more if needed
            while (nbits < n && pos + consumedWholeBytes < src.length) {
              bits |= src[pos + consumedWholeBytes] << nbits;
              nbits += 8;
            }
            const mask = (1 << n) - 1;
            const r = bits & mask;
            advance(n);
            return r;
          };
          // loop via safe sentinel to avoid infinite
          const safety = output.length + 10_000_000;
          while (output.length < safety) {
            const code = readBits(7);
            let symbol = -1;
            if (code === -1) break;
            if (code >= 0 && code <= 23) { symbol = 256 + code; }
            else {
              const extraBit = readBits(1);
              if (extraBit === 1) { symbol = 0 + (code - 48); }
              else { symbol = 144 + (code - 0); }
            }
            if (symbol === 256) { pos += consumedWholeBytes; return new Uint8Array(output); }
            if (symbol < 256) { output.push(symbol); continue; }
            // length-distance pair
            const lenIdx = symbol - 257;
            const lenBases = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
            const lenExtras = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
            let length = lenBases[lenIdx] + readBits(lenExtras[lenIdx]);
            const distCode = readBits(5);
            const distBases = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
            const distExtras = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
            const dist = distBases[distCode] + readBits(distExtras[distCode]);
            const start = output.length - dist;
            for (let i = 0; i < length; i++) output.push(output[start + i]);
          }
          pos += consumedWholeBytes;
          break;
        }
        continue;
      }
      // 不支持动态 Huffman，直接返回已解压部分
      break;
    }
    return new Uint8Array(output);
  };

  const bytesToStr = (b: Uint8Array): string => {
    let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    try { return decodeURIComponent(escape(s)); } catch { return s; }
  };
  const strToBytes = (s: string): Uint8Array => {
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
    return b;
  };
  const b64Encode = (bytes: Uint8Array): string => {
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += ABC[(n >> 18) & 63] + ABC[(n >> 12) & 63] + (i + 1 < bytes.length ? ABC[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? ABC[n & 63] : '=');
    }
    return out;
  };
  const b64Decode = (s: string): Uint8Array => {
    const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const idx = new Uint8Array(256); for (let i = 0; i < ABC.length; i++) idx[ABC.charCodeAt(i)] = i;
    const str = s.replace(/\s+/g, '').replace(/=+$/, '');
    const out: number[] = [];
    for (let i = 0; i < str.length; i += 4) {
      const a = idx[str.charCodeAt(i)] || 0;
      const b = i + 1 < str.length ? (idx[str.charCodeAt(i + 1)] || 0) : 0;
      const c = i + 2 < str.length ? (idx[str.charCodeAt(i + 2)] || 0) : 0;
      const d = i + 3 < str.length ? (idx[str.charCodeAt(i + 3)] || 0) : 0;
      const n = (a << 18) | (b << 12) | (c << 6) | d;
      out.push((n >> 16) & 0xff);
      if (i + 2 < str.length) out.push((n >> 8) & 0xff);
      if (i + 3 < str.length) out.push(n & 0xff);
    }
    return new Uint8Array(out);
  };

  // 解析 PNG 角色卡（返回 tavern card 对象）
  const parsePngCharacterCardSimple = async (uri: string): Promise<any> => {
    try {
      let bytes: Uint8Array;
      try {
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: (FileSystem as any).EncodingType?.Base64 ?? 'base64' });
        bytes = b64Decode(b64);
      } catch {
        return null;
      }
      if (bytes.length < 8 || bytes[0] !== 0x89) return null;
      const chunks: { type: string; data: Uint8Array }[] = [];
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
        const start = offset + 8;
        const dataBytes = bytes.slice(start, start + length);
        chunks.push({ type, data: dataBytes });
        if (type === 'IEND') break;
        offset += 12 + length;
      }
      type TextChunk = { keyword: string; data: string; compressed: boolean; rawData?: Uint8Array };
      const textChunks: TextChunk[] = [];
      for (const c of chunks) {
        if (c.type === 'tEXt') {
          const arr = c.data;
          let nul = -1;
          for (let i = 0; i < arr.length; i++) if (arr[i] === 0) { nul = i; break; }
          if (nul > 0) textChunks.push({ keyword: bytesToStr(arr.slice(0, nul)), data: bytesToStr(arr.slice(nul + 1)), compressed: false });
        } else if (c.type === 'zTXt') {
          const arr = c.data;
          let nul = -1;
          for (let i = 0; i < arr.length; i++) if (arr[i] === 0) { nul = i; break; }
          if (nul >= 0 && nul + 2 < arr.length) {
            textChunks.push({ keyword: bytesToStr(arr.slice(0, nul)), data: '', compressed: true, rawData: arr.slice(nul + 2) });
          }
        } else if (c.type === 'iTXt') {
          const arr = c.data;
          let p = 0;
          let nul1 = -1; for (let i = 0; i < arr.length; i++) if (arr[i] === 0) { nul1 = i; break; }
          if (nul1 < 0) continue;
          const keyword = bytesToStr(arr.slice(0, nul1));
          p = nul1 + 1;
          if (p + 2 > arr.length) continue;
          const compFlag = arr[p]; const compMethod = arr[p + 1];
          p += 2;
          let nul2 = -1; for (let i = p; i < arr.length; i++) if (arr[i] === 0) { nul2 = i; break; }
          if (nul2 < 0) continue;
          p = nul2 + 1;
          let nul3 = -1; for (let i = p; i < arr.length; i++) if (arr[i] === 0) { nul3 = i; break; }
          if (nul3 < 0) continue;
          const textBytes = arr.slice(nul3 + 1);
          if (compFlag === 1 && compMethod === 0) {
            try {
              const inflated = simpleInflateSync(textBytes);
              textChunks.push({ keyword, data: bytesToStr(inflated), compressed: false });
            } catch {
              textChunks.push({ keyword, data: '', compressed: true, rawData: textBytes });
            }
          } else {
            textChunks.push({ keyword, data: bytesToStr(textBytes), compressed: false });
          }
        }
      }
      // 解压 zTXt
      for (const tc of textChunks) {
        if (tc.compressed && tc.rawData) {
          try { tc.data = bytesToStr(simpleInflateSync(tc.rawData)); } catch {}
        }
      }
      const extractCard = (p: any): any => {
        if (!p) return null;
        if (p.spec === 'chara_card_v2' && p.data) {
          const d = p.data;
          return {
            name: d.name || '', description: d.description || '', personality: d.personality || '', scenario: d.scenario || '',
            first_mes: d.first_mes || '', mes_example: d.mes_example || '', system_prompt: d.system_prompt || '',
            post_history_instructions: d.post_history_instructions || '', alternate_greetings: d.alternate_greetings || [],
            tags: d.tags || [], creator: d.creator || '', character_version: d.character_version || '',
            creator_notes: d.creator_notes || '', extensions: d.extensions || {},
          };
        }
        if (p.name || p.description || p.personality || p.first_mes || p.firstMessage || p.greeting || p.system_prompt || p.systemPrompt) {
          return {
            name: p.name || '', description: p.description || p.desc || '', personality: p.personality || '',
            scenario: p.scenario || '', first_mes: p.first_mes || p.firstMessage || p.greeting || '',
            mes_example: p.mes_example || p.messageExample || p.exampleDialogue || '',
            system_prompt: p.system_prompt || p.systemPrompt || p.system || '',
            post_history_instructions: p.post_history_instructions || p.postHistoryInstructions || '',
            alternate_greetings: p.alternate_greetings || p.alternateGreetings || [],
            tags: p.tags || p.tag_list || [], creator: p.creator || p.author || '',
            character_version: p.character_version || '', creator_notes: p.creator_notes || p.creatorNotes || p.creator_comment || '',
          };
        }
        return null;
      };
      const tryJson = (t: string): any => {
        try { const p = JSON.parse(t); const e = extractCard(p); if (e) return e; } catch {}
        return null;
      };
      const tavern = textChunks.find(c => c.keyword === 'tavern');
      if (tavern && tavern.data) {
        const r = tryJson(tavern.data); if (r) return r;
      }
      const chara = textChunks.find(c => c.keyword === 'chara');
      if (chara && chara.data) {
        try { const decoded = bytesToStr(b64Decode(chara.data)); const r = tryJson(decoded); if (r) return r; } catch {}
        const r = tryJson(chara.data); if (r) return r;
      }
      const cv2 = textChunks.find(c => c.keyword === 'chara_card_v2');
      if (cv2 && cv2.data) {
        try { const decoded = bytesToStr(b64Decode(cv2.data)); const r = tryJson(decoded); if (r) return r; } catch {}
        const r = tryJson(cv2.data); if (r) return r;
      }
      const prom = textChunks.find(c => c.keyword === 'prompt');
      if (prom && prom.data) { const r = tryJson(prom.data); if (r) return r; }
      const ch = textChunks.find(c => c.keyword === 'character');
      if (ch && ch.data) { const r = tryJson(ch.data); if (r) return r; }
      // 扫描所有文本块做 tryParse
      for (const tc of textChunks) {
        if (!tc.data) continue;
        const r = tryJson(tc.data);
        if (r) return r;
      }
      return null;
    } catch {
      return null;
    }
  };

  // 把解析出来的卡对象（或 JSON 对象）转化为 Character 字段；返回 { character, cardSrc }
  const normalizeCharacterCard = (srcRaw: any, fallbackName?: string, fallbackAvatar?: string): import('../types').Character => {
    let src = srcRaw || {};
    if (src.spec === 'chara_card_v2' && src.data) src = src.data;
    const gid = generateId;
    const name = (src.name as string) || fallbackName || '未命名角色';
    const description = (src.description as string) || (src.desc as string) || '';
    const personality = (src.personality as string) || '';
    const scenario = (src.scenario as string) || '';
    const greeting = (src.first_mes as string) || (src.firstMessage as string) || (src.greeting as string) || '';
    const mesExample = (src.mes_example as string) || (src.messageExample as string) || (src.exampleDialogue as string) || '';
    const systemPrompt = (src.system_prompt as string) || (src.systemPrompt as string) || (src.system as string) || '';
    const postHistoryInstructions = (src.post_history_instructions as string) || (src.postHistoryInstructions as string) || '';
    const alternateGreetings = (src.alternate_greetings as string[]) || (src.alternateGreetings as string[]) || [];
    const tags = Array.isArray(src.tags) ? src.tags : (Array.isArray(src.tag_list) ? src.tag_list : []);
    const creator = (src.creator as string) || (src.author as string) || '';
    const characterVersion = (src.character_version as string) || '';
    const creatorNotes = (src.creator_notes as string) || (src.creatorNotes as string) || (src.creator_comment as string) || '';
    const userPersona = (src.user_persona as string) || (src.userPersona as string) || '';
    const summaryPrompt = (src.summary_prompt as string) || (src.summaryPrompt as string) || '';
    const prePrompt = (src.pre_prompt as string) || (src.prePrompt as string) || '';
    const postPrompt = (src.post_prompt as string) || (src.postPrompt as string) || '';
    const avatar = (srcRaw.avatar as string) || (srcRaw.image as string) || (srcRaw.avatar_url as string) || (src.image as string) || fallbackAvatar || '';
    const char: import('../types').Character = {
      id: gid(),
      name,
      description: description || personality || systemPrompt?.substring(0, 100) || '',
      tags,
      avatar,
      isFavorite: false,
      createdAt: Date.now(),
      systemPrompt: systemPrompt || personality || '',
      greeting: greeting || `你好，我是${name}，很高兴见到你。`,
      messageExample: mesExample,
      personality,
      scenario,
      creator,
      characterVersion,
      creatorNotes,
      alternateGreetings: Array.isArray(alternateGreetings) ? alternateGreetings : [],
      userPersona,
      summaryPrompt,
      prePrompt,
      postPrompt,
      firstMessage: greeting,
      mesExample,
      functionBar: postHistoryInstructions,
    };
    return char;
  };

  // 导入角色卡文件（PNG/JSON），既加入角色库，也创建一个新对话
  const handleImportCharacterCard = async () => {
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
        onSelectChat(newChat.id);
        showSuccess('导入成功', `已导入对话: ${newChat.title}`);
      } else if (result.characters.length > 0) {
        const existingNames = characters.map(c => c.name);
        result.characters.forEach((c) => {
          if (existingNames.includes(c.name)) {
            c.name = `${c.name} (${existingNames.filter(n => n === c.name).length + 1})`;
          }
        });
        await setCharacters([...characters, ...result.characters]);
        setChats([...result.chats, ...chats]);
        if (result.chats.length === 1) {
          onSelectChat(result.chats[0].id);
        }
        showSuccess('导入成功', `已导入 ${result.characters.length} 个角色卡，并创建对应对话`);
      }
    } catch (error: any) {
      showError('导入失败', error.message || '未知错误');
    }
  };

  // 将原 JSON 对话导入独立为内容版本，便于角色卡导入时复用
  const handleImportChatFromContent = async (content: string) => {
    try {
      const imported = await exportService.importChatFromJSON(content);
      if (!imported) { showError('导入失败', '文件格式不正确'); return; }
      const { chat: importedChat, worldBooks: importedWorldBooks } = imported;
      const newChat: Chat = {
        ...importedChat,
        id: generateId(),
        title: importedChat.title + ' (导入)',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      let newWorldBookIds = [...(newChat.worldBookIds || [])];
      let importedCount = 0;
      if (importedWorldBooks && importedWorldBooks.length > 0) {
        const updatedWorldBooks = [...worldBooks];
        for (const wb of importedWorldBooks) {
          const existingIndex = updatedWorldBooks.findIndex(w => w.name === wb.name);
          const newId = generateId();
          const newWb = { ...wb, id: newId, name: existingIndex >= 0 ? wb.name + ' (导入)' : wb.name };
          updatedWorldBooks.push(newWb);
          newWorldBookIds = newWorldBookIds.map(id => id === wb.id ? newId : id);
          importedCount++;
        }
        newChat.worldBookIds = newWorldBookIds;
        setWorldBooks(updatedWorldBooks);
      }
      setChats([newChat, ...chats]);
      const msg = importedCount > 0
        ? `已导入对话: ${newChat.title}\n同时导入了 ${importedCount} 本世界书`
        : `已导入对话: ${newChat.title}`;
      showSuccess('导入成功', msg);
    } catch (error: any) {
      showError('导入失败', error.message || '未知错误');
    }
  };

  const openEditModal = (chat: Chat) => {
    setEditingChat(chat);
    setEditTitle(chat.title);
    setShowEditModal(true);
  };

  const cloneChat = () => {
    if (!editingChat) return;
    const now = Date.now();
    const newChat: Chat = {
      ...editingChat,
      id: generateId(),
      title: editingChat.title + ' 副本',
      createdAt: now,
      updatedAt: now,
      messages: editingChat.messages.map((m) => ({ ...m, id: generateId() })),
    };
    setChats([newChat, ...chats]);
    showSuccess('克隆成功', '已在列表顶部生成对话副本');
  };

  const clearMessages = () => {
    if (!editingChat) return;
    showConfirm('确认清空', '确定要清空对话中的所有消息吗？此操作不可撤销。', [
      { label: '取消', onPress: () => {} },
      {
        label: '清空',
        destructive: true,
        onPress: () => {
          const now = Date.now();
          if (editingChat.id === editingChat?.id) {
            setChats((prev) =>
              prev.map((c) =>
                c.id === editingChat.id ? { ...c, messages: [], updatedAt: now } : c
              )
            );
          }
          // 同步 editingChat 使卡片上的消息数刷新（关闭 Modal 之前）
          setEditingChat((ec) => (ec ? { ...ec, messages: [], updatedAt: now } : ec));
          showSuccess('已清空', '对话消息已清空');
        },
      },
    ], 'warning');
  };

  const copyTitle = async () => {
    if (!editingChat) return;
    try {
      if (typeof (Clipboard as any).setStringAsync === 'function') {
        await (Clipboard as any).setStringAsync(editingChat.title);
      } else {
        (Clipboard as any).setString?.(editingChat.title);
      }
      showSuccess('已复制', '对话标题已复制到剪贴板');
    } catch (e: any) {
      showError('复制失败', e?.message || '未知错误');
    }
  };

  const getConversationTypePill = (type?: Chat['conversationType']) => {
    switch (type) {
      case 'parent':
        return { label: '母对话', color: '#3b82f6' };
      case 'child':
        return { label: '子对话', color: '#06b6d4' };
      case 'group':
        return { label: '群对话', color: '#f97316' };
      case 'group_private':
        return { label: '私聊', color: '#f97316' };
      case 'manual':
        return { label: '说明书', color: '#ec4899' };
      default:
        return { label: '普通', color: '#64748b' };
    }
  };

  const saveEdit = () => {
    if (!editingChat) return;
    if (!editTitle.trim()) {
      showInfo('提示', '请输入对话标题');
      return;
    }
    setChats(
      chats.map((c) =>
        c.id === editingChat.id ? { ...c, title: editTitle.trim(), updatedAt: Date.now() } : c
      )
    );
    setShowEditModal(false);
    setEditingChat(null);
  };

  const deleteChat = (id: string) => {
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;

    if (chat.conversationType === 'manual') {
      showInfo('使用说明书', '此记录为系统说明，不可删除');
      return;
    }

    // 只删除当前对话和真正属于它的子对话（conversationType === 'child' 且 parentId 匹配）
    let idsToDelete: string[] = [id];

    if (chat.conversationType === 'parent') {
      const childChats = chats.filter(
        (c) => c.parentId === id && c.conversationType === 'child'
      );
      idsToDelete = [...idsToDelete, ...childChats.map((c) => c.id)];
    } else if (chat.conversationType === 'group') {
      const groupPrivateChats = chats.filter(
        (c) => c.parentId === id && c.conversationType === 'group_private'
      );
      idsToDelete = [...idsToDelete, ...groupPrivateChats.map((c) => c.id)];
    }

    const message = idsToDelete.length > 1
      ? `确定要删除这个对话及其 ${idsToDelete.length - 1} 个子对话吗？此操作不可撤销。`
      : '确定要删除这个对话吗？此操作不可撤销。';

    showConfirm('确认删除', message, [
      { label: '取消', onPress: () => {} },
      {
        label: '删除',
        destructive: true,
        onPress: () => {
          const deleteSet = new Set(idsToDelete);
          setChats(chats.filter((c) => !deleteSet.has(c.id)));
          setShowActionSheet(false);
          setLongPressChatId(null);
          showSuccess('已删除', '对话已删除');
        },
      },
    ], 'warning');
  };

  const renderChatItem = useCallback(({ item }: { item: Chat }) => {
    const isChild = item.conversationType === 'child';
    const isParent = item.conversationType === 'parent';
    const isManual = item.conversationType === 'manual';
    const childCount = isParent ? (childCountMap.get(item.id) || 0) : 0;
    const isExpanded = expandedParents.has(item.id);
    const character = item.characterId ? characterMap.get(item.characterId) : undefined;

    const hasCover = !!item.coverImage;
    const hasWallpaper = !!item.wallpaper;
    const hasBg = hasCover || hasWallpaper;
    const bgUri = item.coverImage || item.wallpaper;

    const avatarUri = item.assistantAvatar || character?.avatar;
    const userAvatarUri = item.userAvatar || userProfile?.avatar;

    return (
      <TouchableOpacity
        style={[
          styles.chatItem,
          {
            borderBottomColor: theme.borderColor,
            paddingLeft: isChild ? 36 : 0,
          },
        ]}
        onPress={() => {
          onSelectChat(item.id);
        }}
        onLongPress={() => {
          if (isManual) {
            showInfo('使用说明书', '此记录为系统说明，不可删除');
            return;
          }
          handleLongPress(item);
        }}
        delayLongPress={500}
      >
        {hasCover && (
          <Image
            source={{ uri: item.coverImage }}
            style={[styles.chatCoverBg, {
              transform: [
                { translateX: (item.coverConfig?.offsetX || 0) * 100 },
                { translateY: (item.coverConfig?.offsetY || 0) * 100 },
                { scale: item.coverConfig?.scale || 1 },
              ],
            }]}
            resizeMode="cover"
          />
        )}
        {hasWallpaper && !hasCover && (
          <Image source={{ uri: item.wallpaper }} style={styles.chatCoverBg} resizeMode="cover" />
        )}
        {hasBg && <View style={styles.chatCoverOverlay} />}
        <View style={[
          styles.chatItemInner,
          {
            backgroundColor: currentChatId === item.id ? theme.secondaryColor : 'transparent',
          }
        ]}>
          <View style={styles.avatarContainer}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                <Text style={[styles.avatarPlaceholderText, { color: theme.subTextColor }]}>
                  {item.title.charAt(0)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.chatItemContent}>
            <View style={styles.chatItemHeader}>
              {item.isPinned && <IconPin size={14} color={theme.accentColor} />}
              {isManual && <IconBook size={14} color={theme.subTextColor} />}
              {isParent && (
                <IconFolder size={14} color={theme.subTextColor} />
              )}
              {isChild && <IconFile size={14} color={theme.accentColor} />}
              <Text style={[
                styles.chatTitle,
                {
                  color: hasBg ? '#fff' : theme.textColor,
                  fontWeight: isParent || isManual ? '600' : '500',
                }
              ]} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            <Text style={[
              styles.chatPreview,
              { color: hasBg ? 'rgba(255,255,255,0.8)' : theme.subTextColor }
            ]} numberOfLines={2}>
              {item.messages.length > 0
                ? item.messages[item.messages.length - 1].content
                : isParent ? '点击创建子对话开始聊天' : '暂无消息'}
            </Text>
            <View style={styles.chatItemFooter}>
              <Text style={[styles.chatDate, { color: hasBg ? 'rgba(255,255,255,0.6)' : theme.subTextColor }]}>
                {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
              <Text style={[styles.chatCount, { color: hasBg ? 'rgba(255,255,255,0.6)' : theme.subTextColor }]}>
                {item.messages.length} 条
              </Text>
              {!isManual && (
                <View style={styles.userAvatarWrapper}>
                  {userAvatarUri ? (
                    <Image source={{ uri: userAvatarUri }} style={styles.userAvatar} resizeMode="cover" />
                  ) : (
                    <View style={[styles.userAvatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                      <Text style={[styles.userAvatarPlaceholderText, { color: theme.subTextColor }]}>
                        {(userProfile?.username || 'U').charAt(0)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
          {!isManual && (
            <View style={styles.chatItemRightBtns}>
              {isParent && childCount > 0 && (
                <TouchableOpacity
                  onPress={() => toggleParentExpand(item.id)}
                  style={[styles.chatBadge, { backgroundColor: theme.accentColor + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }]}
                >
                  <Text style={{ color: theme.accentColor, fontSize: 11, fontWeight: '600' }}>
                    {isExpanded ? '收起' : `${childCount}`}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.chatItemStarBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  toggleChatFavorite(item.id);
                }}
                activeOpacity={0.7}
              >
                {item.isFavorite ? (
                  <IconStar size={16} color="#ff6b9d" />
                ) : (
                  <IconStarOutline size={16} color={theme.subTextColor} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chatItemMenuBtn}
                onPress={(e) => {
                  e.stopPropagation();
                  handleLongPress(item);
                }}
                activeOpacity={0.7}
              >
                <IconMenuDots size={16} color={theme.subTextColor} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [childCountMap, characterMap, expandedParents, theme, currentChatId, userProfile, handleLongPress, onSelectChat]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.headerCloseBtn}>
            <IconClose size={20} color={theme.textColor} />
          </TouchableOpacity>
        )}
        <Text style={[styles.title, { color: theme.textColor }]}>
          {filter === 'favorites' ? '收藏对话' : '对话列表'}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={true}
          contentContainerStyle={styles.headerButtons}
          style={styles.headerButtonsContainer}
          alwaysBounceHorizontal
        >
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={handleImportCharacterCard}
          >
            <Text style={{ color: theme.textColor, fontSize: 12 }}>导入对话</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.primaryColor, borderWidth: 1, borderColor: theme.accentColor }]}
            onPress={handleImportCharacterCard}
          >
            <Text style={{ color: theme.accentColor, fontSize: 12 }}>导入角色卡</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, { backgroundColor: theme.accentColor }]}
            onPress={createNewChat}
          >
            <Text style={{ color: theme.buttonTextColor }}>+ 新对话</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={[styles.searchContainer, { borderBottomColor: theme.borderColor }]}>
        <View style={[styles.searchBox, { backgroundColor: theme.inputBgColor }]}>
          <View style={{ marginRight: 6 }}>
            <IconSearch size={16} color={theme.subTextColor} />
          </View>
          <TextInput
            style={[styles.searchInput, { color: theme.textColor }]}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="搜索对话..."
            placeholderTextColor={theme.subTextColor}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <IconClose size={16} color={theme.subTextColor} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={displayChats}
        keyExtractor={(item) => item.id}
        renderItem={renderChatItem}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={21}
        updateCellsBatchingPeriod={32}
        removeClippedSubviews={true}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{ color: theme.subTextColor }}>
              {filter === 'favorites'
                ? '还没有收藏的对话\n点击对话右侧的星星图标收藏'
                : (searchText ? '没有找到匹配的对话' : '暂无对话')}
            </Text>
            {!searchText && filter !== 'favorites' && (
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: theme.accentColor, marginTop: 16 }]}
                onPress={createNewChat}
              >
                <Text style={{ color: theme.buttonTextColor }}>开始新对话</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {showEditModal && editingChat && (() => {
        const chat = editingChat;
        const messages = chat.messages || [];
        const typePill = getConversationTypePill(chat.conversationType);
        const parentChat = chat.parentId ? chats.find((c) => c.id === chat.parentId) : undefined;
        const isManual = chat.conversationType === 'manual';
        const coverUri = chat.coverImage || chat.wallpaper;
        const avatarChar = characters?.find((c) => c && c.id === chat.characterId);
        const avatarUri = chat.assistantAvatar || avatarChar?.avatar;
        const androidBottomPad = Math.max(insets.bottom, 88 + Math.abs(SCREEN_H - WINDOW_H)) + 24;
        const iosBottomPad = insets.bottom + 24;
        const contentPaddingBottom = Platform.OS === 'android' ? androidBottomPad : iosBottomPad;
        return (
          <Modal visible={showEditModal} animationType="fade" transparent onRequestClose={() => setShowEditModal(false)}>
            <KeyboardAvoidingView
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowEditModal(false)} />
              <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 40 }}>
                <View style={[
                  styles.editModalCard,
                  {
                    backgroundColor: theme.menuBgColor,
                    borderRadius: 20,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.25,
                    shadowRadius: 24,
                    elevation: 24,
                  }
                ]}>
                  {/* Header */}
                  <View style={[styles.editModalHeader, { borderBottomColor: theme.borderColor }]}>
                    <View style={{ width: 32 }} />
                    <Text style={[styles.editModalTitle, { color: theme.textColor }]}>编辑对话</Text>
                    <TouchableOpacity onPress={() => setShowEditModal(false)} style={{ width: 32, alignItems: 'flex-end' }}>
                      <IconClose size={22} color={theme.textColor} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ padding: 20, paddingBottom: contentPaddingBottom, gap: 16 }}
                    keyboardShouldPersistTaps="handled"
                  >
                    {/* 表单区 */}
                    <View style={{ gap: 8 }}>
                      <Text style={[styles.editFormLabel, { color: theme.subTextColor }]}>标题</Text>
                      <TextInput
                        style={{
                          borderRadius: 12,
                          padding: 14,
                          fontSize: 16,
                          backgroundColor: theme.secondaryColor,
                          color: theme.textColor,
                        }}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        placeholder="请输入对话标题"
                        placeholderTextColor={theme.subTextColor}
                        autoFocus
                      />
                    </View>

                    {/* 元数据卡片 */}
                    <View style={[
                      styles.editMetaCard,
                      {
                        borderWidth: 1,
                        borderColor: theme.secondaryColor,
                        borderRadius: 12,
                        backgroundColor: theme.primaryColor,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.08,
                        shadowRadius: 6,
                        elevation: 3,
                      }
                    ]}>
                      <View style={{ flexDirection: 'row' }}>
                        <View style={{ flex: 1, gap: 10 }}>
                          <View style={styles.metaRow}>
                            <Text style={[styles.metaLabel, { color: theme.subTextColor }]}>消息数</Text>
                            <Text style={[styles.metaValue, { color: theme.textColor }]}>{messages.length}</Text>
                          </View>
                          <View style={styles.metaRow}>
                            <Text style={[styles.metaLabel, { color: theme.subTextColor }]}>创建时间</Text>
                            <Text style={[styles.metaValue, { color: theme.textColor, flex: 1, textAlign: 'right' }]} numberOfLines={1}>
                              {new Date(chat.createdAt).toLocaleString()}
                            </Text>
                          </View>
                          <View style={styles.metaRow}>
                            <Text style={[styles.metaLabel, { color: theme.subTextColor }]}>最后更新</Text>
                            <Text style={[styles.metaValue, { color: theme.textColor, flex: 1, textAlign: 'right' }]} numberOfLines={1}>
                              {new Date(chat.updatedAt).toLocaleString()}
                            </Text>
                          </View>
                          <View style={styles.metaRow}>
                            <Text style={[styles.metaLabel, { color: theme.subTextColor }]}>对话类型</Text>
                            <View style={[styles.typePill, { backgroundColor: typePill.color + '22' }]}>
                              <Text style={[styles.typePillText, { color: typePill.color }]}>{typePill.label}</Text>
                            </View>
                          </View>
                          {parentChat ? (
                            <View style={styles.metaRow}>
                              <Text style={[styles.metaLabel, { color: theme.subTextColor }]}>母对话</Text>
                              <Text style={[styles.metaValue, { color: theme.accentColor, flex: 1, textAlign: 'right' }]} numberOfLines={1}>
                                ← {parentChat.title}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={{ marginLeft: 14, alignItems: 'flex-end' }}>
                          <View style={{
                            width: 72,
                            height: 72,
                            borderRadius: 8,
                            overflow: 'hidden',
                            backgroundColor: theme.secondaryColor,
                          }}>
                            {coverUri ? (
                              <Image source={{ uri: coverUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            ) : avatarUri ? (
                              <Image source={{ uri: avatarUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                            ) : (
                              <View style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 26, fontWeight: '700', color: theme.subTextColor }}>
                                  {(chat.title || 'C').charAt(0)}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* 快捷操作按钮行 */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[styles.quickPillBtn, { backgroundColor: theme.secondaryColor, flex: 1 }]}
                        activeOpacity={0.7}
                        onPress={copyTitle}
                      >
                        <Text style={[styles.quickPillText, { color: theme.textColor }]}>复制标题</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.quickPillBtn, { backgroundColor: theme.secondaryColor, flex: 1 }]}
                        activeOpacity={0.7}
                        onPress={cloneChat}
                      >
                        <Text style={[styles.quickPillText, { color: theme.textColor }]}>克隆对话</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.quickPillBtn,
                          { backgroundColor: isManual ? theme.secondaryColor : '#fee2e2', flex: 1, opacity: isManual ? 0.5 : 1 },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => {
                          if (isManual) {
                            showInfo('使用说明书', '此记录为系统说明，不可清空消息');
                            return;
                          }
                          clearMessages();
                        }}
                        disabled={isManual}
                      >
                        <Text style={[styles.quickPillText, { color: isManual ? theme.subTextColor : '#ef4444' }]}>清空消息</Text>
                      </TouchableOpacity>
                    </View>

                    {/* 保存/取消 */}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                      <TouchableOpacity
                        style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: theme.secondaryColor }}
                        activeOpacity={0.7}
                        onPress={() => setShowEditModal(false)}
                      >
                        <Text style={{ color: theme.textColor, fontSize: 16 }}>取消</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: theme.accentColor }}
                        activeOpacity={0.7}
                        onPress={saveEdit}
                      >
                        <Text style={{ color: theme.buttonTextColor, fontSize: 16, fontWeight: '600' }}>保存</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}

      <ActionSheet
        visible={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        title={actionSheetTitle}
        message={actionSheetMessage}
        actions={actionSheetActions}
        theme={theme}
      />

      <ConfirmModal
        visible={showAlert}
        onClose={() => setShowAlert(false)}
        title={alertTitle}
        message={alertMessage}
        actions={alertActions}
        theme={theme}
        type={alertType}
      />

      {/* 封面编辑 Modal：选图后调整显示区域 */}
      <Modal visible={showCoverEditModal} transparent animationType="slide" onRequestClose={() => setShowCoverEditModal(false)}>
        <View style={styles.coverEditOverlay}>
          <View style={[styles.coverEditSheet, { backgroundColor: theme.backgroundColor }]}>
            <View style={[styles.coverEditHeader, { borderBottomColor: theme.borderColor }]}>
              <Text style={[styles.coverEditTitle, { color: theme.textColor }]}>调整封面显示</Text>
              <TouchableOpacity onPress={() => setShowCoverEditModal(false)} style={styles.coverEditCloseBtn}>
                <IconClose size={20} color={theme.subTextColor} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 预览区域 */}
              <View style={[styles.coverEditPreview, { backgroundColor: theme.secondaryColor }]}>
                {coverEditUri ? (
                  <Image
                    source={{ uri: coverEditUri }}
                    style={{
                      width: '100%',
                      height: 200,
                      transform: [
                        { translateX: coverCfg.offsetX * 100 },
                        { translateY: coverCfg.offsetY * 100 },
                        { scale: coverCfg.scale },
                      ],
                    }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ color: theme.subTextColor, padding: 40 }}>未选择图片</Text>
                )}
              </View>

              {/* X 偏移 */}
              <View style={[styles.coverSliderRow, { borderBottomColor: theme.borderColor }]}>
                <Text style={[styles.coverSliderLabel, { color: theme.textColor }]}>横向位置 X</Text>
                <View style={styles.coverStepControl}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => setCoverCfg((c) => ({ ...c, offsetX: Math.max(-1, Math.round((c.offsetX - 0.05) * 100) / 100) }))}
                  >
                    <Text style={{ color: theme.textColor, fontWeight: '700' }}>-</Text>
                  </TouchableOpacity>
                  <Text style={[styles.stepValue, { color: theme.textColor }]}>{coverCfg.offsetX.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => setCoverCfg((c) => ({ ...c, offsetX: Math.min(1, Math.round((c.offsetX + 0.05) * 100) / 100) }))}
                  >
                    <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Y 偏移 */}
              <View style={[styles.coverSliderRow, { borderBottomColor: theme.borderColor }]}>
                <Text style={[styles.coverSliderLabel, { color: theme.textColor }]}>纵向位置 Y</Text>
                <View style={styles.coverStepControl}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => setCoverCfg((c) => ({ ...c, offsetY: Math.max(-1, Math.round((c.offsetY - 0.05) * 100) / 100) }))}
                  >
                    <Text style={{ color: theme.textColor, fontWeight: '700' }}>-</Text>
                  </TouchableOpacity>
                  <Text style={[styles.stepValue, { color: theme.textColor }]}>{coverCfg.offsetY.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => setCoverCfg((c) => ({ ...c, offsetY: Math.min(1, Math.round((c.offsetY + 0.05) * 100) / 100) }))}
                  >
                    <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* 缩放 */}
              <View style={[styles.coverSliderRow, { borderBottomColor: theme.borderColor }]}>
                <Text style={[styles.coverSliderLabel, { color: theme.textColor }]}>缩放</Text>
                <View style={styles.coverStepControl}>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => setCoverCfg((c) => ({ ...c, scale: Math.max(1, Math.round((c.scale - 0.1) * 10) / 10) }))}
                  >
                    <Text style={{ color: theme.textColor, fontWeight: '700' }}>-</Text>
                  </TouchableOpacity>
                  <Text style={[styles.stepValue, { color: theme.textColor }]}>{coverCfg.scale.toFixed(1)}</Text>
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => setCoverCfg((c) => ({ ...c, scale: Math.min(3, Math.round((c.scale + 0.1) * 10) / 10) }))}
                  >
                    <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.coverEditSaveBtn, { backgroundColor: theme.accentColor }]}
                onPress={saveCoverEdit}
              >
                <Text style={{ color: theme.buttonTextColor, fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
    padding: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerCloseBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 0,
  },
  headerButtonsContainer: {
    flex: 1,
    minWidth: 0,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 2,
  },
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexShrink: 0,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 16,
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
    padding: 14,
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    fontSize: 18,
    fontWeight: '600',
  },
  chatItemContent: {
    flex: 1,
    minWidth: 0,
  },
  chatItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  iconBadge: {
    marginRight: 4,
    fontSize: 14,
  },
  iconBtn: {
    marginRight: 4,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  chatBadge: {
    fontSize: 11,
    marginLeft: 6,
  },
  chatPreview: {
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 18,
  },
  chatItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chatDate: {
    fontSize: 11,
  },
  chatChar: {
    fontSize: 12,
  },
  chatCount: {
    fontSize: 11,
  },
  userAvatarWrapper: {
    marginLeft: 'auto',
  },
  userAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  userAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarPlaceholderText: {
    fontSize: 11,
    fontWeight: '600',
  },
  chatItemMenuBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
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
  chatItemMenuText: {
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  titleInput: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
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
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  editModalCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    maxHeight: '92%',
    overflow: 'hidden',
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  editFormLabel: {
    fontSize: 13,
    textAlign: 'left',
  },
  editMetaCard: {
    padding: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  metaLabel: {
    fontSize: 13,
    minWidth: 60,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  quickPillBtn: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // 封面编辑 Modal
  coverEditOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  coverEditSheet: {
    borderRadius: 14,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  coverEditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  coverEditTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  coverEditCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditPreview: {
    width: '100%',
    height: 200,
    overflow: 'hidden',
    marginVertical: 12,
    borderRadius: 10,
  },
  coverSliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  coverSliderLabel: {
    fontSize: 14,
  },
  coverStepControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },
  coverEditSaveBtn: {
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
});
