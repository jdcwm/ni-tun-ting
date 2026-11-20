import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Clipboard, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { IconClose, IconChevronRight, IconCopy, IconTrash, IconSend, IconBook, IconImport, IconExport, IconUpload } from '../components/Icons';
import { FancyWork, FancyWorkType } from '../types';
import { generateId } from '../constants/defaults';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

type ToolId = 'promptBuilder' | 'nameGen' | 'passwordGen' | 'textClean' | 'imagePrompt' | 'jsonFormatter';

interface Tool {
  id: ToolId;
  title: string;
  desc: string;
}

interface Props {
  onClose: () => void;
  onInsertToChat?: (content: string) => void;
}

const TOOLS: Tool[] = [
  { id: 'promptBuilder', title: '提示词构建器', desc: '拼接角色卡提示词模板' },
  { id: 'nameGen', title: '角色名生成器', desc: '按风格批量生成角色名' },
  { id: 'passwordGen', title: '密码生成器', desc: '生成高强度随机密码' },
  { id: 'textClean', title: '文本清洗', desc: '去除多余空白、特殊字符' },
  { id: 'imagePrompt', title: 'AI 绘图提示词', desc: '将描述转为 Stable Diffusion 提示词' },
  { id: 'jsonFormatter', title: 'JSON 格式化', desc: '格式化 / 压缩 / 校验 JSON' },
];

const PROMPT_TEMPLATES = [
  {
    id: 'template_tsundere',
    name: '傲娇角色',
    description: '经典傲娇女主角模板',
    type: 'prompt' as const,
    content: `# 角色卡

# 角色
你是一位性格傲娇的女主角，表面冷淡但内心温柔。

# 性格
- 口是心非，嘴上说"才不是呢"实际很在意
- 容易害羞，被戳穿时会脸红
- 自尊心强但内心柔软
- 刀子嘴豆腐心

# 说话风格
- 常用"笨蛋"、"才不是"、"别误会"等口头禅
- 偶尔暴露真实感情后会马上掩饰
- 对男主角特别关注但嘴上不承认

# 约束
- 始终保持傲娇性格
- 使用中文回答
- 回复时加入适当的傲娇反应`,
  },
  {
    id: 'template_assistant',
    name: 'AI 助手',
    description: '通用 AI 助手模板',
    type: 'prompt' as const,
    content: `# 角色卡

# 角色
你是一个乐于助人、知识渊博的 AI 助手。

# 性格
- 耐心、友善、专业
- 善于用简单易懂的方式解释复杂问题
- 诚实、不编造信息

# 能力
- 回答各种知识性问题
- 协助写作、翻译、总结
- 提供创意灵感和建议

# 约束
- 使用中文回答
- 对于不确定的问题，诚实告知
- 回答准确、简洁、有条理`,
  },
  {
    id: 'template_storyteller',
    name: '故事讲述者',
    description: '长故事叙述者模板',
    type: 'prompt' as const,
    content: `# 角色卡

# 角色
你是一位擅长讲故事的叙述者，能够构建引人入胜的奇幻故事。

# 性格
- 富有想象力和创造力
- 擅长细节描写和氛围营造
- 故事结构完整，有起承转合

# 写作风格
- 场景描写生动，有画面感
- 角色对话自然，体现性格
- 情节推进合理，有悬念和转折
- 适当使用比喻和修辞手法

# 约束
- 使用中文
- 每次回复推进故事发展
- 保持故事连贯性`,
  },
  {
    id: 'template_teacher',
    name: '良师益友',
    description: '循循善诱的老师模板',
    type: 'prompt' as const,
    content: `# 角色卡

# 角色
你是一位博学多才、循循善诱的老师。

# 性格
- 耐心、温和、鼓励式教育
- 善于发现学生的潜力
- 对知识充满热情

# 教学风格
- 用简单的例子解释复杂概念
- 引导学生思考，而不是直接给出答案
- 适时给予肯定和鼓励
- 布置适当的练习帮助巩固

# 约束
- 使用中文
- 根据学生水平调整讲解深度
- 保持友好亲切的语气`,
  },
  {
    id: 'template_cool',
    name: '冷酷智者',
    description: '冷酷理性的智者模板',
    type: 'prompt' as const,
    content: `# 角色卡

# 角色
你是一位冷酷理性的智者，对世界有深刻的洞察。

# 性格
- 冷静、理性、不轻易流露感情
- 言语简洁有力，不拖泥带水
- 看透事物本质，直击要害

# 说话风格
- 语气平淡但内容深刻
- 偶尔一针见血地指出问题
- 不做无意义的寒暄

# 约束
- 使用中文
- 回答简明扼要
- 保持理性客观`,
  },
];

