import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Alert, Modal } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { ThemeConfig } from '../types';
import { defaultTheme, darkTheme } from '../constants/defaults';
import { IconCheck, IconClose, IconPalette, IconTrash, IconPlus, IconImport, IconExport, IconSun, IconMoon, IconImage, IconEdit } from '../components/Icons';

const SCREEN_W = Dimensions.get('window').width;

interface ThemePreset {
  id: string;
  name: string;
  theme: ThemeConfig;
  isDefault?: boolean;
}

const eyePreset: ThemeConfig = {
  backgroundColor: '#1a0a1e',
  primaryColor: '#2d1b33',
  secondaryColor: '#3d2845',
  accentColor: '#ff006e',
  textColor: '#e8d5f2',
  subTextColor: '#9b7eb0',
  inputBgColor: '#2a1a30',
  buttonColor: '#ff006e',
  buttonTextColor: '#ffffff',
  menuBgColor: '#2d1b33',
  borderColor: '#4a2d58',
  fontSize: 16,
  statusBarSize: 24,
  inputBorderRadius: 12,
  inputBorderWidth: 1,
  inputBorderColor: '#4a2d58',
  inputBorderStyle: 'solid',
  inputFontSize: 14,
  fontFamily: undefined,
  buttonBorderRadius: 20,
  buttonBorderWidth: 0,
  buttonBorderColor: '#ff006e',
  buttonHasShadow: false,
  buttonGradientColor: '#ff4d94',
  buttonPattern: 'rounded',
};

const cyberPreset: ThemeConfig = {
  backgroundColor: '#0a0a0f',
  primaryColor: '#12121a',
  secondaryColor: '#1a1a25',
  accentColor: '#00ffaa',
  textColor: '#e0e0e8',
  subTextColor: '#6b6b7a',
  inputBgColor: '#15151f',
  buttonColor: '#00ffaa',
  buttonTextColor: '#0a0a0f',
  menuBgColor: '#12121a',
  borderColor: '#252530',
  fontSize: 16,
  statusBarSize: 24,
  inputBorderRadius: 8,
  inputBorderWidth: 1,
  inputBorderColor: '#00ffaa',
  inputBorderStyle: 'dashed',
  inputFontSize: 14,
  fontFamily: 'monospace',
  buttonBorderRadius: 8,
  buttonBorderWidth: 1,
  buttonBorderColor: '#00ffaa',
  buttonHasShadow: true,
  buttonGradientColor: '#00aaff',
  buttonPattern: 'outline',
};

const blueArchivePreset: ThemeConfig = {
  backgroundColor: '#f0f4f8',
  primaryColor: '#e8eef4',
  secondaryColor: '#dde5ed',
  accentColor: '#4a9eff',
  textColor: '#2c3e50',
  subTextColor: '#7f8c9b',
  inputBgColor: '#ffffff',
  buttonColor: '#4a9eff',
  buttonTextColor: '#ffffff',
  menuBgColor: '#e8eef4',
  borderColor: '#c5d3e0',
  fontSize: 16,
  statusBarSize: 24,
  inputBorderRadius: 10,
  inputBorderWidth: 1,
  inputBorderColor: '#c5d3e0',
  inputBorderStyle: 'solid',
  inputFontSize: 14,
  fontFamily: undefined,
  buttonBorderRadius: 12,
  buttonBorderWidth: 0,
  buttonBorderColor: '#4a9eff',
  buttonHasShadow: false,
  buttonGradientColor: '#7ab8ff',
  buttonPattern: 'rounded',
};

const bloodMoonPreset: ThemeConfig = {
  backgroundColor: '#1a0505',
  primaryColor: '#2a0a0a',
  secondaryColor: '#3d1515',
  accentColor: '#dc143c',
  textColor: '#f0e0e0',
  subTextColor: '#a08080',
  inputBgColor: '#2a0a0a',
  buttonColor: '#dc143c',
  buttonTextColor: '#ffffff',
  menuBgColor: '#2a0a0a',
  borderColor: '#5a2020',
  fontSize: 16,
  statusBarSize: 24,
  inputBorderRadius: 8,
  inputBorderWidth: 1,
  inputBorderColor: '#5a2020',
  inputBorderStyle: 'solid',
  inputFontSize: 14,
  fontFamily: 'serif',
  buttonBorderRadius: 8,
  buttonBorderWidth: 0,
  buttonBorderColor: '#dc143c',
  buttonHasShadow: true,
  buttonGradientColor: '#ff4d6d',
  buttonPattern: 'shadow',
};

const presetThemes: ThemePreset[] = [
  { id: 'light', name: '日间默认', theme: defaultTheme, isDefault: true },
  { id: 'dark', name: '夜间默认', theme: darkTheme, isDefault: true },
  { id: 'eye', name: '黑岩射手', theme: eyePreset },
  { id: 'cyber', name: '赛博朋克', theme: cyberPreset },
  { id: 'blue', name: '蓝色档案', theme: blueArchivePreset },
  { id: 'blood', name: '血月', theme: bloodMoonPreset },
];

