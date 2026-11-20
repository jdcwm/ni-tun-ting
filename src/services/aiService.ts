﻿import { AIProvider, ChatMessage, AIType, AIModel } from '../types';
import { pluginRegistry } from './plugins/registry';
import { ApiFormat } from './plugins/types';

const getPluginForProvider = (provider: AIProvider) => {
  const format = (provider as any).format || 'openai';
  return pluginRegistry.getByFormat(format as ApiFormat);
};

const applyModelOverride = (provider: AIProvider, modelId?: string): AIProvider => {
  if (!modelId || modelId === provider.model) return provider;
  return { ...provider, model: modelId };
};

// ===== 内置模型元数据字典：厂商模型 -> contextLength =====
// 来源：各厂商官方文档 + 社区维护的 models.dev
// 用于 fetchModels 后自动补齐 contextLength（API /v1/models 不返回此字段）
const MODEL_CONTEXT_LENGTHS: Record<string, number> = {
  // OpenAI
  'gpt-4o': 128000, 'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000, 'gpt-4-turbo-preview': 128000,
  'gpt-4': 8192, 'gpt-4-32k': 32768,
  'gpt-3.5-turbo': 16385, 'gpt-3.5-turbo-16k': 16385,
  'o1': 200000, 'o1-mini': 128000, 'o1-preview': 128000, 'o3-mini': 200000,
  // Anthropic Claude
  'claude-3-5-sonnet': 200000, 'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku': 200000, 'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus': 200000, 'claude-3-sonnet': 200000, 'claude-3-haiku': 200000,
  'claude-3-7-sonnet': 200000, 'claude-sonnet-4': 200000, 'claude-opus-4': 200000,
  // Google Gemini
  'gemini-2.0-flash': 1048576, 'gemini-1.5-pro': 2097152, 'gemini-1.5-flash': 1048576,
  'gemini-1.5-flash-8b': 1048576, 'gemini-pro': 32768,
  // DeepSeek
  'deepseek-chat': 65536, 'deepseek-reasoner': 65536, 'deepseek-coder': 65536,
  // Qwen / 通义千问
  'qwen-max': 32768, 'qwen-plus': 131072, 'qwen-turbo': 131072,
  'qwen2.5-72b-instruct': 131072, 'qwen2.5-32b-instruct': 131072,
  'qwen2-72b-instruct': 32768,
  // GLM / 智谱
  'glm-4': 128000, 'glm-4-plus': 128000, 'glm-4-air': 128000, 'glm-4-flash': 128000,
  // Yi / 零一万物
  'yi-large': 32768, 'yi-34b-chat': 4096,
  // Mistral
  'mistral-large': 128000, 'mistral-medium': 32000, 'mistral-small': 32000,
  'mixtral-8x7b': 32768, 'mixtral-8x22b': 65536,
  // Meta Llama
  'llama-3.3-70b': 128000, 'llama-3.1-405b': 128000, 'llama-3.1-70b': 128000,
  'llama-3.1-8b': 128000, 'llama-3-70b': 8192, 'llama-3-8b': 8192,
  // Moonshot / 月之暗面
  'moonshot-v1-8k': 8192, 'moonshot-v1-32k': 32768, 'moonshot-v1-128k': 128000,
  // 豆包 / 字节
  'doubao-pro-32k': 32000, 'doubao-pro-128k': 128000,
  // 百川
  'baichuan2-13b': 4096,
};

// 模糊匹配：模型 ID 包含某个 key 时返回对应 contextLength
const fuzzyMatchContextLength = (modelId: string): number | undefined => {
  const lower = modelId.toLowerCase();
  // 先精确匹配
  if (MODEL_CONTEXT_LENGTHS[lower]) return MODEL_CONTEXT_LENGTHS[lower];
  // 模糊匹配：遍历 key，如果 modelId 包含 key 则匹配
  for (const [key, len] of Object.entries(MODEL_CONTEXT_LENGTHS)) {
    if (lower.includes(key)) return len;
  }
  return undefined;
};

