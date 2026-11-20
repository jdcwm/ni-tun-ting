import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { generateId, defaultChatSettings } from '../constants/defaults';
import { IconClose, IconPlus, IconChevronRight, IconTrash, IconEdit, IconBook, IconSend } from '../components/Icons';
import { WorldBook } from '../types';

interface Props {
  onClose: () => void;
  onCreated: (chatId: string) => void;
}

type Mode = 'list' | 'create' | 'edit';

export const WorldOrganizerScreen: React.FC<Props> = ({ onClose, onCreated }) => {
  const theme = useTheme();
  const { chats, setChats, worldBooks, setWorldBooks, currentChatId } = useApp();
  const [mode, setMode] = useState<Mode>('list');
  const [editingBook, setEditingBook] = useState<WorldBook | null>(null);
  const [title, setTitle] = useState('');
  const [worldInput, setWorldInput] = useState('');
  const [parseMode, setParseMode] = useState<'simple' | 'separator' | 'ai'>('simple');
  const [separator, setSeparator] = useState('【条目】');
  const [parsing, setParsing] = useState(false);

  const parseEntries = (): { keys: string[]; content: string }[] => {
    const entries: { keys: string[]; content: string }[] = [];

    if (parseMode === 'simple') {
      const lines = worldInput.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const match = line.match(/^[\s]*([:：])\s*(.+)$/);
        if (match) {
          entries.push({ keys: [match[2].trim()], content: line });
        } else {
          entries.push({ keys: [line.slice(0, 10)], content: line });
        }
      }
    } else if (parseMode === 'separator') {
      const parts = worldInput.split(separator).filter(p => p.trim());
      for (const part of parts) {
        const firstLine = part.split('\n')[0].trim();
        entries.push({ keys: [firstLine.slice(0, 20)], content: part.trim() });
      }
    } else if (parseMode === 'ai') {
      const paragraphs = worldInput.split(/\n{2,}/).filter(p => p.trim());
      for (const para of paragraphs) {
        const firstLine = para.split('\n')[0].trim();
        entries.push({ keys: [firstLine.slice(0, 15)], content: para.trim() });
      }
      if (entries.length === 0) {
        const lines = worldInput.split('\n').filter(l => l.trim());
        for (const line of lines) {
          entries.push({ keys: [line.slice(0, 15)], content: line });
        }
      }
    }

    return entries;
  };

  const handleSaveAsWorldBook = () => {
    if (!title.trim()) { Alert.alert('提示', '请输入世界书名称'); return; }
    if (!worldInput.trim()) { Alert.alert('提示', '请输入世界书内容'); return; }

    setParsing(true);
    try {
      const parsed = parseEntries();
      const now = Date.now();
      const newBook: WorldBook = {
        id: editingBook ? editingBook.id : generateId(),
        name: title.trim(),
        entries: parsed.map((e, i) => ({
          id: generateId(),
          keys: e.keys,
          content: e.content,
          images: [],
          enabled: true,
          order: i,
        })),
        createdAt: editingBook ? editingBook.createdAt : now,
        updatedAt: now,
      };

      if (editingBook) {
        setWorldBooks(worldBooks.map(wb => wb.id === editingBook.id ? newBook : wb));
      } else {
        setWorldBooks([...worldBooks, newBook]);
      }

      setParsing(false);
      setMode('list');
      setEditingBook(null);
      setTitle('');
      setWorldInput('');
      Alert.alert('成功', `已保存世界书 "${title}"，包含 ${parsed.length} 条条目`);
    } catch (e) {
      setParsing(false);
      Alert.alert('错误', '保存失败: ' + String(e));
    }
  };

  const handleCreateChatFromWorld = () => {
    if (!title.trim()) { Alert.alert('提示', '请输入世界书名称'); return; }
    if (!worldInput.trim()) { Alert.alert('提示', '请输入世界书内容'); return; }

    setParsing(true);
    try {
      const parsed = parseEntries();
      const now = Date.now();
      const newChatId = generateId();

      const newBook: WorldBook = {
        id: generateId(),
        name: title.trim(),
        entries: parsed.map((e, i) => ({
          id: generateId(),
          keys: e.keys,
          content: e.content,
          images: [],
          enabled: true,
          order: i,
        })),
        createdAt: now,
        updatedAt: now,
      };

      setWorldBooks([...worldBooks, newBook]);

      const newChat = {
        id: newChatId,
        title: title.trim(),
        characterId: undefined,
        createdAt: now,
        updatedAt: now,
        messages: [],
        settings: { ...defaultChatSettings, systemPrompt: title.trim() },
        wallpaper: undefined,
        userAvatar: undefined,
        assistantAvatar: undefined,
        worldBookIds: [newBook.id],
      };

      setChats([...chats, newChat]);
      setParsing(false);
      setTitle('');
      setWorldInput('');
      Alert.alert('成功', `已创建对话 "${title}"`, [
        { text: '进入对话', onPress: () => onCreated(newChatId) },
      ]);
    } catch (e) {
      setParsing(false);
      Alert.alert('错误', '创建失败: ' + String(e));
    }
  };

  const handleInsertToChat = (bookId: string) => {
    if (!currentChatId) {
      Alert.alert('提示', '请先选择或创建一个对话');
      return;
    }
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) {
      Alert.alert('提示', '未找到当前对话');
      return;
    }

    const alreadyLinked = chat.worldBookIds.includes(bookId);
    if (alreadyLinked) {
      Alert.alert('提示', '该世界书已关联到当前对话');
      return;
    }

    setChats(chats.map(c => c.id === currentChatId
      ? { ...c, worldBookIds: [...c.worldBookIds, bookId], updatedAt: Date.now() }
      : c
    ));
    Alert.alert('成功', '世界书已插入当前对话');
  };

  const handleRemoveFromChat = (bookId: string) => {
    if (!currentChatId) return;
    setChats(chats.map(c => c.id === currentChatId
      ? { ...c, worldBookIds: c.worldBookIds.filter(id => id !== bookId), updatedAt: Date.now() }
      : c
    ));
  };

  const handleDeleteWorldBook = (bookId: string) => {
    Alert.alert('确认删除', '删除后不可恢复，确定要删除这个世界书吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setWorldBooks(worldBooks.filter(wb => wb.id !== bookId));
          setChats(chats.map(c => ({
            ...c,
            worldBookIds: c.worldBookIds.filter(id => id !== bookId),
          })));
        },
      },
    ]);
  };

  const handleEditWorldBook = (book: WorldBook) => {
    setEditingBook(book);
    setTitle(book.name);
    setWorldInput(book.entries.map(e => {
      if (e.keys.length > 0 && e.keys[0]) {
        return `${e.keys.join(', ')}: ${e.content}`;
      }
      return e.content;
    }).join('\n\n'));
    setMode('edit');
  };

  const handleQuickSaveEntry = () => {
    if (!worldInput.trim()) { Alert.alert('提示', '请输入世界书内容'); return; }
    if (!currentChatId) {
      Alert.alert('提示', '请先选择或创建一个对话');
      return;
    }

    const parsed = parseEntries();
    const now = Date.now();
    const tempBook: WorldBook = {
      id: generateId(),
      name: title.trim() || `暂存世界书 ${new Date().toLocaleString()}`,
      entries: parsed.map((e, i) => ({
        id: generateId(),
        keys: e.keys,
        content: e.content,
        images: [],
        enabled: true,
        order: i,
      })),
      createdAt: now,
      updatedAt: now,
    };

    setWorldBooks([...worldBooks, tempBook]);
    setChats(chats.map(c => c.id === currentChatId
      ? { ...c, worldBookIds: [...c.worldBookIds, tempBook.id], updatedAt: now }
      : c
    ));
    Alert.alert('成功', `已暂存 ${parsed.length} 条条目并插入当前对话`);
  };

  const linkedBookIds = useMemo(() => {
    if (!currentChatId) return new Set<string>();
    const chat = chats.find(c => c.id === currentChatId);
    return new Set(chat?.worldBookIds || []);
  }, [currentChatId, chats]);

  const handleOpenCreate = () => {
    setEditingBook(null);
    setTitle('');
    setWorldInput('');
    setMode('create');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <IconClose size={22} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>世界观整理工具</Text>
        <View style={{ width: 36 }} />
      </View>

      {mode === 'list' ? (
        <ScrollView style={styles.content}>
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
            onPress={handleOpenCreate}
          >
            <View style={[styles.actionIcon, { backgroundColor: theme.accentColor }]}>
              <IconPlus size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.actionTitle, { color: theme.textColor }]}>新建世界书</Text>
              <Text style={[styles.actionDesc, { color: theme.subTextColor }]}>
                粘贴世界观文本，自动解析为世界书条目
              </Text>
            </View>
            <IconChevronRight size={18} color={theme.subTextColor} />
          </TouchableOpacity>

          <View style={[styles.infoCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.infoTitle, { color: theme.textColor }]}>支持的解析模式</Text>
            <View style={styles.infoRow}>
              <Text style={[styles.infoBullet, { color: theme.accentColor }]}>•</Text>
              <Text style={[styles.infoText, { color: theme.subTextColor }]}>简单模式：按行解析，自动识别"键:值"格式</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoBullet, { color: theme.accentColor }]}>•</Text>
              <Text style={[styles.infoText, { color: theme.subTextColor }]}>分隔符模式：自定义分隔符拆分条目</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoBullet, { color: theme.accentColor }]}>•</Text>
              <Text style={[styles.infoText, { color: theme.subTextColor }]}>AI 模式：按段落智能解析</Text>
            </View>
          </View>

          {worldBooks.length > 0 && (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.textColor }]}>我的世界书 ({worldBooks.length})</Text>
            </View>
          )}

          {worldBooks.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
              <IconBook size={36} color={theme.subTextColor} />
              <Text style={[styles.emptyText, { color: theme.subTextColor }]}>暂无世界书</Text>
              <Text style={[styles.emptySub, { color: theme.subTextColor }]}>点击上方按钮创建第一个世界书</Text>
            </View>
          ) : (
            worldBooks.map((wb) => {
              const isLinked = linkedBookIds.has(wb.id);
              const enabledCount = wb.entries.filter(e => e.enabled).length;
              return (
                <View
                  key={wb.id}
                  style={[
                    styles.bookCard,
                    { backgroundColor: theme.primaryColor, borderColor: theme.borderColor },
                    isLinked && { borderColor: theme.accentColor, borderWidth: 2 },
                  ]}
                >
                  <View style={styles.bookHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bookName, { color: theme.textColor }]} numberOfLines={1}>
                        {wb.name}
                      </Text>
                      <Text style={[styles.bookMeta, { color: theme.subTextColor }]}>
                        {wb.entries.length} 条条目 · 启用 {enabledCount} 条
                      </Text>
                    </View>
                    {isLinked && (
                      <View style={[styles.linkedBadge, { backgroundColor: theme.accentColor }]}>
                        <Text style={{ color: '#fff', fontSize: 11 }}>已关联</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.bookActions}>
                    {isLinked ? (
                      <TouchableOpacity
                        style={[styles.bookActionBtn, { borderColor: theme.borderColor }]}
                        onPress={() => handleRemoveFromChat(wb.id)}
                      >
                        <Text style={{ color: theme.subTextColor, fontSize: 12 }}>取消关联</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.bookActionBtn, { backgroundColor: theme.accentColor, borderColor: theme.accentColor }]}
                        onPress={() => handleInsertToChat(wb.id)}
                      >
                        <IconSend size={14} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 12, marginLeft: 4 }}>插入对话</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.bookActionBtn, { borderColor: theme.borderColor }]}
                      onPress={() => handleEditWorldBook(wb)}
                    >
                      <IconEdit size={14} color={theme.textColor} />
                      <Text style={{ color: theme.textColor, fontSize: 12, marginLeft: 4 }}>编辑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.bookActionBtn, { borderColor: theme.borderColor }]}
                      onPress={() => handleDeleteWorldBook(wb.id)}
                    >
                      <IconTrash size={14} color="#ff6b6b" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}

          <TouchableOpacity
            style={[styles.secondaryCard, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
            onPress={handleQuickSaveEntry}
          >
            <Text style={[styles.secondaryText, { color: theme.textColor }]}>快速保存条目到当前对话</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.textColor }]}>
              {editingBook ? '编辑世界书' : '世界书名称'}
            </Text>
            <TextInput
              style={[styles.textInput, { color: theme.textColor, backgroundColor: theme.inputBgColor, borderColor: theme.borderColor }]}
              placeholder="例如：异世界法则"
              placeholderTextColor={theme.subTextColor}
              value={title}
              onChangeText={setTitle}
            />
          </View>

          {!editingBook && (
            <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
              <Text style={[styles.label, { color: theme.textColor }]}>解析模式</Text>
              <View style={styles.segmentRow}>
                {(['simple', 'separator', 'ai'] as const).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.segment,
                      { borderColor: theme.borderColor },
                      parseMode === m && { backgroundColor: theme.accentColor, borderColor: theme.accentColor },
                    ]}
                    onPress={() => setParseMode(m)}
                  >
                    <Text style={{ color: parseMode === m ? '#fff' : theme.textColor, fontSize: 13 }}>
                      {m === 'simple' ? '简单' : m === 'separator' ? '分隔符' : 'AI'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {parseMode === 'separator' && (
                <TextInput
                  style={[styles.textInput, { color: theme.textColor, backgroundColor: theme.inputBgColor, borderColor: theme.borderColor, marginTop: 8 }]}
                  placeholder="分隔符，如 【条目】"
                  placeholderTextColor={theme.subTextColor}
                  value={separator}
                  onChangeText={setSeparator}
                />
              )}
            </View>
          )}

          <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.label, { color: theme.textColor }]}>世界书内容</Text>
            <TextInput
              style={[styles.textArea, { color: theme.textColor, backgroundColor: theme.inputBgColor, borderColor: theme.borderColor }]}
              placeholder={editingBook ? '编辑世界书条目...' : '粘贴或输入世界观文本...'}
              placeholderTextColor={theme.subTextColor}
              value={worldInput}
              onChangeText={setWorldInput}
              multiline
              textAlignVertical="top"
              numberOfLines={10}
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
              onPress={() => { setMode('list'); setEditingBook(null); }}
            >
              <Text style={{ color: theme.textColor, fontWeight: '600' }}>返回</Text>
            </TouchableOpacity>
            {editingBook ? (
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: theme.accentColor }]}
                onPress={handleSaveAsWorldBook}
                disabled={parsing}
              >
                {parsing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '600' }}>保存修改</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: theme.accentColor }]}
                  onPress={handleSaveAsWorldBook}
                  disabled={parsing}
                >
                  {parsing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={{ color: '#fff', fontWeight: '600' }}>保存世界书</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmBtn, { backgroundColor: theme.accentColor }]}
                  onPress={handleCreateChatFromWorld}
                  disabled={parsing}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>创建对话</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
  },
  headerBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  content: { flex: 1, padding: 16 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 12,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  actionDesc: { fontSize: 13, lineHeight: 18 },
  infoCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  infoTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
  infoBullet: { fontSize: 14, lineHeight: 20 },
  infoText: { fontSize: 13, lineHeight: 20, flex: 1 },
  sectionHeader: { marginTop: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  bookCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  bookHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  bookName: { fontSize: 15, fontWeight: '600' },
  bookMeta: { fontSize: 12, marginTop: 2 },
  linkedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  bookActions: { flexDirection: 'row', gap: 8 },
  bookActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyState: {
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8,
  },
  emptyText: { fontSize: 15, fontWeight: '600', marginTop: 10 },
  emptySub: { fontSize: 13, marginTop: 4 },
  secondaryCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 12,
  },
  secondaryText: { fontSize: 14, fontWeight: '600' },
  inputGroup: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  textArea: {
    maxHeight: 240,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 180,
  },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
});