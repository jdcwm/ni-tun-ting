import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import {
  normalizeCustomInterface,
  buildDefaultCustomInterface,
  CustomInterfaceConfig,
  DEFAULT_CUSTOM_INTERFACE_HTML,
  DEFAULT_CUSTOM_INTERFACE_CSS,
  DEFAULT_CUSTOM_INTERFACE_JS,
} from '../services/customInterface';
import { IconClose, IconRefresh, IconCopy, IconBook } from '../components/Icons';

interface Props {
  onClose: () => void;
  /** 打开规则文档（可选） */
  onOpenGuide?: () => void;
}

type TabKey = 'html' | 'css' | 'js' | 'splash' | 'sidebar' | 'floating';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'html', label: 'HTML' },
  { key: 'css', label: 'CSS' },
  { key: 'js', label: 'JS' },
  { key: 'splash', label: '启动页' },
  { key: 'sidebar', label: '侧边栏' },
  { key: 'floating', label: '悬浮窗' },
];

const HINTS: Record<TabKey, string> = {
  html:
    '界面结构。不要写 <!DOCTYPE>/<html>/<head>/<body>，App 会补外壳。\n' +
    '宿主元素：#aurora-chat-flow、#aurora-input、#aurora-send、#aurora-status-bar\n' +
    '素材引用：src="media://名字"（先在「素材库」导入）',
  css:
    '直接写 CSS。可用主题变量：var(--aurora-accent)、var(--aurora-text)、var(--aurora-border) 等。\n' +
    '改气泡：.aurora-msg .aurora-bubble { ... }；用户气泡：.aurora-msg.user .aurora-bubble',
  js:
    '这里能跑完整 JS（支持 <script>、多行、ES6，不像 MMD 只能塞进属性）。\n' +
    'API：Aurora.send / Aurora.appendToInput / Aurora.setVar / Aurora.setBackground /\n' +
    'Aurora.injectCss / Aurora.onState / Aurora.onChunk / Aurora.toggleSidebar / Aurora.openPanel',
  splash:
    '启动页 HTML。显示在主界面之上，splashDuration 毫秒后自动淡出（0 = 不自动消失，由你的代码控制）。',
  sidebar: '侧边栏 HTML，渲染在界面左侧区域。可用 Aurora.toggleSidebar() 开关 App 原生抽屉。',
  floating: '悬浮窗 HTML，渲染在最上层，适合放悬浮按钮与快捷面板。',
};

/**
 * 自定义界面编辑器。
 *
 * 这是「方案B」的入口：用户在这里写 HTML/CSS/JS，开启后主界面就由这些代码渲染，
 * 并通过 window.Aurora 反向驱动 App（发消息、改背景、注入样式…）。
 */