interface ThemeSettingsScreenProps {
  onClose: () => void;
}

const COLOR_FIELDS: { key: keyof ThemeConfig; label: string; type: 'color' | 'number' }[] = [
  { key: 'backgroundColor', label: '背景色', type: 'color' },
  { key: 'primaryColor', label: '主色', type: 'color' },
  { key: 'secondaryColor', label: '次色', type: 'color' },
  { key: 'accentColor', label: '强调色', type: 'color' },
  { key: 'textColor', label: '文字颜色', type: 'color' },
  { key: 'subTextColor', label: '副文字颜色', type: 'color' },
  { key: 'inputBgColor', label: '输入框背景', type: 'color' },
  { key: 'buttonColor', label: '按钮颜色', type: 'color' },
  { key: 'buttonTextColor', label: '按钮文字色', type: 'color' },
  { key: 'menuBgColor', label: '菜单背景', type: 'color' },
  { key: 'borderColor', label: '边框颜色', type: 'color' },
  { key: 'userBubbleColor', label: '用户气泡色', type: 'color' },
  { key: 'assistantBubbleColor', label: 'AI气泡色', type: 'color' },
];

const FONT_OPTIONS = [
  { id: 'default', name: '默认系统字体', value: undefined },
  { id: 'serif', name: '衬线字体', value: 'serif' },
  { id: 'monospace', name: '等宽字体', value: 'monospace' },
];

const BUTTON_PATTERNS: {
  id: 'rounded' | 'square' | 'pill' | 'outline' | 'shadow' | 'gradient' | 'icon' | 'text';
  name: string;
  description: string;
  style: any;
}[] = [
  { id: 'rounded', name: '圆角按钮', description: '柔和圆角，通用风格', style: { borderRadius: 20 } },
  { id: 'square', name: '方形按钮', description: '方正直角，干练风格', style: { borderRadius: 4 } },
  { id: 'pill', name: '胶囊按钮', description: '极致圆角，胶囊形态', style: { borderRadius: 30 } },
  { id: 'outline', name: '描边按钮', description: '透明背景+边框', style: { borderRadius: 12, borderWidth: 2 } },
  { id: 'shadow', name: '阴影按钮', description: '带投影，立体效果', style: { borderRadius: 12, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 } },
  { id: 'gradient', name: '渐变按钮', description: '渐变背景，视觉冲击', style: { borderRadius: 16 } },
  { id: 'icon', name: '图标按钮', description: '圆形小按钮', style: { borderRadius: 20 } },
  { id: 'text', name: '文字按钮', description: '无背景文字样式', style: { borderRadius: 8 } },
];

const INPUT_BORDER_STYLES = [
  { id: 'solid', name: '实线', value: 'solid' as const },
  { id: 'dashed', name: '虚线', value: 'dashed' as const },
  { id: 'dotted', name: '点线', value: 'dotted' as const },
  { id: 'none', name: '无边框', value: 'none' as const },
];

const EXPORT_IMPORT_PRESET_COLORS = [
  '#fff5f6', '#FF6B9D', '#00FFAA', '#4A9EFF', '#FF006E', '#1A1A2E', '#F5F5F5', '#2D5016', '#8B0000', '#ff4d6d',
];

