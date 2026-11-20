import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Image, TextInput, Alert } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { ChatSettingsPanel } from './ChatSettingsPanel';
import { ChatSettings, PromptPreset, ChatMessage, WorldBook, WorldBookCoverConfig } from '../types';
import { SummaryTab } from './SummaryTab';
import { GalleryTab } from './GalleryTab';
import { PromptManagerTab } from './PromptManagerTab';
import { useApp } from '../context/AppContext';
import { ActionSheet, ActionSheetAction } from '../components/ActionSheet';
import {
  IconClose,
  IconSearch,
  IconImage,
  IconEdit,
  IconTrash,
  IconSend,
  IconGlobe,
  IconPlus,
  IconChevronDown,
} from '../components/Icons';
import { imageUtils } from '../utils/imageUtils';
import { Modal } from 'react-native';

interface RightDrawerProps {
  chatId: string;
  chatSettings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  wallpaper?: string;
  onWallpaperChange?: (wallpaper?: string) => void;
  /** 视频背景播放状态（由外层提升） */
  videoBgState?: { muted: boolean; paused: boolean };
  onVideoBgStateChange?: (state: { muted: boolean; paused: boolean }) => void;
  /** 当前背景是否为视频，用于决定是否显示播放控制 */
  isVideoBackground?: boolean;
  worldBookIds?: string[];
  onWorldBookIdsChange?: (ids: string[]) => void;
  isChildConversation?: boolean;
  characterId?: string;
  onSelectPromptPreset?: (preset: PromptPreset) => void;
  userAvatar?: string;
  onUserAvatarChange?: (avatar?: string) => void;
  assistantAvatar?: string;
  onAssistantAvatarChange?: (avatar?: string) => void;
  onNavigateToChat?: (chatId: string) => void;
  messages?: ChatMessage[];
  onAddSystemPrompt?: (prompt: string) => void;
  onRequestOpenWorldBookEditor?: (worldBookId?: string) => void;
  isSharedCard?: boolean;
  cardHideFlags?: {
    systemPrompt?: boolean;
    worldBook?: boolean;
    characterDesc?: boolean;
    characterPersonality?: boolean;
    characterScenario?: boolean;
    author?: boolean;
    css?: boolean;
    regex?: boolean;
    greeting?: boolean;
  };
  extraSystemPrompt?: string;
  onExtraSystemPromptChange?: (text: string) => void;
  onOpenCharacterPicker?: () => void;
}

type TabType = 'settings' | 'worldbook' | 'prompts' | 'summary' | 'gallery';

const DEFAULT_COVER_CONFIG: WorldBookCoverConfig = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  borderRadius: 8,
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const roundToStep = (v: number, step: number) => {
  return Math.round((Math.round(v / step) * step) * 100) / 100;
};

