import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { PromptPreset, PromptCategory } from '../types';
import { presetService } from '../services/presetService';
import { macroService } from '../services/macroService';
import { generateId } from '../constants/defaults';

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  persona: '用户人设',
  system: '系统设定',
  regex: '正则',
};

const CATEGORY_ICONS: Record<PromptCategory, string> = {
  persona: '👤',
  system: '⚙️',
  regex: '🔍',
};

export const PromptManagerTab: React.FC<{
  currentPromptPresetId?: string;
  onSelectPreset: (preset: PromptPreset) => void;
}> = ({ currentPromptPresetId, onSelectPreset }) => {
  const theme = useTheme();
  const { presets, setPresets } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PromptCategory>('system');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(currentPromptPresetId || null);
  const [isEditing, setIsEditing] = useState(false);
  const [isNewPreset, setIsNewPreset] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSystemPrompt, setEditSystemPrompt] = useState('');
  const [editJailbreakPrompt, setEditJailbreakPrompt] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPersona, setEditPersona] = useState('');
  const [editFindRegex, setEditFindRegex] = useState('');
  const [editReplaceString, setEditReplaceString] = useState('');
  const [editRegexEnabled, setEditRegexEnabled] = useState(true);
  const [editRegexScope, setEditRegexScope] = useState<'input' | 'output' | 'both'>('output');

  const promptPresets = useMemo(() => {
    let list = presets.filter((p) => p.type === 'prompt') as PromptPreset[];
    // 按分类过滤
    list = list.filter((p) => (p.category || 'system') === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.systemPrompt || '').toLowerCase().includes(q) ||
          (p.personaDescription || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      return (a.order || 0) - (b.order || 0);
    });
  }, [presets, searchQuery, activeCategory]);

  const selectedPreset = useMemo(
    () => promptPresets.find((p) => p.id === selectedPresetId) || null,
    [promptPresets, selectedPresetId]
  );

  const builtinMacros = macroService.getBuiltinMacros();

  const handleSelectPreset = (preset: PromptPreset) => {
    setSelectedPresetId(preset.id);
    setIsEditing(false);
    setIsNewPreset(false);
  };

  const handleApplyPreset = (preset: PromptPreset) => {
    onSelectPreset(preset);
  };

  const handleStartEdit = () => {
    if (!selectedPreset) return;
    setEditName(selectedPreset.name);
    setEditSystemPrompt(selectedPreset.systemPrompt || '');
    setEditJailbreakPrompt(selectedPreset.jailbreakPrompt || '');
    setEditDescription(selectedPreset.description || '');
    setEditPersona(selectedPreset.personaDescription || '');
    setEditFindRegex(selectedPreset.findRegex || '');
    setEditReplaceString(selectedPreset.replaceString || '');
    setEditRegexEnabled(selectedPreset.isRegexEnabled ?? true);
    setEditRegexScope(selectedPreset.regexScope || 'output');
    setIsEditing(true);
    setIsNewPreset(false);
  };

  const handleNewPreset = () => {
    const newPreset = presetService.createPromptPreset('新预设', { category: activeCategory });
    setSelectedPresetId(newPreset.id);
    setEditName(newPreset.name);
    setEditSystemPrompt('');
    setEditJailbreakPrompt('');
    setEditDescription('');
    setEditPersona('');
    setEditFindRegex('');
    setEditReplaceString('');
    setEditRegexEnabled(true);
    setEditRegexScope('output');
    setIsEditing(true);
    setIsNewPreset(true);
  };

  const handleSavePreset = () => {
    if (!editName.trim()) return;

    const category = activeCategory;
    const commonFields = {
      name: editName.trim(),
      description: editDescription.trim() || undefined,
      category,
      updatedAt: Date.now(),
    };

    if (isNewPreset) {
      let newPreset: PromptPreset;
      if (category === 'persona') {
        newPreset = {
          id: selectedPresetId || generateId(),
          type: 'prompt',
          ...commonFields,
          personaDescription: editPersona,
          isFavorite: false,
          order: presets.filter(p => p.type === 'prompt' && (p as PromptPreset).category === 'persona').length,
          createdAt: Date.now(),
        };
      } else if (category === 'regex') {
        newPreset = {
          id: selectedPresetId || generateId(),
          type: 'prompt',
          ...commonFields,
          systemPrompt: editSystemPrompt,
          findRegex: editFindRegex,
          replaceString: editReplaceString,
          isRegexEnabled: editRegexEnabled,
          regexScope: editRegexScope,
          isFavorite: false,
          order: presets.filter(p => p.type === 'prompt' && (p as PromptPreset).category === 'regex').length,
          createdAt: Date.now(),
        };
      } else {
        newPreset = {
          id: selectedPresetId || generateId(),
          type: 'prompt',
          ...commonFields,
          systemPrompt: editSystemPrompt,
          jailbreakPrompt: editJailbreakPrompt,
          includeCharacterSystemPrompt: true,
          includeWorldBookSystemPrompt: true,
          isFavorite: false,
          order: presets.filter(p => p.type === 'prompt' && (p as PromptPreset).category === 'system').length,
          createdAt: Date.now(),
        };
      }
      setPresets([...presets, newPreset]);
    } else if (selectedPresetId) {
      const updated = presets.map((p) => {
        if (p.id === selectedPresetId && p.type === 'prompt') {
          const pp = p as PromptPreset;
          if (category === 'persona') {
            return { ...pp, ...commonFields, personaDescription: editPersona };
          } else if (category === 'regex') {
            return {
              ...pp,
              ...commonFields,
              systemPrompt: editSystemPrompt,
              findRegex: editFindRegex,
              replaceString: editReplaceString,
              isRegexEnabled: editRegexEnabled,
              regexScope: editRegexScope,
            };
          } else {
            return {
              ...pp,
              ...commonFields,
              systemPrompt: editSystemPrompt,
              jailbreakPrompt: editJailbreakPrompt,
            };
          }
        }
        return p;
      });
      setPresets(updated);
    }

    setIsEditing(false);
    setIsNewPreset(false);
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId || isNewPreset) return;
    Alert.alert(
      '删除预设',
      '确定要删除这个预设吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            const updated = presets.filter((p) => p.id !== selectedPresetId);
            setPresets(updated);
            setSelectedPresetId(null);
            setIsEditing(false);
            setIsNewPreset(false);
          },
        },
      ]
    );
  };

  const handleCancelEdit = () => {
    if (isNewPreset) {
      setSelectedPresetId(null);
    }
    setIsEditing(false);
    setIsNewPreset(false);
  };

  const insertMacro = (macro: string) => {
    if (activeCategory === 'persona') {
      setEditPersona((prev) => prev + macro);
    } else {
      setEditSystemPrompt((prev) => prev + macro);
    }
  };

  const renderDetailContent = () => {
    if (!selectedPreset && !(isNewPreset && isEditing)) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: theme.subTextColor, fontSize: 13, textAlign: 'center' }}>
            {`选择或创建一个${CATEGORY_LABELS[activeCategory]}预设\n支持宏变量: {{char}}, {{user}} 等`}
          </Text>
        </View>
      );
    }

    if (!isEditing) {
      // 查看模式
      return (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          horizontal={false}
        >
          <View style={{ padding: 12, width: '100%' }}>
            <Text style={{ color: theme.textColor, fontSize: 15, fontWeight: '600' }}>
              {selectedPreset?.name}
            </Text>
            {selectedPreset?.description && (
              <Text style={{ color: theme.subTextColor, fontSize: 12, marginTop: 4 }}>
                {selectedPreset.description}
              </Text>
            )}

            {activeCategory === 'persona' && (
              <>
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 12, marginBottom: 4 }}>
                  人设描述
                </Text>
                <Text style={[styles.detailText, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}>
                  {selectedPreset?.personaDescription || '(空)'}
                </Text>
              </>
            )}

            {activeCategory === 'system' && (
              <>
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 12, marginBottom: 4 }}>
                  系统提示词
                </Text>
                <Text style={[styles.detailText, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}>
                  {selectedPreset?.systemPrompt || '(空)'}
                </Text>
                {!!selectedPreset?.jailbreakPrompt && (
                  <>
                    <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 12, marginBottom: 4 }}>
                      越狱提示词
                    </Text>
                    <Text style={[styles.detailText, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}>
                      {selectedPreset.jailbreakPrompt}
                    </Text>
                  </>
                )}
              </>
            )}

            {activeCategory === 'regex' && (
              <>
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 12, marginBottom: 4 }}>
                  格式提示词
                </Text>
                <Text style={[styles.detailText, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}>
                  {selectedPreset?.systemPrompt || '(空)'}
                </Text>
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 12, marginBottom: 4 }}>
                  查找正则
                </Text>
                <Text style={[styles.detailText, { color: theme.textColor, backgroundColor: theme.secondaryColor, fontFamily: 'monospace' }]}>
                  {selectedPreset?.findRegex || '(空)'}
                </Text>
                <Text style={{ color: theme.subTextColor, fontSize: 11, marginTop: 12, marginBottom: 4 }}>
                  替换内容
                </Text>
                <Text style={[styles.detailText, { color: theme.textColor, backgroundColor: theme.secondaryColor, fontFamily: 'monospace' }]}>
                  {selectedPreset?.replaceString || '(删除匹配内容)'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selectedPreset?.isRegexEnabled ? '#26de81' : '#ff9f43' }} />
                    <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                      {selectedPreset?.isRegexEnabled ? '已启用' : '已禁用'}
                    </Text>
                  </View>
                  <Text style={{ color: theme.subTextColor, fontSize: 11 }}>
                    作用域: {selectedPreset?.regexScope === 'both' ? '输入+输出' : selectedPreset?.regexScope === 'input' ? '仅输入' : '仅输出'}
                  </Text>
                </View>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.applyBtn, { backgroundColor: theme.accentColor, flex: 1 }]}
                onPress={() => selectedPreset && handleApplyPreset(selectedPreset)}
              >
                <Text style={{ color: theme.buttonTextColor, fontSize: 13 }}>应用到当前对话</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editBtn, { backgroundColor: theme.secondaryColor }]}
                onPress={handleStartEdit}
              >
                <Text style={{ color: theme.textColor, fontSize: 13 }}>编辑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      );
    }

    // 编辑模式
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        horizontal={false}
      >
        <View style={{ padding: 12, width: '100%' }}>
          <Text style={{ color: theme.textColor, fontSize: 12, marginBottom: 4 }}>名称</Text>
          <TextInput
            style={[styles.input, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}
            value={editName}
            onChangeText={setEditName}
          />
          <Text style={{ color: theme.textColor, fontSize: 12, marginTop: 10, marginBottom: 4 }}>描述</Text>
          <TextInput
            style={[styles.input, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}
            value={editDescription}
            onChangeText={setEditDescription}
          />

          {activeCategory === 'persona' && (
            <>
              <Text style={{ color: theme.textColor, fontSize: 12, marginTop: 10, marginBottom: 4 }}>人设描述</Text>
              <TextInput
                style={[styles.textarea, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}
                value={editPersona}
                onChangeText={setEditPersona}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
                placeholder="描述用户的人设、性格、背景等，支持 {{char}}、{{user}} 等宏变量"
                placeholderTextColor={theme.subTextColor}
              />
            </>
          )}

          {activeCategory === 'system' && (
            <>
              <Text style={{ color: theme.textColor, fontSize: 12, marginTop: 10, marginBottom: 4 }}>系统提示词</Text>
              <TextInput
                style={[styles.textarea, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}
                value={editSystemPrompt}
                onChangeText={setEditSystemPrompt}
                multiline
                numberOfLines={10}
                textAlignVertical="top"
                placeholder="输入系统提示词，支持 {{char}}、{{user}} 等宏变量"
                placeholderTextColor={theme.subTextColor}
              />
              <Text style={{ color: theme.textColor, fontSize: 12, marginTop: 10, marginBottom: 4 }}>越狱提示词（可选）</Text>
              <TextInput
                style={[styles.textarea, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}
                value={editJailbreakPrompt}
                onChangeText={setEditJailbreakPrompt}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                placeholder="输入越狱提示词..."
                placeholderTextColor={theme.subTextColor}
              />
            </>
          )}

          {activeCategory === 'regex' && (
            <>
              <Text style={{ color: theme.textColor, fontSize: 12, marginTop: 10, marginBottom: 4 }}>格式提示词</Text>
              <TextInput
                style={[styles.textarea, { color: theme.textColor, backgroundColor: theme.secondaryColor }]}
                value={editSystemPrompt}
                onChangeText={setEditSystemPrompt}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                placeholder="告诉AI如何输出特定格式的内容，如标签包裹、结构化数据等"
                placeholderTextColor={theme.subTextColor}
              />
              <Text style={{ color: theme.textColor, fontSize: 12, marginTop: 10, marginBottom: 4 }}>查找正则表达式</Text>
              <TextInput
                style={[styles.codeInput, { color: theme.textColor, backgroundColor: theme.secondaryColor, fontFamily: 'monospace' }]}
                value={editFindRegex}
                onChangeText={setEditFindRegex}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                placeholder="例如: <Status>([\s\S]*?)<\/Status>"
                placeholderTextColor={theme.subTextColor}
              />
              <Text style={{ color: theme.textColor, fontSize: 12, marginTop: 10, marginBottom: 4 }}>替换内容</Text>
              <TextInput
                style={[styles.codeInput, { color: theme.textColor, backgroundColor: theme.secondaryColor, fontFamily: 'monospace' }]}
                value={editReplaceString}
                onChangeText={setEditReplaceString}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                placeholder="留空则删除匹配内容，支持 $1 $2 等捕获组"
                placeholderTextColor={theme.subTextColor}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <Text style={{ color: theme.textColor, fontSize: 12 }}>启用此正则</Text>
                <Switch
                  value={editRegexEnabled}
                  onValueChange={setEditRegexEnabled}
                  trackColor={{ false: theme.borderColor, true: theme.accentColor }}
                />
              </View>
              <Text style={{ color: theme.textColor, fontSize: 12, marginTop: 12, marginBottom: 4 }}>作用域</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['output', 'input', 'both'] as const).map((scope) => (
                  <TouchableOpacity
                    key={scope}
                    style={[
                      styles.scopeBtn,
                      {
                        backgroundColor: editRegexScope === scope ? theme.accentColor : theme.secondaryColor,
                        borderColor: editRegexScope === scope ? theme.accentColor : theme.borderColor,
                      },
                    ]}
                    onPress={() => setEditRegexScope(scope)}
                  >
                    <Text style={{ color: editRegexScope === scope ? theme.buttonTextColor : theme.subTextColor, fontSize: 11 }}>
                      {scope === 'output' ? '仅输出' : scope === 'input' ? '仅输入' : '输入+输出'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* 宏变量快速插入 */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: theme.subTextColor, fontSize: 11, marginBottom: 6 }}>宏变量（点击插入）</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {builtinMacros.slice(0, 8).map((m) => (
                <TouchableOpacity
                  key={m.name}
                  style={[styles.macroChip, { backgroundColor: theme.secondaryColor }]}
                  onPress={() => insertMacro(m.name)}
                >
                  <Text style={{ color: theme.accentColor, fontSize: 10 }}>{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: theme.secondaryColor, flex: 1 }]}
              onPress={handleCancelEdit}
            >
              <Text style={{ color: theme.textColor, fontSize: 13 }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: theme.accentColor, flex: 1 }]}
              onPress={handleSavePreset}
            >
              <Text style={{ color: theme.buttonTextColor, fontSize: 13 }}>保存</Text>
            </TouchableOpacity>
          </View>
          {!isNewPreset && (
            <TouchableOpacity
              style={[styles.deleteBtn, { marginTop: 12 }]}
              onPress={handleDeletePreset}
            >
              <Text style={{ color: '#ff4444', fontSize: 13 }}>删除预设</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 顶部分类 Tab */}
      <View style={[styles.categoryTabRow, { borderBottomColor: theme.borderColor }]}>
        {(['system', 'persona', 'regex'] as PromptCategory[]).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[
              styles.categoryTab,
              activeCategory === cat && { borderBottomColor: theme.accentColor },
            ]}
            onPress={() => {
              setActiveCategory(cat);
              setSelectedPresetId(null);
              setIsEditing(false);
              setIsNewPreset(false);
            }}
          >
            <Text style={{ fontSize: 14, marginRight: 4 }}>
              {CATEGORY_ICONS[cat]}
            </Text>
            <Text
              style={{
                color: activeCategory === cat ? theme.accentColor : theme.subTextColor,
                fontSize: 13,
                fontWeight: activeCategory === cat ? '600' : '400',
              }}
            >
              {CATEGORY_LABELS[cat]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 搜索栏 */}
      <View style={styles.topBar}>
        <View style={[styles.searchBar, { backgroundColor: theme.secondaryColor }]}>
          <Text style={{ color: theme.subTextColor, fontSize: 12 }}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: theme.textColor }]}
            placeholder={`搜索${CATEGORY_LABELS[activeCategory]}...`}
            placeholderTextColor={theme.subTextColor}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: theme.accentColor }]}
          onPress={handleNewPreset}
        >
          <Text style={{ color: theme.buttonTextColor, fontSize: 12 }}>新建</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* 左侧列表 */}
        <View style={[styles.listPane, { borderRightColor: theme.borderColor }]}>
          <FlatList
            data={promptPresets}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.presetItem,
                  {
                    backgroundColor:
                      selectedPresetId === item.id
                        ? theme.accentColor + '20'
                        : 'transparent',
                    borderBottomColor: theme.borderColor,
                  },
                ]}
                onPress={() => handleSelectPreset(item)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: theme.textColor, fontSize: 13, fontWeight: '500' }}
                    numberOfLines={1}
                  >
                    {item.isFavorite && '★ '}
                    {item.name}
                  </Text>
                  {item.description && (
                    <Text
                      style={{ color: theme.subTextColor, fontSize: 11, marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {item.description}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={{ color: theme.subTextColor, textAlign: 'center', padding: 20, fontSize: 12 }}>
                {`暂无${CATEGORY_LABELS[activeCategory]}预设`}
              </Text>
            }
          />
        </View>

        {/* 右侧详情/编辑区 */}
        <View style={styles.detailPane}>
          {renderDetailContent()}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  categoryTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    padding: 10,
    gap: 8,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 34,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    padding: 0,
    height: 34,
  },
  newBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  listPane: {
    width: 130,
    borderRightWidth: 1,
  },
  detailPane: {
    flex: 1,
  },
  presetItem: {
    padding: 10,
    borderBottomWidth: 0.5,
  },
  detailText: {
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
    borderRadius: 8,
  },
  input: {
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    minHeight: 36,
  },
  textarea: {
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    minHeight: 160,
    maxHeight: 500,
    textAlignVertical: 'top',
    width: '100%',
  },
  codeInput: {
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    minHeight: 80,
    maxHeight: 300,
    textAlignVertical: 'top',
    width: '100%',
  },
  scopeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  macroChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  saveBtn: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtn: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteBtn: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  applyBtn: {
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  editBtn: {
    padding: 10,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
});
