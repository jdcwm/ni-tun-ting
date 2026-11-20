import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Modal, Image, Pressable, Switch, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { WorldBook, WorldBookEntry, WorldBookCoverConfig } from '../types';
import {
  IconClose,
  IconPlus,
  IconTrash,
  IconEdit,
  IconSearch,
  IconGlobe,
  IconChevronDown,
  IconUp,
  IconSend,
  IconImage,
  IconImport,
  IconExport,
  IconCopy,
} from '../components/Icons';
import { imageUtils, packAssets, unpackAssets } from '../utils/imageUtils';
import { ActionSheet, ActionSheetAction } from '../components/ActionSheet';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';

const CATEGORIES = ['世界观', '角色设定', '故事背景', '规则', '其他'];

const DEFAULT_COVER_CONFIG: WorldBookCoverConfig = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  borderRadius: 8,
};

interface WorldBookScreenProps {
  onClose?: () => void;
  onAddToChat?: (systemPrompt: string) => void;
  worldBookIds?: string[];
  onWorldBookIdsChange?: (ids: string[]) => void;
  initialBookId?: string;
  initialEntryId?: string;
}

/**
 * 渲染带裁切配置的世界书缩略图。
 * 视口 viewport：容器宽高；图像尺寸 = 2 * viewport；translate 按 viewport/2 为单位。
 */
