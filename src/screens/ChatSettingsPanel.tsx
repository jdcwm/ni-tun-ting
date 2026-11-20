import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Image,
  Alert,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Animated,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatSettings, AIProvider, AIModel, AIType, WorldBook, StatusBarConfig, StatusVar, RegexRule, CSSEntry, Character, ChatMessage } from '../types';
import { imageUtils, packAssets, unpackAssets } from '../utils/imageUtils';
import { generateId } from '../constants/defaults';
import { aiService } from '../services/aiService';
import { ModelSelector } from '../components/ModelSelector';
import { IconUser, IconAI, IconImport, IconExport, IconCopy, IconBolt } from '../components/Icons';
import { buildDirectiveRegexPresets } from '../services/uiDirectiveService';
import { storage } from '../utils/storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';

interface ChatSettingsPanelProps {
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings) => void;
  wallpaper?: string;
  onWallpaperChange?: (wallpaper?: string) => void;
  worldBookIds?: string[];
  onWorldBookIdsChange?: (ids: string[]) => void;
  isChildConversation?: boolean;
  characterId?: string;
  userAvatar?: string;
  onUserAvatarChange?: (avatar?: string) => void;
  assistantAvatar?: string;
  onAssistantAvatarChange?: (avatar?: string) => void;
  onNavigateToChat?: (chatId: string) => void;
  messages?: ChatMessage[];
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

