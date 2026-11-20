import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { IconClose, IconCheck, IconX, IconRefresh, IconCpu, IconDatabase, IconZap } from '../components/Icons';
import { aiService } from '../services/aiService';
import type { AIProvider, ChatMessage, AIType } from '../types';

const SCREEN_W = Dimensions.get('window').width;

// Token 估算：中文约 1.5 字/token，英文约 4 字符/token
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let chinese = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) {
      chinese++;
    } else {
      other++;
    }
  }
  return Math.ceil(chinese / 1.5 + other / 4);
}

function estimateMessagesTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content || '');
    // 每条消息额外约 4 token 的角色标记开销
    total += 4;
    if (msg.images && msg.images.length > 0) {
      // 每张图约 85-170 token（取中间值 128）
      total += msg.images.length * 128;
    }
  }
  return total;
}

interface FeatureItem {
  id: string;
  name: string;
  description: string;
  status: 'available' | 'unavailable' | 'checking';
  details?: string;
}

interface SystemCheckScreenProps {
  onClose: () => void;
}

export const SystemCheckScreen: React.FC<SystemCheckScreenProps> = ({ onClose }) => {
  const theme = useTheme();
  const { currentConfig, providers, chats, currentChatId } = useApp();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [features, setFeatures] = useState<FeatureItem[]>([
    { id: 'connection', name: 'API 连接', description: '测试 API 是否可达', status: 'checking' },
    { id: 'context-window', name: '上下文窗口', description: '模型支持的最大上下文长度', status: 'checking' },
    { id: 'memory', name: 'AI 记忆功能', description: '模型是否支持历史对话记忆', status: 'checking' },
    { id: 'streaming', name: '流式输出', description: '是否支持逐字流式返回', status: 'checking' },
    { id: 'vision', name: '多模态/视觉', description: '是否支持图片分析', status: 'checking' },
    { id: 'speed', name: '响应速度', description: 'API 响应延迟', status: 'checking' },
  ]);
  const cancelRef = useRef(false);

  // 获取当前活跃的 text provider
  const getTextProvider = (): AIProvider | undefined => {
    if (!providers || providers.length === 0) return undefined;
    // 优先找有 text 能力的
    const textP = providers.find((p) => p.capabilities?.includes('text'));
    return textP || providers[0];
  };

  // 获取当前对话的上下文统计
  const getContextStats = () => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return { totalMessages: 0, contextMessages: 0, estimatedTokens: 0, memoryLength: 0, summaryCount: 0 };

    const memoryLength = chat.settings?.memoryLength ?? 10;
    const allMsgs = chat.messages;
    const summaryMsgs = allMsgs.filter(m => m.role === 'system' && (m.type === 'summary' || (m as any).isCompressedSummary));
    const aliveNonSystem = allMsgs.filter(m => !!(m && ((m.role === 'user' || m.role === 'assistant') && !(m as any).isCompressed)));
    const recentMsgs = aliveNonSystem.slice(-memoryLength);
    const contextMsgs = [...summaryMsgs, ...recentMsgs];
    const estimatedTokens = estimateMessagesTokens(contextMsgs);

    return {
      totalMessages: allMsgs.length,
      contextMessages: contextMsgs.length,
      estimatedTokens,
      memoryLength,
      summaryCount: summaryMsgs.length,
    };
  };

  // 真实检测：API 连接
  const checkConnection = async (provider: AIProvider): Promise<FeatureItem> => {
    try {
      const start = Date.now();
      const result = await aiService.testConnection(
        provider.baseUrl,
        provider.apiKey,
        (provider as any).format || 'openai'
      );
      const latency = Date.now() - start;
      if (result.ok) {
        return {
          id: 'connection',
          name: 'API 连接',
          description: '测试 API 是否可达',
          status: 'available',
          details: `连接成功 · ${latency}ms`,
        };
      }
      return {
        id: 'connection',
        name: 'API 连接',
        description: '测试 API 是否可达',
        status: 'unavailable',
        details: result.error || '连接失败',
      };
    } catch (e: any) {
      return {
        id: 'connection',
        name: 'API 连接',
        description: '测试 API 是否可达',
        status: 'unavailable',
        details: e?.message?.slice(0, 40) || '连接异常',
      };
    }
  };

  // 真实检测：上下文窗口
  const checkContextWindow = async (provider: AIProvider): Promise<FeatureItem> => {
    try {
      // 尝试从模型列表获取上下文大小
      const format = (provider as any).format || 'openai';
      const modelInfo = await aiService.fetchModels(provider.baseUrl, provider.apiKey, format);
      if (modelInfo.models && modelInfo.models.length > 0) {
        // 根据模型名推断上下文大小
        const modelName = (provider.model || modelInfo.models[0] || '').toLowerCase();
        let contextSize = 4096; // 默认
        if (modelName.includes('gpt-4o') || modelName.includes('claude-3') || modelName.includes('gemini-1.5')) {
          contextSize = 128000;
        } else if (modelName.includes('gpt-4')) {
          contextSize = 8192;
        } else if (modelName.includes('gpt-3.5') || modelName.includes('gpt-4o-mini')) {
          contextSize = 16384;
        } else if (modelName.includes('32k') || modelName.includes('32K')) {
          contextSize = 32768;
        } else if (modelName.includes('128k') || modelName.includes('128K')) {
          contextSize = 128000;
        } else if (modelName.includes('200k') || modelName.includes('200K')) {
          contextSize = 200000;
        } else if (modelName.includes('1m') || modelName.includes('1M')) {
          contextSize = 1000000;
        }
        // 如果 currentConfig 有 contextLength 配置，优先用配置值
        const finalSize = currentConfig?.contextLength || contextSize;
        return {
          id: 'context-window',
          name: '上下文窗口',
          description: '模型支持的最大上下文长度',
          status: 'available',
          details: `${finalSize >= 1000 ? (finalSize / 1000) + 'K' : finalSize} tokens`,
        };
      }
      // 获取模型列表失败，用配置值
      const configSize = currentConfig?.contextLength || 4096;
      return {
        id: 'context-window',
        name: '上下文窗口',
        description: '模型支持的最大上下文长度',
        status: 'available',
        details: `${configSize >= 1000 ? (configSize / 1000) + 'K' : configSize} tokens (配置)`,
      };
    } catch {
      const configSize = currentConfig?.contextLength || 4096;
      return {
        id: 'context-window',
        name: '上下文窗口',
        description: '模型支持的最大上下文长度',
        status: 'available',
        details: `${configSize >= 1000 ? (configSize / 1000) + 'K' : configSize} tokens (配置)`,
      };
    }
  };

  // 真实检测：AI 记忆功能（发送测试请求看是否记住前文）
  const checkMemory = async (provider: AIProvider): Promise<FeatureItem> => {
    try {
      const testMessages: ChatMessage[] = [
        { id: 't1', role: 'user', content: '我的名字叫测试用户，请记住。', images: [], timestamp: Date.now() - 2000 },
        { id: 't2', role: 'assistant', content: '好的，我记住了。', images: [], timestamp: Date.now() - 1000 },
        { id: 't3', role: 'user', content: '我的名字是什么？', images: [], timestamp: Date.now() },
      ];
      const response = await aiService.chat(provider, testMessages, '你是一个测试助手，请简短回复。', undefined, { maxTokens: 50, temperature: 0.0, signal: AbortSignal.timeout(15000) } as any);
      const hasMemory = response.includes('测试用户') || response.includes('测试');
      return {
        id: 'memory',
        name: 'AI 记忆功能',
        description: '模型是否支持历史对话记忆',
        status: hasMemory ? 'available' : 'unavailable',
        details: hasMemory ? '记忆正常 · 已记住前文' : '记忆异常 · 未记住前文',
      };
    } catch (e: any) {
      // 超时或出错不算"不支持"，算检测失败
      return {
        id: 'memory',
        name: 'AI 记忆功能',
        description: '模型是否支持历史对话记忆',
        status: 'unavailable',
        details: e?.message?.slice(0, 30) || '检测失败',
      };
    }
  };

  // 真实检测：流式输出
  const checkStreaming = async (provider: AIProvider): Promise<FeatureItem> => {
    try {
      let receivedChunks = 0;
      const testMsg: ChatMessage = {
        id: 'stream-test',
        role: 'user',
        content: '请回复"你好"两个字',
        images: [],
        timestamp: Date.now(),
      };
      await aiService.chat(
        provider,
        [testMsg],
        '你是一个测试助手，请简短回复。',
        (_chunk: string) => { receivedChunks++; },
        { maxTokens: 20, temperature: 0.0, signal: AbortSignal.timeout(10000) } as any
      );
      // 如果收到 >1 个 chunk，说明流式工作
      const isStreaming = receivedChunks > 1;
      return {
        id: 'streaming',
        name: '流式输出',
        description: '是否支持逐字流式返回',
        status: isStreaming ? 'available' : 'unavailable',
        details: isStreaming ? `支持 · 收到 ${receivedChunks} 个数据块` : '不支持或一次性返回',
      };
    } catch {
      // 流式检测失败，检查 provider 是否有 streaming capability
      const hasStreamCap = provider.capabilities?.includes('streaming');
      return {
        id: 'streaming',
        name: '流式输出',
        description: '是否支持逐字流式返回',
        status: hasStreamCap ? 'available' : 'unavailable',
        details: hasStreamCap ? '支持（配置标记）' : '不支持',
      };
    }
  };

  // 真实检测：多模态/视觉（检查 capabilities）
  const checkVision = (provider: AIProvider): FeatureItem => {
    const hasVision = provider.capabilities?.includes('vision') || provider.capabilities?.includes('image');
    // 根据模型名推断
    const modelName = (provider.model || '').toLowerCase();
    const visionModels = ['gpt-4o', 'gpt-4-vision', 'gpt-4-turbo', 'claude-3', 'gemini-1.5', 'gemini-2', 'qwen-vl', 'llava', 'yi-vl'];
    const modelHasVision = visionModels.some(m => modelName.includes(m));
    const supports = hasVision || modelHasVision;
    return {
      id: 'vision',
      name: '多模态/视觉',
      description: '是否支持图片分析',
      status: supports ? 'available' : 'unavailable',
      details: supports ? (hasVision ? '支持（能力标记）' : '支持（模型推断）') : '不支持',
    };
  };

  // 真实检测：响应速度
  const checkSpeed = async (provider: AIProvider): Promise<FeatureItem> => {
    try {
      const start = Date.now();
      const testMsg: ChatMessage = {
        id: 'speed-test',
        role: 'user',
        content: 'Hi',
        images: [],
        timestamp: Date.now(),
      };
      await aiService.chat(provider, [testMsg], '', undefined, { maxTokens: 5, temperature: 0.0, signal: AbortSignal.timeout(15000) } as any);
      const latency = Date.now() - start;
      let status: 'available' | 'unavailable' = 'available';
      if (latency > 5000) status = 'unavailable';
      return {
        id: 'speed',
        name: '响应速度',
        description: 'API 响应延迟',
        status,
        details: `${latency}ms${latency < 1000 ? ' · 极快' : latency < 3000 ? ' · 正常' : ' · 较慢'}`,
      };
    } catch (e: any) {
      return {
        id: 'speed',
        name: '响应速度',
        description: 'API 响应延迟',
        status: 'unavailable',
        details: e?.message?.slice(0, 30) || '请求超时',
      };
    }
  };

  const checkFeature = async (featureId: string, provider: AIProvider): Promise<FeatureItem> => {
    switch (featureId) {
      case 'connection': return checkConnection(provider);
      case 'context-window': return await checkContextWindow(provider);
      case 'memory': return await checkMemory(provider);
      case 'streaming': return await checkStreaming(provider);
      case 'vision': return checkVision(provider);
      case 'speed': return await checkSpeed(provider);
      default:
        return {
          id: featureId,
          name: featureId,
          description: '',
          status: 'unavailable',
        };
    }
  };

  const runFullCheck = async () => {
    const provider = getTextProvider();
    if (!provider) {
      Alert.alert('无法检测', '请先在设置中配置至少一个 AI 提供商');
      return;
    }

    cancelRef.current = false;
    setIsRunning(true);
    setProgress(0);

    const featureIds = features.map((f) => f.id);
    const newFeatures: FeatureItem[] = [];

    for (let i = 0; i < featureIds.length; i++) {
      if (cancelRef.current) break;
      setProgress((i / featureIds.length) * 100);
      const result = await checkFeature(featureIds[i], provider);
      newFeatures.push(result);
      setFeatures([...newFeatures, ...features.slice(i + 1).map(f => ({ ...f, status: 'checking' as const }))]);
    }

    setProgress(100);
    setIsRunning(false);

    const availableCount = newFeatures.filter(f => f.status === 'available').length;
    Alert.alert(
      '检测完成',
      `已检测 ${newFeatures.length} 项功能\n可用: ${availableCount} 项\n不可用: ${newFeatures.length - availableCount} 项`
    );
  };

  React.useEffect(() => {
    runFullCheck();
    return () => { cancelRef.current = true; };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return '#00d672';
      case 'unavailable': return '#ff4757';
      default: return '#ffaa00';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return '可用';
      case 'unavailable': return '不可用';
      default: return '检测中...';
    }
  };

  const availableCount = features.filter(f => f.status === 'available').length;
  const totalCount = features.length;
  const completionPercent = Math.round((availableCount / totalCount) * 100);

  const ctxStats = getContextStats();
  const contextLimit = currentConfig?.contextLength || 4096;
  const contextUsagePercent = Math.min(100, Math.round((ctxStats.estimatedTokens / contextLimit) * 100));

  const provider = getTextProvider();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* 头部 */}
      <View style={[styles.header, { backgroundColor: theme.menuBgColor, borderBottomColor: theme.borderColor }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <IconClose size={24} color={theme.textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textColor }]}>系统检测</Text>
        <TouchableOpacity onPress={runFullCheck} style={styles.refreshBtn} disabled={isRunning}>
          {isRunning ? (
            <ActivityIndicator size="small" color={theme.accentColor} />
          ) : (
            <IconRefresh size={20} color={theme.accentColor} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* 当前 Provider 信息 */}
        {provider && (
          <View style={[styles.providerCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
            <View style={styles.providerHeader}>
              <IconCpu size={18} color={theme.accentColor} />
              <Text style={[styles.providerName, { color: theme.textColor }]}>{provider.name}</Text>
            </View>
            <View style={styles.providerInfo}>
              <Text style={[styles.providerDetail, { color: theme.subTextColor }]} numberOfLines={1}>
                模型: {provider.model || '默认'}
              </Text>
              <Text style={[styles.providerDetail, { color: theme.subTextColor }]} numberOfLines={1}>
                格式: {(provider as any).format || 'openai'}
              </Text>
            </View>
            <View style={styles.providerCaps}>
              {(provider.capabilities || []).map((cap, idx) => (
                <View key={idx} style={[styles.capBadge, { backgroundColor: theme.accentColor + '20' }]}>
                  <Text style={[styles.capText, { color: theme.accentColor }]}>{cap}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 总体状态卡片 */}
        <View style={[styles.summaryCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIcon}>
              <IconCpu size={24} color={theme.accentColor} />
            </View>
            <View style={styles.summaryInfo}>
              <Text style={[styles.summaryTitle, { color: theme.textColor }]}>功能检测结果</Text>
              <Text style={[styles.summarySubtitle, { color: theme.subTextColor }]}>
                {isRunning ? '正在检测...' : `完成度 ${completionPercent}%`}
              </Text>
            </View>
          </View>

          <View style={[styles.progressBar, { backgroundColor: theme.secondaryColor }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: theme.accentColor,
                  width: `${isRunning ? progress : completionPercent}%`,
                }
              ]}
            />
          </View>

          <View style={styles.summaryStats}>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: '#00d672' }]} />
              <Text style={[styles.statText, { color: theme.textColor }]}>
                {availableCount} 项可用
              </Text>
            </View>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: '#ff4757' }]} />
              <Text style={[styles.statText, { color: theme.textColor }]}>
                {totalCount - availableCount} 项不可用
              </Text>
            </View>
          </View>
        </View>

        {/* 上下文记忆检测 — 真实数据 */}
        <View style={[styles.memoryCard, { backgroundColor: theme.primaryColor, borderColor: theme.borderColor }]}>
          <View style={styles.memoryHeader}>
            <IconDatabase size={20} color={theme.accentColor} />
            <Text style={[styles.memoryTitle, { color: theme.textColor }]}>上下文记忆分析</Text>
          </View>

          {/* 上下文使用率进度条 */}
          <View style={styles.usageSection}>
            <View style={styles.usageHeader}>
              <Text style={[styles.usageLabel, { color: theme.subTextColor }]}>上下文占用</Text>
              <Text style={[styles.usageValue, { color: contextUsagePercent > 80 ? '#ff4757' : contextUsagePercent > 50 ? '#ffaa00' : '#00d672' }]}>
                {ctxStats.estimatedTokens} / {contextLimit >= 1000 ? (contextLimit / 1000) + 'K' : contextLimit}
              </Text>
            </View>
            <View style={[styles.usageBar, { backgroundColor: theme.secondaryColor }]}>
              <View
                style={[
                  styles.usageFill,
                  {
                    width: `${contextUsagePercent}%`,
                    backgroundColor: contextUsagePercent > 80 ? '#ff4757' : contextUsagePercent > 50 ? '#ffaa00' : '#00d672',
                  }
                ]}
              />
            </View>
            <Text style={[styles.usagePercent, { color: theme.subTextColor }]}>{contextUsagePercent}% 已使用</Text>
          </View>

          <View style={styles.memoryStats}>
            <View style={[styles.memoryStat, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.memoryValue, { color: theme.textColor }]}>
                {ctxStats.totalMessages}
              </Text>
              <Text style={[styles.memoryLabel, { color: theme.subTextColor }]}>总消息数</Text>
            </View>
            <View style={[styles.memoryStat, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.memoryValue, { color: theme.textColor }]}>
                {ctxStats.contextMessages}
              </Text>
              <Text style={[styles.memoryLabel, { color: theme.subTextColor }]}>上下文消息</Text>
            </View>
            <View style={[styles.memoryStat, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.memoryValue, { color: theme.textColor }]}>
                {ctxStats.memoryLength}
              </Text>
              <Text style={[styles.memoryLabel, { color: theme.subTextColor }]}>记忆条数</Text>
            </View>
            <View style={[styles.memoryStat, { backgroundColor: theme.secondaryColor }]}>
              <Text style={[styles.memoryValue, { color: theme.textColor }]}>
                {ctxStats.summaryCount}
              </Text>
              <Text style={[styles.memoryLabel, { color: theme.subTextColor }]}>摘要消息</Text>
            </View>
          </View>

          <View style={styles.tokenEstimateRow}>
            <Text style={[styles.tokenEstimateLabel, { color: theme.subTextColor }]}>估算 Token</Text>
            <Text style={[styles.tokenEstimateValue, { color: theme.accentColor }]}>
              ~{ctxStats.estimatedTokens} tokens
            </Text>
          </View>
        </View>

        {/* 功能列表 */}
        <View style={styles.featuresSection}>
          <Text style={[styles.sectionTitle, { color: theme.textColor }]}>功能详情</Text>

          <View style={styles.featuresList}>
            {features.map((feature) => (
              <View
                key={feature.id}
                style={[
                  styles.featureCard,
                  {
                    backgroundColor: theme.primaryColor,
                    borderColor: theme.borderColor,
                    opacity: feature.status === 'checking' ? 0.7 : 1,
                  }
                ]}
              >
                <View style={styles.featureHeader}>
                  <View style={styles.featureIcon}>
                    {feature.status === 'available' ? (
                      <IconCheck size={18} color="#00d672" />
                    ) : feature.status === 'unavailable' ? (
                      <IconX size={18} color="#ff4757" />
                    ) : (
                      <ActivityIndicator size="small" color="#ffaa00" />
                    )}
                  </View>
                  <View style={styles.featureInfo}>
                    <Text style={[styles.featureName, { color: theme.textColor }]}>
                      {feature.name}
                    </Text>
                    <Text style={[styles.featureDesc, { color: theme.subTextColor }]}>
                      {feature.description}
                    </Text>
                  </View>
                </View>

                <View style={styles.featureFooter}>
                  {feature.details && (
                    <Text style={[styles.featureDetails, { color: theme.subTextColor }]}>
                      {feature.details}
                    </Text>
                  )}
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(feature.status) }]}>
                    <Text style={styles.statusBadgeText}>
                      {getStatusText(feature.status)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* 操作建议 */}
        {!isRunning && (
          <View style={styles.suggestionSection}>
            <View style={[styles.suggestionCard, { backgroundColor: theme.secondaryColor, borderColor: theme.borderColor }]}>
              <IconZap size={20} color={theme.accentColor} />
              <Text style={[styles.suggestionText, { color: theme.textColor }]}>
                {completionPercent >= 80
                  ? '当前 AI 配置良好，推荐使用'
                  : completionPercent >= 50
                    ? '部分功能不可用，建议切换其他模型'
                    : '检测到多项功能不可用，建议更换供应商'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
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
  refreshBtn: {
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
    gap: 16,
  },
  providerCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerName: {
    fontSize: 15,
    fontWeight: '600',
  },
  providerInfo: {
    flexDirection: 'row',
    gap: 16,
  },
  providerDetail: {
    fontSize: 12,
  },
  providerCaps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  capBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  capText: {
    fontSize: 11,
    fontWeight: '500',
  },
  summaryCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 107, 157, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  summarySubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  summaryStats: {
    flexDirection: 'row',
    gap: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statText: {
    fontSize: 13,
    fontWeight: '500',
  },
  memoryCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memoryTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  usageSection: {
    gap: 6,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usageLabel: {
    fontSize: 13,
  fontWeight: '500',
  },
  usageValue: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  usageBar: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  marginTop: 2,
  },
  usageFill: {
    height: '100%',
    borderRadius: 5,
  },
  usagePercent: {
    fontSize: 11,
    textAlign: 'right',
  },
  memoryStats: {
    flexDirection: 'row',
    gap: 8,
  },
  memoryStat: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  memoryValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  memoryLabel: {
    fontSize: 10,
  textAlign: 'center',
  },
  tokenEstimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  tokenEstimateLabel: {
    fontSize: 12,
  },
  tokenEstimateValue: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  featuresSection: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  featuresList: {
    gap: 10,
  },
  featureCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  featureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureInfo: {
    flex: 1,
    gap: 2,
  },
  featureName: {
    fontSize: 14,
    fontWeight: '600',
  },
  featureDesc: {
    fontSize: 12,
  },
  featureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 42,
  },
  featureDetails: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  suggestionSection: {
    paddingVertical: 8,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  suggestionText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