export const renderCoverThumb = (
  book: WorldBook,
  viewport: number,
  theme: any
) => {
  const cfg = book.coverConfig || DEFAULT_COVER_CONFIG;
  const radius = cfg.borderRadius ?? DEFAULT_COVER_CONFIG.borderRadius;
  const scale = cfg.scale ?? DEFAULT_COVER_CONFIG.scale;
  const ox = cfg.offsetX ?? DEFAULT_COVER_CONFIG.offsetX;
  const oy = cfg.offsetY ?? DEFAULT_COVER_CONFIG.offsetY;
  const imgSize = viewport * 2;
  const translateUnit = viewport / 2;
  return (
    <View
      style={{
        width: viewport,
        height: viewport,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: theme.secondaryColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {book.coverImage ? (
        <Image
          source={{ uri: book.coverImage }}
          style={{
            width: imgSize,
            height: imgSize,
            transform: [
              { translateX: ox * translateUnit },
              { translateY: oy * translateUnit },
              { scale: scale },
            ],
          }}
          resizeMode="cover"
        />
      ) : (
        <View style={{ alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
          <IconGlobe size={Math.floor(viewport * 0.5)} color={theme.subTextColor} />
        </View>
      )}
    </View>
  );
};

export const coverConfigDefaults = DEFAULT_COVER_CONFIG;

const createEmptyEntry = (): WorldBookEntry => ({
  id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  keys: [],
  content: '',
  images: [],
  enabled: true,
  category: '世界观',
  order: 1,
});

const createEmptyWorldBook = (): WorldBook => ({
  id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  name: '',
  description: '',
  entries: [createEmptyEntry()],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export const WorldBookScreen: React.FC<WorldBookScreenProps> = ({ onClose, onAddToChat, worldBookIds, onWorldBookIdsChange, initialBookId, initialEntryId }) => {
  const theme = useTheme();
  const { worldBooks, setWorldBooks } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('全部');
  const [showEditor, setShowEditor] = useState(false);
  const [editingBook, setEditingBook] = useState<WorldBook | null>(null);
  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEntries, setFormEntries] = useState<WorldBookEntry[]>([]);
  const [formEntryModalIndex, setFormEntryModalIndex] = useState<number | null>(null);

  // 封面相关
  const [longPressBookId, setLongPressBookId] = useState<string | null>(null);
  const [showBookActionSheet, setShowBookActionSheet] = useState(false);
  const [bookActions, setBookActions] = useState<ActionSheetAction[]>([]);
  const [bookActionSheetTitle, setBookActionSheetTitle] = useState('');

  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [coverEditingBook, setCoverEditingBook] = useState<WorldBook | null>(null);
  const [coverImageUri, setCoverImageUri] = useState<string | null>(null);
  const [coverCfg, setCoverCfg] = useState<WorldBookCoverConfig>(DEFAULT_COVER_CONFIG);

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    CATEGORIES.forEach((c) => cats.add(c));
    worldBooks.forEach((wb) => {
      wb.entries.forEach((e) => {
        if (e.category) cats.add(e.category);
      });
    });
    return Array.from(cats);
  }, [worldBooks]);

  const filteredBooks = useMemo(() => {
    return worldBooks
      .filter((wb) => {
        const matchesSearch =
          wb.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (wb.description || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
          activeCategory === '全部' ||
          wb.entries.some((e) => e.category === activeCategory);
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [worldBooks, searchQuery, activeCategory]);

  const totalEnabled = useMemo(
    () => worldBooks.reduce((sum, wb) => sum + wb.entries.filter((e) => e.enabled).length, 0),
    [worldBooks]
  );
  const totalEntries = useMemo(
    () => worldBooks.reduce((sum, wb) => sum + wb.entries.length, 0),
    [worldBooks]
  );

  const toggleExpand = (bookId: string) => {
    setExpandedBooks((prev) => {
      const next = new Set(prev);
      if (next.has(bookId)) {
        next.delete(bookId);
      } else {
        next.add(bookId);
      }
      return next;
    });
  };

  // 当传入 initialBookId 时，自动打开该书籍的编辑器
  useEffect(() => {
    if (initialBookId && worldBooks.length > 0) {
      const book = worldBooks.find((wb) => wb.id === initialBookId);
      if (book) {
        // 自动展开该书
        setExpandedBooks((prev) => {
          const next = new Set(prev);
          next.add(book.id);
          return next;
        });
        // 打开编辑器
        setTimeout(() => {
          handleOpenEditor(book);
          // 如果指定了 initialEntryId，则自动展开该条目
          if (initialEntryId) {
            const entryIndex = book.entries.findIndex((e) => e.id === initialEntryId);
            if (entryIndex >= 0) {
              setFormEntryModalIndex(entryIndex);
            }
          }
        }, 300);
      }
    }
  }, [initialBookId, initialEntryId, worldBooks.length]);

  const handleOpenEditor = (book?: WorldBook, withNewEntry = false) => {
    if (book) {
      setEditingBook(book);
      setFormName(book.name);
      setFormDescription(book.description || '');
      const cloned: WorldBookEntry[] = JSON.parse(JSON.stringify(book.entries));
      if (withNewEntry) {
        // 直接进「新增条目」：追加一条空条目并自动展开，省掉"编辑 -> 添加条目 -> 展开"三步
        cloned.push(createEmptyEntry());
      }
      setFormEntries(cloned);
      setFormEntryModalIndex(withNewEntry ? cloned.length - 1 : null);
    } else {
      setEditingBook(null);
      setFormName('');
      setFormDescription('');
      setFormEntries([createEmptyEntry()]);
      setFormEntryModalIndex(withNewEntry ? 0 : null);
    }
    setShowEditor(true);
  };

  const handleSaveBook = async () => {
    if (!formName.trim()) {
      Alert.alert('错误', '请填写世界书名称');
      return;
    }
    const validEntries = formEntries.filter((e) => e.content.trim());
    if (validEntries.length === 0) {
      Alert.alert('错误', '至少需要一条有内容的条目');
      return;
    }

    const now = Date.now();
    if (editingBook) {
      const updated: WorldBook = {
        ...editingBook,
        name: formName.trim(),
        description: formDescription.trim(),
        entries: validEntries,
        updatedAt: now,
      };
      await setWorldBooks(worldBooks.map((wb) => (wb.id === editingBook.id ? updated : wb)));
    } else {
      const newBook: WorldBook = {
        id: `wb_${now}_${Math.random().toString(36).slice(2, 6)}`,
        name: formName.trim(),
        description: formDescription.trim(),
        entries: validEntries,
        createdAt: now,
        updatedAt: now,
      };
      await setWorldBooks([newBook, ...worldBooks]);
    }
    setShowEditor(false);
  };

  const handleDeleteBook = (id: string) => {
    Alert.alert('删除确认', '确定要删除这本世界书及其所有条目吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await setWorldBooks(worldBooks.filter((wb) => wb.id !== id));
          setExpandedBooks((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    ]);
  };

  const handleToggleBookEnabled = async (bookId: string) => {
    const book = worldBooks.find((wb) => wb.id === bookId);
    if (!book) return;
    const allEnabled = book.entries.every((e) => e.enabled);
    const updated: WorldBook = {
      ...book,
      entries: book.entries.map((e) => ({ ...e, enabled: !allEnabled })),
      updatedAt: Date.now(),
    };
    await setWorldBooks(worldBooks.map((wb) => (wb.id === bookId ? updated : wb)));
  };

  const handleToggleChatLink = (bookId: string) => {
    if (!onWorldBookIdsChange) return;
    const ids = worldBookIds ?? [];
    if (ids.includes(bookId)) {
      onWorldBookIdsChange(ids.filter((id) => id !== bookId));
    } else {
      onWorldBookIdsChange([...ids, bookId]);
    }
  };

  const handleSetCover = async (book: WorldBook) => {
    try {
      const uri = await imageUtils.pickImageFromGallery();
      if (!uri) return;
      setCoverEditingBook(book);
      setCoverImageUri(uri);
      setCoverCfg({ ...(book.coverConfig || DEFAULT_COVER_CONFIG) });
      setShowCoverEditor(true);
    } catch (e: any) {
      Alert.alert('设置失败', e?.message || '未知错误');
    }
  };

  const handleSaveCover = async () => {
    if (!coverEditingBook || !coverImageUri) return;
    try {
      let savedUri = coverImageUri;
      // 尝试保存到 App 目录，便于持久化
      try {
        savedUri = await imageUtils.saveImageToAppDir(coverImageUri, 'wb_covers');
      } catch (_) {
        // 失败则回退使用原图 uri
      }
      const now = Date.now();
      const updated: WorldBook = {
        ...coverEditingBook,
        coverImage: savedUri,
        coverConfig: { ...coverCfg },
        updatedAt: now,
      };
      await setWorldBooks(worldBooks.map((wb) => (wb.id === coverEditingBook.id ? updated : wb)));
      setShowCoverEditor(false);
      setCoverEditingBook(null);
      setCoverImageUri(null);
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '未知错误');
    }
  };

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  const roundToStep = (v: number, step: number) => {
    const r = Math.round(v / step) * step;
    // 修正浮点数精度
    return Math.round(r * 100) / 100;
  };

  const handleLongPressBook = (book: WorldBook) => {
    setLongPressBookId(book.id);
    const selectedInChat = worldBookIds?.includes(book.id);
    const actions: ActionSheetAction[] = [
      {
        label: '设置封面',
        onPress: () => handleSetCover(book),
        icon: <IconImage size={18} color={theme.subTextColor} />,
      },
      {
        label: '编辑',
        onPress: () => handleOpenEditor(book),
        icon: <IconEdit size={18} color={theme.subTextColor} />,
      },
      ...(onWorldBookIdsChange
        ? [
            {
              label: selectedInChat ? '从对话移除' : '加入对话',
              onPress: () => handleToggleChatLink(book.id),
              icon: <IconSend size={18} color={theme.subTextColor} />,
            },
          ]
        : []),
      {
        label: '导出为JSON',
        onPress: () => handleExportBook(book),
        icon: <IconExport size={18} color={theme.subTextColor} />,
      },
      {
        label: '复制JSON到剪贴板',
        onPress: async () => {
          try {
            await Clipboard.setStringAsync(JSON.stringify(book, null, 2));
            Alert.alert('已复制', '《' + book.name + '》JSON已写入剪贴板');
          } catch (e: any) {
            Alert.alert('复制失败', e?.message || '');
          }
        },
        icon: <IconCopy size={18} color={theme.subTextColor} />,
      },
      {
        label: '删除',
        onPress: () => handleDeleteBook(book.id),
        destructive: true,
        icon: <IconTrash size={18} color="#ef4444" />,
      },
    ];
    setBookActions(actions);
    setBookActionSheetTitle(`《${book.name}》`);
    setShowBookActionSheet(true);
  };

  const handleExportBook = async (book: WorldBook) => {
    try {
      const { plain, assets } = await packAssets(book, 'worldBook');
      const payload: any = { format: 'aitavern:wb:1', data: plain };
      if (Array.isArray(assets) && assets.length > 0) payload.assets = assets;
      const dataStr = JSON.stringify(payload, null, 2);
      const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const safeName = book.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      const fileUri = documentDir + `worldbook_${safeName}_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, dataStr);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: `导出世界书：${book.name}`,
          UTI: 'public.json',
        });
      } else {
        Alert.alert('导出成功', `已导出到: ${fileUri}`);
      }
    } catch (e: any) {
      Alert.alert('导出失败', e?.message || '未知错误');
    }
  };

  const handleExportAll = async () => {
    try {
      const { plain, assets } = await packAssets({ books: worldBooks }, 'worldBooks');
      const payload: any = { format: 'aitavern:wb:1', data: plain };
      if (Array.isArray(assets) && assets.length > 0) payload.assets = assets;
      const dataStr = JSON.stringify(payload, null, 2);
      const documentDir = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
      const fileUri = documentDir + `worldbooks_all_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, dataStr);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '导出全部世界书',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('导出成功', `已导出到: ${fileUri}`);
      }
    } catch (e: any) {
      Alert.alert('导出失败', e?.message || '未知错误');
    }
  };

  const normalizeWorldBookList = async (parsed: any): Promise<WorldBook[]> => {
    let assets: any = undefined;
    let source: any = parsed;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.format === 'aitavern:wb:1') {
        assets = parsed.assets;
        const d = parsed.data;
        if (d && Array.isArray((d as any).books)) source = (d as any).books;
        else if (Array.isArray(d)) source = d;
        else if (d && (d as any).name) source = [d];
        else source = [];
      } else if ((parsed as any).books && Array.isArray((parsed as any).books)) {
        source = (parsed as any).books;
      }
    }
    let arr: any[] = Array.isArray(source) ? source : [source];
    if (assets && arr.length > 0) {
      const wrap = { books: arr };
      const { data } = await unpackAssets(wrap, assets, 'worldBookImages');
      arr = (data && data.books) || arr;
    }
    return arr.filter((wb) => wb && wb.name && Array.isArray(wb.entries));
  };

  const handleImportClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        Alert.alert('粘贴失败', '剪贴板为空');
        return;
      }
      const parsed = JSON.parse(text);
      const imported: WorldBook[] = await normalizeWorldBookList(parsed);
      if (imported.length === 0) {
        Alert.alert('导入失败', '剪贴板内容不含有效的世界书数据');
        return;
      }
      const now = Date.now();
      const existingMap = new Map(worldBooks.map((wb) => [wb.id, wb]));
      const merged: WorldBook[] = imported.map((wb, i) => ({
        ...wb,
        id: wb.id || `wb_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: wb.createdAt || existingMap.get(wb.id)?.createdAt || now,
        updatedAt: now,
      }));
      const mergedIds = new Set(merged.map((wb) => wb.id));
      const rest = worldBooks.filter((wb) => !mergedIds.has(wb.id));
      const overwriteCount = merged.filter((wb) => existingMap.has(wb.id)).length;
      Alert.alert(
        '确认导入',
        `将从剪贴板导入 ${merged.length} 本世界书${overwriteCount > 0 ? `（${overwriteCount} 本覆盖同名 id）` : ''}，是否继续？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '导入',
            onPress: async () => {
              await setWorldBooks([...merged, ...rest]);
              Alert.alert('导入成功', `已从剪贴板导入 ${merged.length} 本世界书`);
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert('粘贴失败', e?.message || '内容不是合法的 JSON');
    }
  };

  const handleImportWorldBook = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file) return;
      const content = await FileSystem.readAsStringAsync(file.uri);
      const parsed = JSON.parse(content);
      const imported: WorldBook[] = await normalizeWorldBookList(parsed);
      if (imported.length === 0) {
        Alert.alert('导入失败', '未找到有效的世界书数据');
        return;
      }
      const now = Date.now();
      const newBooks: WorldBook[] = imported.map((wb, i) => ({
        ...wb,
        id: wb.id || `wb_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: wb.createdAt || now,
        updatedAt: now,
      }));
      Alert.alert(
        '确认导入',
        `将导入 ${newBooks.length} 本世界书，是否继续？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '导入',
            onPress: async () => {
              await setWorldBooks([...newBooks, ...worldBooks]);
              Alert.alert('导入成功', `已导入 ${newBooks.length} 本世界书`);
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '文件格式错误');
    }
  };

  const handleAddEntryToEditor = () => {
    setFormEntries([...formEntries, createEmptyEntry()]);
  };

  const handleRemoveEntryFromEditor = (index: number) => {
    setFormEntries((prev) => prev.filter((_, i) => i !== index));
    setFormEntryModalIndex(null);
  };

  const handleUpdateEntryInEditor = (index: number, patch: Partial<WorldBookEntry>) => {
    setFormEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const handleMoveEntryInEditor = (index: number, direction: 'up' | 'down') => {
    setFormEntries((prev) => {
      const next = [...prev];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleToggleAllEntriesInEditor = () => {
    setFormEntries((prev) => {
      if (prev.length === 0) return prev;
      const allOn = prev.every((e) => e.enabled);
      return prev.map((e) => ({ ...e, enabled: !allOn }));
    });
  };

  const handleAddToChat = (book: WorldBook) => {
    if (!onAddToChat) return;
    const enabledEntries = book.entries.filter((e) => e.enabled && e.content.trim());
    if (enabledEntries.length === 0) {
      Alert.alert('提示', '该世界书没有已启用的条目');
      return;
    }
    const promptParts = enabledEntries
      .sort((a, b) => (b.order || 0) - (a.order || 0))
      .map((e) => {
        const keysText = e.keys && e.keys.length > 0 ? e.keys.join('、') : '';
        const header = keysText ? `【${keysText}】` : '';
        const cat = e.category ? `(${e.category})` : '';
        return `${header}${cat}\n${e.content}`;
      });
    const fullPrompt = `以下是世界观设定（来自《${book.name}》），请作为参考融入对话中：\n\n${promptParts.join('\n\n')}`;
    Alert.alert(
      '添加到对话',
      `将把「${book.name}」中 ${enabledEntries.length} 条启用的世界观条目作为系统提示词添加到当前对话，确定要执行吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定添加',
          onPress: () => {
            onAddToChat(fullPrompt);
            Alert.alert('添加成功', `已将「${book.name}」添加到对话`);
            onClose?.();
          },
        },
      ]
    );
  };

  const renderEntryItem = (entry: WorldBookEntry, index: number) => {
    const isExpanded = formEntryModalIndex === index;
    return (
      <View key={entry.id} style={[styles.entryItem, { backgroundColor: theme.secondaryColor }]}>
        <TouchableOpacity
          style={styles.entryItemHeader}
          onPress={() => setFormEntryModalIndex(isExpanded ? null : index)}
        >
          <View style={styles.entryItemHeaderLeft}>
            <Text style={[styles.entryIndex, { color: theme.subTextColor }]}>#{index + 1}</Text>
            <View style={[styles.entryKeyBadge, { backgroundColor: theme.accentColor }]}>
              <Text style={styles.entryKeyBadgeText}>
                {entry.keys && entry.keys.length > 0 ? entry.keys.join(', ') : '无关键词'}
              </Text>
            </View>
            <View style={[styles.entryCatBadge, { backgroundColor: theme.primaryColor }]}>
              <Text style={[styles.entryCatText, { color: theme.textColor }]}>
                {entry.category || '未分类'}
              </Text>
            </View>
          </View>
          <View style={styles.entryItemHeaderRight}>
            <TouchableOpacity
              onPress={() => handleUpdateEntryInEditor(index, { enabled: !entry.enabled })}
              style={[
                styles.entryToggle,
                { backgroundColor: entry.enabled ? theme.accentColor : theme.primaryColor },
              ]}
            >
              <View
                style={[
                  styles.entryToggleDot,
                  { backgroundColor: entry.enabled ? '#fff' : theme.subTextColor },
                ]}
              />
            </TouchableOpacity>
            {isExpanded ? (
              <IconUp size={18} color={theme.subTextColor} />
            ) : (
              <IconChevronDown size={18} color={theme.subTextColor} />
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={[styles.entryExpandContent, { backgroundColor: theme.primaryColor }]}>
            <View style={styles.entryField}>
              <Text style={[styles.entryFieldLabel, { color: theme.subTextColor }]}>
                关键词（用逗号分隔）
              </Text>
              <TextInput
                style={[
                  styles.entryFieldInput,
                  { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor },
                ]}
                value={entry.keys?.join(', ') || ''}
                onChangeText={(text) =>
                  handleUpdateEntryInEditor(index, {
                    keys: text.split(',').map((k) => k.trim()).filter(Boolean),
                  })
                }
                placeholder="例如：魔法, 法术, 元素"
                placeholderTextColor={theme.subTextColor}
              />
            </View>

            <View style={styles.entryField}>
              <Text style={[styles.entryFieldLabel, { color: theme.subTextColor }]}>内容</Text>
              <TextInput
                style={[
                  styles.entryFieldTextArea,
                  { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor },
                ]}
                value={entry.content}
                onChangeText={(text) => handleUpdateEntryInEditor(index, { content: text })}
                placeholder="输入世界观内容描述..."
                placeholderTextColor={theme.subTextColor}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.entryField}>
              <Text style={[styles.entryFieldLabel, { color: theme.subTextColor }]}>分类</Text>
              <View style={styles.categoryOptions}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => handleUpdateEntryInEditor(index, { category: cat })}
                    style={[
                      styles.categoryOption,
                      {
                        backgroundColor: entry.category === cat ? theme.accentColor : theme.secondaryColor,
                        borderColor: theme.borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        { color: entry.category === cat ? '#fff' : theme.textColor },
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.entryField}>
              <Text style={[styles.entryFieldLabel, { color: theme.subTextColor }]}>
                优先级 ({entry.order || 0})
              </Text>
              <View style={styles.prioritySlider}>
                {[1, 2, 3, 4, 5].map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => handleUpdateEntryInEditor(index, { order: p })}
                    style={[
                      styles.priorityDot,
                      {
                        backgroundColor: (entry.order || 0) >= p ? theme.accentColor : theme.secondaryColor,
                        borderColor: theme.borderColor,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>

            <View style={styles.entryExpandActions}>
              <TouchableOpacity
                onPress={() => handleMoveEntryInEditor(index, 'up')}
                style={[styles.entryMoveBtn, { backgroundColor: theme.secondaryColor }]}
                disabled={index === 0}
              >
                <Text style={{ color: theme.textColor, fontSize: 12 }}>上移</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleMoveEntryInEditor(index, 'down')}
                style={[styles.entryMoveBtn, { backgroundColor: theme.secondaryColor }]}
                disabled={index === formEntries.length - 1}
              >
                <Text style={{ color: theme.textColor, fontSize: 12 }}>下移</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemoveEntryFromEditor(index)}
                style={[styles.entryDeleteBtn, { backgroundColor: '#fee2e2' }]}
              >
                <IconTrash size={16} color="#ef4444" />
                <Text style={{ color: '#ef4444', fontSize: 12, marginLeft: 4 }}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor },
        ]}
      >
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconClose size={24} color={theme.textColor} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>世界书管理</Text>
          <Text style={[styles.headerSubtitle, { color: theme.subTextColor }]}>
            {totalEnabled} / {totalEntries} 条启用
          </Text>
        </View>
        <View style={styles.headerActions}>
          {/* 导入按钮横条：文件导入 / 粘贴导入 并排 */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 18,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: theme.accentColor + '60',
              marginRight: 2,
            }}
          >
            <TouchableOpacity
              onPress={handleImportWorldBook}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: theme.accentColor + '10',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <IconImport size={16} color={theme.accentColor} />
                <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                  导入
                </Text>
              </View>
            </TouchableOpacity>
            <View style={{ width: 1, height: 22, backgroundColor: theme.accentColor + '40' }} />
            <TouchableOpacity
              onPress={handleImportClipboard}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: theme.accentColor + '10',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <IconCopy size={16} color={theme.accentColor} />
                <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                  粘贴导入
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleExportAll} style={styles.headerActionBtn}>
            <IconExport size={22} color={theme.accentColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleOpenEditor()} style={styles.headerActionBtn}>
            <IconPlus size={24} color={theme.accentColor} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterSection}>
        <View style={[styles.searchBar, { backgroundColor: theme.primaryColor }]}>
          <IconSearch size={18} color={theme.subTextColor} />
          <TextInput
            style={[styles.searchInput, { color: theme.textColor }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="搜索世界书名称或描述..."
            placeholderTextColor={theme.subTextColor}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagsContainer}
        >
          {['全部', ...allCategories].map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setActiveCategory(cat)}
              style={[
                styles.tagItem,
                {
                  backgroundColor: activeCategory === cat ? theme.accentColor : theme.secondaryColor,
                },
              ]}
            >
              <Text
                style={[
                  styles.tagText,
                  { color: activeCategory === cat ? '#fff' : theme.textColor },
                ]}
              >
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredBooks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconGlobe size={48} color={theme.subTextColor} />
            <Text style={[styles.emptyText, { color: theme.subTextColor }]}>暂无世界书</Text>
            <Text style={[styles.emptyHint, { color: theme.subTextColor }]}>
              点击右上角添加新的世界书
            </Text>
          </View>
        ) : (
          filteredBooks.map((book) => {
            const enabledCount = book.entries.filter((e) => e.enabled).length;
            const isExpanded = expandedBooks.has(book.id);
            const allEnabled = book.entries.length > 0 && enabledCount === book.entries.length;
            const selected = !!worldBookIds?.includes(book.id);
            return (
              <View
                key={book.id}
                style={[
                  styles.bookCard,
                  {
                    backgroundColor: theme.primaryColor,
                    borderColor: theme.borderColor,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.bookHeader}
                  onPress={() => toggleExpand(book.id)}
                  onLongPress={() => handleLongPressBook(book)}
                  delayLongPress={500}
                  activeOpacity={0.85}
                >
                  <View style={{ marginRight: 12 }}>
                    {renderCoverThumb(book, 56, theme)}
                  </View>
                  <View style={styles.bookHeaderLeft}>
                    <Text style={[styles.bookName, { color: theme.textColor }]}>
                      {book.name}
                    </Text>
                    {book.description ? (
                      <Text
                        style={[styles.bookDescription, { color: theme.subTextColor }]}
                        numberOfLines={2}
                      >
                        {book.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.bookHeaderRight}>
                    {onWorldBookIdsChange ? (
                      <View style={{ marginRight: 6 }}>
                        <Switch
                          value={selected}
                          onValueChange={() => handleToggleChatLink(book.id)}
                          trackColor={{ true: theme.accentColor + '80', false: theme.borderColor }}
                          thumbColor={selected ? theme.accentColor : '#fff'}
                        />
                      </View>
                    ) : null}
                    {isExpanded ? (
                      <IconUp size={18} color={theme.subTextColor} />
                    ) : (
                      <IconChevronDown size={18} color={theme.subTextColor} />
                    )}
                  </View>
                </TouchableOpacity>

                <View style={styles.bookMeta}>
                  <TouchableOpacity
                    onPress={() => handleOpenEditor(book)}
                    activeOpacity={0.7}
                    style={[styles.metaBadge, { backgroundColor: theme.secondaryColor }]}
                  >
                    <Text style={[styles.metaText, { color: theme.textColor }]}>
                      {book.entries.length} 条条目 · 点此编辑
                    </Text>
                  </TouchableOpacity>
                  <View
                    style={[
                      styles.metaBadge,
                      {
                        backgroundColor: allEnabled ? '#dcfce7' : theme.secondaryColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.metaText,
                        { color: allEnabled ? '#16a34a' : theme.subTextColor },
                      ]}
                    >
                      {enabledCount} / {book.entries.length} 启用
                    </Text>
                  </View>
                </View>

                {isExpanded && (
                  <View style={[styles.entriesList, { borderTopColor: theme.borderColor }]}>
                    {book.entries.map((entry) => (
                      <View
                        key={entry.id}
                        style={[
                          styles.entryCard,
                          {
                            backgroundColor: theme.secondaryColor,
                            opacity: entry.enabled ? 1 : 0.55,
                          },
                        ]}
                      >
                        <View style={styles.entryCardHeader}>
                          <View style={styles.entryKeyContainer}>
                            <Text style={[styles.entryKeyText, { color: theme.textColor }]}>
                              {entry.keys && entry.keys.length > 0
                                ? entry.keys.join(', ')
                                : '无关键词'}
                            </Text>
                          </View>
                          {entry.category ? (
                            <View style={[styles.entryCatContainer, { backgroundColor: theme.primaryColor }]}>
                              <Text style={[styles.entryCatLabel, { color: theme.textColor }]}>
                                {entry.category}
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.entryOrderBadge}>
                            <Text style={styles.entryOrderText}>P{entry.order || 0}</Text>
                          </View>
                        </View>
                        <Text
                          style={[styles.entryContent, { color: theme.subTextColor }]}
                          numberOfLines={3}
                        >
                          {entry.content}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <View style={[styles.bookActions, { borderTopColor: theme.borderColor }]}>
                  <TouchableOpacity
                    onPress={() => handleToggleBookEnabled(book.id)}
                    style={[
                      styles.actionBtn,
                      { backgroundColor: allEnabled ? theme.secondaryColor : theme.accentColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionBtnText,
                        { color: allEnabled ? theme.textColor : '#fff' },
                      ]}
                    >
                      {allEnabled ? '全部禁用' : '全部启用'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleOpenEditor(book, true)}
                    style={[styles.actionBtn, { backgroundColor: theme.accentColor }]}
                  >
                    <IconPlus size={16} color="#fff" />
                    <Text style={[styles.actionBtnText, { color: '#fff', marginLeft: 4 }]}>
                      加条目
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleOpenEditor(book)}
                    style={[styles.actionBtn, { backgroundColor: theme.secondaryColor }]}
                  >
                    <IconEdit size={16} color={theme.textColor} />
                    <Text style={[styles.actionBtnText, { color: theme.textColor, marginLeft: 4 }]}>
                      编辑
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteBook(book.id)}
                    style={[styles.actionBtn, { backgroundColor: '#fee2e2' }]}
                  >
                    <IconTrash size={16} color="#ef4444" />
                  </TouchableOpacity>
                  {onAddToChat && (
                    <TouchableOpacity
                      onPress={() => handleAddToChat(book)}
                      style={[styles.actionBtn, { backgroundColor: '#26de81' }]}
                    >
                      <IconSend size={16} color="#fff" />
                      <Text style={[styles.actionBtnText, { color: '#fff', marginLeft: 4 }]}>
                        添加到对话
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        visible={showEditor}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditor(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>
                {editingBook ? '编辑世界书' : '新建世界书'}
              </Text>
              <TouchableOpacity onPress={() => setShowEditor(false)}>
                <IconClose size={20} color={theme.textColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>世界书名称</Text>
                <TextInput
                  style={[
                    styles.formInput,
                    {
                      color: theme.textColor,
                      backgroundColor: theme.primaryColor,
                      borderColor: theme.borderColor,
                    },
                  ]}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="输入世界书名称"
                  placeholderTextColor={theme.subTextColor}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>描述（可选）</Text>
                <TextInput
                  style={[
                    styles.formTextArea,
                    {
                      color: theme.textColor,
                      backgroundColor: theme.primaryColor,
                      borderColor: theme.borderColor,
                    },
                  ]}
                  value={formDescription}
                  onChangeText={setFormDescription}
                  placeholder="输入世界书描述..."
                  placeholderTextColor={theme.subTextColor}
                  multiline
                  numberOfLines={2}
                />
              </View>

              <View style={styles.formGroup}>
                <View style={styles.entriesSectionHeader}>
                  <Text style={[styles.entriesSectionTitle, { color: theme.textColor }]}>
                    条目 ({formEntries.length})
                  </Text>
                  <View style={styles.entriesSectionActions}>
                    {formEntries.length > 0 && (
                      <TouchableOpacity
                        onPress={handleToggleAllEntriesInEditor}
                        style={[
                          styles.secondaryActionBtn,
                          {
                            backgroundColor:
                              formEntries.length > 0 && formEntries.every((e) => e.enabled)
                                ? theme.secondaryColor
                                : theme.accentColor,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.secondaryActionBtnText,
                            {
                              color:
                                formEntries.length > 0 && formEntries.every((e) => e.enabled)
                                  ? theme.textColor
                                  : '#fff',
                            },
                          ]}
                        >
                          {formEntries.length > 0 && formEntries.every((e) => e.enabled)
                            ? '全部禁用'
                            : '全选启用'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={handleAddEntryToEditor}
                      style={[styles.addEntryBtn, { backgroundColor: theme.accentColor }]}
                    >
                      <IconPlus size={16} color="#fff" />
                      <Text style={styles.addEntryBtnText}>添加条目</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.editorEntriesList}>
                  {formEntries.map((entry, index) => renderEntryItem(entry, index))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowEditor(false)}
                style={[styles.cancelBtn, { backgroundColor: theme.primaryColor }]}
              >
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveBook}
                style={[styles.saveBtn, { backgroundColor: theme.accentColor }]}
              >
                <Text style={{ color: '#fff' }}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 封面裁切编辑器 Modal */}
      {showCoverEditor && coverEditingBook ? (
        <Modal visible={showCoverEditor} animationType="slide" transparent onRequestClose={() => setShowCoverEditor(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
              <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor }]}>
                <Text style={[styles.modalTitle, { color: theme.textColor }]}>封面裁切</Text>
                <TouchableOpacity onPress={() => setShowCoverEditor(false)}>
                  <IconClose size={22} color={theme.textColor} />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 16, gap: 18, alignItems: 'center' }}>
                {/* 预览区 */}
                <View
                  style={{
                    width: 180,
                    height: 180,
                    borderRadius: coverCfg.borderRadius,
                    overflow: 'hidden',
                    backgroundColor: theme.secondaryColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {coverImageUri ? (
                    <Image
                      source={{ uri: coverImageUri }}
                      style={{
                        width: 360,
                        height: 360,
                        transform: [
                          { translateX: coverCfg.offsetX * 90 },
                          { translateY: coverCfg.offsetY * 90 },
                          { scale: coverCfg.scale },
                        ],
                      }}
                      resizeMode="cover"
                    />
                  ) : (
                    <IconImage size={48} color={theme.subTextColor} />
                  )}
                </View>

                {/* 四个滑块（退化为 ± 按钮 + 数值） */}
                {/* X */}
                <View style={styles.coverSliderRow}>
                  <Text style={[styles.coverSliderLabel, { color: theme.textColor }]}>横向位置 X</Text>
                  <View style={styles.coverStepControl}>
                    <TouchableOpacity
                      style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                      onPress={() => setCoverCfg((c) => ({ ...c, offsetX: clamp(roundToStep(c.offsetX - 0.05, 0.05), -1, 1) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={[styles.stepValue, { color: theme.textColor }]}>{coverCfg.offsetX.toFixed(2)}</Text>
                    <TouchableOpacity
                      style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                      onPress={() => setCoverCfg((c) => ({ ...c, offsetX: clamp(roundToStep(c.offsetX + 0.05, 0.05), -1, 1) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Y */}
                <View style={styles.coverSliderRow}>
                  <Text style={[styles.coverSliderLabel, { color: theme.textColor }]}>纵向位置 Y</Text>
                  <View style={styles.coverStepControl}>
                    <TouchableOpacity
                      style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                      onPress={() => setCoverCfg((c) => ({ ...c, offsetY: clamp(roundToStep(c.offsetY - 0.05, 0.05), -1, 1) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={[styles.stepValue, { color: theme.textColor }]}>{coverCfg.offsetY.toFixed(2)}</Text>
                    <TouchableOpacity
                      style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                      onPress={() => setCoverCfg((c) => ({ ...c, offsetY: clamp(roundToStep(c.offsetY + 0.05, 0.05), -1, 1) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Scale */}
                <View style={styles.coverSliderRow}>
                  <Text style={[styles.coverSliderLabel, { color: theme.textColor }]}>缩放 Scale</Text>
                  <View style={styles.coverStepControl}>
                    <TouchableOpacity
                      style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                      onPress={() => setCoverCfg((c) => ({ ...c, scale: clamp(roundToStep(c.scale - 0.1, 0.1), 1, 3) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={[styles.stepValue, { color: theme.textColor }]}>{coverCfg.scale.toFixed(1)}</Text>
                    <TouchableOpacity
                      style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                      onPress={() => setCoverCfg((c) => ({ ...c, scale: clamp(roundToStep(c.scale + 0.1, 0.1), 1, 3) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Radius */}
                <View style={styles.coverSliderRow}>
                  <Text style={[styles.coverSliderLabel, { color: theme.textColor }]}>圆角 Radius</Text>
                  <View style={styles.coverStepControl}>
                    <TouchableOpacity
                      style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                      onPress={() => setCoverCfg((c) => ({ ...c, borderRadius: clamp(c.borderRadius - 2, 0, 32) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={[styles.stepValue, { color: theme.textColor }]}>{coverCfg.borderRadius}</Text>
                    <TouchableOpacity
                      style={[styles.stepBtn, { backgroundColor: theme.secondaryColor }]}
                      onPress={() => setCoverCfg((c) => ({ ...c, borderRadius: clamp(c.borderRadius + 2, 0, 32) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>

              <View style={[styles.modalActions, { borderTopColor: theme.borderColor }]}>
                <TouchableOpacity
                  onPress={() => setShowCoverEditor(false)}
                  style={[styles.cancelBtn, { backgroundColor: theme.primaryColor }]}
                >
                  <Text style={{ color: theme.textColor }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveCover}
                  style={[styles.saveBtn, { backgroundColor: theme.accentColor }]}
                >
                  <Text style={{ color: '#fff' }}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      {/* 长按 ActionSheet */}
      <ActionSheet
        visible={showBookActionSheet}
        onClose={() => setShowBookActionSheet(false)}
        title={bookActionSheetTitle}
        actions={bookActions}
        theme={theme}
      />
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
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  addBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSection: {
    padding: 16,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 44,
  },
  tagsContainer: {
    gap: 8,
  },
  tagItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 32,
  },
  emptyContainer: {
    padding: 48,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyHint: {
    fontSize: 14,
  },
  bookCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  bookHeader: {
    flexDirection: 'row',
    padding: 14,
  },
  bookHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  bookHeaderRight: {
    justifyContent: 'center',
    paddingLeft: 8,
  },
  bookName: {
    fontSize: 16,
    fontWeight: '600',
  },
  bookDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  bookMeta: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  metaBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  entriesList: {
    borderTopWidth: 1,
    paddingVertical: 8,
    gap: 8,
  },
  entryCard: {
    borderRadius: 10,
    padding: 12,
    marginHorizontal: 14,
    gap: 8,
  },
  entryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryKeyContainer: {
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  entryKeyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  entryCatContainer: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  entryCatLabel: {
    fontSize: 11,
  },
  entryOrderBadge: {
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  entryOrderText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  entryContent: {
    fontSize: 13,
    lineHeight: 18,
  },
  bookActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flex: 1,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
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
    flex: 1,
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  formInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
  },
  formTextArea: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  entriesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  entriesSectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entriesSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  addEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  addEntryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  editorEntriesList: {
    gap: 10,
  },
  entryItem: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  entryItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
  },
  entryItemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  entryIndex: {
    fontSize: 12,
    fontWeight: '700',
  },
  entryKeyBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 120,
  },
  entryKeyBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  entryCatBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  entryCatText: {
    fontSize: 11,
  },
  entryItemHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  entryToggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  entryToggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignSelf: 'flex-end',
  },
  entryExpandContent: {
    padding: 12,
    gap: 10,
  },
  entryField: {
    gap: 6,
  },
  entryFieldLabel: {
    fontSize: 13,
  },
  entryFieldInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 38,
    fontSize: 14,
  },
  entryFieldTextArea: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
    // 世界书词条内容可以很长，必须封顶否则会撑满整屏
    minHeight: 96,
    maxHeight: 240,
  },
  categoryOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryOption: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  categoryOptionText: {
    fontSize: 12,
  },
  prioritySlider: {
    flexDirection: 'row',
    gap: 6,
  },
  priorityDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
  },
  entryExpandActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  entryMoveBtn: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  entryDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  coverSliderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    gap: 12,
  },
  coverSliderLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  coverStepControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    minWidth: 54,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});