export const ChatSettingsPanel: React.FC<ChatSettingsPanelProps> = ({
  settings,
  onSettingsChange,
  wallpaper,
  onWallpaperChange,
  worldBookIds = [],
  onWorldBookIdsChange,
  isChildConversation = false,
  characterId,
  userAvatar,
  onUserAvatarChange,
  assistantAvatar,
  onAssistantAvatarChange,
  onNavigateToChat,
  messages = [],
  isSharedCard = false,
  cardHideFlags,
  extraSystemPrompt = '',
  onExtraSystemPromptChange,
  onOpenCharacterPicker,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { providers, worldBooks, characters } = useApp();
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [providerType, setProviderType] = useState<AIType>('text');
  const [showStatusBarEditor, setShowStatusBarEditor] = useState(false);
  const [statusBarForm, setStatusBarForm] = useState<StatusBarConfig>({
    enabled: false,
    vars: [],
    position: 'top',
    style: 'bar',
    animation: 'none',
  });
  const [showRegexEditor, setShowRegexEditor] = useState(false);
  const [editingRegex, setEditingRegex] = useState<RegexRule | null>(null);
  const [regexForm, setRegexForm] = useState({
    name: '',
    pattern: '',
    replacement: '',
    scope: 'output' as 'input' | 'output' | 'both',
  });
  const [editingVarIndex, setEditingVarIndex] = useState<number | null>(null);
  const [varForm, setVarForm] = useState({
    name: '',
    label: '',
    value: '',
    min: '0',
    max: '100',
    type: 'progress' as 'number' | 'string' | 'progress',
    color: '',
    icon: '',
  });
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [showCSSEditor, setShowCSSEditor] = useState(false);
  const [editingCSS, setEditingCSS] = useState<CSSEntry | null>(null);
  const [cssForm, setCssForm] = useState({ name: '', css: '', scope: 'message' as 'message' | 'global' });

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

  const updateSetting = <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const [userNameInput, setUserNameInput] = useState(settings.userName || '');

  const sortedRegexRules = [...(settings.regexRules || [])].sort((a, b) => a.order - b.order);

  const cssEntries = settings.cssEntries || [];

  const openAddCSS = () => {
    setEditingCSS(null);
    setCssForm({ name: '', css: '', scope: 'message' });
    setShowCSSEditor(true);
  };

  const openEditCSS = (entry: CSSEntry) => {
    setEditingCSS(entry);
    setCssForm({ name: entry.name, css: entry.css, scope: entry.scope });
    setShowCSSEditor(true);
  };

  const saveCSS = () => {
    if (!cssForm.name.trim()) {
      Alert.alert('提示', '请输入 CSS 条目名称');
      return;
    }
    if (editingCSS) {
      const updated = cssEntries.map((e) =>
        e.id === editingCSS.id ? { ...e, name: cssForm.name.trim(), css: cssForm.css, scope: cssForm.scope } : e
      );
      updateSetting('cssEntries', updated);
    } else {
      const newEntry: CSSEntry = {
        id: generateId(),
        name: cssForm.name.trim(),
        css: cssForm.css,
        enabled: true,
        scope: cssForm.scope,
      };
      updateSetting('cssEntries', [...cssEntries, newEntry]);
    }
    setShowCSSEditor(false);
    setEditingCSS(null);
    setCssForm({ name: '', css: '', scope: 'message' });
  };

  const toggleCSS = (id: string) => {
    updateSetting('cssEntries', cssEntries.map((e) => e.id === id ? { ...e, enabled: !e.enabled } : e));
  };

  const deleteCSS = (id: string) => {
    updateSetting('cssEntries', cssEntries.filter((e) => e.id !== id));
  };

  const openAddRegex = () => {
    setEditingRegex(null);
    setRegexForm({
      name: '',
      pattern: '',
      replacement: '',
      scope: 'output',
    });
    setShowRegexEditor(true);
  };

  const openEditRegex = (rule: RegexRule) => {
    setEditingRegex(rule);
    setRegexForm({
      name: rule.name,
      pattern: rule.pattern,
      replacement: rule.replacement,
      scope: rule.scope,
    });
    setShowRegexEditor(true);
  };

  const saveRegex = () => {
    if (!regexForm.name.trim()) {
      Alert.alert('提示', '请输入规则名称');
      return;
    }
    if (!regexForm.pattern.trim()) {
      Alert.alert('提示', '请输入正则表达式');
      return;
    }
    const rules = [...(settings.regexRules || [])];
    if (editingRegex) {
      const idx = rules.findIndex((r) => r.id === editingRegex.id);
      if (idx >= 0) {
        rules[idx] = { ...rules[idx], name: regexForm.name.trim(), pattern: regexForm.pattern, replacement: regexForm.replacement, scope: regexForm.scope };
      }
    } else {
      rules.push({
        id: generateId(),
        name: regexForm.name.trim(),
        pattern: regexForm.pattern,
        replacement: regexForm.replacement,
        scope: regexForm.scope,
        enabled: true,
        order: rules.length,
      });
    }
    updateSetting('regexRules', rules);
    setShowRegexEditor(false);
    setEditingRegex(null);
    setRegexForm({ name: '', pattern: '', replacement: '', scope: 'output' });
  };

  const toggleRegexEnabled = (ruleId: string) => {
    const rules = (settings.regexRules || []).map((r) =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    updateSetting('regexRules', rules);
  };

  const deleteRegex = (ruleId: string) => {
    const rules = (settings.regexRules || [])
      .filter((r) => r.id !== ruleId)
      .map((r, i) => ({ ...r, order: i }));
    updateSetting('regexRules', rules);
  };

  const moveRegex = (ruleId: string, direction: 'up' | 'down') => {
    const rules = [...(settings.regexRules || [])];
    const idx = rules.findIndex((r) => r.id === ruleId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= rules.length) return;
    [rules[idx], rules[newIdx]] = [rules[newIdx], rules[idx]];
    // 使用 map 创建新对象，避免直接修改 state
    const updatedRules = rules.map((r, i) => ({ ...r, order: i }));
    updateSetting('regexRules', updatedRules);
  };

  // 单条正则 → 剪贴板（自动 bundle 图片 url，assets 非空时才写入）
  const handleExportOneRegex = async (rule: RegexRule) => {
    try {
      const { plain, assets } = await packAssets({ rules: [rule] }, 'regex');
      const payload: any = { format: 'aitavern:regex:1', rules: (plain as any).rules };
      if (Array.isArray(assets) && assets.length > 0) payload.assets = assets;
      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      Alert.alert('已复制', `正则「${rule.name || '未命名'}」已写入剪贴板`);
    } catch (e: any) {
      Alert.alert('导出失败', e?.message || '未知错误');
    }
  };

  // 导出全部正则 → 文件 / 剪贴板兜底
  const handleExportAllRegex = async () => {
    try {
      const rules = sortedRegexRules;
      const { plain, assets } = await packAssets({ rules }, 'regex');
      const payload: any = { format: 'aitavern:regex:1', rules: (plain as any).rules };
      if (Array.isArray(assets) && assets.length > 0) payload.assets = assets;
      const dataStr = JSON.stringify(payload, null, 2);
      const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
      const fileUri = cacheDir + `regex_all_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, dataStr);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '导出全部正则规则',
          UTI: 'public.json',
        });
      } else {
        await Clipboard.setStringAsync(dataStr);
        Alert.alert('导出完成', '分享不可用，已写入剪贴板');
      }
      try {
        await storage.appendUserLog({
          type: 'export',
          target: { kind: 'regex', id: 'all', name: `${rules.length}条规则` },
        });
      } catch (_) { /* ignore log errors */ }
    } catch (e: any) {
      Alert.alert('导出失败', e?.message || '未知错误');
    }
  };

  // 合并规则：按 id 去重；id 冲突则重命名生成新 id
  const mergeRegexRules = (current: RegexRule[], incoming: RegexRule[]): RegexRule[] => {
    const existingIds = new Set(current.map((r) => r.id));
    const next = [...current];
    incoming.forEach((r) => {
      let id = r.id;
      if (id && existingIds.has(id)) {
        id = `regex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      } else if (!id) {
        id = `regex_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      }
      existingIds.add(id);
      next.push({ ...r, id, order: next.length });
    });
    return next.map((r, i) => ({ ...r, order: i }));
  };

  const applyRegexImport = async (parsed: any) => {
    let incoming: RegexRule[] = [];
    let assets: any = undefined;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      assets = (parsed as any).assets;
      if ((parsed as any).format === 'aitavern:regex:1' && Array.isArray((parsed as any).rules)) {
        incoming = (parsed as any).rules;
      }
    } else if (Array.isArray(parsed)) {
      incoming = parsed;
    }
    if (assets && incoming.length > 0) {
      const { data } = await unpackAssets({ rules: incoming }, assets, 'regexImages');
      incoming = (data && Array.isArray(data.rules)) ? data.rules : incoming;
    }
    const valid = incoming.filter(
      (r: any) => r && typeof r === 'object' && typeof (r.pattern ?? '') === 'string'
    );
    if (valid.length === 0) {
      Alert.alert('导入失败', '未找到有效的正则规则');
      return;
    }
    const merged = mergeRegexRules(settings.regexRules || [], valid);
    updateSetting('regexRules', merged);
    Alert.alert('导入成功', `已导入 ${valid.length} 条正则规则`);
    try {
      await storage.appendUserLog({
        type: 'import',
        target: { kind: 'regex', id: 'all', name: `${valid.length}条规则` },
      });
    } catch (_) { /* ignore */ }
  };

  const handleImportRegexFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if ((result as any).canceled) return;
      const file = (result as any).assets?.[0];
      if (!file) return;
      const content = await FileSystem.readAsStringAsync(file.uri);
      await applyRegexImport(JSON.parse(content));
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '文件格式错误');
    }
  };

  const handleImportRegexClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        Alert.alert('导入失败', '剪贴板为空');
        return;
      }
      await applyRegexImport(JSON.parse(text));
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '剪贴板内容不是合法 JSON');
    }
  };

  /**
   * 一键安装「界面指令触发词」正则。
   *
   * 背景：让 AI 直接输出 {{ui:...}} 依赖模型配合，弱模型可能不照格式写。
   * 这套预设让用户/AI 只写短触发词（【夜】【雪】【图:xxx】），由输出正则替换成指令，
   * 不依赖模型能力。
   */
  const handleInstallDirectivePresets = () => {
    const presets = buildDirectiveRegexPresets();
    const existing = settings.regexRules || [];
    const existingPatterns = new Set(existing.map((r) => r.pattern));
    const toAdd = presets.filter((p) => !existingPatterns.has(p.pattern));
    if (toAdd.length === 0) {
      Alert.alert('已安装', '界面指令触发词已经全部添加过了');
      return;
    }
    Alert.alert(
      '添加界面指令触发词',
      `将添加 ${toAdd.length} 条输出正则。\n\n` +
        '添加后你在消息里写【夜】【雪】【图:插图名】这类短词，' +
        '就会被替换成对应的界面指令，用来变色/加装饰/换背景/发图。\n\n' +
        '（AI 也可以直接输出这些短词，效果一样）',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '添加',
          onPress: () => {
            const baseOrder = existing.length;
            const newRules: RegexRule[] = toAdd.map((p, i) => ({
              id: generateId(),
              name: p.name,
              pattern: p.pattern,
              replacement: p.replacement,
              scope: p.scope,
              enabled: true,
              order: baseOrder + i,
            }));
            updateSetting('regexRules', [...existing, ...newRules]);
            Alert.alert('已添加', `新增 ${newRules.length} 条界面指令触发词`);
          },
        },
      ],
    );
  };

  // --- CSS 导入导出 ---
  const handleExportOneCSS = async (entry: CSSEntry) => {
    try {
      const { plain, assets } = await packAssets({ entries: [entry] }, 'css');
      const payload: any = { format: 'aitavern:css:1', entries: (plain as any).entries };
      if (Array.isArray(assets) && assets.length > 0) payload.assets = assets;
      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      Alert.alert('已复制', `CSS「${entry.name || '未命名'}」已写入剪贴板`);
    } catch (e: any) {
      Alert.alert('导出失败', e?.message || '未知错误');
    }
  };

  const handleExportAllCSS = async () => {
    try {
      const entries = cssEntries;
      const { plain, assets } = await packAssets({ entries }, 'css');
      const payload: any = { format: 'aitavern:css:1', entries: (plain as any).entries };
      if (Array.isArray(assets) && assets.length > 0) payload.assets = assets;
      const dataStr = JSON.stringify(payload, null, 2);
      const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || '';
      const fileUri = cacheDir + `css_all_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, dataStr);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '导出全部 CSS 条目',
          UTI: 'public.json',
        });
      } else {
        await Clipboard.setStringAsync(dataStr);
        Alert.alert('导出完成', '分享不可用，已写入剪贴板');
      }
      try {
        await storage.appendUserLog({
          type: 'export',
          target: { kind: 'css', id: 'all', name: `${entries.length}条CSS` },
        });
      } catch (_) { /* ignore */ }
    } catch (e: any) {
      Alert.alert('导出失败', e?.message || '未知错误');
    }
  };

  const applyCSSImport = async (parsed: any) => {
    let incoming: CSSEntry[] = [];
    let assets: any = undefined;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      assets = (parsed as any).assets;
      if ((parsed as any).format === 'aitavern:css:1' && Array.isArray((parsed as any).entries)) {
        incoming = (parsed as any).entries;
      }
    } else if (Array.isArray(parsed)) {
      incoming = parsed;
    }
    if (assets && incoming.length > 0) {
      const { data } = await unpackAssets({ entries: incoming }, assets, 'cssImages');
      incoming = (data && Array.isArray(data.entries)) ? data.entries : incoming;
    }
    const valid = incoming.filter(
      (e: any) => e && typeof e === 'object' && typeof (e.name ?? '') === 'string'
    );
    if (valid.length === 0) {
      Alert.alert('导入失败', '未找到有效的 CSS 条目');
      return;
    }
    const existingIds = new Set(cssEntries.map((e) => e.id));
    const merged: CSSEntry[] = [...cssEntries];
    valid.forEach((e) => {
      let id = e.id;
      if (id && existingIds.has(id)) {
        id = `css_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      } else if (!id) {
        id = `css_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      }
      existingIds.add(id);
      merged.push({
        ...e,
        id,
        enabled: e.enabled !== false,
        scope: e.scope === 'global' ? 'global' : 'message',
      });
    });

    const doCommit = () => {
      updateSetting('cssEntries', merged);
      Alert.alert('导入成功', `已导入 ${valid.length} 条 CSS 条目`);
      storage
        .appendUserLog({
          type: 'import',
          target: { kind: 'css', id: 'all', name: `${valid.length}条CSS` },
        })
        .catch(() => {});
    };

    const globalCount = valid.filter((e) => e.scope === 'global').length;
    if (globalCount > 3) {
      Alert.alert(
        '提示',
        `全局 CSS 导入数量较多（${globalCount} 条 > 3）可能影响性能，是否继续？`,
        [
          { text: '取消', style: 'cancel' },
          { text: '继续导入', onPress: doCommit },
        ]
      );
    } else {
      doCommit();
    }
  };

  const handleImportCSSFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain'],
        copyToCacheDirectory: true,
      });
      if ((result as any).canceled) return;
      const file = (result as any).assets?.[0];
      if (!file) return;
      const content = await FileSystem.readAsStringAsync(file.uri);
      await applyCSSImport(JSON.parse(content));
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '文件格式错误');
    }
  };

  const handleImportCSSClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        Alert.alert('导入失败', '剪贴板为空');
        return;
      }
      await applyCSSImport(JSON.parse(text));
    } catch (e: any) {
      Alert.alert('导入失败', e?.message || '剪贴板内容不是合法 JSON');
    }
  };

  const openStatusBarEditor = () => {
    const sb = settings.statusBar || {
      enabled: false,
      vars: [],
      position: 'top',
      style: 'bar',
      animation: 'none',
    };
    setStatusBarForm({ ...sb });
    setShowStatusBarEditor(true);
  };

  const saveStatusBar = () => {
    updateSetting('statusBar', { ...statusBarForm });
    setShowStatusBarEditor(false);
  };

  const openAddVar = () => {
    setEditingVarIndex(-1);
    setVarForm({
      name: '',
      label: '',
      value: '50',
      min: '0',
      max: '100',
      type: 'progress',
      color: '',
      icon: '',
    });
  };

  const openEditVar = (index: number) => {
    const v = statusBarForm.vars[index];
    setEditingVarIndex(index);
    setVarForm({
      name: v.name,
      label: v.label,
      value: String(v.value),
      min: String(v.min ?? 0),
      max: String(v.max ?? 100),
      type: v.type,
      color: v.color || '',
      icon: v.icon || '',
    });
  };

  const saveVar = () => {
    if (!varForm.name.trim() || !varForm.label.trim()) {
      Alert.alert('提示', '请填写变量名和显示名称');
      return;
    }

    const newVar: StatusVar = {
      name: varForm.name.trim(),
      label: varForm.label.trim(),
      type: varForm.type,
      value: varForm.type === 'string' ? varForm.value : Number(varForm.value) || 0,
      min: varForm.type === 'progress' ? Number(varForm.min) || 0 : undefined,
      max: varForm.type === 'progress' ? Number(varForm.max) || 100 : undefined,
      color: varForm.color || undefined,
      icon: varForm.icon || undefined,
    };

    const newVars = [...statusBarForm.vars];
    if (editingVarIndex !== null && editingVarIndex >= 0) {
      newVars[editingVarIndex] = newVar;
    } else {
      newVars.push(newVar);
    }
    setStatusBarForm({ ...statusBarForm, vars: newVars });
    // 保存后关闭表单并重置，避免显示残留数据
    setEditingVarIndex(null);
    setVarForm({
      name: '',
      label: '',
      value: '50',
      min: '0',
      max: '100',
      type: 'progress',
      color: '',
      icon: '',
    });
  };

  const deleteVar = (index: number) => {
    setStatusBarForm({
      ...statusBarForm,
      vars: statusBarForm.vars.filter((_, i) => i !== index),
    });
  };

  const pickWallpaper = async () => {
    const uri = await imageUtils.pickImageFromGallery();
    if (uri && onWallpaperChange) {
      const savedUri = await imageUtils.saveImageToAppDir(uri, 'chat_wallpapers');
      onWallpaperChange(savedUri);
    }
  };

  const removeWallpaper = () => {
    if (onWallpaperChange) {
      onWallpaperChange(undefined);
    }
  };

  const pickUserAvatar = async () => {
    if (!onUserAvatarChange) return;
    const uri = await imageUtils.pickAvatarFromGallery();
    if (uri) {
      const savedUri = await imageUtils.saveImageToAppDir(uri, 'avatars');
      onUserAvatarChange(savedUri);
    }
  };

  const removeUserAvatar = () => {
    if (onUserAvatarChange) {
      onUserAvatarChange(undefined);
    }
  };

  const pickAssistantAvatar = async () => {
    if (!onAssistantAvatarChange) return;
    const uri = await imageUtils.pickAvatarFromGallery();
    if (uri) {
      const savedUri = await imageUtils.saveImageToAppDir(uri, 'avatars');
      onAssistantAvatarChange(savedUri);
    }
  };

  const removeAssistantAvatar = () => {
    if (onAssistantAvatarChange) {
      onAssistantAvatarChange(undefined);
    }
  };

  const openProviderSelector = (type: AIType) => {
    setProviderType(type);
    setShowModelSelector(true);
  };

  const handleSelectModel = (type: AIType, provider: AIProvider, model: AIModel) => {
    const key = `${type}ProviderId` as keyof ChatSettings;
    const modelKey = `${type}ModelId` as keyof ChatSettings;
    onSettingsChange({
      ...settings,
      [key]: provider.id,
      [modelKey]: model.id,
    });
    setShowModelSelector(false);
  };

  const getProvider = (type: AIType) => {
    const providerId = settings[`${type}ProviderId` as keyof ChatSettings] as string | undefined;
    return providers.find((p) => p.id === providerId);
  };

  const getCurrentModel = (type: AIType) => {
    const provider = getProvider(type);
    const modelId = settings[`${type}ModelId` as keyof ChatSettings] as string | undefined;
    return provider?.models?.find((m) => m.id === modelId);
  };

  const getSelectedProviderName = (type: AIType) => {
    const model = getCurrentModel(type);
    const provider = getProvider(type);
    if (model && provider) {
      return `${provider.name} · ${model.name}`;
    }
    return provider?.name || '未选择';
  };

  const typeLabels: Record<string, string> = {
    text: '对话AI',
    image: '生图AI',
    vision: '识图AI',
    summary: '总结AI',
    function_calling: '函数调用AI',
    streaming: '流式AI',
    reasoning: '推理AI',
    audio: '音频AI',
  };

  const toggleWorldBook = (bookId: string) => {
    if (!onWorldBookIdsChange) return;
    const newIds = worldBookIds.includes(bookId)
      ? worldBookIds.filter((id) => id !== bookId)
      : [...worldBookIds, bookId];
    onWorldBookIdsChange(newIds);
  };

  // Android 键盘跟随：监听键盘弹起/收起，给 ScrollView 底部留出空间
  // iOS 由 KeyboardAvoidingView behavior='padding' 处理；Android behavior 不生效，需手动处理
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.backgroundColor }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundColor }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? androidKeyboardHeight + Math.max(insets.bottom, 0) : 0 }}
      >
      {/* 「角色选择」已按需求移到左侧菜单 → 对话历史里的对话操作，这里不再重复显示 */}
      {false && (
      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>角色选择</Text>
        {(() => {
          const character = characters.find(c => c.id === characterId);
          const avatar = character?.avatar;
          const name = character?.name || '暂未选择角色';
          return (
            <View style={[styles.characterJumpCard, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
              <View style={styles.characterJumpCardLeft}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.characterJumpAvatar} />
                ) : (
                  <View style={[styles.characterJumpAvatarPlaceholder, { backgroundColor: theme.primaryColor }]}>
                    <IconAI size={24} color={theme.subTextColor} />
                  </View>
                )}
                <View style={styles.characterJumpCardInfo}>
                  <Text style={[styles.characterJumpCardName, { color: theme.textColor }]} numberOfLines={1}>
                    {name}
                  </Text>
                  {character?.description ? (
                    <Text style={[styles.characterJumpCardDesc, { color: theme.subTextColor }]} numberOfLines={1}>
                      {character?.description}
                    </Text>
                  ) : !character ? (
                    <Text style={[styles.characterJumpCardDesc, { color: theme.subTextColor }]} numberOfLines={1}>
                      请前往角色库选择一个角色
                    </Text>
                  ) : null}
                </View>
              </View>
              {onOpenCharacterPicker ? (
                <TouchableOpacity
                  style={[styles.characterJumpBtn, { backgroundColor: theme.accentColor }]}
                  onPress={onOpenCharacterPicker}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>添加角色（复制角色指令）</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.characterJumpBtn, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor, borderWidth: 1, opacity: 0.6 }]}>
                  <Text style={{ color: theme.subTextColor, fontSize: 12, fontWeight: '500' }}>角色库</Text>
                </View>
              )}
            </View>
          );
        })()}
      </View>
      )}

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>对话壁纸</Text>
        <View style={styles.wallpaperRow}>
          {wallpaper ? (
            <View style={styles.wallpaperPreview}>
              <Image source={{ uri: wallpaper }} style={styles.wallpaperImage} />
              <TouchableOpacity
                style={[styles.removeWallpaperBtn, { backgroundColor: theme.accentColor }]}
                onPress={removeWallpaper}
              >
                <Text style={{ color: '#fff', fontSize: 12 }}>移除</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ color: theme.subTextColor, fontSize: 12 }}>使用全局壁纸</Text>
          )}
          <TouchableOpacity
            style={[styles.wallpaperBtn, { backgroundColor: theme.secondaryColor }]}
            onPress={pickWallpaper}
          >
            <Text style={{ color: theme.textColor, fontSize: 12 }}>选择壁纸</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>对话头像</Text>
        <View style={styles.avatarRow}>
          <View style={styles.avatarItem}>
            <Text style={[styles.avatarLabel, { color: theme.subTextColor }]}>用户头像</Text>
            <View style={styles.avatarPreviewContainer}>
              {userAvatar ? (
                <Image
                  source={{ uri: userAvatar }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                  <IconUser size={32} color={theme.subTextColor} />
                </View>
              )}
            </View>
            <View style={styles.avatarActions}>
              <TouchableOpacity
                style={[styles.avatarBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={pickUserAvatar}
              >
                <Text style={{ color: theme.textColor, fontSize: 12 }}>上传</Text>
              </TouchableOpacity>
              {userAvatar && (
                <TouchableOpacity
                  style={[styles.avatarBtn, { backgroundColor: theme.accentColor }]}
                  onPress={removeUserAvatar}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>移除</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.avatarItem}>
            <Text style={[styles.avatarLabel, { color: theme.subTextColor }]}>AI头像</Text>
            <View style={styles.avatarPreviewContainer}>
              {assistantAvatar ? (
                <Image
                  source={{ uri: assistantAvatar }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: theme.secondaryColor }]}>
                  <IconAI size={32} color={theme.subTextColor} />
                </View>
              )}
            </View>
            <View style={styles.avatarActions}>
              <TouchableOpacity
                style={[styles.avatarBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={pickAssistantAvatar}
              >
                <Text style={{ color: theme.textColor, fontSize: 12 }}>上传</Text>
              </TouchableOpacity>
              {assistantAvatar && (
                <TouchableOpacity
                  style={[styles.avatarBtn, { backgroundColor: theme.accentColor }]}
                  onPress={removeAssistantAvatar}
                >
                  <Text style={{ color: '#fff', fontSize: 12 }}>移除</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 8 }}>
          在此设置当前对话的头像，仅对本次对话生效
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>对话用户名</Text>
        <Text style={{ color: theme.subTextColor, fontSize: 12, marginBottom: 8 }}>
          用于渲染宏变量中的用户名（如 {'{{user}}'}），优先于全局设置
        </Text>
        <View style={[styles.inputContainer, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
          <TextInput
            style={[styles.textInput, { color: theme.textColor }]}
            value={userNameInput}
            onChangeText={(text) => {
              setUserNameInput(text);
              updateSetting('userName', text);
            }}
            placeholder="输入对话中显示的用户名"
            placeholderTextColor={theme.subTextColor}
          />
        </View>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>状态栏</Text>
          <Switch
            value={!!settings.statusBar?.enabled}
            onValueChange={(val) => {
              const sb = settings.statusBar || {
                enabled: false,
                vars: [],
                position: 'top',
                style: 'bar',
                animation: 'none',
              };
              updateSetting('statusBar', { ...sb, enabled: val });
            }}
            trackColor={{ false: theme.borderColor, true: theme.accentColor }}
          />
        </View>
        {settings.statusBar?.enabled && (
          <TouchableOpacity
            style={[styles.providerRow, { borderBottomColor: theme.borderColor }]}
            onPress={openStatusBarEditor}
          >
            <View>
              <Text style={{ color: theme.textColor }}>配置状态栏</Text>
              <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
                {settings.statusBar.vars.length} 个变量 · {settings.statusBar.position === 'top' ? '顶部' : '底部'} ·
                {settings.statusBar.style === 'inline' ? '单行' : settings.statusBar.style === 'bar' ? '标准' : settings.statusBar.style === 'compact' ? '紧凑' : '完整'}
              </Text>
            </View>
            <Text style={{ color: theme.subTextColor }}>{'>'}</Text>
          </TouchableOpacity>
        )}
        {!settings.statusBar?.enabled && (
          <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>
            开启后可在对话中显示状态变量，AI可通过代码块更新状态
          </Text>
        )}
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>AI模型选择</Text>
        {(['text', 'image', 'vision', 'summary'] as AIType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.providerRow, { borderBottomColor: theme.borderColor }]}
            onPress={() => openProviderSelector(type)}
          >
            <Text style={{ color: theme.textColor }}>{typeLabels[type]}</Text>
            <View style={styles.providerRowRight}>
              <Text style={{ color: theme.subTextColor, fontSize: 12, marginRight: 4 }}>
                {getSelectedProviderName(type)}
              </Text>
              <Text style={{ color: theme.subTextColor }}>{'>'}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>世界书</Text>
          <Text style={{ color: theme.accentColor, fontSize: 12 }}>
            已关联 {worldBookIds.length} / {worldBooks.length}
          </Text>
        </View>
        {worldBooks.length === 0 ? (
          <Text style={{ color: theme.subTextColor, fontSize: 12, paddingVertical: 8 }}>
            暂无世界书，在世界书页面创建
          </Text>
        ) : (
          <View style={styles.worldBookList}>
            {worldBooks.map((wb) => {
              const isActive = worldBookIds.includes(wb.id);
              const enabledCount = wb.entries.filter((e) => e.enabled).length;
              return (
                <TouchableOpacity
                  key={wb.id}
                  style={[
                    styles.worldBookItem,
                    {
                      backgroundColor: isActive ? theme.accentColor + '15' : theme.secondaryColor,
                      borderColor: isActive ? theme.accentColor : 'transparent',
                    },
                  ]}
                  onPress={() => toggleWorldBook(wb.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.worldBookItemLeft}>
                    <Text style={styles.worldBookIcon}>📚</Text>
                    <View style={styles.worldBookInfo}>
                      <Text
                        style={{
                          color: theme.textColor,
                          fontWeight: isActive ? '600' : '400',
                          fontSize: 14,
                        }}
                        numberOfLines={1}
                      >
                        {wb.name}
                      </Text>
                      <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
                        {wb.entries.length} 条 · 启用 {enabledCount} 条
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.switchDot,
                      {
                        backgroundColor: isActive ? theme.accentColor : theme.borderColor,
                      },
                    ]}
                  >
                    {isActive && <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 8 }}>
          点击开启/关闭关联的世界书，开启后其中的条目会注入到对话中
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>系统设定</Text>
        {isSharedCard && cardHideFlags?.systemPrompt ? (
          // 分享卡片且系统设定被隐藏：只读，不可编辑
          <View style={[styles.textArea, { backgroundColor: theme.inputBgColor, opacity: 0.6, minHeight: 100 }]}>
            <Text style={{ color: theme.subTextColor, fontSize: 13, fontStyle: 'italic' }}>
              🔒 原系统设定已被分享者隐藏
            </Text>
          </View>
        ) : isChildConversation ? (
          <View style={[styles.textArea, { backgroundColor: theme.inputBgColor, opacity: 0.6, minHeight: 200 }]}>
            <Text style={{ color: theme.textColor, fontSize: 14 }}>{settings.systemPrompt || '无系统设定'}</Text>
          </View>
        ) : (
          <TextInput
            style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 200 }]}
            value={settings.systemPrompt}
            onChangeText={(text) => updateSetting('systemPrompt', text)}
            placeholder="系统提示词..."
            placeholderTextColor={theme.subTextColor}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
          />
        )}
        {isChildConversation && (
          <Text style={{ color: theme.accentColor, fontSize: 11, marginTop: 4 }}>
            子对话继承母对话的系统设定，如需修改请在母对话中编辑
          </Text>
        )}
        {/* 额外系统设定 - 仅分享卡片且有隐藏时显示 */}
        {isSharedCard && cardHideFlags?.systemPrompt && (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.sectionTitle, { color: theme.textColor, fontSize: 13 }]}>
              额外系统设定
            </Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginBottom: 6 }}>
              原系统设定被隐藏，你可以在此添加额外的设定内容，将追加到系统设定之后
            </Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 120 }]}
              value={extraSystemPrompt}
              onChangeText={onExtraSystemPromptChange}
              placeholder="在此添加额外的系统设定..."
              placeholderTextColor={theme.subTextColor}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>
        )}
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>用户人设（你扮演的角色）</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={settings.userPersona}
          onChangeText={(text) => updateSetting('userPersona', text)}
          placeholder="描述你（用户）扮演的角色设定，包括背景、性格、技能等..."
          placeholderTextColor={theme.subTextColor}
          multiline
          numberOfLines={4}
        />
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>
          此设定描述的是你（用户）的角色，AI会以此理解你的身份。AI会保持自己的角色设定，不会混淆。
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>AI 输出前置词</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={settings.prePrompt || ''}
          onChangeText={(text) => updateSetting('prePrompt', text)}
          placeholder="要求 AI 的回复以这段内容开头..."
          placeholderTextColor={theme.subTextColor}
          multiline
          numberOfLines={3}
        />
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>
          会在系统提示里要求 AI 的回复以这段内容开头
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>AI 输出后置词</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={settings.postPrompt || ''}
          onChangeText={(text) => updateSetting('postPrompt', text)}
          placeholder="要求 AI 的回复以这段内容结尾..."
          placeholderTextColor={theme.subTextColor}
          multiline
          numberOfLines={3}
        />
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>
          会在系统提示里要求 AI 的回复以这段内容结尾
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>用户输出前置词</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={settings.userPrePrompt || ''}
          onChangeText={(text) => updateSetting('userPrePrompt', text)}
          placeholder="在用户消息前自动拼接的内容..."
          placeholderTextColor={theme.subTextColor}
          multiline
          numberOfLines={3}
        />
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>
          发送消息时，会自动在你的消息前面拼接这段内容
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>用户输出后置词</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={settings.userPostPrompt || ''}
          onChangeText={(text) => updateSetting('userPostPrompt', text)}
          placeholder="在用户消息后自动拼接的内容..."
          placeholderTextColor={theme.subTextColor}
          multiline
          numberOfLines={3}
        />
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>
          发送消息时，会自动在你的消息后面拼接这段内容
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textColor, marginBottom: 0 }]}>屏蔽词</Text>
        </View>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={(settings.blockWords || []).join('\n')}
          onChangeText={(text) => updateSetting('blockWords', text.split('\n').filter(w => w.trim()))}
          placeholder="每行一个屏蔽词..."
          placeholderTextColor={theme.subTextColor}
          multiline
          numberOfLines={4}
        />
        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>
          当用户输入包含这些词语时，会阻止消息发送
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textColor }}>启用开场白</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
              创建子对话时自动发送一段开场消息
            </Text>
          </View>
          <Switch
            value={settings.greetingEnabled ?? false}
            onValueChange={(val) => updateSetting('greetingEnabled', val)}
            trackColor={{ false: theme.borderColor, true: theme.accentColor }}
          />
        </View>
        {settings.greetingEnabled && (
          <TextInput
            style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor, marginTop: 8 }]}
            value={settings.greeting || ''}
            onChangeText={(text) => updateSetting('greeting', text)}
            placeholder="输入开场白内容..."
            placeholderTextColor={theme.subTextColor}
            multiline
            numberOfLines={4}
          />
        )}
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textColor, marginBottom: 0 }]}>内置 CSS</Text>
          <TouchableOpacity
            style={[styles.addRegexBtn, { backgroundColor: theme.accentColor }]}
            onPress={openAddCSS}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>+ 新建</Text>
          </TouchableOpacity>
        </View>

        {/* CSS 导入导出 横条 */}
        <View
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            backgroundColor: theme.primaryColor,
            borderWidth: 1,
            borderColor: theme.borderColor,
          }}
        >
          <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
            CSS 导入导出
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <TouchableOpacity
              onPress={handleExportAllCSS}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: theme.accentColor + '15',
                borderWidth: 1,
                borderColor: theme.accentColor + '60',
              }}
            >
              <IconExport size={14} color={theme.accentColor} />
              <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                导出全部
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleImportCSSFile}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: theme.accentColor + '15',
                borderWidth: 1,
                borderColor: theme.accentColor + '60',
              }}
            >
              <IconImport size={14} color={theme.accentColor} />
              <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                文件导入
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleImportCSSClipboard}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: theme.accentColor + '15',
                borderWidth: 1,
                borderColor: theme.accentColor + '60',
              }}
            >
              <IconCopy size={14} color={theme.accentColor} />
              <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                剪贴板导入
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {cssEntries.length === 0 ? (
          <Text style={{ color: theme.subTextColor, fontSize: 12, paddingVertical: 12, textAlign: 'center' }}>
            暂无 CSS 条目，点击右上角新建
          </Text>
        ) : (
          <View style={{ marginTop: 8, gap: 6 }}>
            {cssEntries.map((entry) => (
              <View
                key={entry.id}
                style={[
                  styles.regexItem,
                  {
                    backgroundColor: entry.enabled ? theme.secondaryColor : theme.inputBgColor + '50',
                    borderColor: theme.borderColor,
                    opacity: entry.enabled ? 1 : 0.6,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.regexItemMain}
                  onPress={() => openEditCSS(entry)}
                  onLongPress={() => {
                    Alert.alert(entry.name, undefined, [
                      {
                        text: '导出此条',
                        onPress: () => handleExportOneCSS(entry),
                      },
                      { text: '删除', style: 'destructive', onPress: () => deleteCSS(entry.id) },
                      { text: '取消', style: 'cancel', onPress: () => {} },
                    ]);
                  }}
                  delayLongPress={500}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.regexItemHeader}>
                      <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                        {entry.name}
                      </Text>
                      <Text style={{ color: theme.subTextColor, fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: theme.inputBgColor }}>
                        {entry.scope === 'message' ? '消息' : '全局'}
                      </Text>
                    </View>
                    <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4, fontFamily: 'monospace' }} numberOfLines={1}>
                      {entry.css.substring(0, 60) || '(空)'}
                    </Text>
                  </View>
                </TouchableOpacity>
                <Switch
                  value={entry.enabled}
                  onValueChange={() => toggleCSS(entry.id)}
                  trackColor={{ false: theme.borderColor, true: theme.accentColor }}
                  style={{ transform: [{ scale: 0.8 }] }}
                />
              </View>
            ))}
          </View>
        )}

        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 8 }}>
          添加独立的 CSS 样式条目。「消息」作用于 AI 消息渲染区域，「全局」独立渲染于对话界面。长按可删除。
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textColor, marginBottom: 0 }]}>正则替换</Text>
          <TouchableOpacity
            style={[styles.addRegexBtn, { backgroundColor: theme.accentColor }]}
            onPress={openAddRegex}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>+ 新建</Text>
          </TouchableOpacity>
        </View>

        {/* 正则导入导出 横条 */}
        <View
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            backgroundColor: theme.primaryColor,
            borderWidth: 1,
            borderColor: theme.borderColor,
          }}
        >
          <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>
            正则导入导出
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <TouchableOpacity
              onPress={handleExportAllRegex}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: theme.accentColor + '15',
                borderWidth: 1,
                borderColor: theme.accentColor + '60',
              }}
            >
              <IconExport size={14} color={theme.accentColor} />
              <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                导出全部
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleImportRegexFile}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: theme.accentColor + '15',
                borderWidth: 1,
                borderColor: theme.accentColor + '60',
              }}
            >
              <IconImport size={14} color={theme.accentColor} />
              <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                文件导入
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleImportRegexClipboard}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: theme.accentColor + '15',
                borderWidth: 1,
                borderColor: theme.accentColor + '60',
              }}
            >
              <IconCopy size={14} color={theme.accentColor} />
              <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>
                剪贴板导入
              </Text>
            </TouchableOpacity>
            {/* 界面指令触发词：不依赖模型配合的兜底方案 */}
            <TouchableOpacity
              onPress={handleInstallDirectivePresets}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: theme.primaryColor,
                borderWidth: 1,
                borderColor: theme.borderColor,
              }}
            >
              <IconBolt size={14} color={theme.textColor} />
              <Text style={{ color: theme.textColor, fontSize: 12, fontWeight: '600' }}>
                一键添加界面指令触发词
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {sortedRegexRules.length === 0 ? (
          <Text style={{ color: theme.subTextColor, fontSize: 12, paddingVertical: 12, textAlign: 'center' }}>
            暂无正则规则，点击右上角新建
          </Text>
        ) : (
          <View style={{ marginTop: 8, gap: 6 }}>
            {sortedRegexRules.map((rule, index) => (
              <View
                key={rule.id}
                style={[
                  styles.regexItem,
                  {
                    backgroundColor: rule.enabled ? theme.secondaryColor : theme.inputBgColor + '50',
                    borderColor: theme.borderColor,
                    opacity: rule.enabled ? 1 : 0.6,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.regexItemMain}
                  onPress={() => openEditRegex(rule)}
                  onLongPress={() => {
                    const btns: { text: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive' }[] = [];
                    if (index > 0) btns.push({ text: '上移', onPress: () => moveRegex(rule.id, 'up') });
                    if (index < sortedRegexRules.length - 1) btns.push({ text: '下移', onPress: () => moveRegex(rule.id, 'down') });
                    btns.push({ text: '导出此条', onPress: () => handleExportOneRegex(rule) });
                    btns.push({ text: '删除', style: 'destructive', onPress: () => deleteRegex(rule.id) });
                    btns.push({ text: '取消', style: 'cancel', onPress: () => {} });
                    Alert.alert(rule.name, undefined, btns);
                  }}
                  delayLongPress={500}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.regexItemHeader}>
                      <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                        {rule.name}
                      </Text>
                      <Text style={{ color: theme.subTextColor, fontSize: 10, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: theme.inputBgColor }}>
                        {rule.scope === 'input' ? '输入' : rule.scope === 'output' ? '输出' : '全部'}
                      </Text>
                    </View>
                    <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4, fontFamily: 'monospace' }} numberOfLines={1}>
                      /{rule.pattern}/g
                    </Text>
                  </View>
                </TouchableOpacity>
                <Switch
                  value={rule.enabled}
                  onValueChange={() => toggleRegexEnabled(rule.id)}
                  trackColor={{ false: theme.borderColor, true: theme.accentColor }}
                  style={{ transform: [{ scale: 0.8 }] }}
                />
              </View>
            ))}
          </View>
        )}

        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 8 }}>
          支持多条正则表达式替换，按顺序执行。长按规则可调整顺序或删除。
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>上下文记忆</Text>

        {/* 记忆条数快捷预设 */}
        <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500', marginTop: 8 }}>记忆条数</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 10 }}>
          {[5, 10, 20, 30, 50, 80, 100, 200, 500].map((n) => (
            <TouchableOpacity
              key={n}
              style={[
                styles.presetChip,
                {
                  backgroundColor: settings.memoryLength === n ? theme.accentColor : theme.secondaryColor,
                  borderColor: theme.borderColor,
                },
              ]}
              onPress={() => updateSetting('memoryLength', n)}
            >
              <Text style={{ color: settings.memoryLength === n ? '#fff' : theme.textColor, fontSize: 12, fontWeight: '600' }}>
                {n}条
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 细调旋钮 */}
        <View style={[styles.counterRow, { marginTop: 4, marginBottom: 12 }]}>
          <TouchableOpacity
            style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, borderWidth: 1, borderColor: theme.borderColor }]}
            onPress={() => updateSetting('memoryLength', Math.max(1, settings.memoryLength - 1))}
          >
            <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: '700' }}>-</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textColor, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
              {settings.memoryLength}
            </Text>
            <Text style={{ color: theme.subTextColor, fontSize: 10, textAlign: 'center' }}>条历史消息</Text>
          </View>
          <TouchableOpacity
            style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, borderWidth: 1, borderColor: theme.borderColor }]}
            onPress={() => updateSetting('memoryLength', settings.memoryLength + 1)}
          >
            <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: '700' }}>+</Text>
          </TouchableOpacity>
        </View>

        {/* 直接输入 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Text style={{ color: theme.subTextColor, fontSize: 12 }}>自定义:</Text>
          <TextInput
            style={[
              styles.smallInput,
              { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor },
            ]}
            value={String(settings.memoryLength)}
            onChangeText={(t) => {
              const n = parseInt(t.replace(/\D/g, ''), 10);
              if (!isNaN(n) && n >= 1) updateSetting('memoryLength', Math.min(10000, n));
            }}
            keyboardType="number-pad"
            placeholder="自定义条数"
            placeholderTextColor={theme.subTextColor}
          />
          <TouchableOpacity
            style={[styles.quickBtn, { backgroundColor: theme.accentColor }]}
            onPress={() => updateSetting('memoryLength', 10000)}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>全部</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2, marginBottom: 4 }}>
          💡 只发送最近 {settings.memoryLength} 条用户/AI 消息给模型（不包含系统提示）。数值越大，AI记得的上下文越多，但越容易超 token 限制。
        </Text>

        {/* 对话预测设置 */}
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.borderColor }}>
          <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '600' }}>对话预测</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: theme.textColor, fontSize: 12 }}>收到消息后预测对话走向</Text>
            <Switch
              value={settings.predictionConfig?.enabled ?? true}
              onValueChange={(v) =>
                updateSetting('predictionConfig', {
                  ...(settings.predictionConfig || { mode: 'per_turn', maxMessages: 3, prompt: '' }),
                  enabled: v,
                })
              }
            />
          </View>
          <View style={[styles.counterRow, { marginTop: 8, marginBottom: 8 }]}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, borderWidth: 1, borderColor: theme.borderColor }]}
              onPress={() =>
                updateSetting('predictionConfig', {
                  ...(settings.predictionConfig || { enabled: true, mode: 'per_turn', prompt: '' }),
                  maxMessages: Math.max(1, (settings.predictionConfig?.maxMessages ?? 3) - 1),
                })
              }
            >
              <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: '700' }}>-</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textColor, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
                {settings.predictionConfig?.maxMessages ?? 3}
              </Text>
              <Text style={{ color: theme.subTextColor, fontSize: 10, textAlign: 'center' }}>AI 最多发送条数</Text>
            </View>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, borderWidth: 1, borderColor: theme.borderColor }]}
              onPress={() =>
                updateSetting('predictionConfig', {
                  ...(settings.predictionConfig || { enabled: true, mode: 'per_turn', prompt: '' }),
                  maxMessages: (settings.predictionConfig?.maxMessages ?? 3) + 1,
                })
              }
            >
              <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: '700' }}>+</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
            💡 用户说一句话，AI 先预测关键词和剧情走向，再按预测连续回复（最多这么多条）。
          </Text>
        </View>

        {(() => {
          const textProvider = providers.find(p => p.id === settings.textProviderId);
          const contextUsage = aiService.calculateContextTokenUsage(messages, settings.systemPrompt);
          const modelLimit = aiService.getModelContextLimit(textProvider, settings.textModelId);
          const usagePercent = Math.min(100, (contextUsage.estimatedTokens / modelLimit) * 100);
          const isNearLimit = usagePercent >= 80;
          const isOverLimit = usagePercent >= 100;
          const barColor = isOverLimit ? '#ff4444' : isNearLimit ? '#ffaa00' : theme.accentColor;
          
          return (
            <View style={{ marginTop: 12, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500' }}>
                  上下文使用情况
                </Text>
                <Text style={{ 
                  color: isOverLimit ? '#ff4444' : isNearLimit ? '#ffaa00' : theme.subTextColor, 
                  fontSize: 12,
                  fontWeight: '500'
                }}>
                  ~{contextUsage.estimatedTokens.toLocaleString()} / {modelLimit.toLocaleString()} tokens
                </Text>
              </View>
              <View style={{ 
                height: 8, 
                backgroundColor: theme.secondaryColor, 
                borderRadius: 4,
                overflow: 'hidden'
              }}>
                <View style={{ 
                  height: '100%', 
                  width: `${usagePercent}%`, 
                  backgroundColor: barColor,
                  borderRadius: 4
                }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                  消息: {contextUsage.messageCount} 条
                </Text>
                <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                  字符: {contextUsage.totalChars.toLocaleString()}
                </Text>
                <Text style={{ color: isOverLimit ? '#ff4444' : isNearLimit ? '#ffaa00' : theme.subTextColor, fontSize: 11 }}>
                  {usagePercent.toFixed(1)}%
                </Text>
              </View>
              {isOverLimit && (
                <Text style={{ color: '#ff4444', fontSize: 11, marginTop: 6 }}>
                  ⚠️ 已超出模型上下文限制，可能导致对话质量下降或报错
                </Text>
              )}
              {isNearLimit && !isOverLimit && (
                <Text style={{ color: '#ffaa00', fontSize: 11, marginTop: 6 }}>
                  ⚠️ 即将达到上下文限制，建议开启自动总结
                </Text>
              )}
            </View>
          );
        })()}

        <View style={styles.row}>
          <Text style={{ color: theme.textColor }}>流式输出</Text>
          <Switch
            value={settings.streamOutput}
            onValueChange={(val) => updateSetting('streamOutput', val)}
            trackColor={{ false: theme.borderColor, true: theme.accentColor }}
          />
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textColor }}>粘贴长文本为文件</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
              粘贴超过500字的文本时自动转为文件发送
            </Text>
          </View>
          <Switch
            value={!!settings.pasteLongTextAsFile}
            onValueChange={(val) => updateSetting('pasteLongTextAsFile', val)}
            trackColor={{ false: theme.borderColor, true: theme.accentColor }}
          />
        </View>
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>总结设置</Text>
        <View style={styles.row}>
          <Text style={{ color: theme.textColor }}>自动总结</Text>
          <Switch
            value={settings.autoSummarize}
            onValueChange={(val) => updateSetting('autoSummarize', val)}
            trackColor={{ false: theme.borderColor, true: theme.accentColor }}
          />
        </View>

        {settings.autoSummarize && (
          <>
            <TouchableOpacity
              style={[styles.providerRow, { borderBottomColor: theme.borderColor }]}
              onPress={() => openProviderSelector('summary')}
            >
              <View style={{ flex: 1, paddingVertical: 4 }}>
                <Text style={{ color: theme.textColor }}>总结AI模型</Text>
                {getSelectedProviderName('summary') === '未设置' && (
                  <Text style={{ color: '#ff6b6b', fontSize: 11, marginTop: 2 }}>⚠️ 未设置总结AI将使用对话AI代替</Text>
                )}
              </View>
              <View style={styles.providerRowRight}>
                <Text style={{ color: theme.subTextColor, fontSize: 12, marginRight: 4 }}>
                  {getSelectedProviderName('summary')}
                </Text>
                <Text style={{ color: theme.subTextColor }}>{'>'}</Text>
              </View>
            </TouchableOpacity>

            <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500', marginTop: 8 }}>触发阈值 (消息数)</Text>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2, marginBottom: 6 }}>
              消息数量达到此值时，将压缩旧消息为总结并保留最近的条数
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {[5, 10, 20, 30, 50, 80, 100, 200].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: (settings.autoSummarizeThreshold || 10) === n ? theme.accentColor : theme.secondaryColor,
                      borderColor: theme.borderColor,
                    },
                  ]}
                  onPress={() => updateSetting('autoSummarizeThreshold', n)}
                >
                  <Text style={{ color: (settings.autoSummarizeThreshold || 10) === n ? '#fff' : theme.textColor, fontSize: 12, fontWeight: '600' }}>
                    {n}条
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.counterRow, { marginBottom: 10 }]}>
              <TouchableOpacity
                style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, borderWidth: 1, borderColor: theme.borderColor }]}
                onPress={() => updateSetting('autoSummarizeThreshold', Math.max(2, (settings.autoSummarizeThreshold || 10) - 1))}
              >
                <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '700' }}>-</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textColor, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
                  {settings.autoSummarizeThreshold || 10}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.counterBtn, { backgroundColor: theme.secondaryColor, borderWidth: 1, borderColor: theme.borderColor }]}
                onPress={() => updateSetting('autoSummarizeThreshold', (settings.autoSummarizeThreshold || 10) + 1)}
              >
                <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '700' }}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: theme.subTextColor, marginTop: 4 }]}>总结指令</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
              value={settings.summaryPrompt}
              onChangeText={(text) => updateSetting('summaryPrompt', text)}
              placeholder="请简洁地总结以下对话内容，保留关键信息和角色设定..."
              placeholderTextColor={theme.subTextColor}
              multiline
              numberOfLines={3}
            />
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 8 }}>
              ⚡ 开启后：每次对话后检查消息条数，超过阈值时自动压缩最早的消息为总结，历史总结会作为上下文注入到下一次请求中。
            </Text>
          </>
        )}
      </View>

      <View style={[styles.section, { borderBottomColor: theme.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: theme.textColor }]}>生图设置</Text>
        <View style={styles.row}>
          <Text style={{ color: theme.textColor }}>自动关键词生图</Text>
          <Switch
            value={settings.autoImageGeneration}
            onValueChange={(val) => updateSetting('autoImageGeneration', val)}
            trackColor={{ false: theme.borderColor, true: theme.accentColor }}
          />
        </View>

        <View style={styles.row}>
          <Text style={{ color: theme.textColor }}>发送图片到上下文</Text>
          <Switch
            value={settings.sendImagesInContext}
            onValueChange={(val) => updateSetting('sendImagesInContext', val)}
            trackColor={{ false: theme.borderColor, true: theme.accentColor }}
          />
        </View>

        <View style={styles.row}>
          <Text style={{ color: theme.textColor }}>单次最多发送图片</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateSetting('maxImagesPerMessage', Math.max(1, settings.maxImagesPerMessage - 1))}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 30, textAlign: 'center' }}>
              {settings.maxImagesPerMessage}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateSetting('maxImagesPerMessage', settings.maxImagesPerMessage + 1)}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={{ color: theme.textColor }}>图片历史数量</Text>
          <View style={styles.counterRow}>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateSetting('imageHistoryCount', Math.max(0, settings.imageHistoryCount - 1))}
            >
              <Text style={{ color: theme.textColor }}>-</Text>
            </TouchableOpacity>
            <Text style={{ color: theme.textColor, minWidth: 30, textAlign: 'center' }}>
              {settings.imageHistoryCount}
            </Text>
            <TouchableOpacity
              style={[styles.counterBtn, { backgroundColor: theme.secondaryColor }]}
              onPress={() => updateSetting('imageHistoryCount', settings.imageHistoryCount + 1)}
            >
              <Text style={{ color: theme.textColor }}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.label, { color: theme.subTextColor, marginTop: 8 }]}>生图提示词前置</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
          value={settings.imageGenerationPrompt}
          onChangeText={(text) => updateSetting('imageGenerationPrompt', text)}
          placeholder="生图前置提示词..."
          placeholderTextColor={theme.subTextColor}
          multiline
          numberOfLines={2}
        />
      </View>

      <View style={{ height: insets.bottom + 20 }} />

      <ModelSelector
        visible={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        providers={providers}
        selectedModelId={getCurrentModel(providerType)?.id}
        selectedProviderId={getProvider(providerType)?.id}
        onSelect={(provider, model) => handleSelectModel(providerType, provider, model)}
        capabilityFilter={providerType}
        title={`选择${typeLabels[providerType]}`}
      />

      <Modal
        visible={showCSSEditor}
        animationType="slide"
        onRequestClose={() => setShowCSSEditor(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.backgroundColor }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.fullModal, { backgroundColor: theme.backgroundColor }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 30) + 12 }]}>
              <TouchableOpacity onPress={() => setShowCSSEditor(false)}>
                <Text style={{ color: theme.subTextColor }}>取消</Text>
              </TouchableOpacity>
              <Text style={[styles.modalHeaderTitle, { color: theme.textColor }]}>
                {editingCSS ? '编辑 CSS' : '新建 CSS'}
              </Text>
              <TouchableOpacity onPress={saveCSS}>
                <Text style={{ color: theme.accentColor, fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
              <Text style={[styles.label, { color: theme.subTextColor }]}>名称</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 44 }]}
                value={cssForm.name}
                onChangeText={(text) => setCssForm({ ...cssForm, name: text })}
                placeholder="CSS 条目名称"
                placeholderTextColor={theme.subTextColor}
              />

              <Text style={[styles.label, { color: theme.subTextColor, marginTop: 16 }]}>作用范围</Text>
              <View style={styles.segmentedControl}>
                {(['message', 'global'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.segmentBtn,
                      cssForm.scope === s && { backgroundColor: theme.accentColor },
                    ]}
                    onPress={() => setCssForm({ ...cssForm, scope: s })}
                  >
                    <Text style={{ color: cssForm.scope === s ? '#fff' : theme.subTextColor, fontSize: 13 }}>
                      {s === 'message' ? '消息样式' : '全局样式'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 4 }}>
                {cssForm.scope === 'message'
                  ? '注入每条 AI 消息的渲染区域，能直接改气泡里的文字/表格/代码块样式'
                  : '独立覆盖层。只写 CSS 时作为样式层；若含 HTML/JS，会开一个可交互渲染层，可用 window.Aurora 操控界面（发消息/切背景/开面板）'}
              </Text>

              <Text style={[styles.label, { color: theme.subTextColor, marginTop: 16 }]}>CSS 内容</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor, fontFamily: 'monospace', minHeight: 200, textAlignVertical: 'top', fontSize: 13 }]}
                value={cssForm.css}
                onChangeText={(text) => setCssForm({ ...cssForm, css: text })}
                placeholder={
                  cssForm.scope === 'message'
                    ? '/* 例：改 AI 气泡里的样式 */\n.aurora-bubble, p { line-height: 1.9; }'
                    : '/* 例：全局覆盖层，可含 HTML/JS */\n<style>.my-fab{position:fixed;right:16px;bottom:90px}</style>\n<div class="my-fab" onclick="Aurora.scrollToBottom()">↓</div>'
                }
                placeholderTextColor={theme.subTextColor}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showStatusBarEditor}
        animationType="slide"
        onRequestClose={() => setShowStatusBarEditor(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.backgroundColor }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.fullModal, { backgroundColor: theme.backgroundColor }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 30) + 12 }]}>
              <TouchableOpacity onPress={() => setShowStatusBarEditor(false)}>
                <Text style={{ color: theme.subTextColor }}>取消</Text>
              </TouchableOpacity>
              <Text style={[styles.modalHeaderTitle, { color: theme.textColor }]}>配置状态栏</Text>
              <TouchableOpacity onPress={saveStatusBar}>
                <Text style={{ color: theme.accentColor, fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
            <View style={styles.row}>
              <Text style={{ color: theme.textColor }}>位置</Text>
              <View style={styles.segmentedControl}>
                {(['top', 'bottom'] as const).map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.segmentBtn,
                      {
                        backgroundColor: statusBarForm.position === p ? theme.accentColor : theme.secondaryColor,
                      },
                    ]}
                    onPress={() => setStatusBarForm({ ...statusBarForm, position: p })}
                  >
                    <Text style={{ color: statusBarForm.position === p ? theme.buttonTextColor : theme.textColor, fontSize: 12 }}>
                      {p === 'top' ? '顶部' : '底部'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <Text style={{ color: theme.textColor }}>样式</Text>
              <View style={styles.segmentedControl}>
                {(['inline', 'bar', 'compact', 'full'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.segmentBtn,
                      {
                        backgroundColor: statusBarForm.style === s ? theme.accentColor : theme.secondaryColor,
                      },
                    ]}
                    onPress={() => setStatusBarForm({ ...statusBarForm, style: s })}
                  >
                    <Text style={{ color: statusBarForm.style === s ? theme.buttonTextColor : theme.textColor, fontSize: 12 }}>
                      {s === 'inline' ? '单行' : s === 'bar' ? '标准' : s === 'compact' ? '紧凑' : '完整'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <Text style={{ color: theme.textColor }}>动画</Text>
              <View style={styles.segmentedControl}>
                {(['none', 'breathing', 'pulse'] as const).map((a) => (
                  <TouchableOpacity
                    key={a}
                    style={[
                      styles.segmentBtn,
                      {
                        backgroundColor: statusBarForm.animation === a ? theme.accentColor : theme.secondaryColor,
                      },
                    ]}
                    onPress={() => setStatusBarForm({ ...statusBarForm, animation: a })}
                  >
                    <Text style={{ color: statusBarForm.animation === a ? theme.buttonTextColor : theme.textColor, fontSize: 12 }}>
                      {a === 'none' ? '无' : a === 'breathing' ? '呼吸' : '脉冲'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.sectionHeader, { marginTop: 16 }]}>
              <Text style={[styles.sectionTitle, { color: theme.textColor, marginBottom: 0 }]}>
                状态变量 ({statusBarForm.vars.length})
              </Text>
              <TouchableOpacity
                style={[styles.smallBtn, { backgroundColor: theme.accentColor }]}
                onPress={openAddVar}
              >
                <Text style={{ color: theme.buttonTextColor, fontSize: 12 }}>+ 添加</Text>
              </TouchableOpacity>
            </View>

            {statusBarForm.vars.length === 0 ? (
              <Text style={{ color: theme.subTextColor, fontSize: 12, paddingVertical: 8 }}>
                暂无变量，点击上方按钮添加
              </Text>
            ) : (
              <View style={{ gap: 8, marginTop: 8 }}>
                {statusBarForm.vars.map((v, idx) => (
                  <TouchableOpacity
                    key={`${v.name}_${idx}`}
                    style={[styles.varItem, { backgroundColor: theme.secondaryColor }]}
                    onPress={() => openEditVar(idx)}
                    onLongPress={() => {
                      Alert.alert('删除变量', `确定删除"${v.label}"吗？`, [
                        { text: '取消', style: 'cancel' },
                        { text: '删除', style: 'destructive', onPress: () => deleteVar(idx) },
                      ]);
                    }}
                    delayLongPress={500}
                  >
                    <Text style={{ fontSize: 16, marginRight: 6 }}>{v.icon || '📊'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.textColor, fontWeight: '500' }}>{v.label}</Text>
                      <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                        {v.name} · {v.type} · {v.value}
                      </Text>
                    </View>
                    <Text style={{ color: theme.subTextColor }}>{'>'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {editingVarIndex !== null && (
              <View style={[styles.varEditForm, { backgroundColor: theme.secondaryColor, marginTop: 16 }]}>
                <Text style={[styles.sectionTitle, { color: theme.textColor, marginBottom: 12 }]}>
                  {editingVarIndex === -1 ? '添加变量' : '编辑变量'}
                </Text>
                <Text style={[styles.label, { color: theme.textColor }]}>变量名 (英文)</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                  value={varForm.name}
                  onChangeText={(text) => setVarForm({ ...varForm, name: text })}
                  placeholder="例如：hp, mood"
                  placeholderTextColor={theme.subTextColor}
                />
                <Text style={[styles.label, { color: theme.textColor }]}>显示名称</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                  value={varForm.label}
                  onChangeText={(text) => setVarForm({ ...varForm, label: text })}
                  placeholder="例如：生命值"
                  placeholderTextColor={theme.subTextColor}
                />
                <Text style={[styles.label, { color: theme.textColor }]}>类型</Text>
                <View style={styles.segmentedControl}>
                  {(['progress', 'number', 'string'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.segmentBtn,
                        {
                          backgroundColor: varForm.type === t ? theme.accentColor : theme.secondaryColor,
                        },
                      ]}
                      onPress={() => setVarForm({ ...varForm, type: t })}
                    >
                      <Text style={{ color: varForm.type === t ? theme.buttonTextColor : theme.textColor, fontSize: 12 }}>
                        {t === 'progress' ? '进度条' : t === 'number' ? '数值' : '文字'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.label, { color: theme.textColor }]}>初始值</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                  value={varForm.value}
                  onChangeText={(text) => setVarForm({ ...varForm, value: text })}
                  placeholder={varForm.type === 'string' ? '输入文字' : '输入数字'}
                  placeholderTextColor={theme.subTextColor}
                  keyboardType={varForm.type === 'string' ? 'default' : 'numeric'}
                />
                {varForm.type === 'progress' && (
                  <>
                    <Text style={[styles.label, { color: theme.textColor }]}>最小值</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                      value={varForm.min}
                      onChangeText={(text) => setVarForm({ ...varForm, min: text })}
                      placeholder="0"
                      placeholderTextColor={theme.subTextColor}
                      keyboardType="numeric"
                    />
                    <Text style={[styles.label, { color: theme.textColor }]}>最大值</Text>
                    <TextInput
                      style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                      value={varForm.max}
                      onChangeText={(text) => setVarForm({ ...varForm, max: text })}
                      placeholder="100"
                      placeholderTextColor={theme.subTextColor}
                      keyboardType="numeric"
                    />
                  </>
                )}
                <Text style={[styles.label, { color: theme.textColor }]}>图标 (emoji)</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                  value={varForm.icon}
                  onChangeText={(text) => setVarForm({ ...varForm, icon: text })}
                  placeholder="❤️ 😊 ⚡"
                  placeholderTextColor={theme.subTextColor}
                />
                <Text style={[styles.label, { color: theme.textColor }]}>颜色 (HEX，可选)</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
                  value={varForm.color}
                  onChangeText={(text) => setVarForm({ ...varForm, color: text })}
                  placeholder="#ff6b6b 或留空用主题色"
                  placeholderTextColor={theme.subTextColor}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: theme.secondaryColor, flex: 1 }]}
                    onPress={() => setEditingVarIndex(null)}
                  >
                    <Text style={{ color: theme.textColor }}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: theme.accentColor, flex: 1 }]}
                    onPress={saveVar}
                  >
                    <Text style={{ color: theme.buttonTextColor }}>保存</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showRegexEditor}
        animationType="slide"
        onRequestClose={() => setShowRegexEditor(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.backgroundColor }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.fullModal, { backgroundColor: theme.backgroundColor }]}>
            <View style={[styles.modalHeader, { borderBottomColor: theme.borderColor, paddingTop: Math.max(insets.top, 30) + 12 }]}>
              <TouchableOpacity onPress={() => setShowRegexEditor(false)}>
                <Text style={{ color: theme.subTextColor }}>取消</Text>
              </TouchableOpacity>
              <Text style={[styles.modalHeaderTitle, { color: theme.textColor }]}>
                {editingRegex ? '编辑正则' : '新建正则'}
              </Text>
              <TouchableOpacity onPress={saveRegex}>
                <Text style={{ color: theme.accentColor, fontWeight: '600' }}>保存</Text>
              </TouchableOpacity>
            </View>

          <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.label, { color: theme.textColor }]}>名称</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: theme.inputBgColor, color: theme.textColor }]}
              value={regexForm.name}
              onChangeText={(text) => setRegexForm({ ...regexForm, name: text })}
              placeholder="例如：隐藏思维链"
              placeholderTextColor={theme.subTextColor}
            />

            <Text style={[styles.label, { color: theme.textColor, marginTop: 12 }]}>作用范围</Text>
            <View style={styles.segmentedControl}>
              {(['input', 'output', 'both'] as const).map((scope) => (
                <TouchableOpacity
                  key={scope}
                  style={[
                    styles.segmentBtn,
                    {
                      backgroundColor: regexForm.scope === scope ? theme.accentColor : theme.secondaryColor,
                    },
                  ]}
                  onPress={() => setRegexForm({ ...regexForm, scope })}
                >
                  <Text style={{ color: regexForm.scope === scope ? theme.buttonTextColor : theme.textColor, fontSize: 12 }}>
                    {scope === 'input' ? '用户输入' : scope === 'output' ? 'AI输出' : '全部'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: theme.textColor, marginTop: 12 }]}>匹配正则</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 100 }]}
              value={regexForm.pattern}
              onChangeText={(text) => setRegexForm({ ...regexForm, pattern: text })}
              placeholder="例如：&lt;thinking&gt;.*?&lt;/thinking&gt;"
              placeholderTextColor={theme.subTextColor}
              multiline
              numberOfLines={4}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />

            <Text style={[styles.label, { color: theme.textColor, marginTop: 12 }]}>替换为</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: theme.inputBgColor, color: theme.textColor, minHeight: 100 }]}
              value={regexForm.replacement}
              onChangeText={(text) => setRegexForm({ ...regexForm, replacement: text })}
              placeholder="例如：空字符串（留空则删除匹配内容）"
              placeholderTextColor={theme.subTextColor}
              multiline
              numberOfLines={4}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />

            <View style={{ marginTop: 16, padding: 12, backgroundColor: theme.secondaryColor, borderRadius: 8 }}>
              <Text style={{ color: theme.textColor, fontSize: 13, fontWeight: '500', marginBottom: 6 }}>提示</Text>
              <Text style={{ color: theme.subTextColor, fontSize: 12, lineHeight: 18 }}>
                {'\u2022'} 支持 JavaScript 正则表达式语法{'\n'}
                {'\u2022'} 使用 $1, $2 等引用捕获组{'\n'}
                {'\u2022'} 替换内容留空表示删除匹配的文本{'\n'}
                {'\u2022'} 多条正则按列表顺序依次执行
              </Text>
            </View>
          </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  counterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallInput: {
    flex: 1,
    minWidth: 80,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  quickBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textArea: {
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    minHeight: 96,
    // 多行输入框必须封顶：系统提示这类内容很长，不封顶会撑满整屏、按钮点不到
    maxHeight: 240,
  },
  addRegexBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  regexItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  regexItemMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  regexItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wallpaperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wallpaperPreview: {
    position: 'relative',
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  wallpaperImage: {
    width: '100%',
    height: '100%',
  },
  removeWallpaperBtn: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 2,
  },
  wallpaperBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  avatarRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  avatarItem: {
    flex: 1,
    alignItems: 'center',
  },
  avatarLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  avatarPreviewContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    marginBottom: 8,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
  },
  avatarActions: {
    flexDirection: 'row',
    gap: 6,
  },
  avatarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  providerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  providerRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  worldBookTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  worldBookList: {
    gap: 8,
    marginTop: 4,
  },
  worldBookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  worldBookItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  worldBookIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  worldBookInfo: {
    flex: 1,
  },
  switchDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  worldBookTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: 150,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  providerItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullModal: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  textInput: {
    maxHeight: 240,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 48,
  },
  inputContainer: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  modalBtn: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  varItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
  },
  varEditForm: {
    borderRadius: 12,
    padding: 16,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  sliderInput: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  characterJumpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  characterJumpCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  characterJumpAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  characterJumpAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterJumpCardInfo: {
    flex: 1,
    marginLeft: 10,
  },
  characterJumpCardName: {
    fontSize: 14,
    fontWeight: '600',
  },
  characterJumpCardDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  characterJumpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
