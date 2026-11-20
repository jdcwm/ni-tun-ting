import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../context/AppContext';
import { generateId } from '../constants/defaults';

interface WorldViewOrganizerProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (chatId: string) => void;
  theme: any;
}

interface WorldBookEntryDraft {
  id: string;
  keys: string;
  content: string;
}

type ParseMode = 'ai' | 'separator' | 'simple';

export const WorldViewOrganizer: React.FC<WorldViewOrganizerProps> = ({
  visible,
  onClose,
  onCreated,
  theme,
}) => {
  const insets = useSafeAreaInsets();
  const { providers, setWorldBooks, worldBooks, chats, setChats, settings } = useApp();

  const [step, setStep] = useState<1 | 2>(1);
  const [chatTitle, setChatTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [summaryPrompt, setSummaryPrompt] = useState('');
  const [entries, setEntries] = useState<WorldBookEntryDraft[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseMode, setParseMode] = useState<ParseMode>('separator');
  const [parseError, setParseError] = useState('');
  const [customRequirements, setCustomRequirements] = useState('');

  const textProvider = providers.find((p) => p.capabilities.includes('text'));
  const summaryProvider = settings.summaryProviderId
    ? providers.find((p) => p.id === settings.summaryProviderId)
    : textProvider;

  const handleSeparatorParse = () => {
    const text = rawText.trim();
    if (!text) return;

    setParseError('');

    const aaaaMatch = text.match(/『aaaa』|【aaaa】|\{\{aaaa\}\}|aaaa/i);
    const yyyyRegex = /『yyyy』|【yyyy】|\{\{yyyy\}\}|yyyy/gi;
    const zzzzMatch = text.match(/『zzzz』|【zzzz】|\{\{zzzz\}\}|zzzz/i);

    let beforeStr = text;
    let middleStr = '';
    let afterStr = '';

    if (aaaaMatch && aaaaMatch.index !== undefined) {
      beforeStr = text.substring(0, aaaaMatch.index);
      const restAfterAaaa = text.substring(aaaaMatch.index + aaaaMatch[0].length);

      if (zzzzMatch && zzzzMatch.index !== undefined) {
        const zzzzRelIndex = zzzzMatch.index - aaaaMatch.index - aaaaMatch[0].length;
        if (zzzzRelIndex > 0) {
          middleStr = restAfterAaaa.substring(0, zzzzRelIndex);
          afterStr = restAfterAaaa.substring(zzzzRelIndex + zzzzMatch[0].length);
        } else {
          middleStr = restAfterAaaa;
        }
      } else {
        middleStr = restAfterAaaa;
      }
    } else {
      const allYyyyMatches = [...text.matchAll(yyyyRegex)];
      if (allYyyyMatches.length >= 2) {
        const firstIdx = allYyyyMatches[0].index || 0;
        const lastMatch = allYyyyMatches[allYyyyMatches.length - 1];
        const lastIdx = (lastMatch.index || 0) + (lastMatch[0]?.length || 0);
        beforeStr = text.substring(0, firstIdx);
        middleStr = text.substring(firstIdx + (allYyyyMatches[0][0]?.length || 0), lastIdx - (lastMatch[0]?.length || 0));
        afterStr = text.substring(lastIdx);
      }
    }

    const prompt = beforeStr.trim() || '你是一个AI助手。';

    const entryContents: string[] = [];
    const yyyyMatches = [...middleStr.matchAll(yyyyRegex)];

    if (yyyyMatches.length >= 2) {
      for (let i = 0; i < yyyyMatches.length - 1; i += 2) {
        const startIdx = (yyyyMatches[i].index || 0) + (yyyyMatches[i][0]?.length || 0);
        const endIdx = yyyyMatches[i + 1].index || middleStr.length;
        const entryContent = middleStr.substring(startIdx, endIdx).trim();
        if (entryContent) {
          entryContents.push(entryContent);
        }
      }
    } else if (middleStr.trim()) {
      const paras = middleStr.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      paras.forEach((p) => entryContents.push(p.trim()));
    }

    const draftEntries: WorldBookEntryDraft[] = entryContents.map((content, i) => {
      const firstLine = content.split('\n')[0].trim();
      const keyText = firstLine.length > 30 ? firstLine.substring(0, 30) : firstLine;
      return {
        id: `draft_${i}`,
        keys: keyText || `条目${i + 1}`,
        content,
      };
    });

    setSystemPrompt(prompt);
    setSummaryPrompt(afterStr.trim());
    setEntries(draftEntries);
    setStep(2);
  };

  const handleSimpleParse = () => {
    const text = rawText.trim();
    if (!text) return;

    setParseError('');
    const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    if (paragraphs.length === 0) return;

    const prompt = paragraphs[0].trim();
    const draftEntries: WorldBookEntryDraft[] = [];

    for (let i = 1; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (para.length < 10) continue;
      const firstLine = para.split('\n')[0].trim();
      const keyText = firstLine.length > 30 ? firstLine.substring(0, 30) : firstLine;
      draftEntries.push({
        id: `draft_${i}`,
        keys: keyText,
        content: para,
      });
    }

    setSystemPrompt(prompt);
    setEntries(draftEntries);
    setStep(2);
  };

  const callAIForParse = async () => {
    if (!summaryProvider || !rawText.trim()) {
      handleSeparatorParse();
      return;
    }

    setIsParsing(true);
    setParseError('');

    try {
      const customReqText = customRequirements.trim()
        ? `\n\n用户额外要求：\n${customRequirements.trim()}`
        : '';

      const systemInstruction = `你是一个世界观整理专家。用户会输入一段原始的世界观文本，你需要将其整理为结构化格式。

请严格按照以下格式输出，不要添加任何额外内容：

『aaaa』
[系统设定内容 - 即AI的角色设定、对话风格、世界观背景等总体设定]
『yyyy』
[条目1的触发关键词，用逗号分隔]
[条目1的详细内容]
『yyyy』
[条目2的触发关键词，用逗号分隔]
[条目2的详细内容]
『yyyy』
...（更多世界书条目）
『zzzz』
[总结提示词 - 如果用户原文中有总结/压缩/概括相关的指令则放在这里，没有则留空]

规则：
1. 『aaaa』之前放系统设定（整体世界观、AI身份等）
2. 每对『yyyy』之间是一个世界书条目，第一行是触发关键词（逗号分隔），后面是内容
3. 『zzzz』之后放总结指令（如果有的话）
4. 不要使用Markdown格式，直接纯文本输出
5. 关键词要简洁，2-6个词，能触发该条目即可
6. 根据用户的额外要求调整整理方式${customReqText ? '：' + customReqText.substring(customReqText.indexOf('：') + 1) : ''}`;

      const userMessage = `请整理以下世界观文本：

${rawText}${customReqText}`;

      const apiUrl = summaryProvider.baseUrl || '';
      const apiKey = summaryProvider.apiKey || '';
      const modelId = settings.summaryModel || settings.defaultModel;

      if (!apiUrl || !apiKey || !modelId) {
        handleSeparatorParse();
        return;
      }

      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const aiOutput = data.choices?.[0]?.message?.content || '';

      if (!aiOutput || !aiOutput.includes('aaaa')) {
        handleSeparatorParse();
        return;
      }

      const aaaaIdx = aiOutput.indexOf('『aaaa』');
      const beforeAaaa = aaaaIdx >= 0 ? aiOutput.substring(0, aaaaIdx) : aiOutput;
      const afterAaaa = aaaaIdx >= 0 ? aiOutput.substring(aaaaIdx + 5) : '';

      const zzzzIdx = afterAaaa.indexOf('『zzzz』');
      const middlePart = zzzzIdx >= 0 ? afterAaaa.substring(0, zzzzIdx) : afterAaaa;
      const afterZzzz = zzzzIdx >= 0 ? afterAaaa.substring(zzzzIdx + 5) : '';

      const prompt = beforeAaaa.trim() || '你是一个AI助手。';
      setSummaryPrompt(afterZzzz.trim());

      const yyyyParts: string[] = [];
      let remaining = middlePart;
      while (true) {
        const yStart = remaining.indexOf('『yyyy』');
        if (yStart === -1) break;
        const afterStart = remaining.substring(yStart + 5);
        const yEnd = afterStart.indexOf('『yyyy』');
        if (yEnd === -1) {
          if (afterStart.trim()) yyyyParts.push(afterStart.trim());
          break;
        }
        const content = afterStart.substring(0, yEnd).trim();
        if (content) yyyyParts.push(content);
        remaining = afterStart.substring(yEnd + 5);
      }

      const draftEntries: WorldBookEntryDraft[] = yyyyParts.map((content, i) => {
        const lines = content.split('\n').filter((l) => l.trim());
        const keysLine = lines[0]?.trim() || `条目${i + 1}`;
        const contentBody = lines.length > 1 ? lines.slice(1).join('\n').trim() : content;
        return {
          id: `draft_${i}`,
          keys: keysLine.length > 50 ? keysLine.substring(0, 50) : keysLine,
          content: contentBody || content,
        };
      });

      setSystemPrompt(prompt);
      setEntries(draftEntries);
      setStep(2);
    } catch (err: any) {
      console.warn('AI parse failed, fallback to separator mode:', err.message);
      setParseError('AI解析失败，已使用分隔词模式');
      handleSeparatorParse();
    } finally {
      setIsParsing(false);
    }
  };

  const handleParse = () => {
    if (parseMode === 'ai') {
      callAIForParse();
    } else if (parseMode === 'separator') {
      handleSeparatorParse();
    } else {
      handleSimpleParse();
    }
  };

  const handleAddEntry = () => {
    setEntries([
      ...entries,
      { id: generateId(), keys: '', content: '' },
    ]);
  };

  const handleRemoveEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const handleUpdateEntry = (id: string, field: 'keys' | 'content', value: string) => {
    setEntries(
      entries.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const handleCreate = () => {
    if (!chatTitle.trim() || !systemPrompt.trim()) return;

    const chatId = generateId();
    const worldBookId = generateId();
    const now = Date.now();

    const validEntries = entries
      .filter((e) => e.keys.trim() && e.content.trim())
      .map((e) => ({
        id: generateId(),
        keys: e.keys.split(/[,，、]/).map((k) => k.trim()).filter(Boolean),
        content: e.content.trim(),
        images: [],
        enabled: true,
      }));

    const newWorldBook = {
      id: worldBookId,
      name: chatTitle.trim(),
      entries: validEntries,
      createdAt: now,
      updatedAt: now,
    };

    setWorldBooks([...worldBooks, newWorldBook]);

    const newChat = {
      id: chatId,
      title: chatTitle.trim(),
      messages: [],
      createdAt: now,
      updatedAt: now,
      worldBookIds: validEntries.length > 0 ? [worldBookId] : [],
      settings: {
        systemPrompt: systemPrompt.trim(),
        memoryLength: 20,
        autoSummarize: false,
        autoSummarizeThreshold: 10,
        streamOutput: true,
        maxImagesPerMessage: 3,
        sendImagesInContext: true,
        imageHistoryCount: 5,
        summaryPrompt: summaryPrompt.trim(),
        imageGenerationPrompt: '',
        autoImageGeneration: false,
        userPersona: '',
        prePrompt: '',
        postPrompt: '',
        customCSS: '',
        globalCSS: '',
        cssEntries: [],
        blockWords: [],
        suggestedQuestionsEnabled: true,
        greeting: '',
        greetingEnabled: false,
      },
      conversationType: 'parent' as const,
    };

    setChats([newChat, ...chats]);
    onCreated(chatId);

    setStep(1);
    setRawText('');
    setChatTitle('');
    setSystemPrompt('');
    setSummaryPrompt('');
    setEntries([]);
    setParseError('');
    setCustomRequirements('');
  };

  const handleClose = () => {
    setStep(1);
    setRawText('');
    setChatTitle('');
    setSystemPrompt('');
    setSummaryPrompt('');
    setEntries([]);
    setParseError('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={{ flex: 1, width: '100%' }} />
        </TouchableWithoutFeedback>
        <View
          style={[
            styles.content,
            { backgroundColor: theme.menuBgColor },
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: theme.borderColor }]}>
            <TouchableOpacity onPress={handleClose}>
              <Text style={{ color: theme.subTextColor, fontSize: 16 }}>取消</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.textColor }]}>
              {step === 1 ? 'AI整理世界观' : '编辑设定'}
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {step === 1 ? (
              <View style={styles.step1}>
                <Text style={[styles.label, { color: theme.subTextColor }]}>
                  对话标题
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: theme.inputBgColor, color: theme.textColor },
                  ]}
                  value={chatTitle}
                  onChangeText={setChatTitle}
                  placeholder="例如：我的原创世界观"
                  placeholderTextColor={theme.subTextColor}
                />

                <View style={styles.modeTabs}>
                  <TouchableOpacity
                    style={[
                      styles.modeTab,
                      { backgroundColor: theme.secondaryColor },
                      parseMode === 'ai' && [styles.modeTabActive, { backgroundColor: theme.accentColor }],
                    ]}
                    onPress={() => setParseMode('ai')}
                  >
                    <Text style={[
                      styles.modeTabText,
                      { color: parseMode === 'ai' ? theme.buttonTextColor : theme.textColor },
                    ]}>
                      AI整理
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modeTab,
                      { backgroundColor: theme.secondaryColor },
                      parseMode === 'separator' && [styles.modeTabActive, { backgroundColor: theme.accentColor }],
                    ]}
                    onPress={() => setParseMode('separator')}
                  >
                    <Text style={[
                      styles.modeTabText,
                      { color: parseMode === 'separator' ? theme.buttonTextColor : theme.textColor },
                    ]}>
                      分隔词
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modeTab,
                      { backgroundColor: theme.secondaryColor },
                      parseMode === 'simple' && [styles.modeTabActive, { backgroundColor: theme.accentColor }],
                    ]}
                    onPress={() => setParseMode('simple')}
                  >
                    <Text style={[
                      styles.modeTabText,
                      { color: parseMode === 'simple' ? theme.buttonTextColor : theme.textColor },
                    ]}>
                      分段
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.label, { color: theme.subTextColor, marginTop: 16 }]}>
                  世界观原文
                </Text>
                <TextInput
                  style={[
                    styles.textArea,
                    { backgroundColor: theme.inputBgColor, color: theme.textColor },
                  ]}
                  value={rawText}
                  onChangeText={setRawText}
                  placeholder={parseMode === 'ai'
                    ? '把你的世界观文本粘贴到这里，AI会自动整理成系统设定+世界书条目...'
                    : parseMode === 'separator'
                    ? '使用分隔词格式：&#10;『aaaa』之前 → 系统设定&#10;『yyyy』条目内容『yyyy』 → 世界书条目&#10;『zzzz』之后 → 总结指令'
                    : '把乱七八糟的设定贴到这里...&#10;&#10;第一段 → 系统设定&#10;后面每段 → 世界书条目'
                  }
                  placeholderTextColor={theme.subTextColor}
                  multiline
                  textAlignVertical="top"
                />

                {parseMode === 'ai' && (
                  <>
                    <Text style={[styles.label, { color: theme.subTextColor, marginTop: 16 }]}>
                      额外整理要求（可选）
                    </Text>
                    <TextInput
                      style={[
                        styles.textArea,
                        { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 60 },
                      ]}
                      value={customRequirements}
                      onChangeText={setCustomRequirements}
                      placeholder="例如：重点整理人物关系、将条目按时间线排列、生成中文关键词等"
                      placeholderTextColor={theme.subTextColor}
                      multiline
                      textAlignVertical="top"
                    />
                  </>
                )}

                {parseError !== '' && (
                  <Text style={[styles.errorText, { color: '#ff6b6b' }]}>{parseError}</Text>
                )}

                {rawText.trim().length > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      { backgroundColor: theme.accentColor },
                      isParsing && { opacity: 0.7 },
                    ]}
                    onPress={handleParse}
                    disabled={isParsing}
                  >
                    {isParsing ? (
                      <View style={styles.parseLoading}>
                        <ActivityIndicator color={theme.buttonTextColor} size="small" />
                        <Text style={{ color: theme.buttonTextColor, fontWeight: '600', marginLeft: 8 }}>
                          AI整理中...
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ color: theme.buttonTextColor, fontWeight: '600' }}>
                        {parseMode === 'ai' ? 'AI整理并生成' : '解析并整理'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.step2}>
                <Text style={[styles.label, { color: theme.subTextColor }]}>
                  系统设定（System Prompt）
                </Text>
                <TextInput
                  style={[
                    styles.textArea,
                    { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 100 },
                  ]}
                  value={systemPrompt}
                  onChangeText={setSystemPrompt}
                  placeholder="AI 扮演的角色设定..."
                  placeholderTextColor={theme.subTextColor}
                  multiline
                  textAlignVertical="top"
                />

                {summaryPrompt !== '' && (
                  <>
                    <Text style={[styles.label, { color: theme.subTextColor, marginTop: 16 }]}>
                      总结提示词
                    </Text>
                    <TextInput
                      style={[
                        styles.textArea,
                        { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 60 },
                      ]}
                      value={summaryPrompt}
                      onChangeText={setSummaryPrompt}
                      placeholder="对话压缩/总结时使用的提示词..."
                      placeholderTextColor={theme.subTextColor}
                      multiline
                      textAlignVertical="top"
                    />
                  </>
                )}

                <View style={styles.sectionHeader}>
                  <Text style={[styles.label, { color: theme.subTextColor }]}>
                    世界书条目 ({entries.length})
                  </Text>
                  <TouchableOpacity onPress={handleAddEntry}>
                    <Text style={{ color: theme.accentColor, fontSize: 14 }}>+ 添加</Text>
                  </TouchableOpacity>
                </View>

                {entries.map((entry, index) => (
                  <View
                    key={entry.id}
                    style={[styles.entryCard, { backgroundColor: theme.secondaryColor }]}
                  >
                    <View style={styles.entryHeader}>
                      <Text style={{ color: theme.subTextColor, fontSize: 12 }}>
                        条目 {index + 1}
                      </Text>
                      <TouchableOpacity onPress={() => handleRemoveEntry(entry.id)}>
                        <Text style={{ color: '#ff4444', fontSize: 12 }}>删除</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: theme.inputBgColor, color: theme.textColor, marginBottom: 8 },
                      ]}
                      value={entry.keys}
                      onChangeText={(v) => handleUpdateEntry(entry.id, 'keys', v)}
                      placeholder="触发关键词，用逗号分隔"
                      placeholderTextColor={theme.subTextColor}
                    />
                    <TextInput
                      style={[
                        styles.textArea,
                        { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 80 },
                      ]}
                      value={entry.content}
                      onChangeText={(v) => handleUpdateEntry(entry.id, 'content', v)}
                      placeholder="条目内容..."
                      placeholderTextColor={theme.subTextColor}
                      multiline
                      textAlignVertical="top"
                    />
                  </View>
                ))}

                {entries.length === 0 && (
                  <Text style={{ color: theme.subTextColor, textAlign: 'center', padding: 20 }}>
                    没有世界书条目，点击上方"添加"或返回上一步重新解析
                  </Text>
                )}

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.accentColor, marginTop: 20 }]}
                  onPress={handleCreate}
                >
                  <Text style={{ color: theme.buttonTextColor, fontWeight: '600' }}>
                    创建对话
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.secondaryColor }]}
                  onPress={() => setStep(1)}
                >
                  <Text style={{ color: theme.textColor }}>返回修改原文</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  content: {
    width: '100%',
    maxHeight: '85%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  scroll: {
    padding: 16,
  },
  step1: {
    paddingBottom: 20,
  },
  step2: {
    paddingBottom: 20,
  },
  label: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  textArea: {
    maxHeight: 240,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 200,
  },
  actionBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  entryCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  modeTabActive: {},
  modeTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  parseLoading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
});
