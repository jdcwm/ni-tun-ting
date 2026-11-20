import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Dimensions,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { FancyWork, FancyWorkType } from '../types';
import { fancyTemplates } from '../data/fancyTemplates';
import { generateId } from '../constants/defaults';
import { useApp } from '../context/AppContext';
import { aiService } from '../services/aiService';

interface FancyToolBoxProps {
  visible: boolean;
  onClose: () => void;
  onSave: (work: FancyWork) => void;
  theme: any;
}

const { width: SCREEN_W } = Dimensions.get('window');

const typeLabels: Record<FancyWorkType, string> = {
  sidebar: '侧边栏',
  greeting: '开场白',
  floating: '悬浮窗',
  guide: '引导页',
  statusBar: '状态栏',
  custom: '自定义',
};

const typeIcons: Record<FancyWorkType, string> = {
  sidebar: '📋',
  greeting: '💬',
  floating: '🔘',
  guide: '📖',
  statusBar: '📊',
  custom: '🎨',
};

export const FancyToolBox: React.FC<FancyToolBoxProps> = ({
  visible,
  onClose,
  onSave,
  theme,
}) => {
  const insets = useSafeAreaInsets();
  const { providers, settings } = useApp();
  const [step, setStep] = useState<'select' | 'edit' | 'aiGenerate'>('select');
  const [selectedType, setSelectedType] = useState<FancyWorkType | null>(null);
  const [workName, setWorkName] = useState('');
  const [workDesc, setWorkDesc] = useState('');
  const [htmlCode, setHtmlCode] = useState('');
  const [cssCode, setCssCode] = useState('');
  const [jsCode, setJsCode] = useState('');
  const [activeTab, setActiveTab] = useState<'html' | 'css' | 'js' | 'preview'>('html');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiType, setAiType] = useState<FancyWorkType>('custom');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardHeightAnim, {
          toValue: e.endCoordinates.height,
          duration: Platform.OS === 'ios' ? e.duration || 250 : 150,
          useNativeDriver: false,
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        Animated.timing(keyboardHeightAnim, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? e?.duration || 250 : 150,
          useNativeDriver: false,
        }).start();
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardHeightAnim]);

  const filteredTemplates = selectedType
    ? fancyTemplates.filter((t) => t.type === selectedType)
    : fancyTemplates;

  const selectTemplate = (templateId: string) => {
    const template = fancyTemplates.find((t) => t.id === templateId);
    if (!template) return;
    setWorkName(template.name);
    setWorkDesc(template.description);
    setHtmlCode(template.html);
    setCssCode(template.css);
    setJsCode(template.js);
    setStep('edit');
  };

  const startBlank = (type: FancyWorkType) => {
    setWorkName('未命名作品');
    setWorkDesc('');
    setHtmlCode('<div class="container">\n  <!-- 在此输入HTML -->\n</div>');
    setCssCode('.container {\n  /* 在此输入CSS */\n}');
    setJsCode('// 在此输入JavaScript');
    setSelectedType(type);
    setStep('edit');
  };

  const handleSave = () => {
    if (!workName.trim()) return;
    const work: FancyWork = {
      id: generateId(),
      name: workName.trim(),
      type: selectedType || 'custom',
      html: htmlCode,
      css: cssCode,
      js: jsCode,
      description: workDesc.trim(),
      isPreset: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onSave(work);
    resetState();
    onClose();
  };

  const resetState = () => {
    setStep('select');
    setSelectedType(null);
    setWorkName('');
    setWorkDesc('');
    setHtmlCode('');
    setCssCode('');
    setJsCode('');
    setActiveTab('html');
    setAiPrompt('');
    setAiType('custom');
    setIsAiGenerating(false);
    setAiError('');
  };

  const getTextProvider = () => {
    const textProvider = providers.find((p) => p.capabilities.includes('text'));
    return textProvider || null;
  };

  const parseGeneratedCode = (text: string) => {
    let html = '';
    let css = '';
    let js = '';

    const htmlMatch = text.match(/```html\n([\s\S]*?)```/i) || text.match(/<html>([\s\S]*?)<\/html>/i);
    if (htmlMatch) {
      html = htmlMatch[1].trim();
    }

    const bodyMatch = text.match(/<body>([\s\S]*?)<\/body>/i);
    if (bodyMatch && !html) {
      html = bodyMatch[1].trim();
    }

    const cssMatch = text.match(/```css\n([\s\S]*?)```/i) || text.match(/<style>([\s\S]*?)<\/style>/i);
    if (cssMatch) {
      css = cssMatch[1].trim();
    }

    const jsMatch = text.match(/```javascript\n([\s\S]*?)```/i) || text.match(/```js\n([\s\S]*?)```/i) || text.match(/<script>([\s\S]*?)<\/script>/i);
    if (jsMatch) {
      js = jsMatch[1].trim();
    }

    if (!html && !css && !js) {
      const allCode = text.match(/```[\s\S]*?```/g);
      if (allCode) {
        const combined = allCode.map((c) => c.replace(/```\w*\n?/g, '').replace(/```$/, '')).join('\n');
        if (combined.includes('<') && combined.includes('>')) {
          html = combined;
        }
      }
    }

    return { html, css, js };
  };

  const handleAiGenerate = async () => {
    const provider = getTextProvider();
    if (!provider) {
      Alert.alert('提示', '请先在设置中添加并选择对话AI提供商');
      return;
    }

    if (!aiPrompt.trim()) {
      Alert.alert('提示', '请输入描述内容');
      return;
    }

    setIsAiGenerating(true);
    setAiError('');

    try {
      const typeLabel = typeLabels[aiType];
      const systemPrompt = `你是一个专业的前端开发工程师，擅长编写精美的HTML/CSS/JavaScript组件。
请根据用户的描述，生成一个${typeLabel}组件的完整代码。

要求：
1. 只输出HTML、CSS和JavaScript代码，不要其他解释性文字
2. HTML代码放在 \`\`\`html 代码块中
3. CSS代码放在 \`\`\`css 代码块中  
4. JavaScript代码放在 \`\`\`javascript 代码块中
5. 设计要美观、现代、有动画效果
6. 使用深色主题，配色要协调
7. 确保代码可以直接运行
8. 响应式设计，适配移动端

请生成${typeLabel}的完整代码。`;

      const userMessage = {
        id: '1',
        role: 'user' as const,
        content: aiPrompt,
        images: [],
        timestamp: Date.now(),
      };

      const result = await aiService.chat(provider, [userMessage], systemPrompt);
      const { html, css, js } = parseGeneratedCode(result);

      if (!html && !css && !js) {
        setAiError('无法解析生成的代码，请重试或调整描述');
        setIsAiGenerating(false);
        return;
      }

      setWorkName(aiPrompt.substring(0, 20) + (aiPrompt.length > 20 ? '...' : ''));
      setWorkDesc(aiPrompt);
      setHtmlCode(html || '<div class="container">\n  <!-- 在此输入HTML -->\n</div>');
      setCssCode(css || '.container {\n  /* 在此输入CSS */\n}');
      setJsCode(js || '// 在此输入JavaScript');
      setSelectedType(aiType);
      setStep('edit');
      setActiveTab('preview');
    } catch (error: any) {
      setAiError(error.message || '生成失败，请重试');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const generatePreviewHtml = () => {
    return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
body { margin: 0; padding: 0; background: #1a1a2e; font-family: -apple-system, sans-serif; }
${cssCode}
</style>
</head>
<body>
${htmlCode}
<script>
${jsCode}
</script>
</body>
</html>`;
  };

  const types: FancyWorkType[] = ['sidebar', 'greeting', 'floating', 'guide', 'statusBar', 'custom'];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.menuBgColor }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 30) + 8, borderBottomColor: theme.borderColor }]}>
          <TouchableOpacity onPress={step === 'aiGenerate' ? () => setStep('select') : handleClose}>
            <Text style={{ color: theme.subTextColor, fontSize: 16 }}>
              {step === 'aiGenerate' ? '返回' : '关闭'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>
            {step === 'select' ? '花式工具箱' : step === 'aiGenerate' ? 'AI生成' : '编辑作品'}
          </Text>
          {step === 'edit' ? (
            <TouchableOpacity onPress={handleSave}>
              <Text style={{ color: theme.accentColor, fontSize: 16, fontWeight: '600' }}>保存</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {step === 'select' ? (
          <ScrollView style={styles.content}>
            {/* Type Filter */}
            <Text style={[styles.sectionTitle, { color: theme.subTextColor }]}>选择类型</Text>
            <View style={styles.typeGrid}>
              {types.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeCard,
                    { backgroundColor: theme.secondaryColor },
                    selectedType === type && { borderColor: theme.accentColor, borderWidth: 2 },
                  ]}
                  onPress={() => setSelectedType(type === selectedType ? null : type)}
                >
                  <Text style={styles.typeIcon}>{typeIcons[type]}</Text>
                  <Text style={[styles.typeLabel, { color: theme.textColor }]}>{typeLabels[type]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* AI Generate Button */}
            <TouchableOpacity
              style={[styles.aiGenerateBtn, { backgroundColor: theme.accentColor }]}
              onPress={() => {
                if (selectedType) {
                  setAiType(selectedType);
                }
                setStep('aiGenerate');
              }}
            >
              <Text style={{ color: theme.buttonTextColor, fontWeight: '600' }}>
                🤖 AI生成 ({selectedType ? typeLabels[selectedType] : '选择类型'})
              </Text>
            </TouchableOpacity>

            {/* Blank Start */}
            <TouchableOpacity
              style={[styles.blankBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => startBlank(selectedType || 'custom')}
            >
              <Text style={{ color: theme.textColor, fontWeight: '600' }}>
                ✨ 空白创建 ({selectedType ? typeLabels[selectedType] : '自定义'})
              </Text>
            </TouchableOpacity>

            {/* Templates */}
            <Text style={[styles.sectionTitle, { color: theme.subTextColor, marginTop: 20 }]}>
              预设模板
            </Text>
            {filteredTemplates.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={[styles.templateCard, { backgroundColor: theme.secondaryColor }]}
                onPress={() => selectTemplate(template.id)}
              >
                <View style={styles.templateInfo}>
                  <Text style={[styles.templateName, { color: theme.textColor }]}>{template.name}</Text>
                  <Text style={[styles.templateDesc, { color: theme.subTextColor }]}>
                    {template.description}
                  </Text>
                  <View style={styles.templateTag}>
                    <Text style={{ color: theme.accentColor, fontSize: 11 }}>
                      {typeLabels[template.type]}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: theme.subTextColor, fontSize: 20 }}>›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : step === 'aiGenerate' ? (
          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={[styles.sectionTitle, { color: theme.subTextColor }]}>选择类型</Text>
            <View style={styles.typeGrid}>
              {types.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeCard,
                    { backgroundColor: theme.secondaryColor },
                    aiType === type && { borderColor: theme.accentColor, borderWidth: 2 },
                  ]}
                  onPress={() => setAiType(type)}
                >
                  <Text style={styles.typeIcon}>{typeIcons[type]}</Text>
                  <Text style={[styles.typeLabel, { color: theme.textColor }]}>{typeLabels[type]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle, { color: theme.subTextColor, marginTop: 20 }]}>
              描述你想要的效果
            </Text>
            <TextInput
              style={[styles.aiPromptInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
              value={aiPrompt}
              onChangeText={setAiPrompt}
              placeholder={`例如：一个${typeLabels[aiType]}，带有动画效果...`}
              placeholderTextColor={theme.subTextColor}
              multiline
              textAlignVertical="top"
              numberOfLines={6}
              editable={!isAiGenerating}
            />

            {aiError ? (
              <Text style={styles.aiErrorText}>{aiError}</Text>
            ) : null}

            <TouchableOpacity
              style={[
                styles.generateBtn,
                { backgroundColor: theme.accentColor },
                isAiGenerating && { opacity: 0.6 },
              ]}
              onPress={handleAiGenerate}
              disabled={isAiGenerating}
              activeOpacity={0.7}
            >
              {isAiGenerating ? (
                <View style={styles.generateBtnContent}>
                  <ActivityIndicator size="small" color={theme.buttonTextColor} />
                  <Text style={{ color: theme.buttonTextColor, fontWeight: '600', marginLeft: 8 }}>
                    生成中...
                  </Text>
                </View>
              ) : (
                <Text style={{ color: theme.buttonTextColor, fontWeight: '600' }}>
                  🚀 开始生成
                </Text>
              )}
            </TouchableOpacity>

            <Text style={[styles.aiTipText, { color: theme.subTextColor }]}>
              💡 提示：描述越详细，生成效果越好。可以包含颜色、布局、动画等具体要求。
            </Text>
          </ScrollView>
        ) : (
          <View style={styles.editContainer}>
            {/* Name Input */}
            <TextInput
              style={[styles.nameInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
              value={workName}
              onChangeText={setWorkName}
              placeholder="作品名称"
              placeholderTextColor={theme.subTextColor}
            />

            {/* Tab Bar */}
            <View style={[styles.tabBar, { borderBottomColor: theme.borderColor }]}>
              {(['html', 'css', 'js', 'preview'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[styles.tab, activeTab === tab && { borderBottomColor: theme.accentColor, borderBottomWidth: 2 }]}
                  onPress={() => setActiveTab(tab)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      { color: activeTab === tab ? theme.accentColor : theme.subTextColor },
                    ]}
                  >
                    {tab.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Editor / Preview */}
            {activeTab === 'preview' ? (
              <WebView
                originWhitelist={['*']}
                source={{ html: generatePreviewHtml() }}
                style={styles.webview}
                scrollEnabled={true}
              />
            ) : (
              <TextInput
                style={[
                  styles.codeEditor,
                  { backgroundColor: theme.inputBgColor, color: theme.textColor },
                ]}
                value={activeTab === 'html' ? htmlCode : activeTab === 'css' ? cssCode : jsCode}
                onChangeText={
                  activeTab === 'html' ? setHtmlCode : activeTab === 'css' ? setCssCode : setJsCode
                }
                multiline
                textAlignVertical="top"
                placeholder={`输入 ${activeTab.toUpperCase()} 代码...`}
                placeholderTextColor={theme.subTextColor}
              />
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeCard: {
    width: (SCREEN_W - 52) / 3,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  aiGenerateBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  blankBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  templateDesc: {
    fontSize: 13,
    marginBottom: 6,
  },
  templateTag: {
    backgroundColor: 'rgba(233,69,96,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  editContainer: {
    flex: 1,
    padding: 12,
  },
  nameInput: {
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 10,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  codeEditor: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  webview: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
  },
  aiPromptInput: {
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  generateBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  generateBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiErrorText: {
    color: '#ff6b6b',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
  },
  aiTipText: {
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
    opacity: 0.7,
  },
});