export const FancyToolBoxScreen: React.FC<Props> = ({ onClose }) => {
  const theme = useTheme();
  const { currentChatId, chats, setChats, fancyWorks, setFancyWorks } = useApp();
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [apiBusy, setApiBusy] = useState(false);

  const normalizeWork = (w: any, i: number): FancyWork => {
    const now = Date.now();
    return {
      id: w.id || generateId(),
      name: w.name || w.title || `导入模板 ${i + 1}`,
      type: (w.type as FancyWorkType) || 'custom',
      html: w.html || '',
      css: w.css || '',
      js: w.js || w.content || '',
      description: w.description || w.desc || '',
      isPreset: false,
      createdAt: w.createdAt || now,
      updatedAt: w.updatedAt || now,
    };
  };

  const handleExport = async () => {
    if (fancyWorks.length === 0) { Alert.alert('提示', '还没有可导出的模板'); return; }
    try {
      const json = JSON.stringify(fancyWorks, null, 2);
      const fileUri = FileSystem.cacheDirectory + 'fancyworks-export.json';
      await FileSystem.writeAsStringAsync(fileUri, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: '导出花式工具箱模板' });
      } else {
        Clipboard.setString(json);
        Alert.alert('已复制', '无法分享文件，已复制 JSON 到剪贴板');
      }
    } catch (e: any) {
      Alert.alert('导出失败', e?.message || String(e));
    }
  };

  const mergeWorks = (list: any[]) => {
    const normalized = list.map(normalizeWork);
    const seen = new Set(fancyWorks.map((w) => w.id));
    const fresh = normalized.filter((w) => !seen.has(w.id));
    if (fresh.length === 0) { Alert.alert('提示', '没有新的模板（可能已全部导入）'); return; }
    setFancyWorks([...fancyWorks, ...fresh]);
    Alert.alert('导入成功', `已导入 ${fresh.length} 个模板`);
  };

  const handleImport = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true });
      if (res.canceled) return;
      const content = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const parsed = JSON.parse(content);
      const list = Array.isArray(parsed) ? parsed : (parsed.fancyWorks || parsed.templates || [parsed]);
      if (!Array.isArray(list) || list.length === 0) { Alert.alert('导入失败', '未在文件里找到模板数组'); return; }
      mergeWorks(list);
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || String(e));
    }
  };

  const handleApiImport = async () => {
    const url = apiUrl.trim();
    if (!/^https?:\/\//i.test(url)) { Alert.alert('提示', '请输入 http(s):// 开头的接口地址'); return; }
    setApiBusy(true);
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      const list = Array.isArray(data) ? data : (data.fancyWorks || data.templates || data.data || []);
      if (!Array.isArray(list) || list.length === 0) { Alert.alert('导入失败', '接口未返回模板数组'); return; }
      mergeWorks(list);
      setShowApiModal(false);
      setApiUrl('');
    } catch (e: any) {
      Alert.alert('接口请求失败', e?.message || String(e));
    } finally {
      setApiBusy(false);
    }
  };

  const handleSaveAsTemplate = (name: string, content: string, type: FancyWorkType = 'custom') => {
    if (!name.trim()) { Alert.alert('提示', '请输入模板名称'); return; }
    const now = Date.now();
    const newWork: FancyWork = {
      id: generateId(),
      name: name.trim(),
      type,
      html: '',
      css: '',
      js: content,
      description: `通过工具箱生成的模板`,
      isPreset: false,
      createdAt: now,
      updatedAt: now,
    };
    setFancyWorks([...fancyWorks, newWork]);
    Alert.alert('成功', `已保存模板 "${name}"`);
  };

  const handleInsertToChat = (content: string) => {
    if (!currentChatId) {
      Alert.alert('提示', '请先选择或创建一个对话');
      return;
    }
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) {
      Alert.alert('提示', '未找到当前对话');
      return;
    }
    const now = Date.now();
    const newMessage = {
      id: generateId(),
      role: 'user' as const,
      content: content,
      images: [],
      timestamp: now,
    };
    setChats(chats.map(c => c.id === currentChatId
      ? { ...c, messages: [...c.messages, newMessage], updatedAt: now }
      : c
    ));
    Alert.alert('成功', '内容已插入当前对话');
  };

  const applyTemplate = (templateContent: string) => {
    setActiveTool('promptBuilder');
    Alert.alert('模板已加载', '提示词模板已加载到提示词构建器中，请进行调整后使用');
    setTimeout(() => {
    }, 100);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
          <IconClose size={22} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>花式工具箱</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => setShowTemplates(true)} style={styles.headerBtn}>
            <IconBook size={20} color={theme.accentColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowApiModal(true)} style={styles.headerBtn}>
            <IconImport size={20} color={theme.textColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleImport} style={styles.headerBtn}>
            <IconUpload size={20} color={theme.textColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleExport} style={styles.headerBtn}>
            <IconExport size={20} color={theme.textColor} />
          </TouchableOpacity>
        </View>
      </View>

      {activeTool === null ? (
        <ScrollView style={styles.content}>
          <View style={[styles.section, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <TouchableOpacity
              style={styles.templateEntry}
              onPress={() => setShowTemplates(true)}
            >
              <IconBook size={24} color={theme.accentColor} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.templateTitle, { color: theme.textColor }]}>提示词模板库</Text>
                <Text style={[styles.templateDesc, { color: theme.subTextColor }]}>
                  浏览预设角色卡模板，一键加载使用
                </Text>
              </View>
              <IconChevronRight size={18} color={theme.subTextColor} />
            </TouchableOpacity>
          </View>

          <View style={styles.sectionLabel}>
            <Text style={[styles.sectionLabelText, { color: theme.subTextColor }]}>实用工具</Text>
          </View>

          {TOOLS.map((tool) => (
            <TouchableOpacity
              key={tool.id}
              style={[styles.toolCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
              onPress={() => setActiveTool(tool.id)}
            >
              <View style={[styles.toolIcon, { backgroundColor: theme.accentColor }]}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>
                  {tool.title[0]}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.toolTitle, { color: theme.textColor }]}>{tool.title}</Text>
                <Text style={[styles.toolDesc, { color: theme.subTextColor }]}>{tool.desc}</Text>
              </View>
              <IconChevronRight size={18} color={theme.subTextColor} />
            </TouchableOpacity>
          ))}

          {fancyWorks.length > 0 && (
            <View style={styles.sectionLabel}>
              <Text style={[styles.sectionLabelText, { color: theme.subTextColor }]}>我的模板 ({fancyWorks.length})</Text>
            </View>
          )}

          {fancyWorks.map((fw) => (
            <View
              key={fw.id}
              style={[styles.savedCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.savedName, { color: theme.textColor }]} numberOfLines={1}>{fw.name}</Text>
                <Text style={[styles.savedDesc, { color: theme.subTextColor }]} numberOfLines={1}>
                  {fw.description}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.miniBtn, { borderColor: theme.borderColor }]}
                onPress={() => {
                  const content = fw.js || fw.html || '';
                  if (content) {
                    handleInsertToChat(content);
                  }
                }}
              >
                <IconSend size={14} color={theme.accentColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { borderColor: theme.borderColor }]}
                onPress={() => {
                  const content = fw.js || fw.html || '';
                  if (content) copyToClipboard(content);
                }}
              >
                <IconCopy size={14} color={theme.subTextColor} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtn, { borderColor: theme.borderColor }]}
                onPress={() => {
                  Alert.alert('确认删除', `确定删除模板 "${fw.name}" 吗？`, [
                    { text: '取消', style: 'cancel' },
                    { text: '删除', style: 'destructive', onPress: () => setFancyWorks(fancyWorks.filter(w => w.id !== fw.id)) },
                  ]);
                }}
              >
                <IconTrash size={14} color="#ff6b6b" />
              </TouchableOpacity>
            </View>
          ))}

          <View style={{ height: 32 }} />
        </ScrollView>
      ) : (
        <ToolView
          toolId={activeTool}
          onBack={() => setActiveTool(null)}
          onSaveTemplate={handleSaveAsTemplate}
          onInsertToChat={handleInsertToChat}
          onCopy={copyToClipboard}
        />
      )}

      {showTemplates && (
        <TemplateLibraryModal
          templates={PROMPT_TEMPLATES}
          onClose={() => setShowTemplates(false)}
          onApply={(content) => {
            setShowTemplates(false);
            applyTemplate(content);
          }}
          theme={theme}
        />
      )}

      {showApiModal && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowApiModal(false)} activeOpacity={1} />
          <View style={[styles.apiModal, { backgroundColor: theme.backgroundColor }]}>
            <Text style={[styles.modalTitle, { color: theme.textColor }]}>从 API 导入模板</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 4 }}>
              输入一个返回模板数组（或 {`{ fancyWorks/templates: [...] }`}）的接口地址，点击「浏览并导入」。
            </Text>
            <TextInput
              style={[styles.saveInput, { color: theme.textColor, backgroundColor: theme.inputBgColor, borderColor: theme.borderColor }]}
              placeholder="https://example.com/api/fancyworks"
              placeholderTextColor={theme.subTextColor}
              value={apiUrl}
              onChangeText={setApiUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.saveDialogBtns}>
              <TouchableOpacity style={[styles.saveDialogBtn, { borderColor: theme.borderColor }]} onPress={() => { setShowApiModal(false); setApiUrl(''); }}>
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveDialogBtn, { backgroundColor: theme.accentColor, opacity: apiBusy ? 0.5 : 1 }]} onPress={handleApiImport} disabled={apiBusy}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>{apiBusy ? '请求中…' : '浏览并导入'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const copyToClipboard = (text: string) => {
  Clipboard.setString(text);
  Alert.alert('已复制', '内容已复制到剪贴板');
};

const TemplateLibraryModal: React.FC<{
  templates: typeof PROMPT_TEMPLATES;
  onClose: () => void;
  onApply: (content: string) => void;
  theme: any;
}> = ({ templates, onClose, onApply, theme }) => {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} activeOpacity={1} />
      <View style={[styles.modalContainer, { backgroundColor: theme.backgroundColor }]}>
        <View style={[styles.modalHeader, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <IconClose size={22} color={theme.textColor} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: theme.textColor }]}>提示词模板库</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView style={styles.modalContent}>
          {templates.map((t) => (
            <View
              key={t.id}
              style={[styles.templateCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
            >
              <View style={{ marginBottom: 8 }}>
                <Text style={[styles.templateCardName, { color: theme.textColor }]}>{t.name}</Text>
                <Text style={[styles.templateCardDesc, { color: theme.subTextColor }]}>{t.description}</Text>
              </View>
              <View style={[styles.templatePreview, { backgroundColor: theme.inputBgColor }]}>
                <Text style={[styles.templatePreviewText, { color: theme.textColor }]} numberOfLines={4}>
                  {t.content}
                </Text>
              </View>
              <View style={styles.templateActions}>
                <TouchableOpacity
                  style={[styles.templateBtn, { backgroundColor: theme.accentColor }]}
                  onPress={() => onApply(t.content)}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>加载模板</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.templateBtn, { borderColor: theme.borderColor, borderWidth: 1 }]}
                  onPress={() => copyToClipboard(t.content)}
                >
                  <IconCopy size={14} color={theme.textColor} />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const ToolView: React.FC<{
  toolId: ToolId;
  onBack: () => void;
  onSaveTemplate: (name: string, content: string, type?: FancyWorkType) => void;
  onInsertToChat: (content: string) => void;
  onCopy: (text: string) => void;
}> = ({ toolId, onBack, onSaveTemplate, onInsertToChat, onCopy }) => {
  const theme = useTheme();

  const renderTool = () => {
    switch (toolId) {
      case 'promptBuilder': return <PromptBuilderTool theme={theme} onSaveTemplate={onSaveTemplate} onInsertToChat={onInsertToChat} onCopy={onCopy} />;
      case 'nameGen': return <NameGenTool theme={theme} onSaveTemplate={onSaveTemplate} onInsertToChat={onInsertToChat} onCopy={onCopy} />;
      case 'passwordGen': return <PasswordGenTool theme={theme} onSaveTemplate={onSaveTemplate} onInsertToChat={onInsertToChat} onCopy={onCopy} />;
      case 'textClean': return <TextCleanTool theme={theme} onSaveTemplate={onSaveTemplate} onInsertToChat={onInsertToChat} onCopy={onCopy} />;
      case 'imagePrompt': return <ImagePromptTool theme={theme} onSaveTemplate={onSaveTemplate} onInsertToChat={onInsertToChat} onCopy={onCopy} />;
      case 'jsonFormatter': return <JsonFormatterTool theme={theme} onSaveTemplate={onSaveTemplate} onInsertToChat={onInsertToChat} onCopy={onCopy} />;
    }
  };

  const toolTitle = TOOLS.find((t) => t.id === toolId)?.title || '工具';

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.subHeader, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
          <IconChevronRight size={22} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.subHeaderTitle, { color: theme.textColor }]}>{toolTitle}</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView style={styles.toolContent} keyboardShouldPersistTaps="handled">
        {renderTool()}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

type Theme = ReturnType<typeof useTheme>;

interface ToolProps {
  theme: Theme;
  onSaveTemplate: (name: string, content: string, type?: FancyWorkType) => void;
  onInsertToChat: (content: string) => void;
  onCopy: (text: string) => void;
}

const PromptBuilderTool: React.FC<ToolProps> = ({ theme, onSaveTemplate, onInsertToChat, onCopy }) => {
  const [role, setRole] = useState('');
  const [personality, setPersonality] = useState('');
  const [scenario, setScenario] = useState('');
  const [constraints, setConstraints] = useState('');
  const [output, setOutput] = useState('');

  const build = () => {
    const parts: string[] = [];
    if (role) parts.push(`# 角色\n${role}`);
    if (personality) parts.push(`# 性格\n${personality}`);
    if (scenario) parts.push(`# 场景\n${scenario}`);
    if (parts.length === 0) { Alert.alert('提示', '请至少填写一项'); return; }
    const constraintText = constraints || '始终保持角色性格\n使用中文回答\n回复长度适中';
    const result = `# 角色卡\n\n${parts.join('\n\n')}\n\n# 约束\n${constraintText}`;
    setOutput(result);
  };

  return (
    <View>
      <InputBlock theme={theme} label="角色设定" value={role} onChangeText={setRole} placeholder="例如：你是一位性格高冷的魔法师" />
      <InputBlock theme={theme} label="性格特点" value={personality} onChangeText={setPersonality} placeholder="例如：傲娇、刀子嘴豆腐心" />
      <InputBlock theme={theme} label="场景背景" value={scenario} onChangeText={setScenario} placeholder="例如：在魔法学院的图书馆相遇" />
      <InputBlock theme={theme} label="约束规则（可选）" value={constraints} onChangeText={setConstraints} placeholder="自定义约束，每行一条" multiline />
      <ActionRow theme={theme} primaryLabel="构建提示词" onPrimary={build} />
      {output ? (
        <ResultBlock theme={theme} text={output} onSave={(name) => onSaveTemplate(name, output, 'custom')} onInsert={() => onInsertToChat(output)} onCopy={onCopy} />
      ) : null}
    </View>
  );
};

const NameGenTool: React.FC<ToolProps> = ({ theme, onSaveTemplate, onInsertToChat, onCopy }) => {
  const [genre, setGenre] = useState<'fantasy' | 'modern' | 'xianxia' | 'sci-fi'>('fantasy');
  const [count, setCount] = useState(5);
  const [results, setResults] = useState<string[]>([]);

  const generate = () => {
    const names: string[] = [];
    const syllables: Record<string, string[]> = {
      fantasy: ['a', 'el', 'gar', 'thor', 'win', 'lyn', 'dra', 'nyx', 'fae', 'mor', 'ion', 'ara', 'zen', 'yth'],
      modern: ['ja', 'mi', 'so', 'ali', 'no', 'kai', 'lu', 'xia', 'lei', 'zhang', 'chen', 'wang', 'liu'],
      xianxia: ['yun', 'xue', 'feng', 'tian', 'ling', 'hua', 'yue', 'chen', 'jin', 'mu', 'qing', 'long', 'xiao'],
      'sci-fi': ['zx', 'ny', 'kr', 'vl', 'px', 'qx', 'dr', 'sr', 'tr', 'wz', 'ax', 'rx', 'nv'],
    };
    const pools = syllables[genre];
    for (let i = 0; i < count; i++) {
      let name = '';
      const len = 2 + Math.floor(Math.random() * 2);
      for (let j = 0; j < len; j++) {
        name += pools[Math.floor(Math.random() * pools.length)];
      }
      name = name.charAt(0).toUpperCase() + name.slice(1);
      names.push(name);
    }
    setResults(names);
  };

  const combinedText = results.join('\n');

  return (
    <View>
      <View style={styles.segmentRow}>
        {(['fantasy', 'modern', 'xianxia', 'sci-fi'] as const).map((g) => (
          <TouchableOpacity
            key={g}
            style={[
              styles.segment,
              { borderColor: theme.borderColor },
              genre === g && { backgroundColor: theme.accentColor, borderColor: theme.accentColor },
            ]}
            onPress={() => setGenre(g)}
          >
            <Text style={{ color: genre === g ? '#fff' : theme.textColor, fontSize: 13 }}>
              {g === 'fantasy' ? '奇幻' : g === 'modern' ? '现代' : g === 'xianxia' ? '仙侠' : '科幻'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        <Text style={[styles.label, { color: theme.textColor }]}>生成数量: {count}</Text>
        <View style={styles.countRow}>
          {[3, 5, 10, 20].map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.countBtn, { borderColor: theme.borderColor }, count === c && { backgroundColor: theme.accentColor }]}
              onPress={() => setCount(c)}
            >
              <Text style={{ color: count === c ? '#fff' : theme.textColor }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <ActionRow theme={theme} primaryLabel="生成名称" onPrimary={generate} />
      {results.length > 0 && (
        <View style={[styles.resultList, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          {results.map((n, i) => (
            <TouchableOpacity key={i} style={styles.resultItem} onPress={() => onCopy(n)}>
              <Text style={{ color: theme.textColor, fontSize: 15 }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {results.length > 0 && (
        <ResultBlock theme={theme} text={combinedText} onSave={(name) => onSaveTemplate(name, combinedText)} onInsert={() => onInsertToChat(combinedText)} onCopy={onCopy} />
      )}
    </View>
  );
};

const PasswordGenTool: React.FC<ToolProps> = ({ theme, onSaveTemplate, onInsertToChat, onCopy }) => {
  const [length, setLength] = useState(16);
  const [useUpper, setUseUpper] = useState(true);
  const [useLower, setUseLower] = useState(true);
  const [useNum, setUseNum] = useState(true);
  const [useSym, setUseSym] = useState(true);
  const [result, setResult] = useState('');

  const generate = () => {
    let chars = '';
    if (useUpper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (useLower) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (useNum) chars += '0123456789';
    if (useSym) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars) { Alert.alert('提示', '请至少选择一种字符'); return; }
    let pwd = '';
    for (let i = 0; i < length; i++) {
      pwd += chars[Math.floor(Math.random() * chars.length)];
    }
    setResult(pwd);
  };

  return (
    <View>
      <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        <Text style={[styles.label, { color: theme.textColor }]}>密码长度: {length}</Text>
        <View style={styles.countRow}>
          {[8, 12, 16, 24, 32].map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.countBtn, { borderColor: theme.borderColor }, length === c && { backgroundColor: theme.accentColor }]}
              onPress={() => setLength(c)}
            >
              <Text style={{ color: length === c ? '#fff' : theme.textColor }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        <OptionRow label="大写字母 (A-Z)" value={useUpper} onChange={setUseUpper} theme={theme} />
        <OptionRow label="小写字母 (a-z)" value={useLower} onChange={setUseLower} theme={theme} />
        <OptionRow label="数字 (0-9)" value={useNum} onChange={setUseNum} theme={theme} />
        <OptionRow label="特殊符号 (!@#$)" value={useSym} onChange={setUseSym} theme={theme} />
      </View>
      <ActionRow theme={theme} primaryLabel="生成密码" onPrimary={generate} />
      {result ? <ResultBlock theme={theme} text={result} mono onSave={(name) => onSaveTemplate(name, result)} onInsert={() => onInsertToChat(result)} onCopy={onCopy} /> : null}
    </View>
  );
};

const TextCleanTool: React.FC<ToolProps> = ({ theme, onSaveTemplate, onInsertToChat, onCopy }) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');

  const clean = (mode: 'trim' | 'dedup' | 'punct' | 'all') => {
    let text = input;
    if (mode === 'trim' || mode === 'all') {
      text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    }
    if (mode === 'dedup' || mode === 'all') {
      const lines = text.split('\n');
      const seen = new Set<string>();
      text = lines.filter((l) => { const t = l.trim(); if (!t) return true; if (seen.has(t)) return false; seen.add(t); return true; }).join('\n');
    }
    if (mode === 'punct' || mode === 'all') {
      text = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s,。！？!?.,;；:：'"''"'\n-]/g, '');
    }
    setOutput(text);
  };

  return (
    <View>
      <InputBlock theme={theme} label="输入文本" value={input} onChangeText={setInput} placeholder="粘贴需要清洗的文本..." multiline />
      <View style={styles.btnRow}>
        <SmallBtn theme={theme} label="去空白" onPress={() => clean('trim')} />
        <SmallBtn theme={theme} label="去重复" onPress={() => clean('dedup')} />
        <SmallBtn theme={theme} label="去符号" onPress={() => clean('punct')} />
        <SmallBtn theme={theme} label="全部" onPress={() => clean('all')} />
      </View>
      {output ? <ResultBlock theme={theme} text={output} onSave={(name) => onSaveTemplate(name, output)} onInsert={() => onInsertToChat(output)} onCopy={onCopy} /> : null}
    </View>
  );
};

const ImagePromptTool: React.FC<ToolProps> = ({ theme, onSaveTemplate, onInsertToChat, onCopy }) => {
  const [desc, setDesc] = useState('');
  const [style, setStyle] = useState('写实风格');
  const [output, setOutput] = useState('');

  const styleOptions = ['写实风格', '动漫风格', '油画风格', '水彩风格', '赛博朋克', '梦幻奇幻'];

  const convert = () => {
    if (!desc.trim()) { Alert.alert('提示', '请输入描述'); return; }
    const result = `${desc}, ${style}, masterpiece, best quality, highly detailed, 8k, professional lighting, vibrant colors, sharp focus`;
    setOutput(result);
  };

  return (
    <View>
      <InputBlock theme={theme} label="画面描述" value={desc} onChangeText={setDesc} placeholder="例如：一位银发少女站在樱花树下" multiline />
      <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
        <Text style={[styles.label, { color: theme.textColor }]}>风格选择</Text>
        <View style={styles.tagRow}>
          {styleOptions.map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.tag, { borderColor: theme.borderColor }, style === s && { backgroundColor: theme.accentColor, borderColor: theme.accentColor }]}
              onPress={() => setStyle(s)}
            >
              <Text style={{ color: style === s ? '#fff' : theme.textColor, fontSize: 13 }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <ActionRow theme={theme} primaryLabel="转换为提示词" onPrimary={convert} />
      {output ? <ResultBlock theme={theme} text={output} onSave={(name) => onSaveTemplate(name, output)} onInsert={() => onInsertToChat(output)} onCopy={onCopy} /> : null}
    </View>
  );
};

const JsonFormatterTool: React.FC<ToolProps> = ({ theme, onSaveTemplate, onInsertToChat, onCopy }) => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');

  const format = (indent: number | null) => {
    setError('');
    try {
      const parsed = JSON.parse(input);
      setOutput(indent !== null ? JSON.stringify(parsed, null, indent) : JSON.stringify(parsed));
    } catch (e: any) {
      setError('JSON 解析错误: ' + e.message);
      setOutput('');
    }
  };

  return (
    <View>
      <InputBlock theme={theme} label="JSON 输入" value={input} onChangeText={setInput} placeholder='{"key": "value"}' multiline />
      <View style={styles.btnRow}>
        <SmallBtn theme={theme} label="格式化(2空格)" onPress={() => format(2)} />
        <SmallBtn theme={theme} label="格式化(4空格)" onPress={() => format(4)} />
        <SmallBtn theme={theme} label="压缩" onPress={() => format(null)} />
        <SmallBtn theme={theme} label="校验" onPress={() => { try { JSON.parse(input); setError(''); setOutput('JSON 格式正确'); } catch(e:any) { setError('错误: ' + e.message); setOutput(''); } }} />
      </View>
      {error ? <View style={[styles.errorBox, { backgroundColor: theme.primaryColor, borderColor: '#ff4444' }]}><Text style={{ color: '#ff4444' }}>{error}</Text></View> : null}
      {output ? <ResultBlock theme={theme} text={output} mono onSave={(name) => onSaveTemplate(name, output)} onInsert={() => onInsertToChat(output)} onCopy={onCopy} /> : null}
    </View>
  );
};

const InputBlock: React.FC<{ theme: Theme; label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; multiline?: boolean }> = ({ theme, label, value, onChangeText, placeholder, multiline }) => (
  <View style={[styles.inputGroup, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
    <Text style={[styles.label, { color: theme.textColor }]}>{label}</Text>
    <TextInput
      style={[multiline ? styles.textArea : styles.textInput, { color: theme.textColor, backgroundColor: theme.inputBgColor, borderColor: theme.borderColor }]}
      placeholder={placeholder}
      placeholderTextColor={theme.subTextColor}
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
    />
  </View>
);

const ActionRow: React.FC<{ theme: Theme; primaryLabel: string; onPrimary: () => void }> = ({ theme, primaryLabel, onPrimary }) => (
  <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accentColor }]} onPress={onPrimary}>
    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{primaryLabel}</Text>
  </TouchableOpacity>
);

const SmallBtn: React.FC<{ theme: Theme; label: string; onPress: () => void }> = ({ theme, label, onPress }) => (
  <TouchableOpacity style={[styles.smallBtn, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]} onPress={onPress}>
    <Text style={{ color: theme.textColor, fontSize: 13 }}>{label}</Text>
  </TouchableOpacity>
);

const ResultBlock: React.FC<{
  theme: Theme;
  text: string;
  mono?: boolean;
  onSave: (name: string) => void;
  onInsert: () => void;
  onCopy: (text: string) => void;
}> = ({ theme, text, mono, onSave, onInsert, onCopy }) => {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');

  return (
    <View style={[styles.resultBlock, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
      <View style={styles.resultHeader}>
        <Text style={[styles.resultLabel, { color: theme.subTextColor }]}>结果</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => setShowSaveDialog(true)} style={styles.headerBtn}>
            <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>保存</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onInsert} style={styles.headerBtn}>
            <IconSend size={18} color={theme.accentColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onCopy(text)} style={styles.headerBtn}>
            <IconCopy size={18} color={theme.accentColor} />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={[styles.resultText, { color: theme.textColor, fontFamily: mono ? 'monospace' : undefined }]}>{text}</Text>

      {showSaveDialog && (
        <View style={styles.saveDialog}>
          <TextInput
            style={[styles.saveInput, { color: theme.textColor, backgroundColor: theme.inputBgColor, borderColor: theme.borderColor }]}
            placeholder="模板名称"
            placeholderTextColor={theme.subTextColor}
            value={templateName}
            onChangeText={setTemplateName}
          />
          <View style={styles.saveDialogBtns}>
            <TouchableOpacity
              style={[styles.saveDialogBtn, { borderColor: theme.borderColor }]}
              onPress={() => { setShowSaveDialog(false); setTemplateName(''); }}
            >
              <Text style={{ color: theme.textColor }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveDialogBtn, { backgroundColor: theme.accentColor }]}
              onPress={() => { onSave(templateName || '未命名模板'); setShowSaveDialog(false); setTemplateName(''); }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>保存</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const OptionRow: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; theme: Theme }> = ({ label, value, onChange, theme }) => (
  <TouchableOpacity style={styles.optionRow} onPress={() => onChange(!value)}>
    <Text style={{ color: theme.textColor, flex: 1, fontSize: 14 }}>{label}</Text>
    <View style={[styles.checkbox, { borderColor: theme.borderColor }, value && { backgroundColor: theme.accentColor, borderColor: theme.accentColor }]}>
      {value && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    paddingTop: 44,
  },
  headerBtn: { padding: 6, borderRadius: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  subHeader: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  subHeaderTitle: { fontSize: 16, fontWeight: '600' },
  content: { flex: 1, padding: 16 },
  toolContent: { flex: 1, padding: 16 },
  section: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionLabel: { marginTop: 8, marginBottom: 8 },
  sectionLabelText: { fontSize: 13, fontWeight: '600' },
  templateEntry: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  templateTitle: { fontSize: 15, fontWeight: '600' },
  templateDesc: { fontSize: 12, marginTop: 2 },
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  toolIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  toolDesc: { fontSize: 13 },
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 8,
  },
  savedName: { fontSize: 14, fontWeight: '600' },
  savedDesc: { fontSize: 12, marginTop: 2 },
  miniBtn: {
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  inputGroup: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  textInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  textArea: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 100, maxHeight: 240 },
  segmentRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segment: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  countRow: { flexDirection: 'row', gap: 6 },
  countBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 16 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  smallBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  resultBlock: { padding: 14, borderRadius: 12, borderWidth: 1, marginTop: 8 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  resultLabel: { fontSize: 12 },
  resultText: { fontSize: 14, lineHeight: 20 },
  resultList: { padding: 8, borderRadius: 12, borderWidth: 1, marginTop: 12 },
  resultItem: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#333' },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  errorBox: { padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 12 },
  saveDialog: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  saveInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  saveDialogBtns: { flexDirection: 'row', gap: 10 },
  saveDialogBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  apiModal: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 40,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
  },
  modalHeader: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    paddingTop: 44,
  },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalContent: { flex: 1, padding: 16 },
  templateCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  templateCardName: { fontSize: 15, fontWeight: '600' },
  templateCardDesc: { fontSize: 12, marginTop: 2 },
  templatePreview: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  templatePreviewText: { fontSize: 13, lineHeight: 18 },
  templateActions: { flexDirection: 'row', gap: 8 },
  templateBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
});