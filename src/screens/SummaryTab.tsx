import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aiService } from '../services/aiService';
import { generateId } from '../constants/defaults';

interface SummaryTabProps {
  chatId: string;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface SummaryRecord {
  id: string;
  content: string;
  timestamp: number;
  messageCount: number;
  isAuto?: boolean;
  tokenUsage?: TokenUsage;
  instruction?: string;
  compressedRange?: { fromTimestamp?: number; toTimestamp?: number };
}

const MANUAL_INSTRUCTION_KEY = '__manual_summary_instruction';
const FALLBACK_BASE_PROMPT = '请总结以下对话内容，保留关键信息、角色设定、人物名字和重要事件。';

function buildSystemPromptForSummary(chat: any, characters: any[], worldBooks: any[]): string {
  const parts: string[] = [];
  if (chat?.characterId) {
    const character = characters.find((c: any) => c.id === chat.characterId);
    if (character?.systemPrompt && String(character.systemPrompt).trim()) {
      parts.push(`【角色系统设定】\n${character.systemPrompt.trim()}`);
    }
  }
  if (chat?.settings?.systemPrompt && String(chat.settings.systemPrompt).trim()) {
    parts.push(`【对话系统设定】\n${chat.settings.systemPrompt.trim()}`);
  }
  if (chat?.settings?.userPersona && String(chat.settings.userPersona).trim()) {
    parts.push(`【用户人设】\n${chat.settings.userPersona.trim()}`);
  }
  const activeWbIds: string[] = chat?.worldBookIds ?? [];
  if (activeWbIds.length > 0) {
    for (const wb of worldBooks) {
      if (!wb || !activeWbIds.includes(wb.id)) continue;
      if (wb.systemPrompt && String(wb.systemPrompt).trim()) {
        parts.push(`【世界书·${wb.name}】\n${wb.systemPrompt.trim()}`);
      }
    }
  }
  return parts.join('\n\n');
}

export const SummaryTab: React.FC<SummaryTabProps> = ({ chatId }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { chats, setChats, providers, characters, worldBooks } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSummary, setEditingSummary] = useState<SummaryRecord | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [summaryRequirement, setSummaryRequirement] = useState('');
  const [, setInstructionSavedTick] = useState(0);

  const chat = chats.find((c) => c.id === chatId);
  const summaries: SummaryRecord[] = (chat as any)?.summaries || [];

  // 与「设置 > 总结指令」同步：本界面输入框 = chat.settings.summaryPrompt，修改后保存即双向同步
  useEffect(() => {
    if (!chat) return;
    const settingPrompt = (chat as any)?.settings?.summaryPrompt || '';
    setSummaryRequirement(settingPrompt);
  }, [chatId, (chat as any)?.settings?.summaryPrompt]);

  const handleSaveInstruction = () => {
    if (!chat) return;
    const updated = chats.map((c) =>
      c.id === chatId
        ? ({
            ...c,
            settings: { ...(c.settings as any), summaryPrompt: summaryRequirement },
            updatedAt: Date.now(),
          } as any)
        : c
    );
    setChats(updated);
    setInstructionSavedTick((t) => t + 1);
    Alert.alert('提示', '总结指令已保存，与「设置 > 总结指令」同步');
  };

  const autoSummaries = summaries.filter((s) => s.isAuto);
  const manualSummaries = summaries.filter((s) => !s.isAuto);

  const summaryProvider = providers.find(
    (p) => p.id === chat?.settings.summaryProviderId && p.capabilities.includes('summary')
  ) || providers.find((p) => p.capabilities.includes('summary'))
  || providers.find((p) => p.capabilities.includes('text'));

