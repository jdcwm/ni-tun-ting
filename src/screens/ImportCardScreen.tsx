import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Clipboard, Modal, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { Chat, Character } from '../types';
import { storage } from '../utils/storage';

interface ImportCardScreenProps {
  onClose: () => void;
  onImported: (cardData: any) => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ImportCardScreen: React.FC<ImportCardScreenProps> = ({ onClose, onImported }) => {
  const theme = useTheme();
  const { setChats, characters, addCharacter } = useApp();
  const [importedCard, setImportedCard] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const handlePasteFromClipboard = async () => {
    try {
      const clip = await Clipboard.getString();
      if (!clip || !clip.trim()) {
        Alert.alert('错误', '剪贴板为空');
        return;
      }
      await processCardJSON(clip);
    } catch (err: any) {
      Alert.alert('错误', err.message);
    }
  };

  const handlePasteDirect = async () => {
    // 简单模式：直接粘贴 JSON
    Alert.alert('粘贴卡片', '请复制分享的卡片JSON后点击确定', [
      { text: '取消', style: 'cancel' },
      { text: '从剪贴板导入', onPress: handlePasteFromClipboard },
    ]);
  };

  const processCardJSON = async (jsonStr: string) => {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || !data.id) {
        throw new Error('无效的卡片格式');
      }
      setImportedCard(data);
    } catch (err: any) {
      Alert.alert('错误', 'JSON解析失败: ' + (err as Error).message);
    }
  };

  const handleImport = async () => {
    if (!importedCard) return;
    setImporting(true);
    try {
      const card = importedCard;

      // 创建角色（如果有角色数据，且未被隐藏的字段才导入）
      let characterId: string | undefined;
      if (card.characterData) {
        const newChar = {
          id: `imp-char-${Date.now()}`,
          name: card.characterData.name || '导入角色',
          description: card.characterData.description || '',
          personality: card.characterData.personality || '',
          scenario: card.characterData.scenario || '',
          avatar: card.characterData.avatar || card.characterAvatar || null,
          greeting: card.characterData.greeting || '',
          firstMessage: card.characterData.greeting || '',
          alternateGreetings: card.characterData.alternateGreetings || [],
          greetingEnabled: card.characterData.greetingEnabled,
          exampleDialogue: '',
          creator: card.authorName || '导入',
          tags: ['导入'],
          createdAt: Date.now(),
        } as unknown as Character;

        // 社区资源表登记（手动导入来源标记）+ import 日志（不阻塞真正的导入写入）
        try {
          await storage.saveCommunityResource('character', {
            resourceId: newChar.id,
            source: 'manual-import',
            metadata: { cardName: newChar.name, manual: true, via: 'clipboard' },
          });
          await storage.appendUserLog({
            type: 'import',
            target: { kind: 'character', id: newChar.id, name: newChar.name },
            meta: { via: 'clipboard' },
          });
        } catch (_logErr) { /* 登记失败不影响主流程导入 */ }

        if (addCharacter) {
          await addCharacter(newChar);
        }
        characterId = newChar.id;
      }

      // 创建新对话 - 使用预览消息（不是完整对话历史）
      const now = Date.now();
      const sourceMessages = card.previewMessages || card.messages || [];
      const newMessages = sourceMessages.map((m: any, i: number) => ({
        id: `msg-${Date.now()}-${i}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || now,
      }));

      const newChat: Chat = {
        id: `imp-chat-${Date.now()}`,
        title: card.title || '导入的对话',
        characterId,
        messages: newMessages,
        createdAt: now,
        updatedAt: now,
        settings: {
          systemPrompt: card.systemPrompt || '',
          // 内置CSS（被隐藏则为空）
          customCSS: card.customCSS || '',
          globalCSS: card.globalCSS || '',
          cssEntries: card.cssEntries || [],
          // 正则规则（被隐藏则为空）
          regexRules: card.regexRules || [],
          // 开场白（被隐藏则为空）
          greeting: card.greeting || '',
          greetingEnabled: card.greetingEnabled,
        } as any,
        worldBookIds: card.worldBook || [],
        conversationType: 'manual',
        isSharedCard: true,
        cardHideFlags: card.hideFlags || {},
        extraSystemPrompt: '', // 初始为空，用户可在设置中填写
      } as Chat;

      if (setChats) {
        setChats((prev: Chat[]) => [newChat, ...prev]);
      }

      onImported(newChat);
      const hiddenInfo = card.hideFlags
        ? Object.entries(card.hideFlags).filter(([, v]) => v).map(([k]) => k).join(', ')
        : '';
      Alert.alert(
        '导入成功',
        `对话卡片已导入！${card.characterData ? '角色已创建。' : ''}${card.totalMessageCount ? `\n原对话共 ${card.totalMessageCount} 条，已导入预览 ${newMessages.length} 条。` : ''}${hiddenInfo ? `\n被隐藏的信息: ${hiddenInfo}` : ''}`
      );
    } catch (err: any) {
      Alert.alert('错误', '导入失败: ' + (err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const renderCardPreview = () => {
    if (!importedCard) return null;
    const card = importedCard;
    return (
      <Modal visible={true} animationType="slide" transparent>
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setImportedCard(null)}>
              <Text style={{ color: theme.textColor }}>← 返回</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.textColor }]}>卡片预览</Text>
            <TouchableOpacity onPress={handleImport} disabled={importing}>
              {importing ? (
                <ActivityIndicator size="small" color={theme.accentColor} />
              ) : (
                <Text style={{ color: theme.accentColor, fontWeight: 'bold' }}>导入</Text>
              )}
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.previewContent}>
            <View style={[styles.cardInfo, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
              <Text style={[styles.cardTitle, { color: theme.textColor }]}>{card.title}</Text>
              <Text style={[styles.cardAuthor, { color: theme.subTextColor }]}>
                作者：{card.authorName}
              </Text>
              <Text style={[styles.cardMeta, { color: theme.subTextColor }]}>
                {card.totalMessageCount ? `原对话 ${card.totalMessageCount} 条` : `消息 ${card.previewMessages?.length || card.messages?.length || 0} 条`} · 角色：{card.characterName || '未知'}
              </Text>
              {card.hideFlags && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, gap: 4 }}>
                  {Object.entries(card.hideFlags).filter(([, v]) => v).map(([k]) => (
                    <Text key={k} style={{
                      fontSize: 10, color: '#888',
                      backgroundColor: 'rgba(128,128,128,0.15)',
                      paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
                    }}>
                      🔒 {k === 'worldBook' ? '世界书' : k === 'systemPrompt' ? '系统设定' : k === 'characterDesc' ? '角色描述' : k === 'characterPersonality' ? '角色人设' : k === 'characterScenario' ? '角色场景' : k === 'greeting' ? '开场白' : k === 'css' ? '内置CSS' : k === 'regex' ? '正则规则' : k === 'author' ? '匿名' : k}
                    </Text>
                  ))}
                </View>
              )}
            </View>

            {card.characterData && (
              <View style={[styles.section, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
                <Text style={[styles.sectionTitle, { color: theme.textColor }]}>角色信息</Text>
                <Text style={[styles.charText, { color: theme.textColor }]}>名称：{card.characterData.name}</Text>
                {card.characterData.description && (
                  <Text style={[styles.charText, { color: theme.subTextColor }]}>
                    描述：{card.characterData.description}
                  </Text>
                )}
                {card.characterData.personality && (
                  <Text style={[styles.charText, { color: theme.subTextColor }]}>
                    人设：{card.characterData.personality}
                  </Text>
                )}
                {card.characterData.scenario && (
                  <Text style={[styles.charText, { color: theme.subTextColor }]}>
                    场景：{card.characterData.scenario}
                  </Text>
                )}
              </View>
            )}

            <View style={styles.messagesSection}>
              <Text style={[styles.sectionTitle, { color: theme.textColor }]}>消息预览</Text>
              {(card.previewMessages || card.messages || []).map((m: any, i: number) => (
                <View
                  key={i}
                  style={[
                    styles.messageBubble,
                    {
                      backgroundColor: m.role === 'user' ? theme.accentColor : theme.primaryColor,
                      borderColor: theme.borderColor,
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    },
                  ]}
                >
                  <Text style={{ color: m.role === 'user' ? '#fff' : theme.textColor, fontSize: 13 }}>
                    {m.content}
                  </Text>
                </View>
              ))}
              {card.totalMessageCount && card.totalMessageCount > (card.previewMessages?.length || 0) && (
                <Text style={[styles.moreHint, { color: theme.subTextColor }]}>
                  原对话共 {card.totalMessageCount} 条，仅展示预览 {card.previewMessages?.length || 0} 条
                </Text>
              )}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: theme.textColor }}>←</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.textColor }]}>导入对话卡片</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        <View style={[styles.introCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <Text style={styles.introIcon}>📥</Text>
          <Text style={[styles.introTitle, { color: theme.textColor }]}>从社区导入对话</Text>
          <Text style={[styles.introDesc, { color: theme.subTextColor }]}>
            在社区发布区找到喜欢的卡片，点击"导入对话卡片"按钮后，卡片JSON会复制到剪贴板，然后在此处粘贴导入。
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
          onPress={handlePasteFromClipboard}
        >
          <View style={styles.actionIconWrapper}>
            <Text style={styles.actionIcon}>📋</Text>
          </View>
          <View style={styles.actionInfo}>
            <Text style={[styles.actionTitle, { color: theme.textColor }]}>从剪贴板粘贴</Text>
            <Text style={[styles.actionDesc, { color: theme.subTextColor }]}>
              读取剪贴板中的JSON并解析
            </Text>
          </View>
          <Text style={{ color: theme.subTextColor }}>›</Text>
        </TouchableOpacity>

        <View style={styles.tipsSection}>
          <Text style={[styles.tipsTitle, { color: theme.textColor }]}>💡 小贴士</Text>
          <Text style={[styles.tipsText, { color: theme.subTextColor }]}>
            • 在社区发布区点击卡片上的"导入"按钮\n
            • 卡片JSON会自动复制到剪贴板\n
            • 返回此处点击"从剪贴板粘贴"\n
            • 确认卡片信息后点击"导入"\n
            • 导入的对话和角色会出现在对应列表中
          </Text>
        </View>
      </ScrollView>

      {renderCardPreview()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 18, fontWeight: 'bold' },
  content: { flex: 1 },
  contentInner: { padding: 16 },

  introCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  introIcon: { fontSize: 48, marginBottom: 12 },
  introTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  introDesc: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  actionIconWrapper: {
    width: 48, height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(100,150,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  actionIcon: { fontSize: 24 },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '500' },
  actionDesc: { fontSize: 12, marginTop: 2 },

  tipsSection: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
  tipsTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  tipsText: { fontSize: 12, lineHeight: 20 },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold' },
  previewContent: { flex: 1, padding: 16 },

  cardInfo: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold' },
  cardAuthor: { fontSize: 13, marginTop: 4 },
  cardMeta: { fontSize: 12, marginTop: 4 },

  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  charText: { fontSize: 13, marginBottom: 4 },

  messagesSection: { marginBottom: 20 },
  messageBubble: {
    maxWidth: '85%',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  moreHint: { textAlign: 'center', fontSize: 12, marginTop: 8 },
});