export const aiService = {
  async chat(
    provider: AIProvider,
    messages: ChatMessage[],
    systemPrompt: string,
    onStream?: (chunk: string) => void,
    options: {
      retries?: number;
      onRetry?: (attempt: number, error: any) => void;
      modelOverride?: string;
      signal?: AbortSignal;
      timeout?: number;
      onTokenUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
      onThinkingChunk?: (thinking: string) => void;
      onChunkEvent?: (event: any) => void;
    } = {}
  ): Promise<string> {
    const plugin = getPluginForProvider(provider);
    if (!plugin) {
      throw new Error('未找到对应的 AI 插件');
    }
    const effectiveProvider = applyModelOverride(provider, options.modelOverride);
    return plugin.chat(effectiveProvider, messages, systemPrompt, onStream, options);
  },

  async generateImage(
    provider: AIProvider,
    prompt: string,
    size: string = '1024x1024',
    options: { retries?: number; modelOverride?: string } = {}
  ): Promise<string[]> {
    const plugin = getPluginForProvider(provider);
    const effectiveProvider = applyModelOverride(provider, options.modelOverride);
    if (!plugin || !plugin.generateImage) {
      const fallback = pluginRegistry.getByFormat('openai');
      if (fallback && fallback.generateImage) {
        return fallback.generateImage(effectiveProvider, prompt, size, options);
      }
      throw new Error('当前 AI 提供商不支持图片生成');
    }
    return plugin.generateImage(effectiveProvider, prompt, size, options);
  },

  async summarize(
    provider: AIProvider,
    messages: ChatMessage[],
    summaryPrompt: string,
    options: {
      retries?: number;
      modelOverride?: string;
      systemPrompt?: string;
      onTokenUsage?: (usage: { promptTokens: number; completionTokens: number; totalTokens: number }) => void;
    } = {}
  ): Promise<{ content: string; tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const textToSummarize = messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content || ''}`)
      .join('\n');

    const fullPrompt = `${summaryPrompt}\n\n对话内容：\n${textToSummarize}`;

    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const content = await this.chat(
      provider,
      [{ id: 'sum', role: 'user', content: fullPrompt, images: [], timestamp: Date.now() }],
      options.systemPrompt || '',
      undefined,
      {
        ...options,
        onTokenUsage: (usage) => {
          tokenUsage = usage;
          options.onTokenUsage?.(usage);
        },
      }
    );
    return { content, tokenUsage };
  },

  async visionAnalyze(
    provider: AIProvider,
    imageUrl: string,
    prompt: string = '请描述这张图片',
    options: { retries?: number; modelOverride?: string } = {}
  ): Promise<string> {
    const plugin = getPluginForProvider(provider);
    const effectiveProvider = applyModelOverride(provider, options.modelOverride);
    if (plugin?.visionAnalyze) {
      return plugin.visionAnalyze(effectiveProvider, imageUrl, prompt, options);
    }
    if (plugin?.chat) {
      const msg: ChatMessage = {
        id: 'vision',
        role: 'user',
        content: prompt,
        images: [imageUrl],
        timestamp: Date.now(),
      };
      return plugin.chat(effectiveProvider, [msg], '', undefined, options);
    }
    throw new Error('当前 AI 提供商不支持图像识别');
  },

  async fetchModels(
    baseUrl: string,
    apiKey: string,
    format: ApiFormat = 'openai',
    options: { retries?: number } = {}
  ): Promise<{ models: string[]; error?: string }> {
    const plugin = pluginRegistry.getByFormat(format);
    if (plugin?.fetchModels) {
      return plugin.fetchModels(baseUrl, apiKey, options);
    }
    const fallback = pluginRegistry.getByFormat('openai');
    if (fallback?.fetchModels) {
      return fallback.fetchModels(baseUrl, apiKey, options);
    }
    return { models: [], error: '不支持获取模型列表' };
  },

  // 获取单个模型的 contextLength（优先从 provider.models 读，再用内置字典模糊匹配）
  getModelContextLength(provider: AIProvider | undefined, modelId?: string): number {
    if (provider?.models?.length) {
      if (modelId) {
        const m = provider.models.find(m => m.id === modelId || m.modelId === modelId);
        if (m?.contextLength) return m.contextLength;
      }
      const dm = provider.models.find(m => m.modelId === provider.model);
      if (dm?.contextLength) return dm.contextLength;
    }
    // 用模型 ID 模糊匹配内置字典
    const idToMatch = modelId || provider?.model;
    if (idToMatch) {
      const matched = fuzzyMatchContextLength(idToMatch);
      if (matched) return matched;
    }
    return 4096;
  },

  detectCapabilities(models: string[], format: ApiFormat = 'openai'): AIType[] {
    const plugin = pluginRegistry.getByFormat(format);
    if (plugin?.detectCapabilities) {
      return plugin.detectCapabilities(models);
    }
    const fallback = pluginRegistry.getByFormat('openai');
    if (fallback?.detectCapabilities) {
      return fallback.detectCapabilities(models);
    }
    return ['text', 'summary'];
  },

  async autoDetectCapabilities(
    provider: AIProvider
  ): Promise<{ capabilities: AIType[]; models: string[]; error?: string }> {
    const format = (provider as any).format || 'openai';
    const result = await this.fetchModels(provider.baseUrl, provider.apiKey, format);
    if (result.error || result.models.length === 0) {
      return {
        capabilities: provider.capabilities as AIType[],
        models: [],
        error: result.error || '未获取到模型列表',
      };
    }
    const capabilities = this.detectCapabilities(result.models, format);
    return { capabilities, models: result.models };
  },

  async testConnection(
    baseUrl: string,
    apiKey: string,
    format: ApiFormat = 'openai'
  ): Promise<{ ok: boolean; latency?: number; error?: string }> {
    const plugin = pluginRegistry.getByFormat(format);
    if (plugin?.testConnection) {
      return plugin.testConnection(baseUrl, apiKey);
    }
    const fallback = pluginRegistry.getByFormat('openai');
    if (fallback?.testConnection) {
      return fallback.testConnection(baseUrl, apiKey);
    }
    return { ok: false, error: '无法测试连接' };
  },

  extractImageKeywords(text: string): string[] {
    const keywords: string[] = [];
    const patterns = [
      /(高兴|开心|快乐|微笑|笑)/g,
      /(生气|愤怒|恼火)/g,
      /(伤心|难过|哭泣|哭)/g,
      /(惊讶|吃惊|震惊)/g,
      /(害怕|恐惧|担心)/g,
      /(思考|沉思|想)/g,
      /(睡觉|睡眠|困)/g,
    ];

    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        keywords.push(...matches);
      }
    }

    return [...new Set(keywords)];
  },

  estimateTokenCount(text: string): number {
    if (!text) return 0;
    let chineseChars = 0;
    let otherChars = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (/[\u4e00-\u9fa5]/.test(char)) {
        chineseChars++;
      } else {
        otherChars++;
      }
    }
    return Math.ceil(chineseChars * 1.5 + otherChars / 4);
  },

  calculateContextTokenUsage(
    messages: ChatMessage[],
    systemPrompt: string = ''
  ): {
    messageCount: number;
    totalChars: number;
    estimatedTokens: number;
    charBreakdown: {
      systemPrompt: number;
      userMessages: number;
      assistantMessages: number;
    };
  } {
    let userChars = 0;
    let assistantChars = 0;

    for (const msg of messages) {
      if (msg.role === 'user') {
        userChars += msg.content?.length || 0;
      } else if (msg.role === 'assistant') {
        assistantChars += msg.content?.length || 0;
      }
    }

    const totalChars = systemPrompt.length + userChars + assistantChars;
    const estimatedTokens = this.estimateTokenCount(systemPrompt) + this.estimateTokenCount(
      messages.map(m => m.content || '').join('\n')
    );

    return {
      messageCount: messages.length,
      totalChars,
      estimatedTokens,
      charBreakdown: {
        systemPrompt: systemPrompt.length,
        userMessages: userChars,
        assistantMessages: assistantChars,
      },
    };
  },

  getModelContextLimit(provider: AIProvider | undefined, modelId?: string): number {
    return this.getModelContextLength(provider, modelId);
  },
  // 自動檢測 API 端點的最大輸出 token 上限
  async detectMaxTokens(
    provider: AIProvider,
    modelId?: string
  ): Promise<{ maxTokens: number; contextLength?: number; source: string; error?: string }> {
    const baseUrl = (provider.baseUrl || '').replace(/\/$/, '');
    const apiKey = provider.apiKey || '';
    const model = modelId || provider.model || '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) { headers['Authorization'] = `Bearer ${apiKey}`; headers['x-api-key'] = apiKey; }

    // 策略1：調用 /v1/models/{model} 獲取模型元數據
    try {
      const resp = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        const meta = data.data || data;
        const ctxLen = meta?.context_length || meta?.context_window || meta?.max_context_tokens;
        const maxOut = meta?.max_output_tokens || meta?.max_tokens || meta?.max_completion_tokens;
        if (maxOut) return { maxTokens: maxOut, contextLength: ctxLen, source: 'models_endpoint' };
      }
    } catch {}

    // 策略2：發送探測請求，max_tokens 設為極大值，讀錯誤中的實際上限
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST', headers,
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 999999, stream: false }),
      });
      const text = await resp.text();
      try {
        const err = JSON.parse(text);
        const msg = err?.error?.message || err?.message || err?.detail || '';
        const patterns = [/max.*?(\d{2,7})/i, /(\d{2,7}).*?max/i, /up to (\d{2,7})/i, /limit.*?(\d{2,7})/i, /(\d{2,7}).*?token/i];
        for (const p of patterns) {
          const m = msg.match(p);
          if (m) { const limit = parseInt(m[1]); if (limit > 0 && limit < 999999) return { maxTokens: limit, source: 'probe_error' }; }
        }
        const limitField = err?.error?.max_tokens || err?.max_tokens;
        if (limitField && limitField < 999999) return { maxTokens: limitField, source: 'probe_error_field' };
      } catch {}
      if (resp.ok) {
        let detected = 1024;
        for (const testVal of [4096, 8192, 16384, 32768, 65536, 131072]) {
          try {
            const r = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST', headers,
              body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ok' }], max_tokens: testVal, stream: false }),
            });
            if (r.ok) detected = testVal; else break;
          } catch { break; }
        }
        return { maxTokens: detected, source: 'binary_search' };
      }
    } catch {}

    const ctxLen = this.getModelContextLength(provider, modelId);
    return { maxTokens: Math.min(Math.floor(ctxLen / 2), 8192), contextLength: ctxLen, source: 'fallback_estimate', error: '無法自動檢測，使用估算值' };
  },

  getPlugins() {
    return pluginRegistry.getAll();
  },

  getPresets() {
    return pluginRegistry.getPresets();
  },

  registerPlugin(plugin: any) {
    pluginRegistry.register(plugin);
  },
};