  const handleGenerateSummary = async () => {
    if (!chat || chat.messages.length < 2) {
      Alert.alert('提示', '对话消息太少，无法总结');
      return;
    }
    if (!summaryProvider) {
      Alert.alert('提示', '请先配置总结AI或对话AI');
      return;
    }
    if (!summaryRequirement.trim()) {
      Alert.alert('提示', '请输入总结需求');
      return;
    }

    setIsGenerating(true);
    try {
      const basePrompt = summaryRequirement.trim() || FALLBACK_BASE_PROMPT;
      const systemPrompt = buildSystemPromptForSummary(chat, characters, worldBooks);

      let enhancedPrompt = basePrompt;
      const activeWbIds: string[] = (chat as any).worldBookIds ?? [];
      const activeWbs = worldBooks.filter((wb: any) => activeWbIds.includes(wb?.id));
      for (const wb of activeWbs) {
        if (wb?.summaryPrompt && String(wb.summaryPrompt).trim()) {
          enhancedPrompt = `${enhancedPrompt}\n\n【${wb.name}·总结要求】${wb.summaryPrompt.trim()}`;
        }
      }

      const result = await aiService.summarize(
        summaryProvider,
        chat.messages,
        enhancedPrompt,
        { systemPrompt: systemPrompt || undefined }
      );
      const summary = (result?.content || '').trim();
      const tokenUsage: TokenUsage = result?.tokenUsage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      if (!summary) {
        Alert.alert('提示', 'AI 返回了空总结，请重试');
        return;
      }

      const newSummary: SummaryRecord = {
        id: generateId(),
        content: summary,
        timestamp: Date.now(),
        messageCount: chat.messages.length,
        isAuto: false,
        tokenUsage,
        instruction: summaryRequirement.trim(),
      };

      const currentSummaries: SummaryRecord[] = (chat as any)?.summaries || [];
      const updatedChats = chats.map((c) =>
        c.id === chatId
          ? ({
              ...c,
              summaries: [newSummary, ...currentSummaries],
              updatedAt: Date.now(),
            } as any)
          : c
      );
      setChats(updatedChats);
    } catch (error: any) {
      Alert.alert('总结失败', error.message || '未知错误');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteSummary = (summaryId: string) => {
    Alert.alert('确认删除', '确定要删除这条总结记录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          if (!chat) return;
          const currentSummaries = ((chat as any)?.summaries || []).filter(
            (s: SummaryRecord) => s.id !== summaryId
          );
          const updatedChats = chats.map((c) =>
            c.id === chatId ? ({ ...c, summaries: currentSummaries } as any) : c
          );
          setChats(updatedChats);
        },
      },
    ]);
  };

  const openEditSummary = (summary: SummaryRecord) => {
    setEditingSummary(summary);
    setEditContent(summary.content);
    setShowEditModal(true);
  };

  const saveEditSummary = () => {
    if (!editingSummary || !chat) return;
    const currentSummaries = ((chat as any)?.summaries || []).map(
      (s: SummaryRecord) =>
        s.id === editingSummary.id ? { ...s, content: editContent.trim() } : s
    );
    const updatedChats = chats.map((c) =>
      c.id === chatId ? ({ ...c, summaries: currentSummaries } as any) : c
    );
    setChats(updatedChats);
    setShowEditModal(false);
    setEditingSummary(null);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString();
  };

  const renderSummaryCard = (summary: SummaryRecord) => {
    const isExpanded = expandedId === summary.id;
    const u = summary.tokenUsage;
    const totalToks = u ? (u.totalTokens || (u.promptTokens || 0) + (u.completionTokens || 0)) : 0;
    return (
      <View
        key={summary.id}
        style={[styles.summaryCard, { backgroundColor: theme.secondaryColor }]}
      >
        <TouchableOpacity
          onPress={() => setExpandedId(isExpanded ? null : summary.id)}
          activeOpacity={0.8}
          style={styles.cardContent}
        >
          <View style={styles.summaryHeader}>
            <View style={styles.summaryHeaderLeft}>
              {summary.isAuto ? (
                <View style={[styles.badge, { backgroundColor: theme.accentColor + '30' }]}>
                  <Text style={[styles.badgeText, { color: theme.accentColor }]}>自动</Text>
                </View>
              ) : (
                <View style={[styles.badge, { backgroundColor: theme.buttonColor + '30' }]}>
                  <Text style={[styles.badgeText, { color: theme.buttonColor }]}>手动</Text>
                </View>
              )}
              <Text style={[styles.summaryTime, { color: theme.subTextColor }]}>
                {formatTime(summary.timestamp)}
              </Text>
            </View>
            <Text style={[styles.summaryCount, { color: theme.subTextColor }]}>
              {summary.messageCount} 条消息
            </Text>
          </View>

          {totalToks > 0 && (
            <View style={styles.tokenRow}>
              <View style={[styles.tokenCol, { backgroundColor: theme.inputBgColor }]}>
                <Text style={[styles.tokenLabel, { color: theme.subTextColor }]}>输入</Text>
                <Text style={[styles.tokenVal, { color: theme.textColor }]}>
                  {(u!.promptTokens || 0).toLocaleString()}
                </Text>
              </View>
              <View style={[styles.tokenCol, { backgroundColor: theme.inputBgColor }]}>
                <Text style={[styles.tokenLabel, { color: theme.subTextColor }]}>输出</Text>
                <Text style={[styles.tokenVal, { color: theme.textColor }]}>
                  {(u!.completionTokens || 0).toLocaleString()}
                </Text>
              </View>
              <View style={[styles.tokenCol, { backgroundColor: theme.accentColor + '15' }]}>
                <Text style={[styles.tokenLabel, { color: theme.subTextColor }]}>总计</Text>
                <Text style={[styles.tokenVal, { color: theme.accentColor, fontWeight: '700' }]}>
                  {totalToks.toLocaleString()}
                </Text>
              </View>
            </View>
          )}

          {summary.instruction ? (
            <View
              style={[
                styles.instructionBox,
                { backgroundColor: theme.inputBgColor, borderColor: theme.borderColor },
              ]}
            >
              <Text style={[styles.instructionLabel, { color: theme.subTextColor }]}>
                本次总结指令：
              </Text>
              <Text
                style={[styles.instructionText, { color: theme.textColor }]}
                numberOfLines={isExpanded ? undefined : 2}
              >
                {summary.instruction}
              </Text>
            </View>
          ) : null}

          <Text
            style={[styles.summaryContent, { color: theme.textColor }]}
            numberOfLines={isExpanded ? undefined : 4}
          >
            {summary.content}
          </Text>
          {!isExpanded && summary.content.length > 150 && (
            <Text style={[styles.expandHint, { color: theme.accentColor }]}>点击展开查看全部</Text>
          )}
        </TouchableOpacity>
        <View style={[styles.cardActions, { borderTopColor: theme.borderColor }]}>
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => openEditSummary(summary)}>
            <Text style={[styles.cardActionText, { color: theme.accentColor }]}>编辑</Text>
          </TouchableOpacity>
          <View style={[styles.cardActionDivider, { backgroundColor: theme.borderColor }]} />
          <TouchableOpacity style={styles.cardActionBtn} onPress={() => handleDeleteSummary(summary.id)}>
            <Text style={[styles.cardActionText, { color: '#ff6b6b' }]}>删除</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerLeft}>
            <Text style={[styles.headerTitle, { color: theme.textColor }]}>对话总结</Text>
            <Text style={[styles.countText, { color: theme.subTextColor }]}>
              共 {summaries.length} 条
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.generateBtn,
              { backgroundColor: isGenerating ? theme.secondaryColor : theme.accentColor },
            ]}
            onPress={handleGenerateSummary}
            disabled={isGenerating}
          >
            <Text style={{ color: theme.buttonTextColor, fontSize: 12 }}>
              {isGenerating ? '生成中...' : '+ 生成总结'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.requirementRow, { backgroundColor: theme.secondaryColor }]}>
          <View style={styles.requirementHeader}>
            <Text style={[styles.requirementLabel, { color: theme.textColor }]}>
              {`总结指令（与「设置 > 总结指令」同步）`}
            </Text>
            <TouchableOpacity
              style={[styles.instructionSaveBtn, { backgroundColor: theme.buttonColor }]}
              onPress={handleSaveInstruction}
            >
              <Text style={{ color: theme.buttonTextColor, fontSize: 12, fontWeight: '600' }}>
                保存指令
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.requirementHint, { color: theme.subTextColor }]}>
            {`与「设置 > 总结设置 > 总结指令」同步一致；修改后点击「保存指令」即写入设置。生成总结时会同时读取角色系统设定、对话系统设定、用户人设和已启用世界书的系统设定。`}
          </Text>
          <TextInput
            style={[styles.requirementInput, { color: theme.textColor }]}
            value={summaryRequirement}
            onChangeText={setSummaryRequirement}
            placeholder="输入总结要求，如：重点概括技术讨论要点"
            placeholderTextColor={theme.subTextColor}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {}} tintColor={theme.accentColor} />
        }
      >
        {summaries.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📝</Text>
            <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
              暂无总结记录
            </Text>
            <Text style={{ color: theme.subTextColor, textAlign: 'center', fontSize: 13 }}>
              点击上方按钮生成对话总结
              {'\n'}
              开启自动总结后，对话会定期自动总结
            </Text>
          </View>
        ) : (
          <View>
            {manualSummaries.length > 0 && (
              <View style={styles.sectionGroup}>
                <Text style={[styles.sectionLabel, { color: theme.subTextColor }]}>
                  手动总结 ({manualSummaries.length})
                </Text>
                {manualSummaries.map(renderSummaryCard)}
              </View>
            )}
            {autoSummaries.length > 0 && (
              <View style={styles.sectionGroup}>
                <Text style={[styles.sectionLabel, { color: theme.subTextColor }]}>
                  自动总结 ({autoSummaries.length})
                </Text>
                {autoSummaries.map(renderSummaryCard)}
              </View>
            )}
          </View>
        )}
        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>

      <Modal visible={showEditModal} animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.backgroundColor }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.modalContainer, { backgroundColor: theme.backgroundColor }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 30) + 12 }]}>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>编辑总结</Text>
              <TouchableOpacity onPress={saveEditSummary}>
                <Text style={{ color: theme.accentColor, fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
              <TextInput
                style={[styles.editTextArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                value={editContent}
                onChangeText={setEditContent}
                multiline
                numberOfLines={20}
                textAlignVertical="top"
                placeholder="编辑总结内容..."
                placeholderTextColor={theme.subTextColor}
                autoFocus
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  countText: { fontSize: 13 },
  generateBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  requirementRow: { marginTop: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  requirementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  requirementLabel: { fontSize: 13, fontWeight: '600' },
  requirementHint: { fontSize: 11, lineHeight: 15, marginBottom: 6 },
  instructionSaveBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  requirementInput: { fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  content: { flex: 1, padding: 16 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  sectionGroup: { marginBottom: 20 },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 10, marginLeft: 2 },
  summaryCard: { borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  cardContent: { padding: 14 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  summaryTime: { fontSize: 12 },
  summaryCount: { fontSize: 12 },
  tokenRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 2, paddingBottom: 10 },
  tokenCol: { flex: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, alignItems: 'center' },
  tokenLabel: { fontSize: 10, opacity: 0.8 },
  tokenVal: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  instructionBox: { borderWidth: 1, borderRadius: 8, padding: 8, marginBottom: 10 },
  instructionLabel: { fontSize: 11, marginBottom: 2 },
  instructionText: { fontSize: 12, lineHeight: 17 },
  summaryContent: { fontSize: 14, lineHeight: 22 },
  expandHint: { fontSize: 12, marginTop: 8, textAlign: 'right' },
  cardActions: { flexDirection: 'row', borderTopWidth: 1 },
  cardActionBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  cardActionText: { fontSize: 14, fontWeight: '500' },
  cardActionDivider: { width: 1, marginVertical: 8 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  editTextArea: { borderRadius: 10, padding: 14, fontSize: 15, minHeight: 300 },
});