export const ThemeSettingsScreen: React.FC<ThemeSettingsScreenProps> = ({ onClose }) => {
  const theme = useTheme();
  const { settings, setSettings, updateTheme, isDarkMode, toggleTheme } = useApp();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customTheme, setCustomTheme] = useState<ThemeConfig>(settings.theme);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [fontFamily, setFontFamily] = useState<string | undefined>(settings.theme.fontFamily);
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [selectedButtonPattern, setSelectedButtonPattern] = useState<string>(
    settings.theme.buttonPattern || 'rounded'
  );
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [inputPreviewText, setInputPreviewText] = useState('');

  const applyPreset = (preset: ThemePreset) => {
    setSelectedPreset(preset.id);
    setCustomTheme(preset.theme);
    setFontFamily(preset.theme.fontFamily);
    setSelectedButtonPattern(preset.theme.buttonPattern || 'rounded');
    updateTheme(preset.theme);
    setIsCustomMode(false);
    Alert.alert('主题已应用', `已切换到 "${preset.name}" 主题`);
  };

  const resetToDefault = () => {
    setCustomTheme(defaultTheme);
    setFontFamily(defaultTheme.fontFamily);
    setSelectedButtonPattern(defaultTheme.buttonPattern || 'rounded');
    setSelectedPreset('light');
    setIsCustomMode(false);
    updateTheme(defaultTheme);
  };

  const saveCustomTheme = () => {
    const themeToSave: ThemeConfig = {
      ...customTheme,
      fontFamily,
      buttonPattern: selectedButtonPattern as ThemeConfig['buttonPattern'],
    };
    setCustomTheme(themeToSave);
    updateTheme(themeToSave);
    setIsCustomMode(true);
    Alert.alert('保存成功', '自定义主题已保存');
  };

  const updateColorField = (key: keyof ThemeConfig, color: string) => {
    const newTheme = { ...customTheme, [key]: color };
    setCustomTheme(newTheme);
    updateTheme(newTheme);
  };

  const updateNumericField = (key: keyof ThemeConfig, value: number) => {
    const newTheme = { ...customTheme, [key]: value };
    setCustomTheme(newTheme);
    updateTheme(newTheme);
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  };

  const generateContrastColors = () => {
    const bg = hexToRgb(customTheme.backgroundColor);
    if (!bg) return;

    const brightness = (bg.r * 299 + bg.g * 587 + bg.b * 114) / 1000;
    const newTheme = { ...customTheme };

    if (brightness > 128) {
      newTheme.textColor = '#333333';
      newTheme.subTextColor = '#666666';
      newTheme.buttonTextColor = '#ffffff';
    } else {
      newTheme.textColor = '#f0f0f0';
      newTheme.subTextColor = '#aaaaaa';
      newTheme.buttonTextColor = '#000000';
    }

    setCustomTheme(newTheme);
    updateTheme(newTheme);
  };

  const getActiveButtonPattern = () => {
    return BUTTON_PATTERNS.find(p => p.id === selectedButtonPattern) || BUTTON_PATTERNS[0];
  };

  const handleExportTheme = () => {
    const themeToExport: ThemeConfig = {
      ...customTheme,
      fontFamily,
      buttonPattern: selectedButtonPattern as ThemeConfig['buttonPattern'],
    };
    const json = JSON.stringify(themeToExport, null, 2);
    setExportText(json);
    setShowExportModal(true);
  };

  const handleImportTheme = () => {
    try {
      const parsed = JSON.parse(importText);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('无效的主题数据');
      }
      const requiredFields: (keyof ThemeConfig)[] = [
        'backgroundColor', 'primaryColor', 'secondaryColor', 'accentColor',
        'textColor', 'subTextColor', 'inputBgColor', 'buttonColor',
        'buttonTextColor', 'menuBgColor', 'borderColor', 'fontSize',
      ];
      const missing = requiredFields.filter(f => !(f in parsed));
      if (missing.length > 0) {
        Alert.alert('导入失败', `缺少必要字段: ${missing.join(', ')}`);
        return;
      }
      const importedTheme: ThemeConfig = {
        ...defaultTheme,
        ...parsed,
      };
      setCustomTheme(importedTheme);
      setFontFamily(importedTheme.fontFamily);
      setSelectedButtonPattern(importedTheme.buttonPattern || 'rounded');
      updateTheme(importedTheme);
      setShowImportModal(false);
      setImportText('');
      setIsCustomMode(true);
      setSelectedPreset(null);
      Alert.alert('导入成功', '主题已成功导入');
    } catch (e) {
      Alert.alert('导入失败', '无效的 JSON 格式，请检查后重试');
    }
  };

  const copyExportToClipboard = async () => {
    try {
      await Clipboard.setStringAsync(exportText);
      Alert.alert('已复制', '主题 JSON 已复制到剪贴板');
    } catch {
      Alert.alert('复制失败', '请手动选择复制');
    }
  };

  const activePattern = getActiveButtonPattern();

  const inputBorderRadius = customTheme.inputBorderRadius ?? 12;
  const inputBorderWidth = customTheme.inputBorderWidth ?? 1;
  const inputBorderColor = customTheme.inputBorderColor ?? customTheme.borderColor;
  const inputBorderStyle = customTheme.inputBorderStyle ?? 'solid';
  const inputFontSize = customTheme.inputFontSize ?? 14;

  const previewFontFamily = fontFamily || undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconClose size={24} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>主题设置</Text>
        <TouchableOpacity onPress={saveCustomTheme} style={styles.saveBtn}>
          <IconCheck size={24} color={theme.accentColor} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* 日间/夜间模式切换 */}
        <View style={[styles.modeToggleSection, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <TouchableOpacity
            style={[
              styles.modeToggleBtn,
              {
                backgroundColor: !isDarkMode ? theme.accentColor : 'transparent',
                borderColor: !isDarkMode ? theme.accentColor : theme.borderColor,
              },
            ]}
            onPress={() => { if (isDarkMode) toggleTheme(); }}
          >
            <IconSun size={16} color={!isDarkMode ? '#fff' : theme.textColor} />
            <Text style={{ color: !isDarkMode ? '#fff' : theme.textColor, marginLeft: 6, fontSize: 14, fontWeight: '600' }}>日间</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeToggleBtn,
              {
                backgroundColor: isDarkMode ? theme.accentColor : 'transparent',
                borderColor: isDarkMode ? theme.accentColor : theme.borderColor,
              },
            ]}
            onPress={() => { if (!isDarkMode) toggleTheme(); }}
          >
            <IconMoon size={16} color={isDarkMode ? '#fff' : theme.textColor} />
            <Text style={{ color: isDarkMode ? '#fff' : theme.textColor, marginLeft: 6, fontSize: 14, fontWeight: '600' }}>夜间</Text>
          </TouchableOpacity>
        </View>

        {/* 预览区域 */}
        <View style={[styles.previewSection, { backgroundColor: customTheme.primaryColor, borderColor: theme.borderColor }]}>
          <Text style={[styles.previewLabel, { color: theme.subTextColor }]}>主题预览</Text>
          <View style={[styles.previewBox, { backgroundColor: customTheme.backgroundColor }]}>
            <View style={[styles.previewBubble, { backgroundColor: customTheme.secondaryColor }]}>
              <Text style={{ color: customTheme.textColor, fontSize: 14, fontFamily: previewFontFamily }}>对话示例</Text>
            </View>
            <View style={[styles.previewBubbleUser, { backgroundColor: customTheme.accentColor }]}>
              <Text style={{ color: customTheme.buttonTextColor, fontSize: 14 }}>用户消息</Text>
            </View>
            <TouchableOpacity
              style={[
                activePattern.style,
                { backgroundColor: customTheme.buttonColor, paddingHorizontal: 20, paddingVertical: 8, alignItems: 'center' },
                activePattern.id === 'outline' && {
                  backgroundColor: 'transparent',
                  borderColor: customTheme.accentColor,
                },
                activePattern.id === 'gradient' && {
                  backgroundColor: customTheme.buttonGradientColor || customTheme.accentColor,
                },
                activePattern.id === 'shadow' && {
                  shadowColor: '#000',
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                },
              ]}
            >
              <Text style={{ color: activePattern.id === 'outline' ? customTheme.accentColor : customTheme.buttonTextColor, fontSize: 13 }}>
                按钮
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 预设主题 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <IconPalette size={20} color={theme.accentColor} />
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>预设主题</Text>
          </View>

          <View style={styles.presetGrid}>
            {presetThemes.map(preset => (
              <TouchableOpacity
                key={preset.id}
                onPress={() => applyPreset(preset)}
                style={[
                  styles.presetCard,
                  { backgroundColor: theme.secondaryColor, borderColor: selectedPreset === preset.id ? theme.accentColor : theme.borderColor },
                ]}
              >
                <View style={[styles.presetPreview, { backgroundColor: preset.theme.backgroundColor }]}>
                  <View style={[styles.presetAccent, { backgroundColor: preset.theme.accentColor }]} />
                </View>
                <Text style={[styles.presetName, { color: theme.textColor }]}>{preset.name}</Text>
                {selectedPreset === preset.id && (
                  <View style={[styles.selectedBadge, { backgroundColor: theme.accentColor }]}>
                    <IconCheck size={14} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 字体设置 - 带实时预览 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>字体设置</Text>
          </View>

          {/* 实时字体预览 */}
          <View style={[styles.fontPreviewBox, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.fontPreviewLabel, { color: theme.subTextColor }]}>实时预览</Text>
            <Text style={[styles.fontPreviewText, { color: theme.textColor, fontFamily: previewFontFamily }]}>
              这是一段预览文字 Aa Bb Cc 123
            </Text>
            <Text style={[styles.fontPreviewSub, { color: theme.subTextColor, fontFamily: previewFontFamily }]}>
              The quick brown fox jumps over the lazy dog.
            </Text>
          </View>

          <View style={[styles.optionList, { backgroundColor: theme.primaryColor }]}>
            {FONT_OPTIONS.map(font => (
              <TouchableOpacity
                key={font.id}
                onPress={() => setFontFamily(font.value)}
                style={[
                  styles.optionItem,
                  { borderBottomColor: theme.borderColor },
                  fontFamily === font.value && { backgroundColor: theme.secondaryColor },
                ]}
              >
                <Text style={[styles.optionText, { color: theme.textColor, fontFamily: font.value || undefined }]}>
                  {font.name}
                </Text>
                {fontFamily === font.value && (
                  <IconCheck size={18} color={theme.accentColor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 自定义颜色 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>自定义颜色</Text>
            <TouchableOpacity
              onPress={generateContrastColors}
              style={[styles.autoBtn, { backgroundColor: theme.secondaryColor }]}
            >
              <Text style={[styles.autoBtnText, { color: theme.textColor }]}>智能对比度</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.colorList, { backgroundColor: theme.primaryColor }]}>
            {COLOR_FIELDS.map(field => (
              <TouchableOpacity
                key={field.key as string}
                onPress={() => setShowColorPicker(field.key as string)}
                style={[
                  styles.colorItem,
                  { borderBottomColor: theme.borderColor },
                ]}
              >
                <Text style={[styles.colorLabel, { color: theme.textColor }]}>{field.label}</Text>
                <View style={styles.colorValueRow}>
                  <View
                    style={[styles.colorSwatch, { backgroundColor: customTheme[field.key] as string }]}
                  />
                  <Text style={[styles.colorHex, { color: theme.subTextColor }]}>
                    {customTheme[field.key] as string}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 输入框美化设置 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>输入框美化</Text>
          </View>

          {/* 输入框预览 */}
          <View style={[styles.inputPreviewBox, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.previewLabel, { color: theme.subTextColor }]}>输入框实时预览</Text>
            <TextInput
              style={[
                styles.inputPreview,
                {
                  backgroundColor: customTheme.inputBgColor,
                  borderWidth: inputBorderStyle === 'none' ? 0 : inputBorderWidth,
                  borderColor: inputBorderStyle === 'none' ? 'transparent' : inputBorderColor,
                  borderRadius: inputBorderRadius,
                  color: theme.textColor,
                  fontSize: inputFontSize,
                  fontFamily: previewFontFamily,
                },
              ]}
              value={inputPreviewText}
              onChangeText={setInputPreviewText}
              placeholder="输入框样式预览..."
              placeholderTextColor={theme.subTextColor}
            />
          </View>

          {/* 圆角设置 */}
          <View style={[styles.settingRow, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>圆角大小</Text>
            <View style={styles.sliderRow}>
              {[0, 4, 8, 12, 16, 20, 24].map(val => (
                <TouchableOpacity
                  key={val}
                  onPress={() => updateNumericField('inputBorderRadius', val)}
                  style={[
                    styles.sliderOption,
                    {
                      backgroundColor: customTheme.inputBorderRadius === val ? theme.accentColor : theme.secondaryColor,
                      borderColor: customTheme.inputBorderRadius === val ? theme.accentColor : theme.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.sliderOptionText, { color: customTheme.inputBorderRadius === val ? '#fff' : theme.textColor }]}>
                    {val}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 边框样式 */}
          <View style={[styles.settingRow, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>边框样式</Text>
            <View style={styles.styleOptionRow}>
              {INPUT_BORDER_STYLES.map(style => (
                <TouchableOpacity
                  key={style.id}
                  onPress={() => {
                    const newTheme = { ...customTheme, inputBorderStyle: style.value };
                    setCustomTheme(newTheme);
                    updateTheme(newTheme);
                  }}
                  style={[
                    styles.styleOption,
                    {
                      backgroundColor: customTheme.inputBorderStyle === style.value ? theme.accentColor : theme.secondaryColor,
                      borderColor: customTheme.inputBorderStyle === style.value ? theme.accentColor : theme.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.styleOptionText, { color: customTheme.inputBorderStyle === style.value ? '#fff' : theme.textColor }]}>
                    {style.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 边框粗细 */}
          <View style={[styles.settingRow, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>边框粗细</Text>
            <View style={styles.sliderRow}>
              {[0, 1, 2, 3, 4].map(val => (
                <TouchableOpacity
                  key={val}
                  onPress={() => updateNumericField('inputBorderWidth', val)}
                  style={[
                    styles.sliderOption,
                    {
                      backgroundColor: customTheme.inputBorderWidth === val ? theme.accentColor : theme.secondaryColor,
                      borderColor: customTheme.inputBorderWidth === val ? theme.accentColor : theme.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.sliderOptionText, { color: customTheme.inputBorderWidth === val ? '#fff' : theme.textColor }]}>
                    {val}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 边框颜色 */}
          <View style={[styles.settingRow, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.settingLabel, { color: theme.textColor }]}>边框颜色</Text>
            <View style={styles.colorPresets}>
              {EXPORT_IMPORT_PRESET_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => updateColorField('inputBorderColor', color)}
                  style={[
                    styles.colorPresetItem,
                    {
                      backgroundColor: color,
                      borderColor: customTheme.inputBorderColor === color ? theme.accentColor : theme.borderColor,
                      borderWidth: customTheme.inputBorderColor === color ? 3 : 1,
                    },
                  ]}
                />
              ))}
              <TouchableOpacity
                onPress={() => setShowColorPicker('inputBorderColor' as any)}
                style={[styles.colorPresetItem, { backgroundColor: 'transparent', borderColor: theme.borderColor }]}
              >
                <IconPlus size={16} color={theme.textColor} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 按钮图案 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>按钮图案</Text>
            <Text style={[styles.sectionHint, { color: theme.subTextColor }]}>选择后立即预览</Text>
          </View>

          {/* 当前选中图案大预览 */}
          <View style={[styles.currentPatternDisplay, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <Text style={[styles.currentPatternLabel, { color: theme.subTextColor }]}>当前按钮样式</Text>
            <View style={styles.currentPatternPreview}>
              <TouchableOpacity
                style={[
                  activePattern.style,
                  {
                    backgroundColor: activePattern.id === 'outline' ? 'transparent' : customTheme.buttonColor,
                    paddingHorizontal: 32,
                    paddingVertical: 14,
                    alignItems: 'center',
                  },
                  activePattern.id === 'outline' && { borderColor: customTheme.accentColor },
                  activePattern.id === 'shadow' && {
                    shadowColor: '#000',
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 6,
                  },
                  activePattern.id === 'text' && {
                    backgroundColor: 'transparent',
                    paddingHorizontal: 8,
                    paddingVertical: 6,
                  },
                ]}
              >
                <Text
                  style={{
                    color: activePattern.id === 'outline' ? customTheme.accentColor
                      : activePattern.id === 'text' ? customTheme.accentColor
                      : customTheme.buttonTextColor,
                    fontSize: 15,
                    fontWeight: activePattern.id === 'text' ? '500' : '600',
                  }}
                >
                  {activePattern.name}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.currentPatternDesc, { color: theme.subTextColor }]}>
                {activePattern.description}
              </Text>
            </View>
          </View>

          {/* 按钮图案网格 */}
          <View style={styles.patternGrid}>
            {BUTTON_PATTERNS.map(pattern => (
              <TouchableOpacity
                key={pattern.id}
                onPress={() => setSelectedButtonPattern(pattern.id)}
                style={[
                  styles.patternCard,
                  {
                    backgroundColor: theme.secondaryColor,
                    borderColor: selectedButtonPattern === pattern.id ? theme.accentColor : theme.borderColor,
                  },
                ]}
              >
                <View style={[styles.patternPreviewBox, { backgroundColor: theme.primaryColor }]}>
                  <TouchableOpacity
                    style={[
                      pattern.style,
                      {
                        backgroundColor: pattern.id === 'outline' ? 'transparent' : customTheme.accentColor,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        alignItems: 'center',
                      },
                      pattern.id === 'outline' && { borderColor: customTheme.accentColor },
                      pattern.id === 'shadow' && { elevation: 3 },
                      pattern.id === 'text' && { backgroundColor: 'transparent' },
                    ]}
                  >
                    <Text
                      style={{
                        color: pattern.id === 'outline' || pattern.id === 'text' ? customTheme.accentColor : customTheme.buttonTextColor,
                        fontSize: 10,
                      }}
                    >
                      按钮
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.patternName, { color: theme.textColor }]}>{pattern.name}</Text>
                {selectedButtonPattern === pattern.id && (
                  <View style={[styles.selectedBadge, { backgroundColor: theme.accentColor }]}>
                    <IconCheck size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* 效果预览行 */}
          <View style={[styles.previewSection, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor, marginTop: 12 }]}>
            <Text style={[styles.previewLabel, { color: theme.subTextColor }]}>多场景效果预览</Text>
            <View style={styles.previewButtonsRow}>
              <TouchableOpacity
                style={[
                  activePattern.style,
                  {
                    backgroundColor: activePattern.id === 'outline' ? 'transparent' : customTheme.accentColor,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    alignItems: 'center',
                  },
                  activePattern.id === 'outline' && { borderColor: customTheme.accentColor },
                  activePattern.id === 'shadow' && { elevation: 4 },
                  activePattern.id === 'text' && { backgroundColor: 'transparent' },
                ]}
              >
                <Text style={{
                  color: activePattern.id === 'outline' || activePattern.id === 'text' ? customTheme.accentColor : customTheme.buttonTextColor,
                  fontSize: 13,
                }}>
                  主要操作
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ backgroundColor: 'transparent', paddingHorizontal: 16, paddingVertical: 10 }}
              >
                <Text style={{ color: theme.subTextColor, fontSize: 13 }}>次要操作</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 思考中指示器 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>思考中指示器</Text>
            <Text style={[styles.sectionHint, { color: theme.subTextColor }]}>自定义AI思考提示</Text>
          </View>
          <View style={[styles.thinkingSection, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <View style={styles.thinkingRow}>
              <Text style={[styles.thinkingLabel, { color: theme.textColor }]}>提示文字</Text>
              <TextInput
                style={[styles.thinkingInput, { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
                value={customTheme.thinkingIndicator?.text || ''}
                onChangeText={(text) => setCustomTheme({ ...customTheme, thinkingIndicator: { ...customTheme.thinkingIndicator, text } })}
                placeholder="思考中..."
                placeholderTextColor={theme.subTextColor}
              />
            </View>
            <View style={styles.thinkingRow}>
              <Text style={[styles.thinkingLabel, { color: theme.textColor }]}>动画类型</Text>
              <View style={styles.thinkingAnimRow}>
                {(['bounce', 'pulse', 'wave', 'none'] as const).map((anim) => (
                  <TouchableOpacity
                    key={anim}
                    style={[
                      styles.thinkingAnimBtn,
                      {
                        backgroundColor: (customTheme.thinkingIndicator?.animation || 'bounce') === anim ? theme.accentColor : theme.secondaryColor,
                        borderColor: theme.borderColor,
                      },
                    ]}
                    onPress={() => setCustomTheme({ ...customTheme, thinkingIndicator: { ...customTheme.thinkingIndicator, animation: anim } })}
                  >
                    <Text style={{ color: (customTheme.thinkingIndicator?.animation || 'bounce') === anim ? '#fff' : theme.textColor, fontSize: 12 }}>
                      {anim === 'bounce' ? '弹跳' : anim === 'pulse' ? '脉冲' : anim === 'wave' ? '波浪' : '无'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.thinkingRow}>
              <Text style={[styles.thinkingLabel, { color: theme.textColor }]}>圆点数量</Text>
              <View style={styles.thinkingDotsRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[
                      styles.thinkingDotBtn,
                      {
                        backgroundColor: (customTheme.thinkingIndicator?.dots || 3) === n ? theme.accentColor : theme.secondaryColor,
                        borderColor: theme.borderColor,
                      },
                    ]}
                    onPress={() => setCustomTheme({ ...customTheme, thinkingIndicator: { ...customTheme.thinkingIndicator, dots: n } })}
                  >
                    <Text style={{ color: (customTheme.thinkingIndicator?.dots || 3) === n ? '#fff' : theme.textColor, fontSize: 13, fontWeight: '600' }}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* 消息气泡颜色 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>消息气泡颜色</Text>
          </View>
          <View style={[styles.bubbleColorRow, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <View style={styles.bubbleColorItem}>
              <Text style={[styles.bubbleColorLabel, { color: theme.textColor }]}>用户气泡</Text>
              <TouchableOpacity
                style={[styles.bubbleColorPreview, { backgroundColor: customTheme.userBubbleColor || theme.secondaryColor, borderColor: theme.borderColor }]}
                onPress={() => setShowColorPicker('userBubbleColor')}
              >
                <IconEdit size={14} color={theme.accentColor} />
              </TouchableOpacity>
            </View>
            <View style={styles.bubbleColorItem}>
              <Text style={[styles.bubbleColorLabel, { color: theme.textColor }]}>AI气泡</Text>
              <TouchableOpacity
                style={[styles.bubbleColorPreview, { backgroundColor: customTheme.assistantBubbleColor || theme.secondaryColor, borderColor: theme.borderColor }]}
                onPress={() => setShowColorPicker('assistantBubbleColor')}
              >
                <IconEdit size={14} color={theme.accentColor} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 主题导入导出 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>主题导入/导出</Text>
          </View>

          <View style={styles.importExportRow}>
            <TouchableOpacity
              onPress={handleExportTheme}
              style={[
                styles.importExportBtn,
                { backgroundColor: theme.primaryColor, borderColor: theme.borderColor },
              ]}
            >
              <IconExport size={22} color={theme.accentColor} />
              <Text style={[styles.importExportLabel, { color: theme.textColor }]}>导出主题</Text>
              <Text style={[styles.importExportDesc, { color: theme.subTextColor }]}>导出为 JSON</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { setImportText(''); setShowImportModal(true); }}
              style={[
                styles.importExportBtn,
                { backgroundColor: theme.primaryColor, borderColor: theme.borderColor },
              ]}
            >
              <IconImport size={22} color={theme.accentColor} />
              <Text style={[styles.importExportLabel, { color: theme.textColor }]}>导入主题</Text>
              <Text style={[styles.importExportDesc, { color: theme.subTextColor }]}>从 JSON 导入</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 操作按钮 */}
        <View style={styles.actionSection}>
          <TouchableOpacity
            onPress={() => { setSelectedButtonPattern('rounded'); resetToDefault(); }}
            style={[styles.dangerBtn, { backgroundColor: theme.secondaryColor }]}
          >
            <IconTrash size={18} color={theme.textColor} />
            <Text style={[styles.dangerBtnText, { color: theme.textColor }]}>重置为默认</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 颜色选择器弹窗 */}
      {showColorPicker && (
        <Modal
          visible={!!showColorPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowColorPicker(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>
                选择 {COLOR_FIELDS.find(f => f.key === showColorPicker)?.label || '颜色'}
              </Text>

              <View style={styles.colorPresets}>
                {EXPORT_IMPORT_PRESET_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => {
                      updateColorField(showColorPicker as keyof ThemeConfig, color);
                      setShowColorPicker(null);
                    }}
                    style={[styles.colorPresetItem, { backgroundColor: color, borderColor: theme.borderColor }]}
                  />
                ))}
              </View>

              <TextInput
                style={[styles.colorInput, { color: theme.textColor, borderColor: theme.borderColor }]}
                value={(customTheme[showColorPicker as keyof ThemeConfig] as string) || ''}
                onChangeText={(text) => {
                  if (/^#[0-9A-Fa-f]{6}$/.test(text)) {
                    updateColorField(showColorPicker as keyof ThemeConfig, text);
                  }
                }}
                placeholder="#000000"
                placeholderTextColor={theme.subTextColor}
              />

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setShowColorPicker(null)} style={styles.modalBtn}>
                  <Text style={{ color: theme.subTextColor }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowColorPicker(null)}
                  style={[styles.modalBtn, { backgroundColor: theme.accentColor }]}
                >
                  <Text style={{ color: '#fff' }}>确定</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 导出弹窗 */}
      {showExportModal && (
        <Modal
          visible={showExportModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowExportModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor, maxHeight: '80%' }]}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>导出主题 JSON</Text>

              <ScrollView style={styles.exportScroll} contentContainerStyle={styles.exportScrollContent}>
                <Text selectable style={[styles.exportJsonText, { color: theme.textColor }]}>
                  {exportText}
                </Text>
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setShowExportModal(false)}
                  style={styles.modalBtn}
                >
                  <Text style={{ color: theme.subTextColor }}>关闭</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={copyExportToClipboard}
                  style={[styles.modalBtn, { backgroundColor: theme.accentColor }]}
                >
                  <Text style={{ color: '#fff' }}>复制到剪贴板</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 导入弹窗 */}
      {showImportModal && (
        <Modal
          visible={showImportModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowImportModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor, maxHeight: '85%' }]}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>导入主题 JSON</Text>

              <Text style={[styles.importHint, { color: theme.subTextColor }]}>
                粘贴有效的主题 JSON 字符串，格式不正确将无法导入
              </Text>

              <TextInput
                style={[
                  styles.importInput,
                  {
                    color: theme.textColor,
                    borderColor: theme.borderColor,
                    backgroundColor: customTheme.inputBgColor,
                  },
                ]}
                value={importText}
                onChangeText={setImportText}
                placeholder='在此粘贴主题 JSON...'
                placeholderTextColor={theme.subTextColor}
                multiline
                textAlignVertical="top"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setShowImportModal(false)}
                  style={styles.modalBtn}
                >
                  <Text style={{ color: theme.subTextColor }}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleImportTheme}
                  style={[styles.modalBtn, { backgroundColor: theme.accentColor }]}
                >
                  <Text style={{ color: '#fff' }}>导入</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 20,
  },
  previewSection: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  previewBox: {
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  previewBubble: {
    borderRadius: 12,
    padding: 8,
    maxWidth: '70%',
  },
  previewBubbleUser: {
    borderRadius: 12,
    padding: 8,
    maxWidth: '70%',
    alignSelf: 'flex-end',
  },
  previewBtn: {
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetCard: {
    width: (SCREEN_W - 56) / 3,
    borderRadius: 12,
    padding: 10,
    borderWidth: 2,
    gap: 8,
    position: 'relative',
  },
  presetPreview: {
    width: '100%',
    height: 60,
    borderRadius: 8,
    gap: 4,
    overflow: 'hidden',
  },
  presetAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  presetName: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
  selectedBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 14,
  },
  autoBtn: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  autoBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
  colorList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  colorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
  },
  colorLabel: {
    fontSize: 14,
  },
  colorValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  colorHex: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  actionSection: {
    paddingVertical: 8,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 14,
  },
  dangerBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  colorPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  colorPresetItem: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 16,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalBtn: {
    padding: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  sectionHint: {
    fontSize: 12,
  },
  modeToggleSection: {
    flexDirection: 'row',
    margin: 12,
    padding: 6,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  thinkingSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  thinkingRow: {
    gap: 6,
  },
  thinkingLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  thinkingInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  thinkingAnimRow: {
    flexDirection: 'row',
    gap: 8,
  },
  thinkingAnimBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  thinkingDotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  thinkingDotBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleColorRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 16,
  },
  bubbleColorItem: {
    flex: 1,
    gap: 8,
  },
  bubbleColorLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  bubbleColorPreview: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentPatternDisplay: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  currentPatternLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  currentPatternPreview: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  currentPatternDesc: {
    fontSize: 12,
    textAlign: 'center',
  },
  patternGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  patternCard: {
    width: (SCREEN_W - 52) / 4,
    borderRadius: 10,
    padding: 8,
    borderWidth: 2,
    gap: 6,
    position: 'relative',
    alignItems: 'center',
  },
  patternPreviewBox: {
    width: '100%',
    height: 50,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  patternName: {
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
  },
  previewButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fontPreviewBox: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  fontPreviewLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  fontPreviewText: {
    fontSize: 18,
    fontWeight: '600',
  },
  fontPreviewSub: {
    fontSize: 13,
  },
  inputPreviewBox: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  inputPreview: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
  },
  settingRow: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  sliderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sliderOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 40,
    alignItems: 'center',
  },
  sliderOptionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  styleOptionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  styleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  styleOptionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  importExportRow: {
    flexDirection: 'row',
    gap: 12,
  },
  importExportBtn: {
    flex: 1,
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  importExportLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  importExportDesc: {
    fontSize: 11,
  },
  exportScroll: {
    maxHeight: 300,
    borderRadius: 10,
    borderWidth: 1,
  },
  exportScrollContent: {
    padding: 12,
  },
  exportJsonText: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  importHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  importInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    minHeight: 150,
    textAlignVertical: 'top',
    fontSize: 12,
    fontFamily: 'monospace',
  },
});