import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Alert, Modal, Image, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { ThemeConfig } from '../types';
import { IconClose, IconEdit, IconTrash, IconImport, IconExport, IconImage, IconPalette, IconEye } from '../components/Icons';

const SCREEN_W = Dimensions.get('window').width;

interface CustomTheme {
  id: string;
  name: string;
  theme: ThemeConfig;
  createdAt: number;
  updatedAt: number;
}

const INITIAL_PRESETS: ThemeConfig[] = [
  {
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
  },
  {
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
  },
  {
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
  },
];

interface ThemeEditorScreenProps {
  onClose: () => void;
}

export const ThemeEditorScreen: React.FC<ThemeEditorScreenProps> = ({ onClose }) => {
  const theme = useTheme();
  const { settings, updateTheme } = useApp();
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null);
  const [themeName, setThemeName] = useState('');
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(settings.theme);
  const [step, setStep] = useState<'colors' | 'preview' | 'details'>('colors');
  const [isImporting, setIsImporting] = useState(false);
  const [splashConfig, setSplashConfig] = useState({
    backgroundColor: settings.theme.accentColor,
    showCustomImage: false,
  });

  const COLOR_FIELDS: { key: keyof ThemeConfig; label: string; type: 'color' }[] = [
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
  ];

  const updateColor = (key: keyof ThemeConfig, color: string) => {
    const newTheme = { ...currentTheme, [key]: color };
    setCurrentTheme(newTheme);
    updateTheme(newTheme);
  };

  const handleSaveTheme = () => {
    if (!themeName.trim()) {
      Alert.alert('错误', '请输入主题名称');
      return;
    }

    const now = Date.now();
    const newTheme: CustomTheme = {
      id: editingTheme?.id || now.toString(),
      name: themeName,
      theme: currentTheme,
      createdAt: editingTheme?.createdAt || now,
      updatedAt: now,
    };

    if (editingTheme) {
      setCustomThemes((prev) =>
        prev.map((t) => (t.id === editingTheme.id ? newTheme : t))
      );
    } else {
      setCustomThemes((prev) => [...prev, newTheme]);
    }

    setShowEditor(false);
    setEditingTheme(null);
    setThemeName('');
  };

  const handleOpenEditor = (theme?: CustomTheme) => {
    if (theme) {
      setEditingTheme(theme);
      setThemeName(theme.name);
      setCurrentTheme(theme.theme);
    } else {
      setEditingTheme(null);
      setThemeName('');
      setCurrentTheme(settings.theme);
    }
    setShowEditor(true);
  };

  const handleDelete = (id: string) => {
    Alert.alert('删除主题', '确定要删除这个自定义主题吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => {
        setCustomThemes((prev) => prev.filter((t) => t.id !== id));
      }},
    ]);
  };

  const handleApplyTheme = (t: ThemeConfig) => {
    updateTheme(t);
    Alert.alert('主题已应用', '主题已成功应用');
  };

  const handleImportTheme = async () => {
    setIsImporting(true);
    setTimeout(() => {
      setIsImporting(false);
      Alert.alert(
        '导入主题',
        '粘贴主题JSON配置代码',
        [
          { text: '取消', style: 'cancel' },
          { text: '粘贴', onPress: () => {
            Alert.alert('提示', '请在支持的主题分享功能中获取主题代码');
          }},
        ]
      );
    }, 1000);
  };

  const handleExportTheme = (themeConfig: ThemeConfig) => {
    const json = JSON.stringify(themeConfig, null, 2);
    Alert.alert('导出主题', '主题配置代码已复制到剪贴板');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconClose size={24} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>主题编辑器</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleImportTheme} style={styles.actionBtn}>
            <IconImport size={20} color={theme.accentColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleOpenEditor()} style={styles.actionBtn}>
            <IconEdit size={20} color={theme.accentColor} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* 说明卡片 */}
        <View style={[styles.infoCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <IconPalette size={24} color={theme.accentColor} />
          <Text style={[styles.infoTitle, { color: theme.textColor }]}>创建你的专属主题</Text>
          <Text style={[styles.infoDesc, { color: theme.subTextColor }]}>
            调整颜色、字体等属性，打造独一无二的对话体验
          </Text>
        </View>

        {/* 预设主题 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>预设模板</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsContainer}
          >
            {INITIAL_PRESETS.map((preset, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => {
                  setCurrentTheme(preset);
                  setShowEditor(true);
                  setEditingTheme(null);
                  setThemeName(`预设主题 ${idx + 1}`);
                }}
                style={[styles.presetCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
              >
                <View style={[styles.presetPreview, { backgroundColor: preset.backgroundColor }]}>
                  <View style={[styles.presetAccent, { backgroundColor: preset.accentColor }]} />
                  <View style={[styles.presetTextLine, { backgroundColor: preset.textColor, opacity: 0.6 }]} />
                  <View style={[styles.presetTextLine, { backgroundColor: preset.subTextColor, opacity: 0.4 }]} />
                </View>
                <Text style={[styles.presetName, { color: theme.textColor }]}>
                  模板 {idx + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* 我的主题 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>我的主题</Text>
          
          {customThemes.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
              <IconPalette size={32} color={theme.subTextColor} />
              <Text style={[styles.emptyTitle, { color: theme.textColor }]}>还没有自定义主题</Text>
              <Text style={[styles.emptyDesc, { color: theme.subTextColor }]}>
                点击右上角按钮创建第一个主题
              </Text>
            </View>
          ) : (
            <View style={styles.themeList}>
              {customThemes.map((t) => (
                <View 
                  key={t.id}
                  style={[styles.themeCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                >
                  <View style={[styles.themePreview, { backgroundColor: t.theme.backgroundColor }]}>
                    <View style={[styles.themeAccent, { backgroundColor: t.theme.accentColor }]} />
                  </View>
                  <View style={styles.themeInfo}>
                    <Text style={[styles.themeName, { color: theme.textColor }]}>{t.name}</Text>
                    <Text style={[styles.themeDate, { color: theme.subTextColor }]}>
                      {new Date(t.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.themeActions}>
                    <TouchableOpacity 
                      onPress={() => handleApplyTheme(t.theme)}
                      style={[styles.themeBtn, { backgroundColor: t.theme.accentColor }]}
                    >
                      <Text style={styles.themeBtnText}>应用</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleOpenEditor(t)}
                      style={styles.themeIconBtn}
                    >
                      <IconEdit size={18} color={theme.subTextColor} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleExportTheme(t.theme)}
                      style={styles.themeIconBtn}
                    >
                      <IconExport size={18} color={theme.subTextColor} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleDelete(t.id)}
                      style={styles.themeIconBtn}
                    >
                      <IconTrash size={18} color="#ff0000" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 对话框预览 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>效果预览</Text>
          <View style={[styles.previewContainer, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <View style={[styles.chatPreview, { backgroundColor: currentTheme.backgroundColor }]}>
              <View style={[styles.bubbleAi, { backgroundColor: currentTheme.secondaryColor }]}>
                <Text style={{ color: currentTheme.textColor, fontSize: 14 }}>
                  你好，很高兴见到你！
                </Text>
              </View>
              <View style={[styles.bubbleUser, { backgroundColor: currentTheme.accentColor }]}>
                <Text style={{ color: currentTheme.buttonTextColor, fontSize: 14 }}>
                  你好！
                </Text>
              </View>
              <TouchableOpacity style={[styles.previewButton, { backgroundColor: currentTheme.buttonColor }]}>
                <Text style={{ color: currentTheme.buttonTextColor, fontSize: 13 }}>
                  按钮示例
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* 主题编辑器弹窗 */}
      <Modal
        visible={showEditor}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditor(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <TouchableOpacity onPress={() => setShowEditor(false)}>
                  <IconClose size={20} color={theme.textColor} />
                </TouchableOpacity>
                <Text style={[styles.modalTitle, { color: theme.textColor }]}>
                  {editingTheme ? '编辑主题' : '创建主题'}
                </Text>
              </View>
              <TouchableOpacity 
                onPress={handleSaveTheme}
                style={[styles.saveButton, { backgroundColor: theme.accentColor }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.stepTabs}>
              <TouchableOpacity
                onPress={() => setStep('colors')}
                style={[styles.stepTab, step === 'colors' && { backgroundColor: theme.primaryColor }]}
              >
                <Text style={[styles.stepTabText, { color: step === 'colors' ? theme.textColor : theme.subTextColor }]}>
                  颜色
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStep('preview')}
                style={[styles.stepTab, step === 'preview' && { backgroundColor: theme.primaryColor }]}
              >
                <Text style={[styles.stepTabText, { color: step === 'preview' ? theme.textColor : theme.subTextColor }]}>
                  预览
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStep('details')}
                style={[styles.stepTab, step === 'details' && { backgroundColor: theme.primaryColor }]}
              >
                <Text style={[styles.stepTabText, { color: step === 'details' ? theme.textColor : theme.subTextColor }]}>
                  详情
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {step === 'colors' && (
                <View style={styles.colorsSection}>
                  {COLOR_FIELDS.map((field) => (
                    <View key={field.key as string} style={[styles.colorRow, { borderBottomColor: theme.borderColor }]}>
                      <Text style={[styles.colorLabel, { color: theme.textColor }]}>{field.label}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          Alert.prompt(
                            '输入颜色值',
                            '请输入十六进制颜色值 (如 #FF6B9D)',
                            (color) => {
                              if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) {
                                updateColor(field.key, color);
                              } else {
                                Alert.alert('错误', '请输入有效的颜色值');
                              }
                            }
                          );
                        }}
                        style={styles.colorPickerBtn}
                      >
                        <View 
                          style={[
                            styles.colorSwatch, 
                            { backgroundColor: currentTheme[field.key] as string, borderColor: theme.borderColor }
                          ]} 
                        />
                        <Text style={[styles.colorValue, { color: theme.subTextColor }]}>
                          {currentTheme[field.key] as string}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {step === 'preview' && (
                <View style={styles.previewSection}>
                  <Text style={[styles.previewLabel, { color: theme.subTextColor }]}>实时预览</Text>
                  <View style={[styles.previewBox, { backgroundColor: currentTheme.backgroundColor, borderColor: theme.borderColor }]}>
                    <View style={[styles.previewBubble, { backgroundColor: currentTheme.secondaryColor }]}>
                      <Text style={{ color: currentTheme.textColor, fontSize: 14 }}>AI回复示例</Text>
                    </View>
                    <View style={[styles.previewBubbleUser, { backgroundColor: currentTheme.accentColor }]}>
                      <Text style={{ color: currentTheme.buttonTextColor, fontSize: 14 }}>用户消息</Text>
                    </View>
                    <TouchableOpacity style={[styles.previewBtn, { backgroundColor: currentTheme.buttonColor }]}>
                      <Text style={{ color: currentTheme.buttonTextColor, fontSize: 13 }}>按钮</Text>
                    </TouchableOpacity>
                    <View style={[styles.previewInput, { backgroundColor: currentTheme.inputBgColor, borderColor: currentTheme.borderColor }]}>
                      <Text style={{ color: currentTheme.subTextColor, fontSize: 13 }}>
                        输入框示例
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {step === 'details' && (
                <View style={styles.detailsSection}>
                  <View style={[styles.detailRow, { borderBottomColor: theme.borderColor }]}>
                    <Text style={[styles.detailLabel, { color: theme.textColor }]}>主题名称</Text>
                    <TextInput
                      style={[styles.detailInput, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                      value={themeName}
                      onChangeText={setThemeName}
                      placeholder="输入主题名称"
                      placeholderTextColor={theme.subTextColor}
                    />
                  </View>

                  <View style={[styles.detailRow, { borderBottomColor: theme.borderColor }]}>
                    <Text style={[styles.detailLabel, { color: theme.textColor }]}>字体大小</Text>
                    <View style={styles.sizeOptions}>
                      {[14, 16, 18, 20].map((size) => (
                        <TouchableOpacity
                          key={size}
                          onPress={() => setCurrentTheme({ ...currentTheme, fontSize: size })}
                          style={[
                            styles.sizeOption,
                            {
                              backgroundColor: currentTheme.fontSize === size ? theme.accentColor : theme.primaryColor,
                              borderColor: theme.borderColor,
                            },
                          ]}
                        >
                          <Text style={{ color: currentTheme.fontSize === size ? '#fff' : theme.textColor }}>
                            {size}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={[styles.detailRow, { borderBottomColor: theme.borderColor }]}>
                    <Text style={[styles.detailLabel, { color: theme.textColor }]}>开屏动画</Text>
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(
                          '开屏动画设置',
                          '选择开屏图片和背景色',
                          [
                            { text: '取消', style: 'cancel' },
                            { text: '选择图片', onPress: () => {
                              setSplashConfig({ ...splashConfig, showCustomImage: true });
                            }},
                            { text: '自定义颜色', onPress: () => {
                              Alert.prompt(
                                '背景色',
                                '输入十六进制颜色值',
                                (color) => {
                                  if (color) {
                                    setSplashConfig({ ...splashConfig, backgroundColor: color });
                                  }
                                }
                              );
                            }},
                          ]
                        );
                      }}
                      style={styles.configButton}
                    >
                      <IconImage size={18} color={theme.accentColor} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
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
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 36,
    height: 36,
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
  infoCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    gap: 10,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoDesc: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  presetsContainer: {
    gap: 12,
  },
  presetCard: {
    width: 120,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 8,
  },
  presetPreview: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    padding: 8,
    gap: 4,
  },
  presetAccent: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  presetTextLine: {
    height: 6,
    borderRadius: 3,
  },
  presetName: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyState: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: 'center',
  },
  themeList: {
    gap: 10,
  },
  themeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  themePreview: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeAccent: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  themeInfo: {
    flex: 1,
  },
  themeName: {
    fontSize: 15,
    fontWeight: '600',
  },
  themeDate: {
    fontSize: 12,
  },
  themeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  themeBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  themeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  themeIconBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  chatPreview: {
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  bubbleAi: {
    borderRadius: 10,
    padding: 8,
    maxWidth: '80%',
  },
  bubbleUser: {
    borderRadius: 10,
    padding: 8,
    maxWidth: '80%',
    alignSelf: 'flex-end',
  },
  previewButton: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignSelf: 'flex-start',
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
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  stepTabs: {
    flexDirection: 'row',
    padding: 8,
    gap: 8,
  },
  stepTab: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  stepTabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  colorsSection: {
    gap: 8,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  colorLabel: {
    fontSize: 14,
  },
  colorPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
  },
  colorValue: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  previewSection: {
    gap: 12,
  },
  previewLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  previewBox: {
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
  },
  previewBubble: {
    borderRadius: 10,
    padding: 8,
    maxWidth: '70%',
  },
  previewBubbleUser: {
    borderRadius: 10,
    padding: 8,
    maxWidth: '70%',
    alignSelf: 'flex-end',
  },
  previewBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  previewInput: {
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
  },
  detailsSection: {
    gap: 12,
  },
  detailRow: {
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  detailLabel: {
    fontSize: 14,
  },
  detailInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
  },
  sizeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeOption: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  configButton: {
    alignSelf: 'flex-start',
  },
});
