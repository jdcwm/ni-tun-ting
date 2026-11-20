import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Alert, Modal, Switch, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { IconClose, IconPlus, IconTrash, IconEdit, IconCheck, IconGlobe, IconDatabase, IconDownload, IconEye, IconEyeOff } from '../components/Icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { aiService } from '../services/aiService';
import { AIModel, AIProvider } from '../types';
const SCREEN_W = Dimensions.get('window').width;

interface AIScreenProps {
  onClose: () => void;
  onNavigate?: (screen: string) => void;
}

const PRESET_PROVIDERS = [
  {
    id: 'preset-openai',
    name: 'OpenAI',
    format: 'openai',
    description: 'GPT系列模型',
    baseUrl: 'https://api.openai.com/v1',
    capabilities: ['text', 'vision', 'function_calling'],
  },
  {
    id: 'preset-anthropic',
    name: 'Anthropic',
    format: 'anthropic',
    description: 'Claude系列模型',
    baseUrl: 'https://api.anthropic.com/v1',
    capabilities: ['text', 'vision'],
  },
  {
    id: 'preset-google',
    name: 'Google',
    format: 'gemini',
    description: 'Gemini系列模型',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    capabilities: ['text', 'vision'],
  },
  {
    id: 'preset-deepseek',
    name: 'DeepSeek',
    format: 'custom',
    description: '国产开源大模型',
    baseUrl: 'https://api.deepseek.com/v1',
    capabilities: ['text', 'function_calling'],
  },
  {
    id: 'preset-qwen',
    name: '阿里云·通义',
    format: 'custom',
    description: '通义系列模型',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    capabilities: ['text', 'vision'],
  },
  {
    id: 'preset-zhipu',
    name: '智谱AI',
    format: 'custom',
    description: '智谱AI系列模型',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    capabilities: ['text', 'function_calling'],
  },
  {
    id: 'preset-glm',
    name: '智谱/GLM',
    format: 'custom',
    description: '清华GLM系列',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    capabilities: ['text'],
  },
  {
    id: 'preset-moonshot',
    name: 'Moonshot',
    format: 'custom',
    description: 'Kimi系列模型',
    baseUrl: 'https://api.moonshot.cn/v1',
    capabilities: ['text'],
  },
  {
    id: 'preset-minimax',
    name: 'MiniMax',
    format: 'custom',
    description: 'MiniMax系列',
    baseUrl: 'https://api.minimaxi.com/v1',
    capabilities: ['text'],
  },
  {
    id: 'preset-volengine',
    name: '火山引擎',
    format: 'custom',
    description: '豆包系列模型',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    capabilities: ['text', 'vision'],
  },
];

const CAPABILITY_OPTIONS = [
  { id: 'text', label: '文本生成' },
  { id: 'vision', label: '视觉理解' },
  { id: 'function_calling', label: '函数调用' },
  { id: 'streaming', label: '流式输出' },
  { id: 'reasoning', label: '深度推理' },
  { id: 'audio', label: '音频处理' },
];