/** 渲染世界书封面缩略图（复用 WorldBookScreen 的公式；RightDrawerContent 也有独立实现以避免耦合） */
const renderCoverThumb = (book: WorldBook, viewport: number, theme: any) => {
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

export const RightDrawerContent: React.FC<RightDrawerProps> = ({
  chatId,
  chatSettings,
  onSettingsChange,
  wallpaper,
  onWallpaperChange,
  videoBgState,
  onVideoBgStateChange,
  isVideoBackground,
  worldBookIds,
  onWorldBookIdsChange,
  isChildConversation = false,
  characterId,
  onSelectPromptPreset,
  userAvatar,
  onUserAvatarChange,
  assistantAvatar,
  onAssistantAvatarChange,
  onNavigateToChat,
  messages,
  onAddSystemPrompt,
  onRequestOpenWorldBookEditor,
  isSharedCard = false,
  cardHideFlags,
  extraSystemPrompt,
  onExtraSystemPromptChange,
  onOpenCharacterPicker,
}) => {
  const theme = useTheme();
  const { worldBooks, setWorldBooks, chats, setChats } = useApp();
  const [activeTab, setActiveTab] = useState<TabType>('settings');

  // 群聊：群聊总设定 + 单角色设定 两个框
  const groupChat = chats.find((c) => c.id === chatId && c.conversationType === 'group');
  /** 群聊设定区是否展开（默认收起，避免占满整个面板） */
  const [groupSectionOpen, setGroupSectionOpen] = useState(false);
  const [groupPromptDraft, setGroupPromptDraft] = useState(chatSettings?.systemPrompt || '');
  const [memberPromptTarget, setMemberPromptTarget] = useState<string | null>(null);
  const [memberPromptDraft, setMemberPromptDraft] = useState('');
  useEffect(() => {
    setGroupPromptDraft(chatSettings?.systemPrompt || '');
  }, [chatId, chatSettings?.systemPrompt]);
  useEffect(() => {
    if (!memberPromptTarget) return;
    const m = groupChat?.groupMembers?.find((x) => x.id === memberPromptTarget);
    setMemberPromptDraft(m?.settings.systemPrompt || '');
  }, [memberPromptTarget]);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'settings', label: '设置' },
    { key: 'worldbook', label: '世界书' },
    { key: 'prompts', label: '提示词' },
    { key: 'summary', label: '总结' },
    { key: 'gallery', label: '图库' },
  ];

  // --- worldbook state ---
  const [wbSearch, setWbSearch] = useState('');
  const [expandedWbIds, setExpandedWbIds] = useState<Set<string>>(new Set());

  const filteredBooks = useMemo(() => {
    const q = wbSearch.trim().toLowerCase();
    return worldBooks
      .filter((wb) => {
        if (!q) return true;
        return (
          wb.name.toLowerCase().includes(q) ||
          (wb.description || '').toLowerCase().includes(q) ||
          wb.entries.some((e) => e.content.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [worldBooks, wbSearch]);

  // 长按 ActionSheet
  const [showWbActionSheet, setShowWbActionSheet] = useState(false);
  const [longPressWb, setLongPressWb] = useState<WorldBook | null>(null);
  const [wbActions, setWbActions] = useState<ActionSheetAction[]>([]);

  // 封面裁切
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [coverEditingWb, setCoverEditingWb] = useState<WorldBook | null>(null);
  const [coverImageUri, setCoverImageUri] = useState<string | null>(null);
  const [coverCfg, setCoverCfg] = useState<WorldBookCoverConfig>(DEFAULT_COVER_CONFIG);

  const toggleWbInChat = (wbId: string) => {
    if (!onWorldBookIdsChange) return;
    const ids = worldBookIds ?? [];
    const next = ids.includes(wbId) ? ids.filter((id) => id !== wbId) : [...ids, wbId];
    onWorldBookIdsChange(next);
  };

  const toggleExpandWb = (wbId: string) => {
    setExpandedWbIds((prev) => {
      const next = new Set(prev);
      if (next.has(wbId)) next.delete(wbId);
      else next.add(wbId);
      return next;
    });
  };

  const toggleWbEntryEnabled = async (wbId: string, entryId: string) => {
    const wb = worldBooks.find((w) => w.id === wbId);
    if (!wb) return;
    const updated: WorldBook = {
      ...wb,
      entries: wb.entries.map((e) => (e.id === entryId ? { ...e, enabled: !e.enabled } : e)),
      updatedAt: Date.now(),
    };
    await setWorldBooks(worldBooks.map((w) => (w.id === wbId ? updated : w)));
  };

  const toggleWbAllEntriesEnabled = async (wbId: string) => {
    const wb = worldBooks.find((w) => w.id === wbId);
    if (!wb || wb.entries.length === 0) return;
    const allOn = wb.entries.every((e) => e.enabled);
    const updated: WorldBook = {
      ...wb,
      entries: wb.entries.map((e) => ({ ...e, enabled: !allOn })),
      updatedAt: Date.now(),
    };
    await setWorldBooks(worldBooks.map((w) => (w.id === wbId ? updated : w)));
  };

  const handleSetCover = async (wb: WorldBook) => {
    try {
      const uri = await imageUtils.pickImageFromGallery();
      if (!uri) return;
      setCoverEditingWb(wb);
      setCoverImageUri(uri);
      setCoverCfg({ ...(wb.coverConfig || DEFAULT_COVER_CONFIG) });
      setShowCoverEditor(true);
    } catch (e: any) {
      Alert.alert('设置失败', e?.message || '未知错误');
    }
  };

  const handleSaveCover = async () => {
    if (!coverEditingWb || !coverImageUri) return;
    try {
      let savedUri = coverImageUri;
      try {
        savedUri = await imageUtils.saveImageToAppDir(coverImageUri, 'wb_covers');
      } catch (_) {}
      const now = Date.now();
      const updated: WorldBook = {
        ...coverEditingWb,
        coverImage: savedUri,
        coverConfig: { ...coverCfg },
        updatedAt: now,
      };
      await setWorldBooks(worldBooks.map((wb) => (wb.id === coverEditingWb.id ? updated : wb)));
      setShowCoverEditor(false);
      setCoverEditingWb(null);
      setCoverImageUri(null);
    } catch (e: any) {
      Alert.alert('保存失败', e?.message || '未知错误');
    }
  };

  const handleDeleteWb = (wbId: string) => {
    Alert.alert('删除确认', '确定要删除这本世界书及其所有条目吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await setWorldBooks(worldBooks.filter((wb) => wb.id !== wbId));
          // 如果在当前对话关联中也移除
          if (onWorldBookIdsChange && worldBookIds?.includes(wbId)) {
            onWorldBookIdsChange(worldBookIds.filter((id) => id !== wbId));
          }
        },
      },
    ]);
  };

  const handleLongPressWb = (wb: WorldBook) => {
    setLongPressWb(wb);
    const selected = !!worldBookIds?.includes(wb.id);
    const actions: ActionSheetAction[] = [
      {
        label: '设置封面',
        onPress: () => handleSetCover(wb),
        icon: <IconImage size={18} color={theme.subTextColor} />,
      },
      {
        label: '编辑',
        onPress: () => {
          if (onRequestOpenWorldBookEditor) {
            onRequestOpenWorldBookEditor(wb.id);
          } else {
            Alert.alert('提示', '当前环境不支持跳转世界书编辑器');
          }
        },
        icon: <IconEdit size={18} color={theme.subTextColor} />,
      },
      {
        label: selected ? '从对话移除' : '加入对话',
        onPress: () => toggleWbInChat(wb.id),
        icon: <IconSend size={18} color={theme.subTextColor} />,
      },
      {
        label: '删除',
        onPress: () => handleDeleteWb(wb.id),
        destructive: true,
        icon: <IconTrash size={18} color="#ef4444" />,
      },
    ];
    setWbActions(actions);
    setShowWbActionSheet(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.tabBar, { borderBottomColor: theme.borderColor }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && { borderBottomColor: theme.accentColor },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={{
                color: activeTab === tab.key ? theme.accentColor : theme.textColor,
                fontWeight: activeTab === tab.key ? '600' : '400',
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === 'settings' && (
          <>
            {/* 扮演模式：我暂时扮演本对话的角色（开关只在本对话生效，是临时的） */}
            {characterId ? (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.borderColor,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '700' }}>🎭 扮演模式</Text>
                    <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
                      我暂时扮演本对话的角色。开启后我发的消息记为「TA 说的」，AI 不回复
                    </Text>
                  </View>
                  <Switch
                    value={!!chatSettings?.puppetCharacterId}
                    onValueChange={(v) =>
                      onSettingsChange({
                        ...chatSettings,
                        puppetCharacterId: v ? characterId : undefined,
                      })
                    }
                  />
                </View>
                {chatSettings?.puppetCharacterId ? (
                  <Text style={{ color: theme.accentColor, fontSize: 11, marginTop: 6 }}>
                    ✓ 已开启：你现在就是在演这个角色，AI 不会回复
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* AI 连续回复（一句回多条）：默认关闭，开了以后由 AI 自己决定要不要接着说 */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: theme.borderColor,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '700' }}>
                    AI 连发多条
                  </Text>
                  <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
                    开启后 AI 可以说一句就接着再发几条，由 AI 自己决定要不要继续（默认关闭）
                  </Text>
                </View>
                <Switch
                  value={chatSettings?.predictionConfig?.enabled === true}
                  onValueChange={(v) =>
                    onSettingsChange({
                      ...chatSettings,
                      predictionConfig: {
                        ...(chatSettings?.predictionConfig || { mode: 'per_turn' as const, prompt: '' }),
                        enabled: v,
                        maxMessages: chatSettings?.predictionConfig?.maxMessages ?? 2,
                      },
                    })
                  }
                />
              </View>
              {chatSettings?.predictionConfig?.enabled ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <Text style={{ color: theme.subTextColor, fontSize: 12 }}>最多</Text>
                  {[2, 3, 4, 5].map((n) => {
                    const cur = chatSettings?.predictionConfig?.maxMessages ?? 2;
                    return (
                      <TouchableOpacity
                        key={n}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: 12,
                          backgroundColor: cur === n ? theme.accentColor : theme.inputBgColor,
                        }}
                        onPress={() =>
                          onSettingsChange({
                            ...chatSettings,
                            predictionConfig: {
                              ...(chatSettings?.predictionConfig || { mode: 'per_turn' as const, prompt: '' }),
                              enabled: true,
                              maxMessages: n,
                            },
                          })
                        }
                      >
                        <Text style={{ color: cur === n ? theme.buttonTextColor : theme.textColor, fontSize: 12 }}>
                          {n} 条
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>

            {/* 群聊：总设定 + 单角色设定（可折叠，默认收起，避免占满整个面板） */}
            {groupChat && (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.borderColor,
                  backgroundColor: theme.secondaryColor,
                }}
              >
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  onPress={() => setGroupSectionOpen((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '700' }}>
                    群聊设定（总设定 / 单角色 / 自动推进）
                  </Text>
                  <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                    {groupSectionOpen ? '收起 ▲' : '展开 ▼'}
                  </Text>
                </TouchableOpacity>

                {groupSectionOpen ? (
                  <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 12 }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '700' }}>自动推进</Text>
                    <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
                      老师发言后，成员自己接着聊（不发言也会推进）
                    </Text>
                  </View>
                  <Switch
                    value={!!chatSettings?.groupAutoAdvance?.enabled}
                    onValueChange={(v) =>
                      onSettingsChange({
                        ...chatSettings,
                        groupAutoAdvance: { enabled: v, rounds: chatSettings?.groupAutoAdvance?.rounds ?? 2 },
                      })
                    }
                  />
                </View>
                {chatSettings?.groupAutoAdvance?.enabled ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <Text style={{ color: theme.subTextColor, fontSize: 12 }}>每次自动聊</Text>
                      {[1, 2, 3].map((n) => {
                        const cur = chatSettings?.groupAutoAdvance?.rounds ?? 2;
                        return (
                          <TouchableOpacity
                            key={n}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 5,
                              borderRadius: 12,
                              backgroundColor: cur === n ? theme.accentColor : theme.inputBgColor,
                            }}
                            onPress={() =>
                              onSettingsChange({
                                ...chatSettings,
                                groupAutoAdvance: { ...chatSettings?.groupAutoAdvance, enabled: true, rounds: n },
                              })
                            }
                          >
                            <Text style={{ color: cur === n ? theme.buttonTextColor : theme.textColor, fontSize: 12 }}>
                              {n} 轮
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <Text style={{ color: theme.subTextColor, fontSize: 12 }}>定时推进</Text>
                      {[0, 30, 60, 120].map((sec) => {
                        const cur = chatSettings?.groupAutoAdvance?.autoIntervalSec ?? 0;
                        return (
                          <TouchableOpacity
                            key={sec}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 12,
                              backgroundColor: cur === sec ? theme.accentColor : theme.inputBgColor,
                            }}
                            onPress={() =>
                              onSettingsChange({
                                ...chatSettings,
                                groupAutoAdvance: { ...chatSettings?.groupAutoAdvance, enabled: true, rounds: chatSettings?.groupAutoAdvance?.rounds ?? 2, autoIntervalSec: sec },
                              })
                            }
                          >
                            <Text style={{ color: cur === sec ? theme.buttonTextColor : theme.textColor, fontSize: 12 }}>
                              {sec === 0 ? '关' : `${sec}秒`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '700', marginBottom: 4 }}>
                  群聊总设定
                </Text>
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginBottom: 6 }}>
                  所有成员共同遵循的基础指令（世界观／群规／共同语气）
                </Text>
                <TextInput
                  style={{
                    color: theme.textColor,
                    backgroundColor: theme.inputBgColor,
                    borderRadius: 8,
                    padding: 8,
                    minHeight: 70,
                    // 必须给上限：内容很长时（比如整段基础指令）多行输入框会自动撑高，
                    // 能把整个抽屉顶满、连关闭按钮都点不到
                    maxHeight: 170,
                    textAlignVertical: 'top',
                  }}
                  value={groupPromptDraft}
                  onChangeText={setGroupPromptDraft}
                  multiline
                  scrollEnabled
                  placeholder="例如：这是一个基沃托斯的日常群聊，大家是同一个社团的伙伴…"
                  placeholderTextColor={theme.subTextColor}
                />
                <TouchableOpacity
                  style={{
                    alignSelf: 'flex-end',
                    marginTop: 8,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                    borderRadius: 14,
                    backgroundColor: theme.accentColor,
                  }}
                  onPress={() => onSettingsChange({ ...chatSettings, systemPrompt: groupPromptDraft })}
                >
                  <Text style={{ color: theme.buttonTextColor, fontSize: 12, fontWeight: '600' }}>保存总设定</Text>
                </TouchableOpacity>

                <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 4 }}>
                  单角色设定
                </Text>
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginBottom: 6 }}>
                  选中一个成员，单独改它自己的设定（叠加在总设定之上）
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {(groupChat.groupMembers || []).slice(0, 60).map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 14,
                        backgroundColor: memberPromptTarget === m.id ? theme.accentColor : theme.inputBgColor,
                      }}
                      onPress={() => setMemberPromptTarget(m.id)}
                    >
                      <Text
                        style={{
                          color: memberPromptTarget === m.id ? theme.buttonTextColor : theme.textColor,
                          fontSize: 12,
                        }}
                      >
                        {m.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {memberPromptTarget ? (
                  <>
                    <TextInput
                      style={{
                        color: theme.textColor,
                        backgroundColor: theme.inputBgColor,
                        borderRadius: 8,
                        padding: 8,
                        minHeight: 70,
                        maxHeight: 170,
                        marginTop: 8,
                        textAlignVertical: 'top',
                      }}
                      value={memberPromptDraft}
                      onChangeText={setMemberPromptDraft}
                      multiline
                      scrollEnabled
                      placeholder="这个角色自己的独立设定…"
                      placeholderTextColor={theme.subTextColor}
                    />
                    <TouchableOpacity
                      style={{
                        alignSelf: 'flex-end',
                        marginTop: 8,
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        borderRadius: 14,
                        backgroundColor: theme.accentColor,
                      }}
                      onPress={() => {
                        const target = memberPromptTarget;
                        setChats((prev) =>
                          prev.map((c) =>
                            c.id === groupChat.id
                              ? {
                                  ...c,
                                  groupMembers: (c.groupMembers || []).map((m) =>
                                    m.id === target
                                      ? { ...m, settings: { ...m.settings, systemPrompt: memberPromptDraft } }
                                      : m,
                                  ),
                                }
                              : c,
                          ),
                        );
                      }}
                    >
                      <Text style={{ color: theme.buttonTextColor, fontSize: 12, fontWeight: '600' }}>保存角色设定</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                  </>
                ) : null}
              </View>
            )}            {/* 视频背景播放控制：默认静音。仅当背景是视频时才显示 */}
            {isVideoBackground && (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.borderColor,
                  backgroundColor: theme.secondaryColor,
                }}
              >
                <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
                  视频背景
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ color: theme.subTextColor, fontSize: 13 }}>
                    {videoBgState?.paused ? '已暂停' : '播放中'}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      onVideoBgStateChange?.({
                        muted: videoBgState?.muted ?? true,
                        paused: !(videoBgState?.paused ?? false),
                      })
                    }
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: theme.accentColor,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                      {videoBgState?.paused ? '继续播放' : '暂停播放'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ color: theme.subTextColor, fontSize: 13 }}>
                    {videoBgState?.muted ?? true ? '声音：已静音（默认）' : '声音：开启'}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      onVideoBgStateChange?.({
                        muted: !(videoBgState?.muted ?? true),
                        paused: videoBgState?.paused ?? false,
                      })
                    }
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: (videoBgState?.muted ?? true) ? theme.secondaryColor : theme.accentColor,
                      borderWidth: 1,
                      borderColor: theme.borderColor,
                    }}
                  >
                    <Text
                      style={{
                        color: (videoBgState?.muted ?? true) ? theme.textColor : '#fff',
                        fontSize: 13,
                        fontWeight: '600',
                      }}
                    >
                      {(videoBgState?.muted ?? true) ? '开启声音' : '静音'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <ChatSettingsPanel
            settings={chatSettings}
            onSettingsChange={onSettingsChange}
            wallpaper={wallpaper}
            onWallpaperChange={onWallpaperChange}
            worldBookIds={worldBookIds}
            onWorldBookIdsChange={onWorldBookIdsChange}
            isChildConversation={isChildConversation}
            characterId={characterId}
            userAvatar={userAvatar}
            onUserAvatarChange={onUserAvatarChange}
            assistantAvatar={assistantAvatar}
            onAssistantAvatarChange={onAssistantAvatarChange}
            onNavigateToChat={onNavigateToChat}
            messages={messages}
            isSharedCard={isSharedCard}
            cardHideFlags={cardHideFlags}
            extraSystemPrompt={extraSystemPrompt}
            onExtraSystemPromptChange={onExtraSystemPromptChange}
            onOpenCharacterPicker={onOpenCharacterPicker}
          />
          </>
        )}

        {activeTab === 'worldbook' && (
          <View style={{ flex: 1 }}>
            {/* 标题栏 + 新建按钮 */}
            <View style={[styles.wbTitleBar, { borderBottomColor: theme.borderColor, backgroundColor: theme.backgroundColor }]}>
              <Text style={[styles.wbTitleText, { color: theme.textColor }]}>世界书</Text>
              {onRequestOpenWorldBookEditor && !(isSharedCard && cardHideFlags?.worldBook) && (
                <TouchableOpacity
                  onPress={() => onRequestOpenWorldBookEditor(undefined)}
                  style={[styles.wbNewBtn, { backgroundColor: '#e94560' }]}
                >
                  <IconPlus size={16} color="#fff" />
                  <Text style={styles.wbNewBtnText}>新建</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 分享卡片世界书隐藏提示 */}
            {isSharedCard && cardHideFlags?.worldBook && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.secondaryColor }}>
                <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                  🔒 世界书内容已被分享者隐藏，只能开启/关闭，无法查看具体条目
                </Text>
              </View>
            )}

            {/* 搜索框 */}
            <View style={[styles.wbSearchBar, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
              <IconSearch size={16} color={theme.subTextColor} />
              <TextInput
                value={wbSearch}
                onChangeText={setWbSearch}
                placeholder="搜索世界书..."
                placeholderTextColor={theme.subTextColor}
                style={[styles.wbSearchInput, { color: theme.textColor }]}
              />
              {wbSearch.length > 0 && (
                <TouchableOpacity onPress={() => setWbSearch('')}>
                  <IconClose size={16} color={theme.subTextColor} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 48, gap: 14 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredBooks.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 48, gap: 10 }}>
                  <IconGlobe size={42} color={theme.subTextColor} />
                  <Text style={{ color: theme.subTextColor, fontSize: 14 }}>暂无匹配的世界书</Text>
                </View>
              ) : (
                filteredBooks.map((wb) => {
                  const selected = !!worldBookIds?.includes(wb.id);
                  const expanded = expandedWbIds.has(wb.id);
                  const enabledCount = wb.entries.filter((e) => e.enabled).length;
                  const allEntriesOn = wb.entries.length > 0 && enabledCount === wb.entries.length;
                  const allKeys = wb.entries.flatMap((e) => e.keys).filter(Boolean);
                  const uniqueKeys = [...new Set(allKeys)];
                  const visibleTags = uniqueKeys.slice(0, 3);
                  const remainingCount = uniqueKeys.length - visibleTags.length;

                  return (
                    <View
                      key={wb.id}
                      style={[
                        styles.wbBookCard,
                        {
                          backgroundColor: theme.primaryColor,
                          borderColor: selected ? theme.accentColor : theme.borderColor,
                        },
                      ]}
                    >
                      {/* 卡片头部：封面 + 标题 + 标签 */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => !(isSharedCard && cardHideFlags?.worldBook) && toggleExpandWb(wb.id)}
                        style={styles.wbCardHeader}
                      >
                        <View style={styles.wbCardCover}>
                          {renderCoverThumb(wb, 52, theme)}
                        </View>
                        <View style={styles.wbCardInfo}>
                          <Text
                            style={[styles.wbCardTitle, { color: theme.textColor }]}
                            numberOfLines={1}
                          >
                            {wb.name}
                            {isSharedCard && cardHideFlags?.worldBook && ' 🔒'}
                          </Text>
                          <Text style={[styles.wbCardSubtitle, { color: theme.subTextColor }]} numberOfLines={1}>
                            {isSharedCard && cardHideFlags?.worldBook
                              ? '内容已隐藏'
                              : `${wb.entries.length} 条 · 启用 ${enabledCount} 条`}
                          </Text>
                        </View>
                        <View style={styles.wbCardMenuBtn}>
                          {onWorldBookIdsChange ? (
                            <View style={{ marginRight: 4 }}>
                              <Switch
                                value={selected}
                                onValueChange={() => toggleWbInChat(wb.id)}
                                trackColor={{ true: theme.accentColor + '80', false: theme.borderColor }}
                                thumbColor={selected ? theme.accentColor : '#fff'}
                              />
                            </View>
                          ) : null}
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); handleLongPressWb(wb); }}
                            style={{ padding: 4 }}
                          >
                            <IconEdit size={18} color={theme.subTextColor} />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>

                      {/* 标签胶囊行 */}
                      {uniqueKeys.length > 0 && (
                        <View style={styles.wbTagRow}>
                          {visibleTags.map((key, idx) => (
                            <TouchableOpacity
                              key={`${wb.id}-tag-${idx}`}
                              style={[styles.wbTagPill, { backgroundColor: theme.accentColor + '20', borderColor: theme.accentColor + '40' }]}
                              onPress={() => toggleExpandWb(wb.id)}
                            >
                              <Text style={[styles.wbTagText, { color: theme.accentColor }]}>{key}</Text>
                            </TouchableOpacity>
                          ))}
                          {remainingCount > 0 && (
                            <View style={[styles.wbTagPill, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
                              <Text style={[styles.wbTagText, { color: theme.subTextColor }]}>+{remainingCount}</Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* 展开/收起 指示 */}
                      <TouchableOpacity
                        onPress={() => toggleExpandWb(wb.id)}
                        style={styles.wbExpandToggle}
                      >
                        <Text style={[styles.wbExpandText, { color: theme.subTextColor }]}>
                          {expanded ? '收起' : '展开'}
                        </Text>
                        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                          <IconChevronDown size={14} color={theme.subTextColor} />
                        </View>
                      </TouchableOpacity>

                      {/* 展开后：条目列表 */}
                      {expanded && (
                        <View style={[styles.wbEntriesContainer, { borderTopColor: theme.borderColor }]}>
                          {/* 操作行：全选 + 添加条目 */}
                          <View style={styles.wbEntryActionBar}>
                            <TouchableOpacity
                              style={[
                                styles.wbSecondaryBtn,
                                { backgroundColor: allEntriesOn ? theme.secondaryColor : theme.accentColor },
                              ]}
                              onPress={() => toggleWbAllEntriesEnabled(wb.id)}
                              disabled={wb.entries.length === 0}
                            >
                              <Text
                                style={[
                                  styles.wbSecondaryBtnText,
                                  { color: allEntriesOn ? theme.textColor : '#fff' },
                                ]}
                              >
                                {allEntriesOn ? '全部禁用' : '全选启用'}
                              </Text>
                            </TouchableOpacity>
                            {/* + 添加条目 按钮 */}
                            <TouchableOpacity
                              style={[styles.wbAddEntryBtn, { backgroundColor: '#e94560' }]}
                              onPress={() => {
                                if (onRequestOpenWorldBookEditor) {
                                  onRequestOpenWorldBookEditor(wb.id);
                                }
                              }}
                            >
                              <IconPlus size={14} color="#fff" />
                              <Text style={styles.wbAddEntryBtnText}>添加条目</Text>
                            </TouchableOpacity>
                          </View>

                          {wb.entries.length === 0 ? (
                            <Text style={{ color: theme.subTextColor, fontSize: 13, textAlign: 'center', padding: 16 }}>
                              暂无条目，点击上方按钮添加
                            </Text>
                          ) : (
                            wb.entries.map((entry) => (
                              <TouchableOpacity
                                key={entry.id}
                                activeOpacity={0.7}
                                onPress={() => {
                                  if (onRequestOpenWorldBookEditor) {
                                    onRequestOpenWorldBookEditor(wb.id);
                                  }
                                }}
                                style={[
                                  styles.wbEntryCard,
                                  { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor },
                                ]}
                              >
                                {/* 条目标签 + 开关 */}
                                <View style={styles.wbEntryHeader}>
                                  <View style={styles.wbEntryTags}>
                                    {entry.keys.slice(0, 3).map((key, idx) => (
                                      <View
                                        key={`${entry.id}-ek-${idx}`}
                                        style={[styles.wbEntryTag, { backgroundColor: theme.accentColor + '25', borderColor: theme.accentColor + '40' }]}
                                      >
                                        <Text style={[styles.wbEntryTagText, { color: theme.accentColor }]}>{key}</Text>
                                      </View>
                                    ))}
                                    {entry.keys.length > 3 && (
                                      <View style={[styles.wbEntryTag, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
                                        <Text style={[styles.wbEntryTagText, { color: theme.subTextColor }]}>+{entry.keys.length - 3}</Text>
                                      </View>
                                    )}
                                  </View>
                                  <Switch
                                    value={entry.enabled}
                                    onValueChange={() => toggleWbEntryEnabled(wb.id, entry.id)}
                                    trackColor={{ true: '#e9456080', false: theme.borderColor }}
                                    thumbColor={entry.enabled ? '#e94560' : '#fff'}
                                    style={{ transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] }}
                                  />
                                </View>

                                {/* 条目描述 */}
                                <Text
                                  style={[
                                    styles.wbEntryDesc,
                                    { color: entry.enabled ? theme.textColor : theme.subTextColor },
                                  ]}
                                  numberOfLines={2}
                                >
                                  {entry.content || '(空内容)'}
                                </Text>
                              </TouchableOpacity>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}

        {activeTab === 'prompts' && (
          <PromptManagerTab
            onSelectPreset={(preset) => onSelectPromptPreset?.(preset)}
          />
        )}
        {activeTab === 'summary' && <SummaryTab chatId={chatId} />}
        {activeTab === 'gallery' && <GalleryTab chatId={chatId} />}
      </View>

      {/* 世界书长按 ActionSheet */}
      <ActionSheet
        visible={showWbActionSheet}
        onClose={() => setShowWbActionSheet(false)}
        title={longPressWb ? `《${longPressWb.name}》` : '操作'}
        actions={wbActions}
        theme={theme}
      />

      {/* 封面裁切 Modal */}
      {showCoverEditor && coverEditingWb ? (
        <Modal visible={showCoverEditor} animationType="slide" transparent onRequestClose={() => setShowCoverEditor(false)}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }]}>
            <View style={[styles.coverEditorSheet, { backgroundColor: theme.menuBgColor }]}>
              <View style={[styles.coverEditorHeader, { borderBottomColor: theme.borderColor }]}>
                <Text style={{ color: theme.textColor, fontSize: 18, fontWeight: '700' }}>封面裁切</Text>
                <TouchableOpacity onPress={() => setShowCoverEditor(false)}>
                  <IconClose size={22} color={theme.textColor} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 16, alignItems: 'center' }}>
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
                {[
                  {
                    label: '横向位置 X',
                    value: coverCfg.offsetX,
                    step: 0.05,
                    min: -1,
                    max: 1,
                    key: 'offsetX' as const,
                    fixed: 2,
                  },
                  {
                    label: '纵向位置 Y',
                    value: coverCfg.offsetY,
                    step: 0.05,
                    min: -1,
                    max: 1,
                    key: 'offsetY' as const,
                    fixed: 2,
                  },
                  {
                    label: '缩放 Scale',
                    value: coverCfg.scale,
                    step: 0.1,
                    min: 1,
                    max: 3,
                    key: 'scale' as const,
                    fixed: 1,
                  },
                ].map((s) => (
                  <View key={s.key} style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
                    <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '500' }}>{s.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TouchableOpacity
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.secondaryColor, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() =>
                          setCoverCfg((c) => ({
                            ...c,
                            [s.key]: clamp(roundToStep(c[s.key] - s.step, s.step), s.min, s.max),
                          }))
                        }
                      >
                        <Text style={{ color: theme.textColor, fontWeight: '700' }}>−</Text>
                      </TouchableOpacity>
                      <Text style={{ color: theme.textColor, minWidth: 50, textAlign: 'center', fontWeight: '600' }}>
                        {coverCfg[s.key].toFixed(s.fixed)}
                      </Text>
                      <TouchableOpacity
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.secondaryColor, alignItems: 'center', justifyContent: 'center' }}
                        onPress={() =>
                          setCoverCfg((c) => ({
                            ...c,
                            [s.key]: clamp(roundToStep(c[s.key] + s.step, s.step), s.min, s.max),
                          }))
                        }
                      >
                        <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
                {/* radius */}
                <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
                  <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '500' }}>圆角 Radius</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.secondaryColor, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => setCoverCfg((c) => ({ ...c, borderRadius: clamp(c.borderRadius - 2, 0, 32) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>−</Text>
                    </TouchableOpacity>
                    <Text style={{ color: theme.textColor, minWidth: 50, textAlign: 'center', fontWeight: '600' }}>
                      {coverCfg.borderRadius}
                    </Text>
                    <TouchableOpacity
                      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.secondaryColor, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => setCoverCfg((c) => ({ ...c, borderRadius: clamp(c.borderRadius + 2, 0, 32) }))}
                    >
                      <Text style={{ color: theme.textColor, fontWeight: '700' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
              <View style={[styles.coverEditorActions, { borderTopColor: theme.borderColor }]}>
                <TouchableOpacity
                  onPress={() => setShowCoverEditor(false)}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: theme.primaryColor }}
                >
                  <Text style={{ color: theme.textColor }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveCover}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: theme.accentColor }}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>保存</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  content: {
    flex: 1,
  },
  summaryContainer: {
    flex: 1,
  },
  // 世界书 - 标题栏
  wbTitleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wbTitleText: {
    fontSize: 18,
    fontWeight: '700',
  },
  wbNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  wbNewBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // 世界书 - 搜索框
  wbSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  wbSearchInput: {
    flex: 1,
    fontSize: 14,
    height: 40,
  },
  // 世界书 - 书籍卡片
  wbBookCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  wbCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wbCardCover: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  wbCardInfo: {
    flex: 1,
    gap: 4,
  },
  wbCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  wbCardSubtitle: {
    fontSize: 12,
  },
  wbCardMenuBtn: {
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // 世界书 - 标签胶囊
  wbTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wbTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  wbTagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  // 世界书 - 展开/收起
  wbExpandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  wbExpandText: {
    fontSize: 12,
  },
  // 世界书 - 展开条目容器
  wbEntriesContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  wbEntryActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  wbSecondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  wbSecondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  wbAddEntryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  wbAddEntryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // 世界书 - 条目卡片
  wbEntryCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  wbEntryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  wbEntryTags: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wbEntryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  wbEntryTagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  wbEntryDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  // 封面裁切
  coverEditorSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  coverEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  coverEditorActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
  },
});