export const CustomInterfaceScreen: React.FC<Props> = ({ onClose, onOpenGuide }) => {
  const theme = useTheme();
  const { settings, setSettings } = useApp();
  const [tab, setTab] = useState<TabKey>('html');
  const [draft, setDraft] = useState<CustomInterfaceConfig>(() =>
    normalizeCustomInterface(settings.customInterface),
  );
  const [dirty, setDirty] = useState(false);

  // 外部设置变化时同步（例如导入数据后）
  useEffect(() => {
    setDraft(normalizeCustomInterface(settings.customInterface));
    setDirty(false);
  }, [settings.customInterface]);

  const patch = (p: Partial<CustomInterfaceConfig>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const handleSave = async () => {
    await setSettings({
      ...settings,
      customInterface: { ...draft, updatedAt: Date.now() },
    });
    setDirty(false);
    Alert.alert('已保存', draft.enabled ? '已启用自定义界面，返回对话即可看到效果' : '已保存（当前未启用）');
  };

  const handleReset = () => {
    Alert.alert('恢复默认模板', '会覆盖当前的 HTML/CSS/JS，确定吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '恢复',
        style: 'destructive',
        onPress: () => {
          const base = buildDefaultCustomInterface();
          setDraft((d) => ({ ...d, html: base.html, css: base.css, js: base.js }));
          setDirty(true);
        },
      },
    ]);
  };

  const handleCopyAll = async () => {
    const bundle = `<!-- HTML -->\n${draft.html}\n\n/* CSS */\n${draft.css}\n\n// JS\n${draft.js}`;
    await Clipboard.setStringAsync(bundle);
    Alert.alert('已复制', '当前 HTML/CSS/JS 已整段复制到剪贴板');
  };

  const currentValue = (): string => {
    switch (tab) {
      case 'html':
        return draft.html;
      case 'css':
        return draft.css;
      case 'js':
        return draft.js;
      case 'splash':
        return draft.splashHtml || '';
      case 'sidebar':
        return draft.sidebarHtml || '';
      case 'floating':
        return draft.floatingHtml || '';
    }
  };

  const setCurrentValue = (v: string) => {
    switch (tab) {
      case 'html':
        patch({ html: v });
        break;
      case 'css':
        patch({ css: v });
        break;
      case 'js':
        patch({ js: v });
        break;
      case 'splash':
        patch({ splashHtml: v });
        break;
      case 'sidebar':
        patch({ sidebarHtml: v });
        break;
      case 'floating':
        patch({ floatingHtml: v });
        break;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.backgroundColor }}>
      {/* 顶栏 */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor },
        ]}
      >
        <TouchableOpacity onPress={onClose} style={styles.hbtn}>
          <IconClose size={22} color={theme.textColor} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.textColor, fontSize: 17, fontWeight: '600' }}>自定义界面</Text>
          <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
            用 HTML/CSS/JS 完全接管主界面
          </Text>
        </View>
        {onOpenGuide && (
          <TouchableOpacity onPress={onOpenGuide} style={styles.hbtn}>
            <IconBook size={20} color={theme.textColor} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleCopyAll} style={styles.hbtn}>
          <IconCopy size={20} color={theme.textColor} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleReset} style={styles.hbtn}>
          <IconRefresh size={20} color={theme.textColor} />
        </TouchableOpacity>
      </View>

      {/* 启用开关 */}
      <View
        style={[
          styles.switchRow,
          { backgroundColor: theme.primaryColor, borderBottomColor: theme.borderColor },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.textColor, fontSize: 14, fontWeight: '600' }}>
            启用自定义界面
          </Text>
          <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}>
            关闭时使用 App 原生界面（更稳）
          </Text>
        </View>
        <Switch
          value={draft.enabled}
          onValueChange={(v) => patch({ enabled: v })}
          trackColor={{ true: theme.accentColor + '80', false: theme.borderColor }}
          thumbColor={draft.enabled ? theme.accentColor : '#fff'}
        />
      </View>

      {/* Tab */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        <View style={[styles.tabs, { borderBottomColor: theme.borderColor }]}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                styles.tab,
                tab === t.key && { borderBottomColor: theme.accentColor },
              ]}
            >
              <Text
                style={{
                  color: tab === t.key ? theme.accentColor : theme.textColor,
                  fontSize: 13,
                  fontWeight: tab === t.key ? '600' : '400',
                }}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* 提示 */}
      <View style={[styles.hint, { backgroundColor: theme.secondaryColor }]}>
        <Text style={{ color: theme.subTextColor, fontSize: 11, lineHeight: 17 }}>{HINTS[tab]}</Text>
      </View>

      {/* 编辑器 */}
      <TextInput
        value={currentValue()}
        onChangeText={setCurrentValue}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder={`在这里写 ${tab.toUpperCase()}…`}
        placeholderTextColor={theme.subTextColor}
        style={[
          styles.editor,
          {
            color: theme.textColor,
            backgroundColor: theme.inputBgColor,
            borderColor: theme.borderColor,
          },
        ]}
      />

      {/* 底部操作 */}
      <View style={[styles.footer, { borderTopColor: theme.borderColor, backgroundColor: theme.menuBgColor }]}>
        <Text style={{ color: theme.subTextColor, fontSize: 11, flex: 1 }}>
          {dirty ? '有未保存的修改' : '已保存'}
        </Text>
        <TouchableOpacity
          onPress={handleSave}
          style={[
            styles.saveBtn,
            { backgroundColor: dirty ? theme.accentColor : theme.secondaryColor },
          ]}
        >
          <Text style={{ color: dirty ? '#fff' : theme.textColor, fontSize: 14, fontWeight: '600' }}>
            保存
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 2,
  },
  hbtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  hint: { paddingHorizontal: 14, paddingVertical: 8 },
  editor: {
    flex: 1,
    margin: 12,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    fontFamily: 'monospace',
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    gap: 12,
  },
  saveBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
});