export const AIProviderScreen: React.FC<AIScreenProps> = ({ onClose, onNavigate }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { providers, setProviders } = useApp();
  const [showEditor, setShowEditor] = useState(false);
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPresets, setShowPresets] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [useProxy, setUseProxy] = useState(false);
  const [proxyUrl, setProxyUrl] = useState('');
  // ===== 自建 Python 中转 =====
  const [showPythonProxyEditor, setShowPythonProxyEditor] = useState(false);
  const [pythonProxy, setPythonProxy] = useState<{
    pythonPath: string;
    scriptCode: string;
    launchCommand: string;
    pipPackages: string;
  }>({
    pythonPath: 'python3',
    launchCommand: 'python3 script.py',
    pipPackages: 'flask requests openai',
    scriptCode: `# Python 中转脚本模板（Flask + OpenAI 兼容转发）
# 功能：启动一个本地 HTTP 服务，暴露 /v1/chat/completions SSE 流式端点，
# 应用内把 "自建中转(Python)" 供应商的 baseUrl 指向 http://127.0.0.1:5000/v1 即可。
# 用户可以在下方任意改写为自己的逻辑（加密/解密、负载均衡、鉴权转换、调用本地模型……）

from flask import Flask, request, Response, stream_with_context
import requests
import json

app = Flask(__name__)

# ====== 用户自行配置区 ======
UPSTREAM_BASE = "https://api.deepseek.com/v1"
UPSTREAM_KEY = ""
# ===========================

@app.route("/v1/chat/completions", methods=["POST"])
def chat():
    body = request.get_json(silent=True) or {}
    upstream_key = request.headers.get("Authorization", "").replace("Bearer ", "").strip() or UPSTREAM_KEY
    stream = bool(body.get("stream", False))
    r = requests.post(
        f"{UPSTREAM_BASE}/chat/completions",
        json=body,
        headers={
            "Authorization": f"Bearer {upstream_key}",
            "Content-Type": "application/json",
        },
        stream=stream,
        timeout=300,
    )
    if stream:
        def gen():
            for chunk in r.iter_content(chunk_size=None):
                if chunk:
                    yield chunk
        return Response(stream_with_context(gen()), mimetype="text/event-stream")
    return Response(r.content, status=r.status_code, content_type=r.headers.get("Content-Type", "application/json"))

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)
`,
  });
  // Python 中转默认供应商 baseUrl，和模板脚本一致
  const PYTHON_PROXY_DEFAULT_BASE = 'http://127.0.0.1:5000/v1';
  const [formData, setFormData] = useState({
    name: '',
    format: 'custom',
    apiKey: '',
    baseUrl: '',
    capabilities: [] as string[],
    model: '',
  });
  const [testingProviderId, setTestingProviderId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; latency?: number; error?: string; time: number }>>({});
  const [editorTestResult, setEditorTestResult] = useState<{ ok: boolean; latency?: number; error?: string } | null>(null);
  const [isTestingInEditor, setIsTestingInEditor] = useState(false);
  const [fetchingProviderId, setFetchingProviderId] = useState<string | null>(null);
  const [isFetchingAll, setIsFetchingAll] = useState(false);

  const filteredPresets = PRESET_PROVIDERS.filter(
    (p) => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openEditor = (provider?: any, preset?: 'python_proxy') => {
    if (provider) {
      setEditingProvider(provider);
      setFormData({
        name: provider.name || '',
        format: provider.format || 'custom',
        apiKey: provider.apiKey || '',
        baseUrl: provider.baseUrl || '',
        capabilities: provider.capabilities || [],
        model: provider.model || '',
      });
      if (provider.pythonProxy) {
        setPythonProxy({
          pythonPath: provider.pythonProxy.pythonPath || 'python3',
          launchCommand: provider.pythonProxy.launchCommand || 'python3 script.py',
          pipPackages: provider.pythonProxy.pipPackages || 'flask requests openai',
          scriptCode: provider.pythonProxy.scriptCode || pythonProxy.scriptCode,
        });
      }
    } else {
      setEditingProvider(null);
      setFormData({
        name: preset === 'python_proxy' ? '自建中转(Python)' : '',
        format: preset === 'python_proxy' ? 'python_proxy' : 'custom',
        apiKey: '',
        baseUrl: preset === 'python_proxy' ? PYTHON_PROXY_DEFAULT_BASE : '',
        capabilities: preset === 'python_proxy' ? ['text', 'streaming', 'reasoning'] : [],
        model: '',
      });
      if (preset === 'python_proxy') {
        setShowPythonProxyEditor(true);
      }
    }
    setShowEditor(true);
  };

  const saveProvider = async () => {
    if (!formData.name.trim() || !formData.baseUrl.trim()) {
      Alert.alert('错误', '请填写名称和API地址');
      return;
    }

    const newProvider = {
      id: editingProvider?.id || `custom-${Date.now()}`,
      name: formData.name,
      format: formData.format as any,
      apiKey: formData.apiKey,
      baseUrl: formData.baseUrl,
      capabilities: formData.capabilities,
      model: formData.model,
      models: [],
      isFavorite: false,
      order: providers.length,
      pythonProxy: formData.format === 'python_proxy' ? {
        pythonPath: pythonProxy.pythonPath,
        scriptCode: pythonProxy.scriptCode,
        launchCommand: pythonProxy.launchCommand,
        pipPackages: pythonProxy.pipPackages,
        lastSavedAt: Date.now(),
      } : undefined,
    };

    if (editingProvider) {
      const updated = providers.map((p: any) =>
        p.id === editingProvider.id ? { ...p, ...newProvider } : p
      );
      await setProviders(updated);
    } else {
      await setProviders([...providers, newProvider]);
    }

    setShowEditor(false);
  };

  const importPreset = async (preset: any) => {
    const newProvider = {
      id: `imported-${Date.now()}`,
      name: preset.name,
      format: preset.format as any,
      apiKey: '',
      baseUrl: preset.baseUrl,
      capabilities: preset.capabilities,
      model: '',
      models: [],
      isFavorite: false,
      order: providers.length,
    };

    await setProviders([...providers, newProvider]);
    Alert.alert('导入成功', `已添加 "${preset.name}" 供应商，请在设置中填写API Key`);
  };

  const importAllPresets = async () => {
    const existingIds = new Set(providers.map((p: any) => p.name));
    const toImport = PRESET_PROVIDERS.filter(p => !existingIds.has(p.name));
    if (toImport.length === 0) {
      Alert.alert('提示', '所有预设供应商已添加');
      return;
    }
    const newProviders = toImport.map((preset, i) => ({
      id: `imported-${Date.now()}-${i}`,
      name: preset.name,
      format: preset.format as any,
      apiKey: '',
      baseUrl: preset.baseUrl,
      capabilities: preset.capabilities,
      model: '',
      models: [],
      isFavorite: false,
      order: providers.length + i,
    }));
    await setProviders([...providers, ...newProviders]);
    Alert.alert('批量导入成功', `已添加 ${toImport.length} 个预设供应商，请在设置中填写API Key`);
  };

  const deleteProvider = async (id: string) => {
    Alert.alert('删除确认', '确定要删除这个供应商吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        await setProviders(providers.filter((p: any) => p.id !== id));
      }},
    ]);
  };

  const resetAllProviders = () => {
    if (providers.length === 0) {
      Alert.alert('提示', '没有可重置的供应商');
      return;
    }
    Alert.alert('重置确认', `将删除全部 ${providers.length} 个供应商，此操作不可撤销`, [
      { text: '取消', style: 'cancel' },
      { text: '重置', style: 'destructive', onPress: async () => {
        await setProviders([]);
        setTestResults({});
        Alert.alert('成功', '已重置所有供应商');
      }},
    ]);
  };

  const fetchModelsForProvider = async (provider: any) => {
    if (!provider.apiKey?.trim()) {
      Alert.alert('提示', '请先填写API Key');
      return;
    }
    setFetchingProviderId(provider.id);
    try {
      const result = await aiService.fetchModels(
        provider.baseUrl,
        provider.apiKey,
        provider.format || 'openai'
      );
      if (result.error || result.models.length === 0) {
        Alert.alert('获取失败', result.error || '未获取到模型列表');
        return;
      }
      const updated = providers.map((p: any) =>
        p.id === provider.id
          ? { ...p, models: result.models, model: result.models[0] }
          : p
      );
      await setProviders(updated);
      Alert.alert('获取成功', `${provider.name}：获取到 ${result.models.length} 个模型`);
    } catch (err: any) {
      Alert.alert('获取失败', err.message);
    } finally {
      setFetchingProviderId(null);
    }
  };

  const fetchAllModels = async () => {
    const connected = providers.filter((p: any) => p.apiKey?.trim());
    if (connected.length === 0) {
      Alert.alert('提示', '没有已配置API Key的供应商');
      return;
    }
    setIsFetchingAll(true);
    let successCount = 0;
    let failCount = 0;
    const updatedProviders = [...providers];

    for (const provider of connected) {
      try {
        const result = await aiService.fetchModels(
          provider.baseUrl,
          provider.apiKey,
          provider.format || 'openai'
        );
        if (result.models.length > 0) {
          const idx = updatedProviders.findIndex((p: any) => p.id === provider.id);
          if (idx >= 0) {
            updatedProviders[idx] = {
              ...updatedProviders[idx],
              models: ((result.models || []) as any[]).map((modelId: any, i: number) => {
                const id = typeof modelId === 'string' ? modelId : (modelId?.id ?? String(modelId));
                const name = typeof modelId === 'string' ? modelId : (modelId?.name ?? String(modelId));
                const caps: any[] = [];
                if (provider.capabilities && provider.capabilities.includes('text')) caps.push('text' as any);
                return {
                  id: `${provider.id}_${id}_${i}`,
                  name,
                  providerId: provider.id,
                  modelId: id,
                  capabilities: caps.length ? caps : ['text' as any],
                  isFavorite: i === 0,
                  order: i,
                } as AIModel;
              }),
              model: (typeof (result.models?.[0]) === 'string' ? result.models[0] : ((result.models as any)?.[0]?.id ?? provider.model)) ?? provider.model,
            };
            successCount++;
          }
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
    await setProviders(updatedProviders);
    setIsFetchingAll(false);
    Alert.alert(
      '获取完成',
      `成功: ${successCount} 个供应商\n失败: ${failCount} 个\n${connected.length - successCount - failCount > 0 ? `未配置Key: ${connected.length - successCount - failCount} 个` : ''}`
    );
  };

  const toggleCapability = (capability: string) => {
    setFormData((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(capability)
        ? prev.capabilities.filter((c) => c !== capability)
        : [...prev.capabilities, capability],
    }));
  };

  const handleTestConnection = async (provider: any) => {
    setTestingProviderId(provider.id);
    try {
      const startTime = Date.now();
      const result = await aiService.testConnection(
        provider.baseUrl,
        provider.apiKey,
        provider.format || 'openai'
      );
      const latency = Date.now() - startTime;
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: { ...result, latency, time: Date.now() },
      }));
    } catch (error: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider.id]: { ok: false, error: error.message || '测试失败', time: Date.now() },
      }));
    } finally {
      setTestingProviderId(null);
    }
  };

  const handleTestEditorConnection = async () => {
    if (!formData.baseUrl.trim()) {
      Alert.alert('错误', '请先填写API地址');
      return;
    }
    setIsTestingInEditor(true);
    setEditorTestResult(null);
    try {
      const startTime = Date.now();
      const result = await aiService.testConnection(
        formData.baseUrl,
        formData.apiKey,
        formData.format as any
      );
      const latency = Date.now() - startTime;
      setEditorTestResult({ ...result, latency });
    } catch (error: any) {
      setEditorTestResult({ ok: false, error: error.message || '测试失败' });
    } finally {
      setIsTestingInEditor(false);
    }
  };

  const getTestResult = (providerId: string) => testResults[providerId];
  const isProviderTesting = (providerId: string) => testingProviderId === providerId;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconClose size={24} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>AI供应商管理</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            onPress={fetchAllModels}
            disabled={isFetchingAll}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.accentColor + '20' }}
          >
            {isFetchingAll ? (
              <ActivityIndicator size="small" color={theme.accentColor} />
            ) : (
              <Text style={{ color: theme.accentColor, fontSize: 12 }}>获取</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={resetAllProviders}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#ff6b6b20' }}
          >
            <Text style={{ color: '#ff6b6b', fontSize: 12 }}>重置</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openEditor()} style={styles.addBtn}>
            <IconPlus size={22} color={theme.accentColor} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* 自建中转服务器 */}
        <View style={[styles.proxySection, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <View style={styles.proxyHeader}>
            <IconDatabase size={20} color={theme.accentColor} />
            <Text style={[styles.proxyTitle, { color: theme.textColor }]}>自建中转服务器</Text>
          </View>
          
          <View style={styles.proxyToggle}>
            <Text style={[styles.proxyLabel, { color: theme.textColor }]}>启用全局 HTTP 代理</Text>
            <Switch
              value={useProxy}
              onValueChange={setUseProxy}
              trackColor={{ false: theme.secondaryColor, true: theme.accentColor }}
            />
          </View>

          {useProxy && (
            <View style={styles.proxyInputRow}>
              <TextInput
                style={[styles.proxyInput, { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
                value={proxyUrl}
                onChangeText={setProxyUrl}
                placeholder="http://127.0.0.1:7890"
                placeholderTextColor={theme.subTextColor}
              />
            </View>
          )}

          <View style={styles.proxySplit} />

          <Text style={[styles.proxyLabel, { color: theme.textColor }]}>自建中转（Python 代码环境）</Text>
          <Text style={[styles.proxyDescText, { color: theme.subTextColor, marginTop: 4, lineHeight: 18 }]}>
            提供一份 Python 代码模板，你可以直接修改后在本机 Python 环境运行，将该供应商的 baseUrl 指向其本地地址即可（SSE 流式兼容 OpenAI）。
          </Text>
          <View style={styles.proxyButtonsRow}>
            <TouchableOpacity
              style={[styles.proxyPrimaryBtn, { backgroundColor: theme.accentColor }]}
              onPress={() => {
                // 自动创建一个 Python 中转供应商，并打开代码编辑器
                openEditor(undefined, 'python_proxy');
              }}
            >
              <IconPlus size={16} color="#fff" />
              <Text style={styles.proxyPrimaryBtnText}>添加并编辑 Python 中转</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 已添加的供应商 */}
        {providers.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>已添加的供应商</Text>
            
            <View style={styles.providerList}>
              {providers.map((provider: any) => (
                <View 
                  key={provider.id}
                  style={[styles.providerCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                >
                  <View style={styles.providerInfo}>
                    <View style={[styles.providerAvatar, { backgroundColor: theme.accentColor + '20' }]}>
                      <IconGlobe size={20} color={theme.accentColor} />
                    </View>
                    <View style={styles.providerDetails}>
                      <Text style={[styles.providerName, { color: theme.textColor }]}>{provider.name}</Text>
                      <Text style={[styles.providerUrl, { color: theme.subTextColor }]} numberOfLines={1}>
                        {provider.baseUrl}
                      </Text>
                      <View style={styles.capabilityTags}>
                        {provider.capabilities?.slice(0, 3).map((cap: string) => (
                          <View key={cap} style={[styles.capabilityTag, { backgroundColor: theme.secondaryColor }]}>
                            <Text style={[styles.capabilityText, { color: theme.subTextColor }]}>{cap}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.providerActions}>
                    <TouchableOpacity
                      onPress={() => fetchModelsForProvider(provider)}
                      style={styles.actionIconBtn}
                      disabled={fetchingProviderId === provider.id}
                    >
                      {fetchingProviderId === provider.id ? (
                        <ActivityIndicator size="small" color={theme.accentColor} />
                      ) : (
                        <IconDownload size={18} color={theme.accentColor} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleTestConnection(provider)}
                      style={styles.actionIconBtn}
                      disabled={isProviderTesting(provider.id)}
                    >
                      {isProviderTesting(provider.id) ? (
                        <ActivityIndicator size="small" color={theme.accentColor} />
                      ) : (
                        <IconCheck size={18} color={theme.accentColor} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEditor(provider)} style={styles.actionIconBtn}>
                      <IconEdit size={18} color={theme.subTextColor} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteProvider(provider.id)} style={styles.actionIconBtn}>
                      <IconTrash size={18} color="#ff0000" />
                    </TouchableOpacity>
                  </View>
                  {provider.models && provider.models.length > 0 && (
                    <Text style={[styles.modelCount, { color: theme.subTextColor }]}>
                      📦 {provider.models.length} 个模型
                    </Text>
                  )}
                  {getTestResult(provider.id) && (
                    <View style={[styles.testResultRow, {
                      backgroundColor: getTestResult(provider.id)?.ok
                        ? theme.accentColor + '15'
                        : '#ff6b6b15',
                    }]}>
                      <Text style={[styles.testResultText, {
                        color: getTestResult(provider.id)?.ok ? theme.accentColor : '#ff6b6b',
                      }]}>
                        {getTestResult(provider.id)?.ok
                          ? `✓ 连接成功 ${getTestResult(provider.id)?.latency ? `· ${getTestResult(provider.id)?.latency}ms` : ''}`
                          : `✗ ${getTestResult(provider.id)?.error || '连接失败'}`}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 预设供应商 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textColor }]}>预设供应商库</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity onPress={importAllPresets} style={[styles.toggleBtn, { backgroundColor: theme.accentColor + '20', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }]}>
                <Text style={{ color: theme.accentColor, fontSize: 12 }}>一键导入全部</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowPresets(!showPresets)} style={styles.toggleBtn}>
                <Text style={[styles.toggleText, { color: theme.accentColor }]}>
                  {showPresets ? '收起' : '展开'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {showPresets && (
            <>
              <View style={[styles.searchBar, { backgroundColor: theme.primaryColor }]}>
                <TextInput
                  style={[styles.searchInput, { color: theme.textColor }]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="搜索供应商..."
                  placeholderTextColor={theme.subTextColor}
                />
              </View>

              <View style={styles.presetList}>
                {filteredPresets.map((preset) => (
                  <View 
                    key={preset.id}
                    style={[styles.presetCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                  >
                    <View style={styles.presetInfo}>
                      <View style={[styles.presetAvatar, { backgroundColor: preset.capabilities.includes('vision') ? '#ff6b9d20' : '#4a9eff20' }]}>
                        <IconGlobe size={16} color={preset.capabilities.includes('vision') ? '#ff6b9d' : '#4a9eff'} />
                      </View>
                      <View style={styles.presetDetails}>
                        <Text style={[styles.presetName, { color: theme.textColor }]}>{preset.name}</Text>
                        <Text style={[styles.presetDesc, { color: theme.subTextColor }]}>{preset.description}</Text>
                      </View>
                    </View>
                    
                    <TouchableOpacity 
                      onPress={() => importPreset(preset)}
                      style={[styles.importBtn, { backgroundColor: theme.accentColor }]}
                    >
                      <IconDownload size={16} color="#fff" />
                      <Text style={styles.importBtnText}>添加</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* 编辑器弹窗 */}
      <Modal
        visible={showEditor}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowEditor(false)}
      >
        <View style={[
          styles.modalOverlay,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}>
          <View style={[styles.modalContent, { backgroundColor: theme.menuBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textColor }]}>
                {editingProvider ? '编辑供应商' : '添加供应商'}
              </Text>
              <TouchableOpacity onPress={() => setShowEditor(false)}>
                <IconClose size={20} color={theme.textColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>供应商名称</Text>
                <TextInput
                  style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                  value={formData.name}
                  onChangeText={(text) => setFormData({ ...formData, name: text })}
                  placeholder="输入供应商名称"
                  placeholderTextColor={theme.subTextColor}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>API 格式（插件类型）</Text>
                <View style={styles.formatGrid}>
                  {[
                    { id: 'openai', label: 'OpenAI' },
                    { id: 'anthropic', label: 'Anthropic' },
                    { id: 'gemini', label: 'Gemini' },
                    { id: 'ollama', label: 'Ollama' },
                    { id: 'azure', label: 'Azure' },
                    { id: 'custom', label: '通用兼容' },
                    { id: 'python_proxy', label: '自建中转(Python)' },
                  ].map((f) => {
                    const active = formData.format === f.id;
                    return (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => {
                          const next = f.id as any;
                          setFormData((prev) => {
                            const patch: any = { format: next };
                            if (next === 'python_proxy' && !prev.baseUrl) {
                              patch.baseUrl = PYTHON_PROXY_DEFAULT_BASE;
                            }
                            return { ...prev, ...patch };
                          });
                          if (f.id === 'python_proxy') setShowPythonProxyEditor(true);
                        }}
                        style={[
                          styles.formatChip,
                          {
                            backgroundColor: active ? theme.accentColor : theme.primaryColor,
                            borderColor: theme.borderColor,
                          },
                        ]}
                      >
                        <Text style={[styles.formatChipText, { color: active ? '#fff' : theme.textColor }]}>
                          {f.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {formData.format === 'python_proxy' && (
                <View style={[styles.formGroup, { padding: 12, borderWidth: 1, borderRadius: 12, borderColor: theme.borderColor, backgroundColor: theme.primaryColor }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[styles.formLabel, { color: theme.subTextColor, marginBottom: 0 }]}>Python 中转代码环境</Text>
                    <TouchableOpacity onPress={() => setShowPythonProxyEditor((v) => !v)}>
                      <Text style={{ color: theme.accentColor, fontSize: 13 }}>{showPythonProxyEditor ? '收起' : '展开'}</Text>
                    </TouchableOpacity>
                  </View>

                  {showPythonProxyEditor && (
                    <View style={{ gap: 10, marginTop: 10 }}>
                      <Text style={[styles.formLabel, { color: theme.subTextColor, marginBottom: -4 }]}>Python 可执行文件</Text>
                      <TextInput
                        style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
                        value={pythonProxy.pythonPath}
                        onChangeText={(text) => setPythonProxy((p) => ({ ...p, pythonPath: text }))}
                        placeholder="python3 / python / C:\\Python311\\python.exe"
                        placeholderTextColor={theme.subTextColor}
                      />
                      <Text style={[styles.formLabel, { color: theme.subTextColor, marginBottom: -4 }]}>pip 依赖包（空格分隔）</Text>
                      <TextInput
                        style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
                        value={pythonProxy.pipPackages}
                        onChangeText={(text) => setPythonProxy((p) => ({ ...p, pipPackages: text }))}
                        placeholder="flask requests openai"
                        placeholderTextColor={theme.subTextColor}
                      />
                      <Text style={[styles.formLabel, { color: theme.subTextColor, marginBottom: -4 }]}>启动命令（可选）</Text>
                      <TextInput
                        style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
                        value={pythonProxy.launchCommand}
                        onChangeText={(text) => setPythonProxy((p) => ({ ...p, launchCommand: text }))}
                        placeholder="python3 script.py"
                        placeholderTextColor={theme.subTextColor}
                      />
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={[styles.formLabel, { color: theme.subTextColor, marginBottom: 0 }]}>中转脚本（Python 代码，可自由修改）</Text>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                          <TouchableOpacity onPress={() => Alert.alert('提示', '保存供应商后，把以下代码复制粘贴到你本机的 Python 环境运行即可：\n1) pip install -U 上方依赖\n2) 新建 script.py 粘贴代码\n3) python3 script.py\n4) 本应用里该供应商 baseUrl 保持为 http://127.0.0.1:5000/v1')}>
                            <Text style={{ color: theme.accentColor, fontSize: 12 }}>使用说明</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => onNavigate?.('pythonEditor')}>
                            <Text style={{ color: theme.accentColor, fontSize: 12, fontWeight: '600' }}>专业编辑器</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <TextInput
                        multiline
                        style={[styles.codeEditor, { color: theme.textColor, backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}
                        value={pythonProxy.scriptCode}
                        onChangeText={(text) => setPythonProxy((p) => ({ ...p, scriptCode: text }))}
                        placeholder="粘贴/编写 Python 中转代码..."
                        placeholderTextColor={theme.subTextColor}
                        textAlignVertical="top"
                      />
                    </View>
                  )}
                </View>
              )}

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>API地址</Text>
                <TextInput
                  style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                  value={formData.baseUrl}
                  onChangeText={(text) => setFormData({ ...formData, baseUrl: text })}
                  placeholder="https://api.example.com/v1"
                  placeholderTextColor={theme.subTextColor}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>API Key</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor, paddingRight: 48 }]}
                    value={formData.apiKey}
                    onChangeText={(text) => setFormData({ ...formData, apiKey: text })}
                    placeholder="输入API密钥"
                    placeholderTextColor={theme.subTextColor}
                    secureTextEntry={!showApiKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', padding: 8 }}
                    onPress={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey
                      ? <IconEyeOff size={18} color={theme.subTextColor} />
                      : <IconEye size={18} color={theme.subTextColor} />}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>默认模型（可选）</Text>
                <TextInput
                  style={[styles.formInput, { color: theme.textColor, backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}
                  value={formData.model}
                  onChangeText={(text) => setFormData({ ...formData, model: text })}
                  placeholder="例如：gpt-4o / claude-3.5-sonnet"
                  placeholderTextColor={theme.subTextColor}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: theme.subTextColor }]}>支持的功能</Text>
                <View style={styles.capabilityList}>
                  {CAPABILITY_OPTIONS.map((cap) => (
                    <TouchableOpacity
                      key={cap.id}
                      onPress={() => toggleCapability(cap.id)}
                      style={[
                        styles.capabilityItem,
                        { 
                          backgroundColor: formData.capabilities.includes(cap.id) ? theme.accentColor : theme.primaryColor,
                          borderColor: theme.borderColor,
                        },
                      ]}
                    >
                      <Text style={[styles.capabilityItemText, { color: formData.capabilities.includes(cap.id) ? '#fff' : theme.textColor }]}>
                        {cap.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={[styles.testSection, { borderTopColor: theme.borderColor }]}>
                <TouchableOpacity
                  style={[styles.testBtn, { backgroundColor: isTestingInEditor ? theme.secondaryColor : theme.accentColor }]}
                  onPress={handleTestEditorConnection}
                  disabled={isTestingInEditor}
                >
                  {isTestingInEditor ? (
                    <ActivityIndicator size="small" color={theme.textColor} />
                  ) : (
                    <>
                      <IconCheck size={16} color={theme.buttonTextColor} />
                      <Text style={{ color: theme.buttonTextColor, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                        测试连接
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                {editorTestResult && (
                  <View style={[styles.editorTestResult, {
                    backgroundColor: editorTestResult.ok
                      ? theme.accentColor + '15'
                      : '#ff6b6b15',
                  }]}>
                    <Text style={[styles.editorTestResultText, {
                      color: editorTestResult.ok ? theme.accentColor : '#ff6b6b',
                    }]}>
                      {editorTestResult.ok
                        ? `✓ 连接成功${editorTestResult.latency ? ` · 延迟 ${editorTestResult.latency}ms` : ''}`
                        : `✗ ${editorTestResult.error || '连接失败'}`}
                    </Text>
                    {editorTestResult.ok && !formData.apiKey && (
                      <Text style={[styles.editorTestResultHint, { color: theme.subTextColor }]}>
                        API Key 为空时仅验证了端点可达性
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity 
                onPress={() => setShowEditor(false)} 
                style={[styles.cancelBtn, { backgroundColor: theme.primaryColor }]}
              >
                <Text style={{ color: theme.textColor }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={saveProvider} 
                style={[styles.saveBtn, { backgroundColor: theme.accentColor }]}
              >
                <Text style={{ color: '#fff' }}>保存</Text>
              </TouchableOpacity>
            </View>
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
  addBtn: {
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
    paddingBottom: 40,
  },
  proxySection: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  proxyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proxyTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  proxyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  proxyLabel: {
    fontSize: 14,
  },
  proxyInputRow: {
    marginTop: 4,
  },
  proxyInput: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
  },
  proxyDesc: {
    marginTop: 4,
  },
  proxyDescText: {
    fontSize: 12,
    lineHeight: 16,
  },
  proxySplit: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
  proxyButtonsRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  proxyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  proxyPrimaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  formatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formatChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  formatChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  codeEditor: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 260,
    maxHeight: 320,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'monospace',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  toggleBtn: {
    paddingHorizontal: 8,
  },
  toggleText: {
    fontSize: 13,
  },
  searchBar: {
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 40,
  },
  searchInput: {
    fontSize: 14,
    height: 40,
  },
  providerList: {
    gap: 10,
  },
  providerCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  providerInfo: {
    flexDirection: 'row',
    gap: 12,
  },
  providerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  providerDetails: {
    flex: 1,
    gap: 4,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '600',
  },
  providerUrl: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  capabilityTags: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  capabilityTag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  capabilityText: {
    fontSize: 10,
  },
  providerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelCount: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 2,
  },
  testResultRow: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  testResultText: {
    fontSize: 13,
    fontWeight: '500',
  },
  presetList: {
    gap: 10,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  presetInfo: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  presetAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetDetails: {
    flex: 1,
    gap: 2,
  },
  presetName: {
    fontSize: 14,
    fontWeight: '600',
  },
  presetDesc: {
    fontSize: 12,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  importBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flex: 1,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalForm: {
    padding: 16,
    gap: 16,
    flex: 1,
    paddingBottom: 20,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
  },
  formInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
  },
  capabilityList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  capabilityItem: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  capabilityItemText: {
    fontSize: 13,
  },
  testSection: {
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 12,
  },
  testBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  editorTestResult: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  editorTestResultText: {
    fontSize: 14,
    fontWeight: '600',
  },
  editorTestResultHint: {
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
